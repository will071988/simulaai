import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import { createProviders, providerConfigured, createOpenRouterModelProvider, openAIKeys } from "./registry";
import { OpenAIProvider } from "./openai";
import { configuredOpenRouterModels } from "./openrouterModels";
import { supabaseService } from "@/lib/supabase-server";
import crypto from "crypto";
import { aiConfig, configuredOpenAIModels, isProviderModelAllowed } from "./config";
import { GenerationBudget } from "./generationBudget";
import { reservePaidBudget, type PaidBudgetReservation } from "./paidBudget";

const providers = createProviders;

function hashInput(input: unknown, promptVersion: string, taskType: string) {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify({ input, promptVersion, taskType }));
  return h.digest("hex");
}

async function getCached<T>(inputHash: string, promptVersion: string): Promise<T | null> {
  try {
    const svc = supabaseService();
    const { data } = await svc.from("ai_cache").select("result").eq("input_hash", inputHash).eq("prompt_version", promptVersion).limit(1).maybeSingle();
    return (data?.result as T) ?? null;
  } catch { return null; }
}

async function setCached(inputHash: string, promptVersion: string, provider: string, model: string, result: unknown) {
  try {
    const svc = supabaseService();
    const { error } = await svc.from("ai_cache").insert({ input_hash: inputHash, prompt_version: promptVersion, provider, model, result });
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "ai_cache", code: "INSERT_FAILED" }));
  } catch { console.error(JSON.stringify({ event: "observability_write_failed", component: "ai_cache", code: "UNAVAILABLE" })); }
}

async function logUsage(provider: string, model: string, taskType: string, success: boolean, latencyMs: number, errorCode?: string, inputSize?: number, outputSize?: number, effectiveModel?: string, metadata?: { paidFallback?: boolean; keyIndex?: number; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; fallbackReason?: string }) {
  try {
    const svc = supabaseService();
    const id = crypto.randomUUID();
    const { error } = await svc.from("ai_usage_logs").insert({ id, provider, model, task_type: taskType, success, latency_ms: latencyMs, error_code: errorCode, input_size: inputSize, output_size: outputSize, paid_fallback: metadata?.paidFallback || false, key_index: metadata?.keyIndex, input_tokens: metadata?.inputTokens, output_tokens: metadata?.outputTokens, estimated_cost_usd: metadata?.estimatedCostUsd, fallback_reason: metadata?.fallbackReason });
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "ai_usage", code: "INSERT_FAILED" }));
    else if (effectiveModel) console.info(JSON.stringify({ event: "ai_usage_model_identity", usageLogId: id, provider, requestedModel: model, effectiveModel, latencyMs, success, errorCode: errorCode || null }));
  } catch { console.error(JSON.stringify({ event: "observability_write_failed", component: "ai_usage", code: "UNAVAILABLE" })); }
}

async function reserveBudget(): Promise<boolean> {
  const maxDay = aiConfig.maxPerDay;
  if (!Number.isInteger(maxDay) || maxDay <= 0) return false;
  try {
    const svc = supabaseService();
    const { data, error } = await svc.rpc("reserve_ai_daily_budget", { p_limit: maxDay });
    if (error) return false;
    return data === true;
  } catch { return false; }
}

export type RouterDependencies = {
  providers: typeof providers;
  getCached: typeof getCached;
  setCached: typeof setCached;
  logUsage: typeof logUsage;
  reserveBudget: typeof reserveBudget;
  order: string[];
  modelAllowed: (model: string, provider?: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  configured?: (name: string) => boolean;
  openRouterModels?: () => string[];
  modelProvider?: (model: string) => AIProvider;
  paidBudget?: (reservation: PaidBudgetReservation) => Promise<boolean>;
  openAIKeys?: () => Array<{ key: string; index: number }>;
};
const dependencies: RouterDependencies = { providers, getCached, setCached, logUsage, reserveBudget, order: aiConfig.providerOrder, modelAllowed: (model, provider) => isProviderModelAllowed(provider || "openrouter", model), configured: providerConfigured, openRouterModels: configuredOpenRouterModels, modelProvider: createOpenRouterModelProvider, paidBudget: reservePaidBudget, openAIKeys, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

export function smokeDependencies(provider: string, model?: string): RouterDependencies {
  return { ...dependencies, order: [provider], ...(model ? { openRouterModels: () => [model] } : {}), getCached: async () => null, setCached: async () => {}, paidBudget: async () => true };
}

type Execution = { providers: Record<string, AIProvider>; failures: Map<string, number>; health: Map<string, "healthy" | "degraded" | "unavailable">; authFailures: Map<string, { httpStatus?: number }> };
const executions = new WeakMap<GenerationBudget, Execution>();
export function isFallbackError(code?: string): boolean {
  return ["TIMEOUT", "EMPTY_BODY", "INVALID_JSON", "INVALID_SCHEMA", "429", "HTTP_5XX", "PROVIDER_UNAVAILABLE", "MODEL_UNAVAILABLE"].includes(code || "") || /^HTTP_5\d\d$/.test(code || "");
}

export async function generateWithFallback<T>(req: AIRequest, opts?: { decode?: (d: unknown) => T; validate?: (d: unknown) => boolean; semanticValidate?: (d: unknown) => boolean; budget?: GenerationBudget }, deps: RouterDependencies = dependencies): Promise<AIResult<T> & { degraded?: boolean }> {
  try {
    if (!req.prompt?.trim() || !req.promptVersion || JSON.stringify(req.input) === undefined) throw new Error("INVALID_INPUT");
  } catch { return { ok: false, provider: "none", model: "", latencyMs: 0, errorCode: "INVALID_INPUT" }; }
  if (process.env.COLLECTOR_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "COLLECTOR_DISABLED", degraded: true };
  if (process.env.AI_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "AI_DISABLED", degraded: true };
  const inputHash = hashInput(req.input, req.promptVersion, req.taskType);
  const cached = await deps.getCached<T>(inputHash, req.promptVersion);
  if (cached && (!opts?.validate || opts.validate(cached)) && (!opts?.semanticValidate || opts.semanticValidate(cached))) return { ok: true, success: true, provider: "cache", model: "cache", requestedModel: "cache", effectiveModel: "MODEL_EFFECTIVE_UNKNOWN", data: cached, latencyMs: 0, cached: true };

  const budget = opts?.budget || new GenerationBudget(aiConfig.maxPerRun);
  const ord = budget.providerOrder || deps.order;
  let execution = executions.get(budget);
  if (!execution) { execution = { providers: deps.providers(), failures: new Map(), health: new Map(), authFailures: new Map() }; executions.set(budget, execution); }
  let last: AIResult<T> = { ok: false, provider: "all", model: "all", latencyMs: 0, errorCode: "SKIPPED_NOT_CONFIGURED" };
  const attempts: NonNullable<AIResult<T>["attempts"]> = [];
  const targets = [...new Set(ord)].filter((name) => name !== "openai").flatMap((name) => {
    if (name !== "openrouter" || !deps.openRouterModels || !deps.modelProvider) return [{ name, key: name }];
    return deps.openRouterModels().map((model) => {
      const key = `${name}:${model}`;
      execution.providers[key] ||= deps.modelProvider!(model);
      return { name, key };
    });
  });
  if (ord.includes("openrouter") && deps.openRouterModels && !deps.openRouterModels().length) return { ...last, errorCode: "AUTH_CONFIGURATION_ERROR", degraded: true };
  for (const { name, key } of targets) {
    const p = execution.providers[key];
    if (!p || (deps.configured && !deps.configured(name))) { execution.health.set(name, "unavailable"); continue; }
    const rejectedCredential = execution.authFailures.get(name);
    if (rejectedCredential) return { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "AUTH_CONFIGURATION_ERROR", httpStatus: rejectedCredential.httpStatus, attempts, degraded: true };
    if ((execution.failures.get(key) || 0) >= 2) { last = { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "MODEL_UNAVAILABLE" }; continue; }
    if (!deps.modelAllowed(p.model, name)) return { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "AUTH_CONFIGURATION_ERROR", attempts, degraded: true };
    const health = await p.healthCheck();
    if (!health.healthy) {
      last = { ok: false, provider: name, model: p.model, latencyMs: 0, httpStatus: health.credentialHttpStatus, errorCode: health.errorCode || "PROVIDER_UNAVAILABLE" };
      execution.health.set(key, "unavailable");
      if (health.errorCode === "AUTH_CONFIGURATION_ERROR") { execution.authFailures.set(name, { httpStatus: health.credentialHttpStatus }); return { ...last, attempts, degraded: true }; }
      continue;
    }
    if (budget.calls >= budget.limit) return { ...last, errorCode: "BUDGET_EXHAUSTED", attempts, degraded: true };
    const beforeCalls = budget.calls;
    const result = p.generateStructured ? await p.generateStructured<T>(req, () => budget.reserve(deps.reserveBudget)) : await p.generate<T>(req, () => budget.reserve(deps.reserveBudget));
    let decoded = result.data;
    let decodingIssue: string | undefined;
    if (result.ok && opts?.decode) {
      try { decoded = opts.decode(result.data); }
      catch (error) { decoded = undefined; decodingIssue = error instanceof Error && error.message === "INVALID_EVIDENCE_REFERENCE" ? "INVALID_EVIDENCE_REFERENCE" : "INVALID_MODEL_OUTPUT"; }
    }
    const invalidSchema = result.ok && (Boolean(decodingIssue) || Boolean(opts?.validate && !opts.validate(decoded)));
    const semanticError = result.ok && !invalidSchema && opts?.semanticValidate && !opts.semanticValidate(decoded);
    last = { ...result, data: decoded, ok: result.ok && !invalidSchema && !semanticError, success: result.ok && !invalidSchema && !semanticError, requestedModel: p.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", ...(decodingIssue ? { validationIssues: [decodingIssue] } : {}), ...(semanticError ? { errorCode: "SCHEMA_SEMANTIC_ERROR" } : invalidSchema ? { errorCode: "INVALID_SCHEMA" } : result.errorCode === "BUDGET_EXCEEDED" ? { errorCode: "BUDGET_EXHAUSTED" } : {}) };
    if (budget.calls > beforeCalls) {
      attempts.push({ provider: name, requestedModel: p.model, effectiveModel: last.effectiveModel!, latencyMs: last.latencyMs, errorCode: last.errorCode, keyIndex: result.keyIndex });
      await deps.logUsage(p.name, p.model, req.taskType, last.ok, last.latencyMs, last.errorCode, JSON.stringify(req.input).length, result.raw?.length, last.effectiveModel, { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });
      if (deps === dependencies) console.info(JSON.stringify({ event: "ai_provider_diagnostics", provider: p.name, requestedModel: p.model, effectiveModel: last.effectiveModel, httpStatus: result.httpStatus ?? null, latencyMs: last.latencyMs, timeoutSource: result.timeoutSource ?? null, jsonClassification: invalidSchema ? "SCHEMA_INVALID" : result.jsonClassification ?? null, generationDiagnostics: result.generationDiagnostics ?? null, errorCode: last.errorCode ?? null }));
    }
    if (last.ok) {
      execution.failures.set(key, 0); execution.health.set(key, "healthy");
      await deps.setCached(inputHash, req.promptVersion, p.name, p.model, last.data);
      return { ...last, attempts };
    }
    if (!isFallbackError(last.errorCode)) {
      // Rejected facts/input belong to this document. They must stop its
      // fallback, but must not open a provider outage circuit for other items.
      execution.health.set(key, "degraded");
      if (last.errorCode === "AUTH_CONFIGURATION_ERROR") execution.authFailures.set(name, { httpStatus: last.httpStatus });
      return { ...last, attempts, degraded: true };
    }
    const failures = (execution.failures.get(key) || 0) + 1;
    execution.failures.set(key, failures); execution.health.set(key, failures >= 2 ? "unavailable" : "degraded");
  }
  const paidReason = last.errorCode || "FREE_CHAIN_EXHAUSTED";
  if (aiConfig.policy !== "free_then_paid") return { ...last, success: false, attempts, degraded: true };
  const models = configuredOpenAIModels();
  const keys = deps.openAIKeys?.() || [];
  if (!models.length) return { ...last, success: false, errorCode: "PAID_MODEL_NOT_CONFIGURED", attempts, degraded: true };
  if (!keys.length) return { ...last, success: false, errorCode: "PAID_KEY_NOT_CONFIGURED", attempts, degraded: true };
  if (aiConfig.openaiMaxCallsPerDay <= 0 || aiConfig.openaiMaxSpendUsdPerDay <= 0) return { ...last, success: false, errorCode: "PAID_BUDGET_NOT_CONFIGURED", attempts, degraded: true };
  const pricing = aiConfig.openaiPricing;
  let paidAttempts = 0;
  let paidLast = last;
  for (const model of models) {
    const price = pricing[model];
    if (!price) { paidLast = { ...paidLast, provider: "openai", model, errorCode: "PAID_PRICING_NOT_CONFIGURED" }; continue; }
    for (const key of keys) {
      if (paidAttempts >= aiConfig.openaiMaxPaidAttemptsPerJob) break;
      const paidProvider = new OpenAIProvider(model, key.key, key.index);
      const estimate = ((JSON.stringify(req.input).length / 4) * price.inputPerMillion + (req.maxTokens || 1200) * price.outputPerMillion) / 1_000_000;
      const beforeCalls = budget.calls;
      const permit = async () => {
        if (!deps.paidBudget || !(await deps.paidBudget({ jobKey: inputHash, estimatedCostUsd: estimate }))) return false;
        return budget.reserve(deps.reserveBudget);
      };
      const result = paidProvider.generateStructured ? await paidProvider.generateStructured<T>(req, permit) : await paidProvider.generate<T>(req, permit);
      if (budget.calls === beforeCalls) { paidLast = { ...result, errorCode: result.errorCode || "PAID_BUDGET_EXHAUSTED", keyIndex: key.index }; break; }
      paidAttempts++;
      let decoded = result.data;
      let decodingIssue: string | undefined;
      if (result.ok && opts?.decode) { try { decoded = opts.decode(result.data); } catch { decoded = undefined; decodingIssue = "INVALID_MODEL_OUTPUT"; } }
      const invalidSchema = result.ok && (Boolean(decodingIssue) || Boolean(opts?.validate && !opts.validate(decoded)));
      const semanticError = result.ok && !invalidSchema && opts?.semanticValidate && !opts.semanticValidate(decoded);
      paidLast = { ...result, data: decoded, ok: result.ok && !invalidSchema && !semanticError, success: result.ok && !invalidSchema && !semanticError, provider: "openai", model, errorCode: semanticError ? "SCHEMA_SEMANTIC_ERROR" : invalidSchema ? "INVALID_SCHEMA" : result.errorCode, estimatedCostUsd: estimate, keyIndex: key.index, ...(decodingIssue ? { validationIssues: [decodingIssue] } : {}) };
      const actualCost = result.usage?.inputTokens !== undefined && result.usage?.outputTokens !== undefined
        ? (result.usage.inputTokens * price.inputPerMillion + result.usage.outputTokens * price.outputPerMillion) / 1_000_000
        : estimate;
      paidLast.estimatedCostUsd = actualCost;
      attempts.push({ provider: "openai", requestedModel: model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", latencyMs: result.latencyMs, errorCode: paidLast.errorCode, keyIndex: key.index });
      await deps.logUsage("openai", model, req.taskType, Boolean(paidLast.ok), result.latencyMs, paidLast.errorCode, JSON.stringify(req.input).length, result.raw?.length, result.effectiveModel, { paidFallback: true, keyIndex: key.index, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, estimatedCostUsd: actualCost, fallbackReason: paidReason });
      if (paidLast.ok) { await deps.setCached(inputHash, req.promptVersion, "openai", model, paidLast.data); return { ...paidLast, attempts }; }
      if (paidLast.errorCode === "PAID_QUOTA_EXHAUSTED" || paidLast.errorCode === "PAID_PERMISSION_DENIED" || paidLast.errorCode === "PAID_MODEL_BLOCKED") return { ...paidLast, attempts, degraded: true };
      if (paidLast.errorCode === "PAID_RATE_LIMIT") {
        const retryAfter = result.rateLimit?.retryAfter;
        const seconds = retryAfter && Number.isFinite(Number(retryAfter)) ? Math.max(0, Math.min(60, Number(retryAfter))) : 1;
        await deps.sleep(seconds * 1000);
        continue;
      }
      if (["PAID_INVALID_KEY", "PAID_MODEL_UNAVAILABLE"].includes(paidLast.errorCode || "")) continue;
      if (paidLast.errorCode === "HTTP_5XX" || paidLast.errorCode === "TIMEOUT") { await deps.sleep(250); continue; }
      if (!isFallbackError(paidLast.errorCode) && paidLast.errorCode !== "INVALID_SCHEMA" && paidLast.errorCode !== "SCHEMA_SEMANTIC_ERROR") break;
    }
  }
  return { ...paidLast, success: false, attempts, degraded: true };
}

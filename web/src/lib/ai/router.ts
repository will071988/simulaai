import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import { createProviders, providerConfigured } from "./registry";
import { supabaseService } from "@/lib/supabase-server";
import crypto from "crypto";
import { aiConfig, isProviderModelAllowed } from "./config";
import { GenerationBudget } from "./generationBudget";

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

async function logUsage(provider: string, model: string, taskType: string, success: boolean, latencyMs: number, errorCode?: string, inputSize?: number, outputSize?: number) {
  try {
    const svc = supabaseService();
    const { error } = await svc.from("ai_usage_logs").insert({ provider, model, task_type: taskType, success, latency_ms: latencyMs, error_code: errorCode, input_size: inputSize, output_size: outputSize });
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "ai_usage", code: "INSERT_FAILED" }));
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
};
const dependencies: RouterDependencies = { providers, getCached, setCached, logUsage, reserveBudget, order: aiConfig.providerOrder, modelAllowed: (model, provider) => isProviderModelAllowed(provider || "openrouter", model), configured: providerConfigured, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

export function smokeDependencies(provider: string): RouterDependencies {
  return { ...dependencies, order: [provider], getCached: async () => null, setCached: async () => {} };
}

type Execution = { providers: Record<string, AIProvider>; failures: Map<string, number>; health: Map<string, "healthy" | "degraded" | "unavailable"> };
const executions = new WeakMap<GenerationBudget, Execution>();
export function isFallbackError(code?: string): boolean {
  return ["TIMEOUT", "EMPTY_BODY", "INVALID_JSON", "429", "HTTP_5XX", "PROVIDER_UNAVAILABLE"].includes(code || "") || /^HTTP_5\d\d$/.test(code || "");
}

export async function generateWithFallback<T>(req: AIRequest, opts?: { validate?: (d: unknown) => boolean; budget?: GenerationBudget }, deps: RouterDependencies = dependencies): Promise<AIResult<T> & { degraded?: boolean }> {
  try {
    if (!req.prompt?.trim() || !req.promptVersion || JSON.stringify(req.input) === undefined) throw new Error("INVALID_INPUT");
  } catch { return { ok: false, provider: "none", model: "", latencyMs: 0, errorCode: "INVALID_INPUT" }; }
  if (process.env.COLLECTOR_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "COLLECTOR_DISABLED", degraded: true };
  if (process.env.AI_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "AI_DISABLED", degraded: true };
  const inputHash = hashInput(req.input, req.promptVersion, req.taskType);
  const cached = await deps.getCached<T>(inputHash, req.promptVersion);
  if (cached && (!opts?.validate || opts.validate(cached))) return { ok: true, success: true, provider: "cache", model: "cache", requestedModel: "cache", effectiveModel: "MODEL_EFFECTIVE_UNKNOWN", data: cached, latencyMs: 0, cached: true };

  const budget = opts?.budget || new GenerationBudget(aiConfig.maxPerRun);
  const ord = budget.providerOrder || deps.order;
  let execution = executions.get(budget);
  if (!execution) { execution = { providers: deps.providers(), failures: new Map(), health: new Map() }; executions.set(budget, execution); }
  let last: AIResult<T> = { ok: false, provider: "all", model: "all", latencyMs: 0, errorCode: "SKIPPED_NOT_CONFIGURED" };
  const attempts: NonNullable<AIResult<T>["attempts"]> = [];
  for (const name of [...new Set(ord)]) {
    const p = execution.providers[name];
    if (!p || (deps.configured && !deps.configured(name))) { execution.health.set(name, "unavailable"); continue; }
    if ((execution.failures.get(name) || 0) >= 2) { last = { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "PROVIDER_UNAVAILABLE" }; continue; }
    if (!deps.modelAllowed(p.model, name)) return { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "AUTH_CONFIGURATION_ERROR", attempts, degraded: true };
    if (!(await p.healthCheck()).healthy) { last = { ok: false, provider: name, model: p.model, latencyMs: 0, errorCode: "PROVIDER_UNAVAILABLE" }; execution.health.set(name, "unavailable"); continue; }
    if (budget.calls >= budget.limit) return { ...last, errorCode: "BUDGET_EXHAUSTED", attempts, degraded: true };
    const beforeCalls = budget.calls;
    const result = p.generateStructured ? await p.generateStructured<T>(req, () => budget.reserve(deps.reserveBudget)) : await p.generate<T>(req, () => budget.reserve(deps.reserveBudget));
    const invalidSchema = result.ok && opts?.validate && !opts.validate(result.data);
    last = { ...result, ok: result.ok && !invalidSchema, success: result.ok && !invalidSchema, requestedModel: p.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", ...(invalidSchema ? { errorCode: "INVALID_SCHEMA" } : result.errorCode === "BUDGET_EXCEEDED" ? { errorCode: "BUDGET_EXHAUSTED" } : {}) };
    if (budget.calls > beforeCalls) {
      attempts.push({ provider: name, requestedModel: p.model, effectiveModel: last.effectiveModel!, latencyMs: last.latencyMs, errorCode: last.errorCode });
      await deps.logUsage(p.name, p.model, req.taskType, last.ok, last.latencyMs, last.errorCode, JSON.stringify(req.input).length, result.raw?.length);
      if (deps === dependencies) console.info(JSON.stringify({ event: "ai_provider_diagnostics", provider: p.name, requestedModel: p.model, effectiveModel: last.effectiveModel, httpStatus: result.httpStatus ?? null, latencyMs: last.latencyMs, timeoutSource: result.timeoutSource ?? null, jsonClassification: invalidSchema ? "SCHEMA_INVALID" : result.jsonClassification ?? null, errorCode: last.errorCode ?? null }));
    }
    if (last.ok) {
      execution.failures.set(name, 0); execution.health.set(name, "healthy");
      await deps.setCached(inputHash, req.promptVersion, p.name, p.model, result.data);
      return { ...last, attempts };
    }
    const failures = (execution.failures.get(name) || 0) + 1;
    execution.failures.set(name, failures); execution.health.set(name, failures >= 2 ? "unavailable" : "degraded");
    if (!isFallbackError(last.errorCode)) return { ...last, attempts, degraded: true };
  }
  return { ...last, success: false, attempts, degraded: true };
}

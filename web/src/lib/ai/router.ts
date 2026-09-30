import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";
import { supabaseService } from "@/lib/supabase-server";
import crypto from "crypto";
import { aiConfig, isModelAllowed } from "./config";
import { GenerationBudget } from "./generationBudget";

function providers(): Record<string, AIProvider> {
  return {
    groq: new GroqProvider(),
    gemini: new GeminiProvider(),
    openrouter: new OpenRouterProvider(),
  };
}

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
    await svc.from("ai_cache").insert({ input_hash: inputHash, prompt_version: promptVersion, provider, model, result });
  } catch {}
}

async function logUsage(provider: string, model: string, taskType: string, success: boolean, latencyMs: number, errorCode?: string, inputSize?: number, outputSize?: number) {
  try {
    const svc = supabaseService();
    await svc.from("ai_usage_logs").insert({ provider, model, task_type: taskType, success, latency_ms: latencyMs, error_code: errorCode, input_size: inputSize, output_size: outputSize });
  } catch {}
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
  modelAllowed: (model: string) => boolean;
  sleep: (ms: number) => Promise<void>;
};
const dependencies: RouterDependencies = { providers, getCached, setCached, logUsage, reserveBudget, order: aiConfig.providerOrder, modelAllowed: isModelAllowed, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

export async function generateWithFallback<T>(req: AIRequest, opts?: { validate?: (d: unknown) => boolean; budget?: GenerationBudget }, deps: RouterDependencies = dependencies): Promise<AIResult<T> & { degraded?: boolean }> {
  if (process.env.COLLECTOR_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "COLLECTOR_DISABLED", degraded: true };
  if (process.env.AI_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "AI_DISABLED", degraded: true };
  const inputHash = hashInput(req.input, req.promptVersion, req.taskType);
  const cached = await deps.getCached<T>(inputHash, req.promptVersion);
  if (cached && (!opts?.validate || opts.validate(cached))) return { ok: true, provider: "cache", model: "cache", data: cached, latencyMs: 0, cached: true };

  const ord = deps.order;
  const map = deps.providers();
  const budget = opts?.budget || new GenerationBudget(aiConfig.maxPerRun);
  let lastErrorCode = "AI_PENDING";

  for (const name of ord) {
    const p = map[name];
    if (!p) continue;
    if (!deps.modelAllowed(p.model)) {
      lastErrorCode = "PAID_MODEL_BLOCKED";
      continue;
    }
    const health = await p.healthCheck();
    if (!health.healthy) { lastErrorCode = "PROVIDER_DOWN"; continue; }
    // single retry with backoff for 429
    let attempt = 0;
    while (attempt < 2) {
      const beforeCalls = budget.calls;
      const res = await p.generate<T>(req, () => budget.reserve(deps.reserveBudget));
      const invalidSchema = res.ok && opts?.validate && !opts.validate(res.data);
      if (budget.calls > beforeCalls) await deps.logUsage(p.name, p.model, req.taskType, res.ok && !invalidSchema, res.latencyMs, invalidSchema ? "INVALID_SCHEMA" : res.errorCode, JSON.stringify(req.input).length, res.raw?.length);
      if (res.errorCode === "BUDGET_EXCEEDED") return { ...res, degraded: true };
      if (res.ok) {
        if (invalidSchema) {
          lastErrorCode = "INVALID_SCHEMA";
          break; // try next provider
        }
        await deps.setCached(inputHash, req.promptVersion, p.name, p.model, res.data);
        return res;
      }
      if (res.errorCode === "429") {
        lastErrorCode = "429";
        const backoff = 1500 * Math.pow(2, attempt) + Math.random() * 500;
        if (attempt === 0) await deps.sleep(backoff);
        attempt++;
        continue;
      }
      if (res.errorCode === "MODEL_NOT_FOUND") {
        lastErrorCode = "MODEL_NOT_FOUND";
        break; // try next provider/model
      }
      lastErrorCode = res.errorCode || "PROVIDER_DOWN";
      break;
    }
  }
  return { ok: false, provider: "all", model: "all", latencyMs: 0, errorCode: lastErrorCode, degraded: true };
}

import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";
import { supabaseService } from "@/lib/supabase-server";
import crypto from "crypto";
import { aiConfig, isModelAllowed } from "./config";

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

async function budgetExceeded(): Promise<boolean> {
  const maxDay = aiConfig.maxPerDay;
  if (!maxDay || maxDay <= 0) return false;
  try {
    const svc = supabaseService();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await svc.from("ai_usage_logs").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString());
    return (count || 0) >= maxDay;
  } catch { return false; }
}

export async function generateWithFallback<T>(req: AIRequest, opts?: { validate?: (d: unknown) => boolean }): Promise<AIResult<T> & { degraded?: boolean }> {
  if (process.env.COLLECTOR_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "COLLECTOR_DISABLED", degraded: true };
  if (process.env.AI_ENABLED === "false") return { ok: false, provider: "disabled", model: "", latencyMs: 0, errorCode: "AI_DISABLED", degraded: true };
  if (await budgetExceeded()) return { ok: false, provider: "budget", model: "", latencyMs: 0, errorCode: "BUDGET_EXCEEDED", degraded: true };

  const inputHash = hashInput(req.input, req.promptVersion, req.taskType);
  const cached = await getCached<T>(inputHash, req.promptVersion);
  if (cached) return { ok: true, provider: "cache", model: "cache", data: cached, latencyMs: 0, cached: true };

  const ord = aiConfig.providerOrder;
  const map = providers();

  for (const name of ord) {
    const p = map[name];
    if (!p) continue;
    if (aiConfig.freeOnly && !isModelAllowed(p.model)) {
      await logUsage(p.name, p.model, req.taskType, false, 0, "PAID_MODEL_BLOCKED");
      continue;
    }
    const health = await p.healthCheck();
    if (!health.healthy) continue;
    // single retry with backoff for 429
    let attempt = 0;
    while (attempt < 2) {
      const res = await p.generate<T>(req);
      await logUsage(p.name, p.model, req.taskType, res.ok, res.latencyMs, res.errorCode, JSON.stringify(req.input).length, res.raw?.length);
      if (res.ok) {
        if (opts?.validate && !opts.validate(res.data)) {
          await logUsage(p.name, p.model, req.taskType, false, res.latencyMs, "INVALID_SCHEMA");
          break; // try next provider
        }
        await setCached(inputHash, req.promptVersion, p.name, p.model, res.data);
        return res;
      }
      if (res.errorCode === "429") {
        const backoff = 1500 * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
        attempt++;
        continue;
      }
      if (res.errorCode === "MODEL_NOT_FOUND") {
        break; // try next provider/model
      }
      break;
    }
  }
  return { ok: false, provider: "all", model: "all", latencyMs: 0, errorCode: "AI_PENDING", degraded: true };
}

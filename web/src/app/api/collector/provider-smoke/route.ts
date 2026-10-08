import { NextResponse } from "next/server";
import { z } from "zod";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { supabaseService } from "@/lib/supabase-server";
import { OpenRouterProvider } from "@/lib/ai/openrouter";
import { GenerationBudget, generationTimeoutMs } from "@/lib/ai/generationBudget";
import { aiConfig } from "@/lib/ai/config";
import { observeApiRoute } from "@/lib/observability/operations";

async function handlePOST(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.AI_ENABLED !== "true" || !aiConfig.freeOnly || aiConfig.providerOrder.join(",") !== "openrouter" || aiConfig.openRouterModel !== "openrouter/free") {
    return NextResponse.json({ error: "SMOKE_CONFIGURATION_BLOCKED" }, { status: 409 });
  }
  const db = supabaseService();
  const budget = new GenerationBudget(1);
  const schema = z.object({ ok: z.literal(true) }).strict();
  const result = await new OpenRouterProvider().generate({ taskType: "EXTRACT_CONCURSO", promptVersion: "sprint28-synthetic-smoke-v1", prompt: 'Retorne somente o objeto JSON {"ok":true}, sem campos adicionais.', input: { synthetic: true } }, () => budget.reserve(async () => {
    const reserved = await db.rpc("reserve_ai_daily_budget", { p_limit: aiConfig.maxPerDay });
    return !reserved.error && reserved.data === true;
  }));
  const schemaSuccess = result.ok && schema.safeParse(result.data).success;
  let accountingLogged = budget.calls === 0;
  if (budget.calls === 1) {
    const logged = await db.from("ai_usage_logs").insert({ provider: result.provider, model: result.model, task_type: "EXTRACT_CONCURSO", success: schemaSuccess, latency_ms: result.latencyMs, error_code: result.ok && !schemaSuccess ? "INVALID_SCHEMA" : result.errorCode, input_size: 18 });
    accountingLogged = !logged.error;
  }
  return NextResponse.json({ ok: schemaSuccess && accountingLogged, configuration: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? "PRESENTE" : "AUSENTE", AI_ENABLED: process.env.AI_ENABLED, FREE_AI_ONLY: aiConfig.freeOnly, AI_PROVIDER_ORDER: aiConfig.providerOrder, AI_OPENROUTER_MODEL: aiConfig.openRouterModel, MAX_AI_REQUESTS_PER_RUN: aiConfig.maxPerRun, MAX_AI_REQUESTS_PER_DAY: aiConfig.maxPerDay }, physicalCalls: budget.calls, provider: result.provider, requestedModel: result.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", httpStatus: result.httpStatus ?? null, latencyMs: result.latencyMs, timeoutMs: generationTimeoutMs(), timeoutSource: result.timeoutSource ?? null, parseSuccess: result.parseSuccess ?? false, schemaSuccess, jsonClassification: result.ok && !schemaSuccess ? "SCHEMA_INVALID" : result.jsonClassification ?? null, errorCode: !accountingLogged ? "USAGE_LOG_FAILED" : result.ok && !schemaSuccess ? "INVALID_SCHEMA" : result.errorCode ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = observeApiRoute("/api/collector/provider-smoke", handlePOST);

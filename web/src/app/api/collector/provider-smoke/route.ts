import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCollectorControl } from "@/lib/collector/controlAuth";
import { GenerationBudget, generationTimeoutMs } from "@/lib/ai/generationBudget";
import { aiConfig } from "@/lib/ai/config";
import { providerConfigured } from "@/lib/ai/registry";
import { generateWithFallback, smokeDependencies } from "@/lib/ai/router";
import { observeApiRoute } from "@/lib/observability/operations";
import { approveFreeModel, fetchOpenRouterCatalog, OPENROUTER_FREE_CANDIDATES } from "@/lib/ai/openrouterModels";
import { runExtractionDiagnostic } from "@/lib/ai/extractionDiagnostic";

async function handleGET(request: Request) {
  const access = await authorizeCollectorControl(request);
  if (access.status !== 200) return NextResponse.json({ error: "Unauthorized" }, { status: access.status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const catalog = await fetchOpenRouterCatalog();
    return NextResponse.json({ candidates: OPENROUTER_FREE_CANDIDATES.map((model) => ({ model, ...approveFreeModel(model, catalog) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "MODEL_CATALOG_UNAVAILABLE" }, { status: 503 }); }
}

async function handlePOST(request: Request) {
  const access = await authorizeCollectorControl(request);
  if (access.status !== 200) return NextResponse.json({ error: "Unauthorized" }, { status: access.status, headers: { "Cache-Control": "private, no-store" } });
  if (process.env.AI_ENABLED !== "true" || !aiConfig.freeOnly) return NextResponse.json({ error: "SMOKE_CONFIGURATION_BLOCKED" }, { status: 409 });
  const schema = z.object({ ok: z.literal(true) }).strict();
  const explicitModel = new URL(request.url).searchParams.get("model");
  if (explicitModel) {
    if (!(OPENROUTER_FREE_CANDIDATES as readonly string[]).includes(explicitModel)) return NextResponse.json({ error: "INVALID_MODEL" }, { status: 400 });
    const params = new URL(request.url).searchParams;
    if (params.has("fixture")) {
      const policy = params.get("reasoningPolicy");
      if (params.get("fixture") !== "synthetic-extraction" || (policy !== "provider-default" && policy !== "disabled")) return NextResponse.json({ error: "INVALID_DIAGNOSTIC" }, { status: 400 });
      return NextResponse.json(await runExtractionDiagnostic(explicitModel, policy), { headers: { "Cache-Control": "private, no-store" } });
    }
    const budget = new GenerationBudget(1);
    const result = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", promptVersion: "sprint28-model-matrix-v1", prompt: 'Retorne somente o objeto JSON {"ok":true}, sem campos adicionais.', input: { synthetic: true }, schema: z.toJSONSchema(schema) }, { budget, validate: (data) => schema.safeParse(data).success }, smokeDependencies("openrouter", explicitModel));
    return NextResponse.json({ requestedModel: explicitModel, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", httpStatus: result.httpStatus ?? null, latencyMs: result.latencyMs, bodyPresent: result.bodyPresent ?? false, parseSuccess: result.parseSuccess ?? false, schemaSuccess: result.ok, errorCode: result.errorCode ?? null, classification: result.ok ? "HEALTHY" : result.errorCode || "UNAVAILABLE", physicalCalls: budget.calls, generationDiagnostics: result.generationDiagnostics ?? null, rateLimit: result.rateLimit ?? null, upstreamError: result.upstreamError ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const results = [];
  const budget = new GenerationBudget(Math.min(4, aiConfig.maxPerRun));
  for (const provider of [...new Set(aiConfig.providerOrder)]) {
    const configured = providerConfigured(provider);
    if (!configured) { results.push({ provider, configured: false, result: "SKIPPED_NOT_CONFIGURED", physicalCalls: 0 }); continue; }
    const before = budget.calls;
    const result = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", promptVersion: "sprint28-synthetic-smoke-v2", prompt: 'Retorne somente o objeto JSON {"ok":true}, sem campos adicionais.', input: { synthetic: true }, schema: z.toJSONSchema(schema) }, { budget, validate: (data) => schema.safeParse(data).success }, smokeDependencies(provider));
    results.push({ provider, configured, requestedModel: result.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", httpStatus: result.httpStatus ?? null, latencyMs: result.latencyMs, timeoutMs: generationTimeoutMs(), parseSuccess: result.parseSuccess ?? false, schemaSuccess: result.ok, errorCode: result.errorCode ?? null, result: result.ok ? "HEALTHY" : "DEGRADED", physicalCalls: budget.calls - before });
    if (result.errorCode === "BUDGET_EXHAUSTED") break;
  }
  return NextResponse.json({ ok: results.some((result) => result.result === "HEALTHY"), providerOrder: aiConfig.providerOrder, physicalCalls: budget.calls, results }, { headers: { "Cache-Control": "private, no-store" } });
}
export const POST = observeApiRoute("/api/collector/provider-smoke", handlePOST);
export const GET = observeApiRoute("/api/collector/provider-smoke", handleGET);

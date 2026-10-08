import assert from "node:assert/strict";
import { z } from "zod";
import { generateWithFallback, type RouterDependencies } from "../src/lib/ai/router";
import { GenerationBudget, generationFetch } from "../src/lib/ai/generationBudget";
import type { AIProvider } from "../src/lib/ai/provider";
import type { AIRequest, AIResult } from "../src/lib/ai/types";
import { GroqProvider } from "../src/lib/ai/groq";
import { GeminiProvider } from "../src/lib/ai/gemini";
import { CerebrasProvider } from "../src/lib/ai/cerebras";
import { parseStructuredJson, closeSchemaObjects, parsedResult } from "../src/lib/ai/structured";
import { getAIRetryDecision } from "../src/lib/collector/retryPolicy";
import { ExtractConcursoSchema } from "../src/lib/collector/schemas";

const request: AIRequest = { taskType: "EXTRACT_CONCURSO", prompt: "synthetic fixture", input: {}, promptVersion: "multi-provider-fixture" };
function fixture(errors: Record<string, string[]>, order = Object.keys(errors), limit = 10) {
  let reserved = 0, physical = 0, cached = false;
  const calls: string[] = [], logs: Array<{ provider: string; success: boolean; error?: string }> = [];
  const queues = Object.fromEntries(Object.entries(errors).map(([name, values]) => [name, [...values]]));
  const providers: Record<string, AIProvider> = Object.fromEntries(Object.keys(errors).map((name) => [name, {
    name, model: `${name}/fixture-free`, healthCheck: async () => ({ healthy: name !== "unavailable" }),
    async generate<T>(req: AIRequest, permit?: () => Promise<boolean>): Promise<AIResult<T>> {
      try {
        await generationFetch(`https://fixture.invalid/${name}`, {}, permit);
        calls.push(name);
        const error = queues[name].shift();
        return { ok: !error, provider: name, model: `${name}/fixture-free`, effectiveModel: `${name}/effective`, latencyMs: 1, ...(error ? { errorCode: error } : { data: { orgao: "Órgão fixture", banca: "Banca fixture", vagas: 1, status: null } as T }) };
      } catch { return { ok: false, provider: name, model: `${name}/fixture-free`, latencyMs: 0, errorCode: "BUDGET_EXHAUSTED" }; }
    },
  }]));
  const deps: RouterDependencies = { providers: () => providers, order, modelAllowed: () => true,
    getCached: async <T>() => cached ? { cached: true } as T : null, setCached: async () => {},
    logUsage: async (provider, _model, _task, success, _latency, error) => { logs.push({ provider, success, error }); },
    reserveBudget: async () => { reserved++; return true; }, sleep: async () => {} };
  const budget = new GenerationBudget(limit);
  return { deps, budget, calls, logs, reserveCount: () => reserved, physicalCount: () => physical, fetch: async () => { physical++; return Response.json({}); }, cache: () => { cached = true; } };
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    for (const error of ["TIMEOUT", "EMPTY_BODY", "INVALID_JSON", "429", "HTTP_5XX", "PROVIDER_UNAVAILABLE"]) {
      const f = fixture({ openrouter: [error], groq: [""] }); globalThis.fetch = f.fetch;
      const result = await generateWithFallback(request, { budget: f.budget, validate: (data) => ExtractConcursoSchema.safeParse(data).success }, f.deps);
      assert.equal(result.ok, true); assert.equal(result.provider, "groq"); assert.equal(result.effectiveModel, "groq/effective");
      assert.deepEqual(f.calls, ["openrouter", "groq"]); assert.equal(f.reserveCount(), 2); assert.equal(f.physicalCount(), 2); assert.equal(f.logs.length, 2);
    }
    for (const error of ["INVALID_INPUT", "AUTH_CONFIGURATION_ERROR", "SCHEMA_SEMANTIC_ERROR", "BUDGET_EXHAUSTED"]) {
      const f = fixture({ openrouter: [error], groq: [""] }); globalThis.fetch = f.fetch;
      const result = await generateWithFallback(request, { budget: f.budget }, f.deps);
      assert.equal(result.ok, false); assert.deepEqual(f.calls, ["openrouter"]);
    }
    const semantic = fixture({ openrouter: [""], groq: [""] }); globalThis.fetch = semantic.fetch;
    assert.equal((await generateWithFallback(request, { budget: semantic.budget, validate: () => false }, semantic.deps)).errorCode, "INVALID_SCHEMA");
    assert.deepEqual(semantic.calls, ["openrouter"]);
    const circuit = fixture({ openrouter: ["EMPTY_BODY", "TIMEOUT"], groq: ["", "", ""] }); globalThis.fetch = circuit.fetch;
    for (let i = 0; i < 3; i++) assert.equal((await generateWithFallback(request, { budget: circuit.budget }, circuit.deps)).ok, true);
    assert.deepEqual(circuit.calls, ["openrouter", "groq", "openrouter", "groq", "groq"]);
    const ordered = fixture({ openrouter: [""], groq: [""] }, ["groq", "openrouter", "groq"]); globalThis.fetch = ordered.fetch;
    assert.equal((await generateWithFallback(request, { budget: ordered.budget }, ordered.deps)).provider, "groq");
    const missing = fixture({ unavailable: [""], groq: [""] }); missing.deps.configured = () => false; globalThis.fetch = missing.fetch;
    assert.equal((await generateWithFallback(request, { budget: missing.budget }, missing.deps)).errorCode, "SKIPPED_NOT_CONFIGURED"); assert.equal(missing.physicalCount(), 0);
    const exhausted = fixture({ openrouter: ["TIMEOUT"], groq: [""] }, undefined, 1); globalThis.fetch = exhausted.fetch;
    assert.equal((await generateWithFallback(request, { budget: exhausted.budget }, exhausted.deps)).errorCode, "BUDGET_EXHAUSTED"); assert.equal(exhausted.reserveCount(), 1);
    const cached = fixture({ openrouter: [""] }); cached.cache(); globalThis.fetch = cached.fetch;
    assert.equal((await generateWithFallback(request, { budget: cached.budget }, cached.deps)).cached, true); assert.equal(cached.reserveCount(), 0);
    const invalid = fixture({ openrouter: [""] }); globalThis.fetch = invalid.fetch;
    assert.equal((await generateWithFallback({ ...request, prompt: "" }, { budget: invalid.budget }, invalid.deps)).errorCode, "INVALID_INPUT"); assert.equal(invalid.reserveCount(), 0);
    assert.deepEqual(parseStructuredJson('```json\n{"ok":true}\n```'), { ok: true });
    assert.throws(() => parseStructuredJson('{"ok":'));
    assert.equal(parsedResult("fixture", "fixture", "[]", "unknown", Date.now(), 200).errorCode, "INVALID_SCHEMA");
    assert.equal(z.toJSONSchema(ExtractConcursoSchema, { io: "input" }).type, "object");
    const transportSchema = closeSchemaObjects(z.toJSONSchema(ExtractConcursoSchema, { io: "input" })) as { additionalProperties: boolean; properties: { evidence: { additionalProperties: boolean } } };
    assert.equal(transportSchema.additionalProperties, false); assert.equal(transportSchema.properties.evidence.additionalProperties, false);
    assert.equal(getAIRetryDecision("BUDGET_EXHAUSTED", 2).incrementRetry, false);
    assert.equal(getAIRetryDecision("SKIPPED_NOT_CONFIGURED", 2).incrementRetry, false);
  } finally { globalThis.fetch = originalFetch; }

  const names = ["GROQ_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "CEREBRAS_API_KEY", "AI_GROQ_MODEL", "AI_GEMINI_MODEL", "AI_CEREBRAS_MODEL", "AI_GROQ_FREE_TIER_CONFIRMED", "AI_GEMINI_FREE_TIER_CONFIRMED", "AI_CEREBRAS_FREE_TIER_CONFIRMED"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    for (const provider of [new GroqProvider(), new GeminiProvider(), new CerebrasProvider()]) {
      const result = await provider.generateStructured(request, async () => { throw new Error("must not reserve"); });
      assert.equal(result.errorCode, "SKIPPED_NOT_CONFIGURED"); assert.equal(result.success, false); assert.equal(result.effectiveModel, "MODEL_EFFECTIVE_UNKNOWN");
    }
    for (const providerName of ["groq", "gemini", "cerebras"]) {
      process.env[`AI_${providerName.toUpperCase()}_MODEL`] = "fixture-model";
      process.env[`AI_${providerName.toUpperCase()}_FREE_TIER_CONFIRMED`] = "true";
    }
    process.env.GROQ_API_KEY = "fixture-only"; process.env.GOOGLE_GENERATIVE_AI_API_KEY = "fixture-only"; process.env.CEREBRAS_API_KEY = "fixture-only";
    for (const provider of [new GroqProvider(), new GeminiProvider(), new CerebrasProvider()]) {
      let physical = 0, reservations = 0;
      globalThis.fetch = async (input, init) => {
        physical++;
        const url = new URL(String(input));
        assert.equal(url.searchParams.has("key"), false, "credentials must not be sent in query strings");
        const body = JSON.parse(String(init?.body));
        if (provider.name === "gemini") { assert.equal(body.generationConfig.responseMimeType, "application/json"); return Response.json({ modelVersion: "effective-fixture", candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }); }
        assert.equal(body.response_format.type, "json_object");
        return Response.json({ model: "effective-fixture", choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] });
      };
      const result = await provider.generateStructured(request, async () => { reservations++; return true; });
      assert.equal(result.success, true); assert.equal(result.effectiveModel, "effective-fixture"); assert.equal(physical, 1); assert.equal(reservations, 1);
      globalThis.fetch = async () => Response.json({ choices: [], candidates: [] });
      assert.equal((await provider.generateStructured(request, async () => true)).errorCode, "EMPTY_BODY");
      globalThis.fetch = async () => new Response(null, { status: 401 });
      assert.equal((await provider.generateStructured(request, async () => true)).errorCode, "AUTH_CONFIGURATION_ERROR");
    }
  } finally { globalThis.fetch = originalFetch; for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
  console.log("multi-provider order, availability, fallback, semantic stop, physical budgets, execution circuit and schema tests passed");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "multi-provider validation failed"); process.exitCode = 1; });

import assert from "node:assert/strict";
import { approveFreeModel, configuredOpenRouterModels, OPENROUTER_FREE_CANDIDATES } from "../src/lib/ai/openrouterModels";
import { OpenRouterProvider } from "../src/lib/ai/openrouter";
import { generateWithFallback, type RouterDependencies } from "../src/lib/ai/router";
import { GenerationBudget } from "../src/lib/ai/generationBudget";
import { extractionSemanticIssues } from "../src/lib/collector/extractionSemantics";
import { ExtractConcursoSchema } from "../src/lib/collector/schemas";

async function main() {
  const models = OPENROUTER_FREE_CANDIDATES.slice(0, 3);
  const catalog = { data: models.map((id) => ({ id, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: ["response_format"], context_length: 262144 })) };
  assert.equal(approveFreeModel(models[0], catalog).ok, true);
  for (const price of ["0.01", "", undefined, "NaN"]) assert.equal(approveFreeModel(models[0], { data: [{ ...catalog.data[0], pricing: { prompt: price, completion: "0" } }] }).errorCode, "MODEL_NOT_FREE");
  assert.equal(approveFreeModel(models[0], { data: [{ ...catalog.data[0], pricing: { prompt: "0", completion: "0.01" } }] }).errorCode, "MODEL_NOT_FREE");
  assert.equal(approveFreeModel(models[0], { data: [] }).errorCode, "MODEL_UNAVAILABLE");
  assert.equal(approveFreeModel("paid/fake:free", catalog).ok, false);
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldOrder = process.env.AI_OPENROUTER_MODEL_ORDER;
  process.env.OPENROUTER_API_KEY = "fixture-only";
  process.env.AI_OPENROUTER_MODEL_ORDER = models.join(",");
  try {
    assert.deepEqual(configuredOpenRouterModels(), models);
    process.env.AI_OPENROUTER_MODEL_ORDER = `openrouter/free,${models[0]}`; assert.deepEqual(configuredOpenRouterModels(), []);
    process.env.AI_OPENROUTER_MODEL_ORDER = models.join(",");
    let physical = 0, reservations = 0;
    const logs: Array<{ model: string; success: boolean }> = [];
    const paths: string[] = [];
    let mode = "EMPTY_BODY";
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/models")) return Response.json(catalog);
      physical++;
      const body = JSON.parse(String(init?.body)); paths.push(body.model);
      assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
      assert.equal(body.provider.allow_fallbacks, false);
      if (body.model === models[0]) {
        if (mode === "TIMEOUT") throw new DOMException("timeout", "TimeoutError");
        if (mode === "INVALID_JSON") return Response.json({ model: models[0], choices: [{ message: { content: "invalid" } }] });
        if (mode === "ALL_UNAVAILABLE") return new Response(null, { status: 404 });
        return Response.json({ model: models[0], choices: [{ message: { content: "" } }] });
      }
      if (mode === "ALL_UNAVAILABLE") return new Response(null, { status: 404 });
      return Response.json({ model: body.model, choices: [{ message: { content: '{"ok":true}' } }] });
    };
    const deps: RouterDependencies = { providers: () => ({ openrouter: new OpenRouterProvider() }), openRouterModels: () => models, modelProvider: (model) => new OpenRouterProvider(model), configured: () => true, order: ["openrouter"], modelAllowed: () => true, getCached: async () => null, setCached: async () => {}, logUsage: async (_p, model, _t, success) => { logs.push({ model, success }); }, reserveBudget: async () => { reservations++; return true; }, sleep: async () => {} };
    for (mode of ["EMPTY_BODY", "INVALID_JSON", "TIMEOUT"]) {
      const budget = new GenerationBudget(10);
      const before = physical;
      const result = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "model-fixture" }, { budget, validate: () => true }, deps);
      assert.equal(result.ok, true); assert.equal(result.model, models[1]); assert.equal(physical - before, 2); assert.equal(budget.calls, 2);
    }
    mode = "EMPTY_BODY";
    const circuitBudget = new GenerationBudget(10);
    const beforeCircuit = paths.length;
    for (let i = 0; i < 3; i++) await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "circuit-fixture" }, { budget: circuitBudget }, deps);
    assert.deepEqual(paths.slice(beforeCircuit), [models[0], models[1], models[0], models[1], models[1]]);
    const exhausted = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "budget-fixture" }, { budget: new GenerationBudget(1) }, deps);
    assert.equal(exhausted.errorCode, "BUDGET_EXHAUSTED");
    const semanticBefore = physical;
    const semantic = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "semantic-fixture" }, { budget: new GenerationBudget(10), semanticValidate: () => false }, { ...deps, openRouterModels: () => [models[1], models[2]] });
    assert.equal(semantic.errorCode, "SCHEMA_SEMANTIC_ERROR"); assert.equal(physical - semanticBefore, 1);
    mode = "ALL_UNAVAILABLE";
    const unavailable = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "unavailable-fixture" }, { budget: new GenerationBudget(10) }, deps);
    assert.equal(unavailable.errorCode, "MODEL_UNAVAILABLE"); assert.equal(unavailable.attempts?.length, 3);
    assert.equal(reservations, physical); assert.equal(logs.length, physical);
    globalThis.fetch = async (input) => { if (String(input).endsWith("/models")) return Response.json({ data: [{ ...catalog.data[0], pricing: { prompt: "1", completion: "0" } }] }); throw new Error("must not generate"); };
    let paidReservations = 0;
    const paid = await new OpenRouterProvider(models[0]).generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture" }, async () => { paidReservations++; return true; });
    assert.equal(paid.errorCode, "MODEL_NOT_FREE"); assert.equal(paidReservations, 0);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    assert.equal((await new OpenRouterProvider(models[0]).generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture" }, async () => { paidReservations++; return true; })).errorCode, "MODEL_UNAVAILABLE");
    assert.equal(paidReservations, 0);
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; if (oldOrder === undefined) delete process.env.AI_OPENROUTER_MODEL_ORDER; else process.env.AI_OPENROUTER_MODEL_ORDER = oldOrder; }
  const raw = "Instituto Exemplo. Cargo: Analista Administrativo. Escolaridade: nível superior. São 10 vagas. Inscrições de 01/10/2026 até 20/10/2026.";
  const valid = ExtractConcursoSchema.parse({ orgao: "Instituto Exemplo", banca: "Cebraspe", vagas: 10, status: null, cargos: ["Analista Administrativo"], escolaridade: ["SUPERIOR"], evidence: { vagas: "São 10 vagas", cargos: "Cargo: Analista Administrativo" } });
  assert.deepEqual(extractionSemanticIssues(valid, "Instituto Exemplo", raw, "Cebraspe"), []);
  assert.ok(extractionSemanticIssues({ ...valid, vagas: 999 }, "Instituto Exemplo", raw, "Cebraspe").includes("vagas:UNSUPPORTED_NUMBER"));
  assert.ok(extractionSemanticIssues({ ...valid, orgao: "Instituição inventada" }, "Instituto Exemplo", raw, "Cebraspe").includes("orgao:UNSUPPORTED_IDENTITY"));
  assert.ok(extractionSemanticIssues({ ...valid, prova_data: "2026-02-30" }, "Instituto Exemplo", raw, "Cebraspe").includes("prova_data:UNSUPPORTED_DATE"));
  assert.ok(extractionSemanticIssues({ ...valid, evidence: { vagas: "quote inventada" } }, "Instituto Exemplo", raw, "Cebraspe").includes("vagas:NON_LITERAL_EVIDENCE"));
  console.log("live-pricing fail-closed, model order/fallback/budget/circuit and grounded extraction validation passed");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "model validation failed"); process.exitCode = 1; });

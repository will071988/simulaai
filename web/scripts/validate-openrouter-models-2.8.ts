import assert from "node:assert/strict";
import { approveFreeModel, configuredOpenRouterModels, OPENROUTER_FREE_CANDIDATES } from "../src/lib/ai/openrouterModels";
import { OpenRouterProvider } from "../src/lib/ai/openrouter";
import { generateWithFallback, type RouterDependencies } from "../src/lib/ai/router";
import { GenerationBudget } from "../src/lib/ai/generationBudget";
import { extractionSemanticIssues } from "../src/lib/collector/extractionSemantics";
import { ExtractConcursoSchema } from "../src/lib/collector/schemas";
import { EXTRACTION_DIAGNOSTIC_TEXT } from "../src/lib/ai/extractionDiagnostic";

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
      if (String(input).endsWith("/auth/key")) return Response.json({ data: { is_free_tier: true } });
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
    const reasoningCatalog = { data: [{ ...catalog.data[0], supported_parameters: ["response_format", "reasoning"], reasoning: { mandatory: false, default_enabled: true, supported_efforts: ["low", "none"] } }] };
    let diagnosticCalls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/models")) return Response.json(reasoningCatalog);
      diagnosticCalls++;
      const body = JSON.parse(String(init?.body)); assert.equal(body.max_tokens, 1200);
      if (body.reasoning?.effort === "none") return Response.json({ model: models[0], choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: { completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 0 } } });
      return Response.json({ model: models[0], choices: [{ finish_reason: "length", message: { content: "", reasoning: "private reasoning must never appear in diagnostics" } }], usage: { completion_tokens: 1200, completion_tokens_details: { reasoning_tokens: 1200 } } });
    };
    const baseline = await new OpenRouterProvider(models[0]).generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture", reasoningPolicy: "provider-default" }, async () => true);
    assert.equal(baseline.errorCode, "EMPTY_BODY"); assert.equal(baseline.generationDiagnostics?.reasoningBudgetExhausted, true);
    assert.doesNotMatch(JSON.stringify(baseline), /private reasoning must never/);
    const disabled = await new OpenRouterProvider(models[0]).generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture", reasoningPolicy: "disabled" }, async () => true);
    assert.equal(disabled.ok, true); assert.equal(disabled.generationDiagnostics?.visibleTokens, 20); assert.equal(diagnosticCalls, 2);
    globalThis.fetch = async () => Response.json({ data: [{ ...reasoningCatalog.data[0], reasoning: { mandatory: true } }] });
    const mandatory = await new OpenRouterProvider(models[0]).generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture", reasoningPolicy: "disabled" }, async () => { throw new Error("must not reserve"); });
    assert.equal(mandatory.errorCode, "MODEL_UNAVAILABLE");
    for (const status of [401, 403]) {
      let credentialChecks = 0; let invalidKeyReservations = 0; let invalidKeyLogs = 0;
      globalThis.fetch = async (input) => { assert.ok(String(input).endsWith("/auth/key")); credentialChecks++; return new Response(null, { status }); };
      const invalidKeyProvider = new OpenRouterProvider(models[0]);
      const invalidKeyDeps = { ...deps, providers: () => ({ openrouter: invalidKeyProvider }), modelProvider: () => invalidKeyProvider, reserveBudget: async () => { invalidKeyReservations++; return true; }, logUsage: async () => { invalidKeyLogs++; } };
      const invalidKeyBudget = new GenerationBudget(10);
      for (let index = 0; index < 2; index++) {
        const result = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "invalid-key-fixture" }, { budget: invalidKeyBudget }, invalidKeyDeps);
        assert.equal(result.errorCode, "AUTH_CONFIGURATION_ERROR"); assert.equal(result.httpStatus, status); assert.deepEqual(result.attempts, []);
      }
      assert.equal(credentialChecks, 1); assert.equal(invalidKeyReservations, 0); assert.equal(invalidKeyLogs, 0); assert.equal(invalidKeyBudget.calls, 0);
    }
  } finally { globalThis.fetch = originalFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; if (oldOrder === undefined) delete process.env.AI_OPENROUTER_MODEL_ORDER; else process.env.AI_OPENROUTER_MODEL_ORDER = oldOrder; }
  const raw = "Instituto Exemplo. Cargo: Analista Administrativo. Escolaridade: nível superior. São 10 vagas. Inscrições de 01/10/2026 até 20/10/2026.";
  const valid = ExtractConcursoSchema.parse({ orgao: "Instituto Exemplo", banca: "Cebraspe", vagas: 10, status: null, cargos: ["Analista Administrativo"], escolaridade: ["SUPERIOR"], evidence: { vagas: "São 10 vagas", cargos: "Cargo: Analista Administrativo" } });
  assert.deepEqual(extractionSemanticIssues(valid, "Instituto Exemplo", raw, "Cebraspe"), []);
  const wrappedRaw = raw.replace("Cargo: Analista Administrativo", "Cargo: Analista\nAdministrativo");
  assert.deepEqual(extractionSemanticIssues(valid, "Instituto Exemplo", wrappedRaw, "Cebraspe"), [], "PDF line wraps must not invalidate otherwise exact quotations");
  assert.ok(extractionSemanticIssues({ ...valid, evidence: { cargos: "Cargo - Analista Administrativo" } }, "Instituto Exemplo", wrappedRaw, "Cebraspe").includes("cargos:NON_LITERAL_EVIDENCE"), "whitespace normalization must not admit changed wording or punctuation");
  const explicitUf = { ...valid, state_code: "AL" as const, evidence: { ...valid.evidence, state_code: "AL" } };
  assert.deepEqual(extractionSemanticIssues(explicitUf, "Instituto Exemplo", `${raw} Local: SEPLAG/AL.`, "Cebraspe"), []);
  assert.ok(extractionSemanticIssues(explicitUf, "Instituto Exemplo", `${raw} Estado de ALAGOAS.`, "Cebraspe").includes("state_code:NON_LITERAL_EVIDENCE"), "UF must not be inferred from a state name or matched inside a word");
  assert.equal(ExtractConcursoSchema.safeParse({ ...valid, state_code: "ZZ" }).success, false);
  assert.ok(extractionSemanticIssues({ ...valid, vagas: 999 }, "Instituto Exemplo", raw, "Cebraspe").includes("vagas:UNSUPPORTED_NUMBER"));
  assert.ok(extractionSemanticIssues({ ...valid, orgao: "Instituição inventada" }, "Instituto Exemplo", raw, "Cebraspe").includes("orgao:UNSUPPORTED_IDENTITY"));
  assert.ok(extractionSemanticIssues({ ...valid, prova_data: "2026-02-30" }, "Instituto Exemplo", raw, "Cebraspe").includes("prova_data:UNSUPPORTED_DATE"));
  assert.ok(extractionSemanticIssues({ ...valid, evidence: { vagas: "quote inventada" } }, "Instituto Exemplo", raw, "Cebraspe").includes("vagas:NON_LITERAL_EVIDENCE"));
  const missingEvidence = extractionSemanticIssues({ ...valid, status: null, cadastro_reserva: null, state_code: null, city: null, evidence: { status: "não informado", cadastro_reserva: "não consta", state_code: "não informado", city: "não informado" } }, "Instituto Exemplo", raw, "Cebraspe");
  for (const field of ["status", "cadastro_reserva", "state_code", "city"]) assert.ok(missingEvidence.includes(`${field}:NON_LITERAL_EVIDENCE`), "absent fields must not accept invented explanations as quotes");
  const diagnosticExpected = ExtractConcursoSchema.parse({ orgao: "INSTITUTO MUNICIPAL DE ESTUDOS APLICADOS", banca: "Cebraspe", vagas: 12, salario: 4200, status: null, cargos: ["Analista Administrativo"], escolaridade: ["SUPERIOR"], inscricao_inicio: "2026-11-02", inscricao_fim: "2026-11-20", prova_data: "2026-12-15", scope: "NACIONAL", evidence: { cargos: "Cargo: Analista Administrativo." } });
  assert.deepEqual(extractionSemanticIssues(diagnosticExpected, diagnosticExpected.orgao!, EXTRACTION_DIAGNOSTIC_TEXT, "Cebraspe"), []);
  console.log("live-pricing fail-closed, model order/fallback/budget/circuit and grounded extraction validation passed");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "model validation failed"); process.exitCode = 1; });

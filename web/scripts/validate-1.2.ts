import assert from "node:assert/strict";
import { isModelAllowed } from "../src/lib/ai/config";
import { resolveLocation } from "../src/lib/collector/syncConcurso";
import { calcHotScore } from "../src/lib/collector/hotScore";
import { getHotCta } from "../src/lib/collector/hotCta";

assert.equal(isModelAllowed("openai/gpt-oss-20b"), true);
assert.equal(isModelAllowed("openrouter/free"), true);
for (const model of ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b", "qwen/qwen3-32b"]) {
  assert.equal(isModelAllowed(model), false, `deprecated model allowed: ${model}`);
}

const unknown = resolveLocation("Agencia Nacional XYZ", "Agencia Nacional XYZ 2027");
assert.equal(unknown.latitude, null);
assert.equal(unknown.longitude, null);
assert.equal(unknown.scope, null);

const state = resolveLocation("PC-RJ", "PC-RJ 2027");
assert.deepEqual({ scope: state.scope, state_code: state.state_code, latitude: state.latitude }, { scope: "ESTADUAL", state_code: "RJ", latitude: null });

const city = resolveLocation("Prefeitura de Niteroi", "Prefeitura de Niteroi 2027");
assert.deepEqual({ scope: city.scope, state_code: city.state_code, city: city.city }, { scope: "MUNICIPAL", state_code: "RJ", city: "Niteroi" });

const national = resolveLocation("PF", "Policia Federal - Agente");
assert.equal(national.scope, "NACIONAL");
assert.equal(national.label, "Nacional - sede administrativa em Brasilia");

assert.equal(calcHotScore({ status: "aberto", vagas: 1000, tier: 1, prova_data: null, salario: null }), 45);
assert.deepEqual(getHotCta({ simulado_slug: "inss-fgv-01", edital_url: "https://example.test/edital" }), { label: "Fazer simulado", href: "/simulados/inss-fgv-01" });
assert.deepEqual(getHotCta({ simulado_slug: null, edital_url: "https://example.test/edital" }), { label: "Ver edital", href: "https://example.test/edital" });
assert.equal(getHotCta({ simulado_slug: null, edital_url: null }), null);

console.log("1.2 validation passed");

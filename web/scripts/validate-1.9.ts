import assert from "node:assert/strict";
import { getOrCreateTrustedExplanation, type ExplanationCacheRecord } from "../src/lib/explanations/cache";
import { MAX_EXPLANATION_OUTPUT_TOKENS, explanationCacheKey, validateTrustedExplanation, type ExplanationQuestion } from "../src/lib/explanations/quality";

const question: ExplanationQuestion = {
  id: "q1", fingerprint: "abc123", discipline: "Matemática", subject: "Porcentagem",
  statement: "Um valor de cem reais recebe acréscimo de vinte por cento. Qual é o valor final?",
  alternatives: [{ key: "A", text: "120 reais" }, { key: "B", text: "110 reais" }, { key: "C", text: "100 reais" }],
  correctAnswer: "A",
};
const valid = {
  correctAnswer: "A",
  explanation: "Vinte por cento de cem reais correspondem a vinte reais, que devem ser somados ao valor inicial.",
  wrongAlternatives: { B: "A alternativa soma apenas dez por cento ao valor inicial, por isso chega a cento e dez reais.", C: "A alternativa ignora completamente o acréscimo percentual informado no enunciado." },
  conceptualReference: "Matemática — porcentagem — acréscimo percentual",
  explanationQuality: 0.92,
  confidence: 0.95,
};
assert.equal(validateTrustedExplanation(question, valid).correctAnswer, "A");
assert.throws(() => validateTrustedExplanation(question, { ...valid, wrongAlternatives: { B: valid.wrongAlternatives.B } }), /WRONG_ALTERNATIVES_INCOMPLETE/);
assert.throws(() => validateTrustedExplanation(question, { ...valid, confidence: 0.5 }), /CONFIDENCE_INSUFFICIENT/);
assert.match(explanationCacheKey(question), /^[a-f0-9]{64}$/);

async function main() {
const records = new Map<string, ExplanationCacheRecord>();
const cache = { get: async (key: string) => records.get(key) || null, put: async (record: ExplanationCacheRecord) => { records.set(record.cacheKey, record); } };
let calls = 0;
const generate = async ({ maxOutputTokens }: { prompt: string; maxOutputTokens: number }) => {
  calls += 1; assert.equal(maxOutputTokens, MAX_EXPLANATION_OUTPUT_TOKENS);
  return { value: valid, inputTokens: 220, outputTokens: 180 };
};
const blocked = await getOrCreateTrustedExplanation({ question, sourceConfidence: 0.4, cache, generate });
assert.equal(blocked.record, null); assert.equal(blocked.reason, "SOURCE_CONFIDENCE_INSUFFICIENT"); assert.equal(calls, 0);
const created = await getOrCreateTrustedExplanation({ question, sourceConfidence: 0.95, cache, generate });
assert.ok(created.record); assert.equal(created.callsUsed, 1); assert.equal(calls, 1);
const reused = await getOrCreateTrustedExplanation({ question, sourceConfidence: 0.95, cache, generate, callsUsed: 1 });
assert.ok(reused.record); assert.equal(reused.callsUsed, 1); assert.equal(calls, 1, "cached explanation must not call AI again");

const rejectedCache = { get: async () => null, put: async () => { throw new Error("LOW_CONFIDENCE_MUST_NOT_BE_CACHED"); } };
const rejected = await getOrCreateTrustedExplanation({ question: { ...question, fingerprint: "def456" }, sourceConfidence: 0.95, cache: rejectedCache, generate: async () => ({ value: { ...valid, confidence: 0.6 }, inputTokens: 100, outputTokens: 100 }) });
assert.equal(rejected.record, null); assert.match(rejected.reason || "", /CONFIDENCE_INSUFFICIENT/);
console.log("Sprint 1.9 confidence gate, complete explanation, cache reuse and AI budget tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

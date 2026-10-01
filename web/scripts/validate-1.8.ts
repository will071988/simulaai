import assert from "node:assert/strict";
import { GenerateSimuladoSchema, requestedQuantity, selectQuestions, type QuestionCandidate } from "../src/lib/simulados/engine";
import { createAttemptToken, hashAttemptToken, isAttemptToken } from "../src/lib/simulados/security";

const difficulties = ["FACIL", "MEDIO", "MEDIO", "DIFICIL"] as const;
const candidates: QuestionCandidate[] = Array.from({ length: 12 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  concursoId: "10000000-0000-4000-8000-000000000001",
  cargo: index < 8 ? "Analista" : "Técnico",
  disciplina: index % 2 ? "Português" : "Matemática",
  assunto: index % 2 ? "Interpretação" : "Porcentagem",
  banca: "FGV",
  nivel: "SUPERIOR",
  dificuldade: difficulties[index % difficulties.length],
}));

const base = GenerateSimuladoSchema.parse({
  sessionId: "20000000-0000-4000-8000-000000000001", concursoId: "10000000-0000-4000-8000-000000000001",
  mode: "RAPIDO", quantidade: 5, seed: "seed-reproduzivel", excludeQuestionIds: [],
});
const first = selectQuestions(candidates, base);
const second = selectQuestions([...candidates].reverse(), base);
assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id), "same seed must be deterministic regardless of input order");
assert.equal(first.length, 5);
assert.ok(new Set(first.map((item) => item.dificuldade)).size >= 2, "mixed difficulty should be distributed");

const unseen = selectQuestions(candidates, { ...base, quantidade: 4, excludeQuestionIds: first.map((item) => item.id) });
assert.ok(unseen.every((item) => !first.some((previous) => previous.id === item.id)), "unseen questions must be preferred when the pool is sufficient");

const filtered = selectQuestions(candidates, { ...base, quantidade: 3, disciplina: "Matemática", dificuldade: "MEDIO" });
assert.ok(filtered.every((item) => item.disciplina === "Matemática" && item.dificuldade === "MEDIO"));
assert.equal(requestedQuantity({ mode: "PROVA_SIMULADA" }), 30);
assert.equal(GenerateSimuladoSchema.safeParse({ sessionId: base.sessionId, mode: "POR_MATERIA" }).success, false);
assert.throws(() => selectQuestions(candidates.slice(0, 1), base), /INSUFFICIENT_QUESTIONS/);

const token = createAttemptToken();
assert.ok(isAttemptToken(token));
assert.match(hashAttemptToken(token), /^[a-f0-9]{64}$/);
assert.notEqual(hashAttemptToken(token), token);
console.log("Sprint 1.8 deterministic selection, filters, repetition avoidance and token tests passed");

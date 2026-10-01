import assert from "node:assert/strict";
import { buildQuestionGenerationPrompt, parseGeneratedQuestion, toDraftPersistence } from "../src/lib/questions/generation";
import { canTransitionQuestionQuality, isPermittedQuestionSource, validateQuestionDraft } from "../src/lib/questions/quality";
import { sanitizePublicAlternatives, toPublicQuestion } from "../src/lib/questions/publicQuestion";

const valid = {
  disciplina: "Raciocínio Lógico", assunto: "Proposições", subassunto: "Contraposição",
  enunciado: "Considere a proposição: se o candidato estuda, então ele melhora o desempenho. Assinale a equivalente.",
  alternativas: [
    { key: "A", text: "Se o candidato não melhora o desempenho, então ele não estuda.", isCorrect: true },
    { key: "B", text: "Se o candidato melhora o desempenho, então ele estuda." },
    { key: "C", text: "O candidato estuda se, e somente se, melhora o desempenho." },
  ],
  respostaCorreta: "A", explicacao: "A alternativa A apresenta a contrapositiva: não melhora implica que não estuda.",
  dificuldade: "MEDIO" as const, origem: "QUESTAO_AUTORAL" as const, banca: null, ano: 2026,
  cargo: "Analista", sourceUrl: null, sourceType: "OWN_CONTENT" as const,
};
assert.equal(validateQuestionDraft(valid).success, true);
assert.equal(validateQuestionDraft({ ...valid, alternativas: [valid.alternativas[0], { ...valid.alternativas[0], key: "B", isCorrect: false }] }).success, false);
assert.equal(validateQuestionDraft({ ...valid, respostaCorreta: "Z" }).success, false);
assert.equal(validateQuestionDraft({ ...valid, alternativas: valid.alternativas.map((a, index) => ({ ...a, isCorrect: index < 2 })) }).success, false);
assert.equal(validateQuestionDraft({ ...valid, enunciado: "Curta" }).success, false);
assert.equal(validateQuestionDraft({ ...valid, explicacao: "Uma explicação longa, porém sem qualquer relação com a resposta selecionada." }).success, false);
assert.equal(validateQuestionDraft({ ...valid, origem: "QUESTAO_IA", sourceType: "AI_GENERATED", banca: "FGV" }).success, false);
assert.equal(isPermittedQuestionSource("https://www.qconcursos.com/questao/1", "PUBLIC_PERMITTED"), false);
assert.equal(isPermittedQuestionSource("https://www.gov.br/exemplo", "PUBLIC_OFFICIAL"), true);
assert.equal(canTransitionQuestionQuality("DRAFT", "PUBLISHED"), false);
assert.equal(canTransitionQuestionQuality("DRAFT", "VALIDATED"), true);
assert.equal(canTransitionQuestionQuality("VALIDATED", "PUBLISHED"), true);

const generated = parseGeneratedQuestion({ ...valid, origem: undefined, banca: "Banca inventada", sourceType: undefined });
assert.equal(generated.origem, "QUESTAO_IA");
assert.equal(generated.banca, null);
assert.equal(toDraftPersistence(generated).quality_status, "DRAFT");
const prompt = buildQuestionGenerationPrompt({ editalExcerpt: "edital", conteudoProgramatico: "lógica", disciplina: "Lógica", assunto: "Proposições", dificuldade: "MEDIO" });
assert.match(prompt, /inédita/i);
assert.match(prompt, /não atribua autoria/i);
assert.deepEqual(sanitizePublicAlternatives([{ key: "A", text: "Correta", isCorrect: true }]), [{ key: "A", text: "Correta" }]);
const publicQuestion = toPublicQuestion({ id: "q", alternativas: valid.alternativas, resposta_correta: "A", explicacao: "segredo", validated_by: "curator" });
assert.equal("resposta_correta" in publicQuestion, false);
assert.equal("explicacao" in publicQuestion, false);
assert.equal("isCorrect" in (publicQuestion.alternativas as Record<string, unknown>[])[0], false);
console.log("Sprint 1.7 question schema, generation, copyright and quality-gate tests passed");

import { QuestionDraftSchema, type QuestionDraft } from "./quality";

export type QuestionGenerationContext = {
  editalExcerpt: string;
  conteudoProgramatico: string;
  disciplina: string;
  assunto: string;
  cargo?: string | null;
  dificuldade: "FACIL" | "MEDIO" | "DIFICIL";
};

export function buildQuestionGenerationPrompt(context: QuestionGenerationContext): string {
  return [
    "Crie uma questão inédita e autoral. Não copie questões existentes e não atribua autoria a qualquer banca.",
    "Retorne somente JSON compatível com o schema informado, com exatamente uma alternativa correta e explicação coerente.",
    `Disciplina: ${context.disciplina}`,
    `Assunto: ${context.assunto}`,
    `Cargo: ${context.cargo || "não informado"}`,
    `Dificuldade: ${context.dificuldade}`,
    `Conteúdo programático: ${context.conteudoProgramatico.slice(0, 4000)}`,
    `Trecho do edital: ${context.editalExcerpt.slice(0, 4000)}`,
  ].join("\n");
}

export function parseGeneratedQuestion(value: unknown): QuestionDraft {
  return QuestionDraftSchema.parse({
    ...(value as Record<string, unknown>),
    origem: "QUESTAO_IA",
    banca: null,
    sourceType: "AI_GENERATED",
  });
}

export function toDraftPersistence(question: QuestionDraft) {
  return {
    concurso_id: question.concursoId || null,
    disciplina: question.disciplina,
    assunto: question.assunto,
    subassunto: question.subassunto || null,
    enunciado: question.enunciado,
    alternativas: question.alternativas,
    resposta_correta: question.respostaCorreta,
    explicacao: question.explicacao,
    dificuldade: question.dificuldade,
    origem: question.origem,
    banca: question.banca || null,
    ano: question.ano || null,
    cargo: question.cargo || null,
    source_url: question.sourceUrl || null,
    source_type: question.sourceType,
    quality_status: "DRAFT" as const,
  };
}

import { z } from "zod";

export const QUESTION_ORIGINS = ["QUESTAO_OFICIAL", "QUESTAO_AUTORAL", "QUESTAO_IA"] as const;
export const QUESTION_QUALITY = ["DRAFT", "VALIDATED", "REJECTED", "PUBLISHED"] as const;

const AlternativeSchema = z.object({
  key: z.string().trim().min(1).max(5),
  text: z.string().trim().min(1).max(1000),
  isCorrect: z.boolean().optional(),
});

export const QuestionDraftSchema = z.object({
  concursoId: z.string().uuid().nullable().optional(),
  disciplina: z.string().trim().min(2).max(120),
  assunto: z.string().trim().min(2).max(160),
  subassunto: z.string().trim().min(2).max(160).nullable().optional(),
  enunciado: z.string().trim().min(20).max(5000),
  alternativas: z.array(AlternativeSchema).min(2).max(5),
  respostaCorreta: z.string().trim().min(1).max(5),
  explicacao: z.string().trim().min(20).max(5000),
  dificuldade: z.enum(["FACIL", "MEDIO", "DIFICIL"]),
  origem: z.enum(QUESTION_ORIGINS),
  banca: z.string().trim().min(2).max(100).nullable().optional(),
  ano: z.number().int().min(1900).max(new Date().getFullYear() + 1).nullable().optional(),
  cargo: z.string().trim().min(2).max(160).nullable().optional(),
  sourceUrl: z.string().url().startsWith("https://").nullable().optional(),
  sourceType: z.enum(["PUBLIC_OFFICIAL", "PUBLIC_PERMITTED", "OWN_CONTENT", "AI_GENERATED"]),
}).superRefine((question, ctx) => {
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const keys = question.alternativas.map((item) => normalized(item.key));
  const texts = question.alternativas.map((item) => normalized(item.text));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["alternativas"], message: "DUPLICATE_ALTERNATIVE_KEY" });
  if (new Set(texts).size !== texts.length) ctx.addIssue({ code: "custom", path: ["alternativas"], message: "DUPLICATE_ALTERNATIVE_TEXT" });
  const selected = question.alternativas.filter((item) => item.isCorrect === true);
  if (selected.length > 1) ctx.addIssue({ code: "custom", path: ["alternativas"], message: "MULTIPLE_CORRECT_ANSWERS" });
  const answer = question.alternativas.find((item) => normalized(item.key) === normalized(question.respostaCorreta));
  if (!answer) ctx.addIssue({ code: "custom", path: ["respostaCorreta"], message: "CORRECT_ANSWER_MISSING" });
  if (selected.length === 1 && normalized(selected[0].key) !== normalized(question.respostaCorreta)) ctx.addIssue({ code: "custom", path: ["respostaCorreta"], message: "CORRECT_ANSWER_MISMATCH" });
  if (answer) {
    const significant = normalized(answer.text).split(/\W+/).filter((token) => token.length >= 4);
    if (significant.length && !significant.some((token) => normalized(question.explicacao).includes(token))) {
      ctx.addIssue({ code: "custom", path: ["explicacao"], message: "EXPLANATION_INCOMPATIBLE" });
    }
  }
  if (question.origem === "QUESTAO_IA" && question.banca) ctx.addIssue({ code: "custom", path: ["banca"], message: "AI_QUESTION_CANNOT_CLAIM_OFFICIAL_BANK" });
  if (question.origem === "QUESTAO_IA" && question.sourceType !== "AI_GENERATED") ctx.addIssue({ code: "custom", path: ["sourceType"], message: "AI_SOURCE_TYPE_REQUIRED" });
  if (question.origem === "QUESTAO_OFICIAL" && (question.sourceType !== "PUBLIC_OFFICIAL" || !question.sourceUrl)) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "OFFICIAL_PUBLIC_SOURCE_REQUIRED" });
});

export type QuestionDraft = z.infer<typeof QuestionDraftSchema>;

export function validateQuestionDraft(input: unknown) {
  return QuestionDraftSchema.safeParse(input);
}

export function canTransitionQuestionQuality(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === "DRAFT") return to === "VALIDATED" || to === "REJECTED";
  if (from === "VALIDATED") return to === "PUBLISHED" || to === "REJECTED";
  if (from === "REJECTED") return to === "DRAFT";
  if (from === "PUBLISHED") return to === "REJECTED";
  return false;
}

export function isPermittedQuestionSource(url: string | null | undefined, sourceType: QuestionDraft["sourceType"]): boolean {
  if (["OWN_CONTENT", "AI_GENERATED"].includes(sourceType)) return !url || url.startsWith("https://");
  if (!url?.startsWith("https://")) return false;
  const hostname = new URL(url).hostname.toLowerCase();
  const blockedPrivateBases = ["qconcursos.com", "tecconcursos.com.br", "estrategiaconcursos.com.br"];
  return !blockedPrivateBases.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

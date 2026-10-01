import {
  MAX_EXPLANATION_CALLS_PER_REQUEST, MAX_EXPLANATION_INPUT_CHARS, MAX_EXPLANATION_INPUT_TOKENS, MAX_EXPLANATION_OUTPUT_TOKENS,
  explanationCacheKey, mayGenerateExplanation, validateTrustedExplanation,
  type ExplanationQuestion, type TrustedExplanation,
} from "./quality";

export type ExplanationCacheRecord = { cacheKey: string; explanation: TrustedExplanation; source: "AUTHORIAL" | "AI_ASSISTED"; inputTokens: number; outputTokens: number };
export type ExplanationCache = { get(cacheKey: string): Promise<ExplanationCacheRecord | null>; put(record: ExplanationCacheRecord): Promise<void> };
export type ExplanationGenerator = (input: { prompt: string; maxOutputTokens: number }) => Promise<{ value: unknown; inputTokens: number; outputTokens: number }>;

export function buildExplanationPrompt(question: ExplanationQuestion) {
  return [
    "Explique esta questão sem inventar fonte. Retorne resposta correta, explicação, justificativa de cada alternativa errada, referência conceitual, qualidade e confiança.",
    `Disciplina: ${question.discipline}`,
    `Assunto: ${question.subject}`,
    `Enunciado: ${question.statement}`,
    `Alternativas: ${question.alternatives.map((alternative) => `${alternative.key}) ${alternative.text}`).join(" | ")}`,
  ].join("\n").slice(0, MAX_EXPLANATION_INPUT_CHARS);
}

export async function getOrCreateTrustedExplanation(args: {
  question: ExplanationQuestion;
  sourceConfidence: number;
  cache: ExplanationCache;
  generate: ExplanationGenerator;
  callsUsed?: number;
}): Promise<{ record: ExplanationCacheRecord | null; callsUsed: number; reason?: string }> {
  const cacheKey = explanationCacheKey(args.question);
  const cached = await args.cache.get(cacheKey);
  if (cached) return { record: cached, callsUsed: args.callsUsed || 0 };
  const callsUsed = args.callsUsed || 0;
  if (!mayGenerateExplanation(args.sourceConfidence)) return { record: null, callsUsed, reason: "SOURCE_CONFIDENCE_INSUFFICIENT" };
  if (callsUsed >= MAX_EXPLANATION_CALLS_PER_REQUEST) return { record: null, callsUsed, reason: "CALL_BUDGET_EXHAUSTED" };
  const prompt = buildExplanationPrompt(args.question);
  const generated = await args.generate({ prompt, maxOutputTokens: MAX_EXPLANATION_OUTPUT_TOKENS });
  if (generated.inputTokens < 0 || generated.inputTokens > MAX_EXPLANATION_INPUT_TOKENS || generated.outputTokens < 0 || generated.outputTokens > MAX_EXPLANATION_OUTPUT_TOKENS) {
    return { record: null, callsUsed: callsUsed + 1, reason: "TOKEN_BUDGET_EXCEEDED" };
  }
  try {
    const explanation = validateTrustedExplanation(args.question, generated.value);
    const record: ExplanationCacheRecord = { cacheKey, explanation, source: "AI_ASSISTED", inputTokens: generated.inputTokens, outputTokens: generated.outputTokens };
    await args.cache.put(record);
    return { record, callsUsed: callsUsed + 1 };
  } catch (error) {
    return { record: null, callsUsed: callsUsed + 1, reason: error instanceof Error ? error.message : "EXPLANATION_REJECTED" };
  }
}

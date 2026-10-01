import { createHash } from "node:crypto";
import { z } from "zod";

export const MIN_EXPLANATION_CONFIDENCE = 0.8;
export const MIN_EXPLANATION_QUALITY = 0.8;
export const MAX_EXPLANATION_INPUT_CHARS = 12_000;
export const MAX_EXPLANATION_INPUT_TOKENS = 3_000;
export const MAX_EXPLANATION_OUTPUT_TOKENS = 800;
export const MAX_EXPLANATION_CALLS_PER_REQUEST = 1;

export const ExplanationSchema = z.object({
  correctAnswer: z.string().trim().min(1).max(5),
  explanation: z.string().trim().min(40).max(4_000),
  wrongAlternatives: z.record(z.string().trim().min(1).max(5), z.string().trim().min(20).max(2_000)),
  conceptualReference: z.string().trim().min(5).max(500),
  explanationQuality: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export type TrustedExplanation = z.infer<typeof ExplanationSchema>;
export type ExplanationQuestion = {
  id: string;
  fingerprint: string;
  statement: string;
  alternatives: Array<{ key: string; text: string }>;
  correctAnswer: string;
  discipline: string;
  subject: string;
};

export function explanationCacheKey(question: Pick<ExplanationQuestion, "fingerprint">, version = "v1") {
  return createHash("sha256").update(`question:${question.fingerprint}:explanation:${version}`).digest("hex");
}

export function validateTrustedExplanation(question: ExplanationQuestion, value: unknown): TrustedExplanation {
  const explanation = ExplanationSchema.parse(value);
  if (explanation.correctAnswer.toUpperCase() !== question.correctAnswer.toUpperCase()) throw new Error("EXPLANATION_ANSWER_MISMATCH");
  const incorrectKeys = question.alternatives.filter((alternative) => alternative.key.toUpperCase() !== question.correctAnswer.toUpperCase()).map((alternative) => alternative.key.toUpperCase()).sort();
  const explainedKeys = Object.keys(explanation.wrongAlternatives).map((key) => key.toUpperCase()).sort();
  if (incorrectKeys.join("|") !== explainedKeys.join("|")) throw new Error("EXPLANATION_WRONG_ALTERNATIVES_INCOMPLETE");
  if (explanation.confidence < MIN_EXPLANATION_CONFIDENCE || explanation.explanationQuality < MIN_EXPLANATION_QUALITY) throw new Error("EXPLANATION_CONFIDENCE_INSUFFICIENT");
  return explanation;
}

export function mayGenerateExplanation(sourceConfidence: number) {
  return Number.isFinite(sourceConfidence) && sourceConfidence >= MIN_EXPLANATION_CONFIDENCE;
}

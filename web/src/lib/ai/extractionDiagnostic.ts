import { z } from "zod";
import { generateWithFallback, smokeDependencies } from "./router";
import { GenerationBudget } from "./generationBudget";
import { closeSchemaObjects } from "./structured";
import { EXTRACT_CONCURSO_PROMPT } from "../collector/extractConcursoWithAI";
import { ExtractConcursoSchema } from "../collector/schemas";
import { extractionSemanticIssues } from "../collector/extractionSemantics";

export const EXTRACTION_DIAGNOSTIC_TEXT = [
  "EXERCÍCIO SINTÉTICO. Não representa um concurso real.",
  "INSTITUTO MUNICIPAL DE ESTUDOS APLICADOS",
  "Edital sintético nº 1/2026.",
  "Banca: Cebraspe, exclusivamente para este exercício sintético.",
  "Cargo: Analista Administrativo.",
  "Escolaridade: nível superior.",
  "São 12 vagas.",
  "Salário: R$ 4.200,00.",
  "Inscrições de 02/11/2026 até 20/11/2026.",
  "Prova em 15/12/2026.",
  "Abrangência nacional.",
  ...Array.from({ length: 12 }, () => "O exercício reúne procedimentos administrativos e orientações gerais de participação. As informações factuais são somente as explicitamente descritas neste texto sintético."),
].join("\n");

export async function runExtractionDiagnostic(model: string, reasoningPolicy: "provider-default" | "disabled", provider = "openrouter") {
  const budget = new GenerationBudget(1);
  const title = "INSTITUTO MUNICIPAL DE ESTUDOS APLICADOS";
  const semantic = (input: unknown) => { const parsed = ExtractConcursoSchema.safeParse(input); return parsed.success && extractionSemanticIssues(parsed.data, title, EXTRACTION_DIAGNOSTIC_TEXT, "Cebraspe").length === 0; };
  const result = await generateWithFallback({ taskType: "EXTRACT_CONCURSO", promptVersion: "synthetic-grounded-extraction-diagnostic-v1", prompt: EXTRACT_CONCURSO_PROMPT, input: { title, sourceName: "Cebraspe", snippet: EXTRACTION_DIAGNOSTIC_TEXT }, schema: closeSchemaObjects(z.toJSONSchema(ExtractConcursoSchema, { io: "input" })), reasoningPolicy }, { budget, validate: (input) => ExtractConcursoSchema.safeParse(input).success, semanticValidate: semantic }, smokeDependencies(provider, model));
  return { ok: result.ok, fixture: "synthetic-extraction", reasoningPolicy, requestedModel: model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN", httpStatus: result.httpStatus ?? null, latencyMs: result.latencyMs, bodyPresent: result.bodyPresent ?? false, parseSuccess: result.parseSuccess ?? false, schemaSuccess: ExtractConcursoSchema.safeParse(result.data).success, semanticSuccess: result.ok && semantic(result.data), generationDiagnostics: result.generationDiagnostics ?? null, physicalCalls: budget.calls, errorCode: result.errorCode ?? null, rateLimit: result.rateLimit ?? null, upstreamError: result.upstreamError ?? null };
}

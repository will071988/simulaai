import { generateWithFallback } from "@/lib/ai/router";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import type { GenerationBudget } from "@/lib/ai/generationBudget";
import { z } from "zod";
import { closeSchemaObjects } from "@/lib/ai/structured";
import { extractionSemanticIssues } from "./extractionSemantics";

export const EXTRACT_CONCURSO_PROMPT = "Extraia concurso. Retorne somente um objeto JSON com todos estes campos: {orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cadastro_reserva,cargos,escolaridade,scope,state_code,city,status,evidence:{...}}. orgao, banca, vagas e status são obrigatórios no JSON; use null quando ausentes. Use [] para listas ausentes. Copie literalmente o nome completo do órgão e dos cargos: não abrevie nem reformule. Não confunda escolaridade com cargo. Use datas ISO apenas quando a data estiver explícita no texto. Não suponha vagas zero para cadastro de reserva. Use status null quando não houver declaração literal do status. Evidence deve conter apenas citações literais curtas do texto, até 120 caracteres por campo; use {} quando não houver evidência. Não invente fatos, localização ou valores ausentes. Prompt v4 grounded.";

export async function extractConcursoWithAI(title: string, rawText: string, budget?: GenerationBudget, sourceName?: string) {
  return generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: EXTRACT_CONCURSO_PROMPT,
    input: { title, sourceName, snippet: rawText.slice(0, 4000) },
    promptVersion: "extract_concurso_v4_grounded",
    schema: closeSchemaObjects(z.toJSONSchema(ExtractConcursoSchema, { io: "input" })),
  }, { validate: (data) => ExtractConcursoSchema.safeParse(data).success, semanticValidate: (data) => {
    const parsed = ExtractConcursoSchema.safeParse(data);
    if (!parsed.success) return false;
    const issues = extractionSemanticIssues(parsed.data, title, rawText, sourceName);
    if (issues.length) console.info(JSON.stringify({ event: "ai_extraction_semantic_rejection", issues }));
    return issues.length === 0;
  }, budget });
}

import { generateWithFallback } from "@/lib/ai/router";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import type { GenerationBudget } from "@/lib/ai/generationBudget";

export const EXTRACT_CONCURSO_PROMPT = "Extraia concurso. Retorne somente um objeto JSON com todos estes campos: {orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cadastro_reserva,cargos,escolaridade,scope,state_code,city,status,evidence:{...}}. orgao, banca, vagas e status são obrigatórios no JSON; use null quando ausentes. Use [] para listas ausentes. Evidence deve conter apenas trechos literais do texto; use {} quando não houver evidência. Não invente fatos, localização ou valores ausentes. Prompt v3.";

export async function extractConcursoWithAI(title: string, rawText: string, budget?: GenerationBudget) {
  return generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: EXTRACT_CONCURSO_PROMPT,
    input: { title, snippet: rawText.slice(0, 4000) },
    promptVersion: "extract_concurso_v3",
  }, { validate: (data) => ExtractConcursoSchema.safeParse(data).success, budget });
}

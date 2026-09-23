import { generateWithFallback } from "@/lib/ai/router";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";

const PROMPT = "Extraia concurso. Retorne JSON {orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cadastro_reserva,cargos,escolaridade,scope,state_code,city,status,evidence:{...}}. Evidence deve conter trechos literais do texto. Não invente fatos, localização ou valores ausentes. Prompt v3.";

export async function extractConcursoWithAI(title: string, rawText: string) {
  return generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: PROMPT,
    input: { title, snippet: rawText.slice(0, 4000) },
    promptVersion: "extract_concurso_v3",
  }, { validate: (data) => ExtractConcursoSchema.safeParse(data).success });
}

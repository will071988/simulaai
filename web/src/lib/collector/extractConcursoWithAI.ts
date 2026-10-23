import { generateWithFallback } from "@/lib/ai/router";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import type { GenerationBudget } from "@/lib/ai/generationBudget";
import { z } from "zod";
import { closeSchemaObjects } from "@/lib/ai/structured";
import { extractionSemanticIssues } from "./extractionSemantics";

export const EXTRACT_CONCURSO_PROMPT = [
  "Extraia concurso. Retorne somente um objeto JSON de dados, sem explicação nem o schema.",
  "Campos: orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cadastro_reserva,cargos,escolaridade,scope,state_code,city,status,evidence.",
  "orgao, banca, vagas e status são obrigatórios no JSON; use null quando ausentes. Use [] para listas ausentes.",
  "Copie literalmente o nome completo do órgão e dos cargos: não abrevie nem reformule. Não confunda escolaridade com cargo.",
  "vagas e cadastro_reserva são números inteiros ou null, nunca booleanos. salario é número ou null, sem R$ ou separadores de milhar.",
  "Use datas ISO YYYY-MM-DD apenas quando explícitas. Não suponha vagas zero para cadastro de reserva.",
  "escolaridade é uma lista de FUNDAMENTAL, MEDIO, TECNICO ou SUPERIOR. scope é NACIONAL, ESTADUAL, MUNICIPAL, REGIONAL ou null. state_code é uma UF de duas letras ou null.",
  "Só preencha state_code se a sigla estiver explicitamente no trecho; nunca converta o nome do estado em sigla por conhecimento externo. Use null em caso de dúvida.",
  "Use status null quando não houver declaração literal do status. Não invente fatos, localização ou valores ausentes.",
  "evidence é um objeto contendo apenas citações literais curtas do texto, até 120 caracteres por campo. Cada chave deve ser o nome do campo correspondente.",
  "Nas citações, quebras de linha e espaços repetidos de PDF podem virar espaços simples, mas preserve todas as palavras, acentos e pontuação. Não junte trechos separados por outras palavras.",
  "OMITA de evidence todos os campos ausentes ou null. Nunca escreva justificativas como 'não informado', 'não consta', null ou paráfrases em evidence. Use {} se não houver citações.",
  "Prompt v6 grounded, com tipos explícitos, UF não inferida e evidências literais de PDF.",
].join(" ");

export async function extractConcursoWithAI(title: string, rawText: string, budget?: GenerationBudget, sourceName?: string) {
  return generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: EXTRACT_CONCURSO_PROMPT,
    input: { title, sourceName, snippet: rawText.slice(0, 4000) },
    promptVersion: "extract_concurso_v6_grounded",
    schema: closeSchemaObjects(z.toJSONSchema(ExtractConcursoSchema, { io: "input" })),
    reasoningPolicy: process.env.AI_EXTRACT_REASONING_POLICY === "disabled" ? "disabled" : "provider-default",
  }, { validate: (data) => ExtractConcursoSchema.safeParse(data).success, semanticValidate: (data) => {
    const parsed = ExtractConcursoSchema.safeParse(data);
    if (!parsed.success) return false;
    const issues = extractionSemanticIssues(parsed.data, title, rawText, sourceName);
    if (issues.length) console.info(JSON.stringify({ event: "ai_extraction_semantic_rejection", issues }));
    return issues.length === 0;
  }, budget });
}

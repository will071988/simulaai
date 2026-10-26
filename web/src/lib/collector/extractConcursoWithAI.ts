import { generateWithFallback } from "@/lib/ai/router";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import type { GenerationBudget } from "@/lib/ai/generationBudget";
import { extractionSemanticIssues } from "./extractionSemantics";
import { buildGroundedExtraction, EXTRACTION_PROMPT_VERSION } from "./extractionGrounding";
import type { AIResult } from "../ai/types";

export const EXTRACT_CONCURSO_PROMPT = [
  "Extraia concurso. Retorne somente um objeto JSON de dados, sem explicação nem o schema.",
  "Extraia SOMENTE os campos listados em fieldsToExtract, além de evidence. O contrato é específico deste documento; não inclua escolaridade, status ou números que não foram solicitados.",
  "orgao e banca são obrigatórios. Para os demais campos solicitados, use null quando ausentes e [] para listas ausentes. Não adicione campos fora de fieldsToExtract.",
  "Copie literalmente o nome completo do órgão e dos cargos: não abrevie nem reformule. Não confunda escolaridade com cargo.",
  "Em tabelas com colunas Cargo e Qualificação, não una colunas: em Cargo 2: Soldado QPBM/1, o cargo é Soldado. Uma linha posterior QPBM/2 não autoriza inventar Soldado QPBM/2. Preserve hífens do nome, como Oficial de Estado-Maior. Frases como que trata este edital não são cargos.",
  "Não converta o nome de um serviço, adjetivo ou título resumido do evento em cargo. Em outorga de delegações de serventias, use cargos [] se não houver denominação literal de cargo na fonte.",
  "vagas e cadastro_reserva são números inteiros ou null, nunca booleanos. salario é número ou null, sem R$ ou separadores de milhar.",
  "Use datas ISO YYYY-MM-DD apenas quando explícitas. Não suponha vagas zero para cadastro de reserva.",
  "escolaridade é uma lista de FUNDAMENTAL, MEDIO, TECNICO ou SUPERIOR. scope é NACIONAL, ESTADUAL, MUNICIPAL, REGIONAL ou null. state_code é uma UF de duas letras ou null.",
  "Escolaridade exige trecho com grau acadêmico explícito, como ensino/nível superior, graduação, bacharelado ou licenciatura; não deduza do nome do cargo ou de uma menção genérica a requisitos.",
  "Só preencha state_code se a sigla estiver explicitamente no trecho; nunca converta o nome do estado em sigla por conhecimento externo. Use null em caso de dúvida.",
  "Use status null quando não houver declaração literal do status. Não invente fatos, localização ou valores ausentes.",
  "Use CANCELADO somente para cancelamento explícito de todo o concurso/certame/processo seletivo, nunca para cancelamento de uma inscrição ou pagamento individual.",
  "A fonte está em excerpts, cada trecho com id E001, E002 etc. Em evidence, indique arrays de IDs existentes para os campos extraídos, por exemplo {vagas:[\"E004\"]}. Nunca redigite citações.",
  "Todo valor não-null e toda lista não vazia exige IDs de evidência. A banca pode ser copiada de sourceName sem ID. Se não conseguir citar um campo, retorne null ou [] em vez de adivinhar.",
  "Use apenas trechos fornecidos. Para campos com vários cargos ou fatos, cite até quatro IDs. Trechos distantes serão mantidos como citações separadas. Não cite IDs inexistentes nem combine palavras de trechos diferentes para inventar um cargo.",
  "Cite o trecho com o rótulo do campo e o valor, não só um número isolado; por exemplo, salário precisa de contexto de remuneração, não de taxa de inscrição.",
  "OMITA de evidence campos ausentes ou null. Use {} quando não houver fatos extraídos. Não escreva justificativas ou texto livre em evidence.",
  "Prompt v8 com escopo de campos e referências verificáveis da fonte.",
].join(" ");

export async function extractConcursoWithAI(title: string, rawText: string, budget?: GenerationBudget, sourceName?: string): Promise<AIResult<ExtractConcurso> & { degraded?: boolean }> {
  let grounded: ReturnType<typeof buildGroundedExtraction>;
  try { grounded = buildGroundedExtraction(title, rawText, sourceName); }
  catch { return { ok: false, provider: "none", model: "", latencyMs: 0, errorCode: "INVALID_INPUT" }; }
  let semanticIssues: string[] = [];
  const result = await generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: EXTRACT_CONCURSO_PROMPT,
    input: grounded.input,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schema: grounded.schema,
    reasoningPolicy: process.env.AI_EXTRACT_REASONING_POLICY === "disabled" ? "disabled" : "provider-default",
  }, { decode: grounded.decode, validate: (data) => ExtractConcursoSchema.safeParse(data).success, semanticValidate: (data) => {
    const parsed = ExtractConcursoSchema.safeParse(data);
    if (!parsed.success) return false;
    semanticIssues = extractionSemanticIssues(parsed.data, title, rawText, sourceName);
    if (semanticIssues.length) console.info(JSON.stringify({ event: "ai_extraction_semantic_rejection", issues: semanticIssues }));
    return semanticIssues.length === 0;
  }, budget });
  return { ...result, ...(grounded.decodingIssues.length ? { validationIssues: grounded.decodingIssues } : {}), groundingRecoveredFields: grounded.recoveredFields, unrequestedFields: grounded.unrequestedFields, semanticIssues: result.errorCode === "SCHEMA_SEMANTIC_ERROR" ? semanticIssues : [] };
}

import type { ExtractConcurso } from "./schemas";
import { isLiteralExtractionEvidence, extractionEvidenceQuotes, numericEvidenceMatches, SCHOOLING_EVIDENCE_PATTERNS } from "./extractionEvidence";
import { enrichDocument } from "./enrichment";
import { isSchoolingCategory } from "../contest-role";
import { normalizeContestStatus, findContestStatusEvidence } from "./contestStatus";

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const validDate = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
export function extractionSemanticIssues(value: ExtractConcurso, title: string, rawText: string, sourceName?: string): string[] {
  const issues: string[] = [];
  const source = fold(`${title}\n${rawText}`);
  const evidence = value.evidence || {};
  const deterministic = enrichDocument(title, rawText);
  const quotes = (field: keyof typeof evidence) => extractionEvidenceQuotes(evidence[field]).map((quote) => quote.trim()).filter(Boolean);
  const someQuote = (field: keyof typeof evidence, matches: (quote: string) => boolean) => quotes(field).some(matches);
  const literal = (field: keyof typeof evidence) => isLiteralExtractionEvidence(field, evidence[field], rawText, value[field]);
  for (const field of Object.keys(evidence) as Array<keyof typeof evidence>) if (quotes(field).length && !literal(field)) issues.push(`${field}:NON_LITERAL_EVIDENCE`);
  if (!value.orgao || /^(orgao|desconhecido|nao informado)$/i.test(fold(value.orgao)) || !source.includes(fold(value.orgao))) issues.push("orgao:UNSUPPORTED_IDENTITY");
  if (!value.banca || (!source.includes(fold(value.banca)) && fold(value.banca) !== fold(sourceName || ""))) issues.push("banca:UNSUPPORTED_IDENTITY");
  for (const field of ["vagas", "salario", "cadastro_reserva"] as const) {
    const claimed = value[field];
    if (claimed == null || deterministic[field] === claimed) continue;
    const numbers = quotes(field).flatMap((quote) => numericEvidenceMatches(field, quote).map((match) => match.value));
    if (!literal(field) || !numbers.includes(claimed)) issues.push(`${field}:UNSUPPORTED_NUMBER`);
  }
  for (const field of ["inscricao_inicio", "inscricao_fim", "prova_data"] as const) {
    const claimed = value[field];
    if (!claimed) continue;
    const [year, month, day] = claimed.split("-");
    const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const writtenDate = new RegExp(`\\b0?${Number(day)}\\s+de\\s+${months[Number(month) - 1]}\\s+de\\s+${year}\\b`);
    if (!validDate(claimed) || (deterministic[field] !== claimed && (!literal(field) || !someQuote(field, (quote) => quote.includes(claimed) || quote.includes(`${day}/${month}/${year}`) || writtenDate.test(fold(quote)))))) issues.push(`${field}:UNSUPPORTED_DATE`);
  }
  if (value.inscricao_inicio && value.inscricao_fim && value.inscricao_inicio > value.inscricao_fim) issues.push("inscricao:REVERSED_RANGE");
  if (value.prova_data && value.inscricao_fim && value.prova_data < value.inscricao_fim) issues.push("prova_data:BEFORE_REGISTRATION_END");
  for (const role of value.cargos || []) if (isSchoolingCategory(role) || !source.includes(fold(role)) || (!deterministic.cargos.includes(role) && (!literal("cargos") || !someQuote("cargos", (quote) => fold(quote).includes(fold(role)))))) issues.push("cargos:UNSUPPORTED_ROLE");
  for (const level of value.escolaridade || []) if (!deterministic.escolaridade.includes(level) && (!literal("escolaridade") || !someQuote("escolaridade", (quote) => Boolean(SCHOOLING_EVIDENCE_PATTERNS[level]?.test(quote))))) issues.push("escolaridade:UNSUPPORTED_LEVEL");
  for (const field of ["city", "state_code"] as const) if (value[field] && deterministic[field] !== value[field] && (!literal(field) || !someQuote(field, (quote) => field === "state_code" ? new RegExp(`(?:^|[^\\p{L}\\p{N}])${value[field]}(?=$|[^\\p{L}\\p{N}])`, "u").test(quote.toUpperCase()) : fold(quote).includes(fold(value[field]!))))) issues.push(`${field}:UNSUPPORTED_LOCATION`);
  if (value.scope && deterministic.scope !== value.scope && (!literal("scope") || !someQuote("scope", (quote) => ({ NACIONAL: /nacional/, ESTADUAL: /estadual|estado/, MUNICIPAL: /municipal|municipio|prefeitura/, REGIONAL: /regional/ }[value.scope!]).test(fold(quote))))) issues.push("scope:UNSUPPORTED_SCOPE");
  if (value.status) {
    const status = normalizeContestStatus(value.status);
    if (!status || !literal("status") || !findContestStatusEvidence(status, rawText) || !someQuote("status", (quote) => Boolean(findContestStatusEvidence(status, quote)))) issues.push("status:UNSUPPORTED_STATUS");
  }
  return [...new Set(issues)];
}

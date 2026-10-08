import type { ExtractConcurso } from "./schemas";
import { enrichDocument } from "./enrichment";
import { isSchoolingCategory } from "../contest-role";
import { normalizeContestStatus } from "./contestStatus";

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const validDate = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
export function extractionSemanticIssues(value: ExtractConcurso, title: string, rawText: string, sourceName?: string): string[] {
  const issues: string[] = [];
  const source = fold(`${title}\n${rawText}`);
  const evidence = value.evidence || {};
  const deterministic = enrichDocument(title, rawText);
  const quote = (field: keyof typeof evidence) => evidence[field]?.trim() || "";
  const literal = (field: keyof typeof evidence) => quote(field).length >= 3 && rawText.toLowerCase().includes(quote(field).toLowerCase());
  for (const field of Object.keys(evidence) as Array<keyof typeof evidence>) if (quote(field) && !literal(field)) issues.push(`${field}:NON_LITERAL_EVIDENCE`);
  if (!value.orgao || /^(orgao|desconhecido|nao informado)$/i.test(fold(value.orgao)) || !source.includes(fold(value.orgao))) issues.push("orgao:UNSUPPORTED_IDENTITY");
  if (!value.banca || (!source.includes(fold(value.banca)) && fold(value.banca) !== fold(sourceName || ""))) issues.push("banca:UNSUPPORTED_IDENTITY");
  for (const field of ["vagas", "salario", "cadastro_reserva"] as const) {
    const claimed = value[field];
    if (claimed == null || deterministic[field] === claimed) continue;
    const numbers = [...quote(field).matchAll(/\b\d+(?:[.,]\d+)*/g)].map((match) => Number(match[0].includes(",") ? match[0].replace(/\./g, "").replace(",", ".") : match[0]));
    const context = { vagas: /vagas|quantitativo|quantidade|qtd/, salario: /salario|remuneracao|vencimento|r\$/, cadastro_reserva: /cadastro|reserva|\bcr\b/ }[field];
    if (!literal(field) || !context.test(fold(quote(field))) || !numbers.includes(claimed)) issues.push(`${field}:UNSUPPORTED_NUMBER`);
  }
  for (const field of ["inscricao_inicio", "inscricao_fim", "prova_data"] as const) {
    const claimed = value[field];
    if (!claimed) continue;
    const [year, month, day] = claimed.split("-");
    const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const writtenDate = new RegExp(`\\b0?${Number(day)}\\s+de\\s+${months[Number(month) - 1]}\\s+de\\s+${year}\\b`);
    if (!validDate(claimed) || (deterministic[field] !== claimed && (!literal(field) || (!quote(field).includes(claimed) && !quote(field).includes(`${day}/${month}/${year}`) && !writtenDate.test(fold(quote(field))))))) issues.push(`${field}:UNSUPPORTED_DATE`);
  }
  if (value.inscricao_inicio && value.inscricao_fim && value.inscricao_inicio > value.inscricao_fim) issues.push("inscricao:REVERSED_RANGE");
  if (value.prova_data && value.inscricao_fim && value.prova_data < value.inscricao_fim) issues.push("prova_data:BEFORE_REGISTRATION_END");
  for (const role of value.cargos || []) if (isSchoolingCategory(role) || !source.includes(fold(role)) || (!deterministic.cargos.includes(role) && (!literal("cargos") || !fold(quote("cargos")).includes(fold(role))))) issues.push("cargos:UNSUPPORTED_ROLE");
  const schoolingPatterns: Record<string, RegExp> = { FUNDAMENTAL: /fundamental/i, MEDIO: /medio/i, TECNICO: /tecnic/i, SUPERIOR: /superior|graduacao/i };
  for (const level of value.escolaridade || []) if (!deterministic.escolaridade.includes(level) && (!literal("escolaridade") || !schoolingPatterns[level]?.test(fold(quote("escolaridade"))))) issues.push("escolaridade:UNSUPPORTED_LEVEL");
  for (const field of ["city", "state_code"] as const) if (value[field] && deterministic[field] !== value[field] && (!literal(field) || !fold(quote(field)).includes(fold(value[field]!)))) issues.push(`${field}:UNSUPPORTED_LOCATION`);
  if (value.scope && deterministic.scope !== value.scope && (!literal("scope") || !({ NACIONAL: /nacional/, ESTADUAL: /estadual|estado/, MUNICIPAL: /municipal|municipio|prefeitura/, REGIONAL: /regional/ }[value.scope]).test(fold(quote("scope"))))) issues.push("scope:UNSUPPORTED_SCOPE");
  if (value.status) {
    const status = normalizeContestStatus(value.status);
    const statusTerms = status?.toLowerCase().replace(/_/g, " ");
    if (!status || !literal("status") || !fold(quote("status")).includes(statusTerms!)) issues.push("status:UNSUPPORTED_STATUS");
  }
  return [...new Set(issues)];
}

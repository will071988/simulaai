import type { ContestIdentity } from "./entityResolution";
import { normalizeBaseEditalNumber, type IdentityAlias } from "./identityAliases";

export type DocumentRelationship = "ORIGINAL" | "RETIFICATION" | "REPUBLICATION" | "REOPENING" | "COMMUNICATION" | "SAME_CONTEST_UPDATE" | "NEW_CONTEST" | "POSSIBLE_SAME_CONTEST" | "UNKNOWN";
export type RelationshipResult = { relationship: DocumentRelationship; confidence: number; reasons: string[]; hardConflicts: string[] };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

export function classifyDocumentRelationship(input: { title: string; rawText?: string; incoming: ContestIdentity; candidate?: ContestIdentity | null; candidateAliases?: IdentityAlias[] }): RelationshipResult {
  const text = normalize(`${input.title}\n${input.rawText || ""}`);
  const reasons: string[] = [];
  const hardConflicts: string[] = [];
  const baseEdital = normalizeBaseEditalNumber(input.incoming.editalNumber || text);
  const explicit = /RETIFIC|ALTERACAO DO EDITAL|REPUBLICAC|REABERTURA|PRORROGA.{0,20}INSCRI|COMUNICADO|ERRATA|CORRECAO|EM SUBSTITUICAO|NOVO CRONOGRAMA|PROCESSO MIGRADO|RENUMERACAO/.test(text);
  const replacement = /EM SUBSTITUICAO AO PROCESSO|NOVO NUMERO DE PROCESSO|PROCESSO MIGRADO|RENUMERACAO/.test(text);
  const aliases = input.candidateAliases || [];
  const aliasMatch = aliases.some((alias) => (alias.alias_type === "EDITAL" && alias.alias_value === baseEdital) || (alias.alias_type === "PROCESS" && text.includes(alias.alias_value)) || (alias.alias_type === "OFFICIAL_SLUG" && alias.alias_value === input.incoming.officialSlug));
  if (aliasMatch) reasons.push("EXPLICIT_REFERENCE_TO_EXISTING_ALIAS");
  if (input.candidate && input.candidate.orgao !== input.incoming.orgao) hardConflicts.push("ORGAO_DIFERENTE");
  if (input.candidate?.cargoKey && input.incoming.cargoKey && input.candidate.cargoKey !== input.incoming.cargoKey && !explicit) hardConflicts.push("CARGO_DIFERENTE");
  const candidateBase = normalizeBaseEditalNumber(input.candidate?.editalNumber);
  if (candidateBase && baseEdital && candidateBase !== baseEdital && !explicit) hardConflicts.push("EDITAL_DIFERENTE_SEM_CONTINUIDADE");
  if (hardConflicts.length) return { relationship: "NEW_CONTEST", confidence: 0.98, reasons, hardConflicts };
  if (!input.candidate && !aliasMatch) return { relationship: "NEW_CONTEST", confidence: 0.75, reasons, hardConflicts };
  const confidence = aliasMatch ? 0.95 : explicit ? 0.82 : 0.72;
  if (/RETIFIC|ALTERACAO DO EDITAL|ERRATA|CORRECAO/.test(text)) return { relationship: "RETIFICATION", confidence, reasons, hardConflicts };
  if (/REPUBLICAC/.test(text)) return { relationship: "REPUBLICATION", confidence, reasons, hardConflicts };
  if (/REABERTURA|PRORROGA.{0,20}INSCRI/.test(text)) return { relationship: "REOPENING", confidence, reasons, hardConflicts };
  if (/COMUNICADO/.test(text)) return { relationship: "COMMUNICATION", confidence, reasons, hardConflicts };
  if (replacement || aliasMatch) return { relationship: "SAME_CONTEST_UPDATE", confidence, reasons, hardConflicts };
  return { relationship: "POSSIBLE_SAME_CONTEST", confidence, reasons, hardConflicts };
}

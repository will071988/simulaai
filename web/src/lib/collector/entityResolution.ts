import { normalizeBaseEditalNumber } from "./identityAliases";

const aliases: Record<string, string> = { "INSTITUTO BRASILEIRO DO MEIO AMBIENTE": "IBAMA", "POLICIA FEDERAL": "PF", "POLÍCIA FEDERAL": "PF", "PREFEITURA MUNICIPAL DO SALVADOR": "PREFEITURA_SALVADOR", "PREFEITURA DE SALVADOR": "PREFEITURA_SALVADOR" };
const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const normalizeOrganization = (value: string) => aliases[clean(value)] || clean(value);
export const normalizeBanca = (value: string | null) => value ? clean(value) : "UNKNOWN";
export const normalizeCargo = (value: string | null) => value ? clean(value).replace(/\b(DE|DA|DO|E)\b/g, "").replace(/\s+/g, "_") : null;
export const normalizeContestTitle = (value: string) => clean(value).replace(/\b(CONCURSO|PUBLICO|EDITAL|PROCESSO|SELETIVO)\b/g, "").replace(/\s+/g, " ").trim();
export const extractContestYear = (value: string) => value.match(/\b20\d{2}\b/)?.[0] || "UNKNOWN";

export type ContestIdentity = { orgao: string; ano: string; banca: string; editalNumber: string | null; processNumber: string | null; cargoKey: string | null; cargoGroupKey: string | null; officialSlug: string | null; officialSource: string | null; titleKey: string };
export type IdentitySignalsInput = { title: string; url: string; rawText?: string; sourceName?: string; orgao: string; banca?: string | null; cargos?: string[] | null; escolaridade?: string[] | null };
export type EntityResolution = { score: number; decision: "AUTO_MATCH" | "POSSIBLE_DUPLICATE" | "NEW_ENTITY"; reason: string; hardConflicts: string[]; identity: ContestIdentity };

function extractGroup(text: string, escolaridade?: string[] | null) {
  const v = clean(text);
  if (/GUARDA|POLICIA|SEGURANCA/.test(v)) return "SEGURANCA_PUBLICA";
  if (/PROFESSOR|MAGISTERIO|DOCENTE/.test(v)) return "MAGISTERIO";
  if (/MEDICO|ENFERMAGEM|SAUDE/.test(v)) return "AREA_SAUDE";
  if (escolaridade?.includes("SUPERIOR") || /NIVEL SUPERIOR|GRADUACAO/.test(v)) return "NIVEL_SUPERIOR";
  if (escolaridade?.includes("MEDIO") || /NIVEL MEDIO/.test(v)) return "NIVEL_MEDIO";
  return null;
}

export function extractIdentitySignals(input: IdentitySignalsInput): ContestIdentity {
  const text = `${input.title}\n${input.rawText || ""}`;
  const edital = normalizeBaseEditalNumber(text);
  const process = text.match(/PROCESSO(?:\s+SELETIVO|\s+ADMINISTRATIVO)?\s*(?:N[ºO]\.?|NUMERO)?\s*([\d.]+\/20\d{2})/i)?.[1]?.replace(/\s+/g, "") || null;
  const slug = new URL(input.url).pathname.match(/\/concursos\/([^/?#]+)/i)?.[1]?.toLowerCase() || null;
  const cargos = input.cargos?.map(normalizeCargo).filter((value): value is string => value !== null && !/^NIVEL_(MEDIO|SUPERIOR|FUNDAMENTAL|TECNICO)_?$/.test(value)) as string[] | undefined;
  const titleCargo = /GUARDA(?:\s+CIVIL)?\s+MUNICIPAL/i.test(text) ? "GUARDA CIVIL MUNICIPAL" : null;
  const cargoKey = normalizeCargo(titleCargo) || cargos?.[0] || normalizeCargo(text.match(/(?:CARGO|FUNCAO)\s*(?:DE|:)?\s*([A-Za-zÀ-ÿ ]{3,70})/i)?.[1] || null);
  const cargoGroupKey = extractGroup(text, input.escolaridade);
  return { orgao: normalizeOrganization(input.orgao), ano: extractContestYear(text), banca: normalizeBanca(input.banca || null), editalNumber: edital, processNumber: process, cargoKey, cargoGroupKey, officialSlug: slug, officialSource: input.sourceName ? clean(input.sourceName) : null, titleKey: normalizeContestTitle(input.title) };
}

export function stableEntityKey(identity: ContestIdentity): string | null {
  const prefix = `${identity.orgao}|${identity.ano}`;
  if (identity.editalNumber) return `${prefix}|EDITAL:${identity.editalNumber}`;
  if (identity.processNumber) return `${prefix}|PROCESSO:${identity.processNumber}`;
  if (identity.officialSource && identity.officialSlug) return `${prefix}|${identity.officialSource}|SLUG:${identity.officialSlug}`;
  if (identity.cargoKey && identity.banca !== "UNKNOWN") return `${prefix}|${identity.banca}|CARGO:${identity.cargoKey}`;
  if (identity.cargoGroupKey && identity.banca !== "UNKNOWN") return `${prefix}|${identity.banca}|GRUPO:${identity.cargoGroupKey}`;
  return null;
}

export function scoreEntity(candidate: ContestIdentity, incoming: ContestIdentity): EntityResolution {
  let score = 0; const reasons: string[] = []; const hardConflicts: string[] = [];
  if (candidate.orgao === incoming.orgao) { score += 25; reasons.push("orgao"); }
  if (candidate.ano !== "UNKNOWN" && candidate.ano === incoming.ano) { score += 10; reasons.push("ano"); }
  if (candidate.banca !== "UNKNOWN" && incoming.banca !== "UNKNOWN" && candidate.banca === incoming.banca) { score += 10; reasons.push("banca"); }
  if (candidate.editalNumber && incoming.editalNumber) { if (candidate.editalNumber === incoming.editalNumber) { score += 45; reasons.push("edital"); } else hardConflicts.push("EDITAL_DIFERENTE"); }
  if (candidate.processNumber && incoming.processNumber) { if (candidate.processNumber === incoming.processNumber) { score += 45; reasons.push("processo"); } else hardConflicts.push("PROCESSO_DIFERENTE"); }
  if (candidate.officialSource && incoming.officialSource && candidate.officialSource === incoming.officialSource && candidate.officialSlug && incoming.officialSlug) { if (candidate.officialSlug === incoming.officialSlug) { score += 40; reasons.push("slug"); } else hardConflicts.push("SLUG_OFICIAL_DIFERENTE"); }
  if (candidate.cargoKey && incoming.cargoKey) { if (candidate.cargoKey === incoming.cargoKey) { score += 30; reasons.push("cargo"); } else hardConflicts.push("CARGO_DIFERENTE"); }
  if (candidate.cargoGroupKey && incoming.cargoGroupKey) { if (candidate.cargoGroupKey === incoming.cargoGroupKey) { score += 20; reasons.push("grupo"); } else hardConflicts.push("GRUPO_DIFERENTE"); }
  const a = new Set(candidate.titleKey.split(" ")); const b = new Set(incoming.titleKey.split(" ")); if ([...a].filter((word) => word.length > 3 && b.has(word)).length >= 2) { score += 10; reasons.push("titulo"); }
  const certainDifferent = hardConflicts.includes("EDITAL_DIFERENTE") || hardConflicts.includes("PROCESSO_DIFERENTE") || (hardConflicts.includes("SLUG_OFICIAL_DIFERENTE") && hardConflicts.includes("CARGO_DIFERENTE"));
  const decision = certainDifferent ? "NEW_ENTITY" : hardConflicts.length ? (score >= 65 ? "POSSIBLE_DUPLICATE" : "NEW_ENTITY") : score >= 85 && (reasons.includes("edital") || reasons.includes("processo") || reasons.includes("slug") || reasons.includes("cargo") || reasons.includes("grupo")) ? "AUTO_MATCH" : score >= 65 ? "POSSIBLE_DUPLICATE" : "NEW_ENTITY";
  return { score, decision, reason: reasons.join(","), hardConflicts, identity: incoming };
}

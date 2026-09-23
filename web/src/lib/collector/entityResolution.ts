const aliases: Record<string, string> = { "INSTITUTO BRASILEIRO DO MEIO AMBIENTE": "IBAMA", "POLICIA FEDERAL": "PF", "POLÍCIA FEDERAL": "PF" };
const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const normalizeOrganization = (value: string) => aliases[clean(value)] || clean(value);
export const normalizeBanca = (value: string | null) => value ? clean(value) : "UNKNOWN";
export const normalizeContestTitle = (value: string) => clean(value).replace(/\b(CONCURSO|PUBLICO|PROCESSO|SELETIVO|EDITAL)\b/g, "").replace(/\s+/g, " ").trim();
export const extractContestYear = (value: string) => value.match(/\b20\d{2}\b/)?.[0] || "UNKNOWN";
export const stableEntityKey = (orgao: string, banca: string | null, title: string) => `${normalizeOrganization(orgao)}|${extractContestYear(title)}|${normalizeBanca(banca)}`;
export function scoreEntity(candidate: { orgao: string; banca: string | null; titulo: string }, incoming: { orgao: string; banca: string | null; titulo: string }) {
  let score = 0; const reasons: string[] = [];
  if (normalizeOrganization(candidate.orgao) === normalizeOrganization(incoming.orgao)) { score += 40; reasons.push("orgao"); }
  if (extractContestYear(candidate.titulo) === extractContestYear(incoming.titulo) && extractContestYear(incoming.titulo) !== "UNKNOWN") { score += 30; reasons.push("ano"); }
  if (normalizeBanca(candidate.banca) !== "UNKNOWN" && normalizeBanca(candidate.banca) === normalizeBanca(incoming.banca)) { score += 20; reasons.push("banca"); }
  const a = new Set(normalizeContestTitle(candidate.titulo).split(" ")); const b = new Set(normalizeContestTitle(incoming.titulo).split(" ")); if ([...a].some((word) => word.length > 3 && b.has(word))) { score += 10; reasons.push("titulo"); }
  return { score, reason: reasons.join(",") };
}

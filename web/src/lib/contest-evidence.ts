export type PublicEvidence = {
  field_name: string; value_json: unknown; source_url: string; source_tier: number;
  evidence_text: string; [key: string]: unknown;
};
export type PublicDocument = { source_url: string; [key: string]: unknown };

const supportedFields = new Set(["titulo", "orgao", "banca", "vagas", "salario", "inscricao_inicio", "inscricao_fim", "prova_data", "cargos", "escolaridade", "status", "scope", "state_code", "city", "location_label", "latitude", "longitude", "edital_number"]);
const fold = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR") : value;

export function isContestId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isPublicSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function matchesCanonical(current: unknown, evidenced: unknown) {
  if (Array.isArray(current)) {
    const values = Array.isArray(evidenced) ? evidenced : [evidenced];
    return values.length > 0 && values.every((value) => current.some((candidate) => fold(candidate) === fold(value)));
  }
  if (typeof current === "number") return typeof evidenced === "number" && current === evidenced;
  return current != null && evidenced != null && fold(current) !== "" && fold(current) === fold(evidenced);
}

export function filterCurrentContestEvidence(contest: Record<string, unknown>, evidence: PublicEvidence[], documents: PublicDocument[]) {
  const linkedSources = new Set(documents.map((document) => document.source_url));
  if (typeof contest.edital_url === "string") linkedSources.add(contest.edital_url);
  return evidence.filter((item) => supportedFields.has(item.field_name)
    && item.invalidation_reason == null
    && item.source_tier >= 1 && item.source_tier <= 3
    && isPublicSourceUrl(item.source_url)
    && linkedSources.has(item.source_url)
    && !/website coleta informações[\s\S]+cookies[\s\S]+funcionamento técnico/i.test(item.evidence_text)
    && matchesCanonical(contest[item.field_name], item.value_json));
}

/** Confirm an array only when every displayed member has official support. */
export function hasOfficialFieldEvidence(contest: Record<string, unknown>, evidence: PublicEvidence[], field: string) {
  const official = evidence.filter((item) => item.field_name === field && item.source_tier === 1 && matchesCanonical(contest[field], item.value_json));
  const current = contest[field];
  if (!Array.isArray(current)) return official.length > 0;
  return current.length > 0 && current.every((value) => official.some((item) =>
    (Array.isArray(item.value_json) ? item.value_json : [item.value_json]).some((candidate) => fold(candidate) === fold(value))));
}

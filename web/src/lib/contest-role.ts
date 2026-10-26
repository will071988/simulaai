/** Schooling categories describe eligibility, never a position by themselves. */
export function isSchoolingCategory(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return /^(?:(?:de\s+)?nivel|ensino|escolaridade|formacao)\s+(?:fundamental|medio|tecnico|superior|graduacao)\b/.test(normalized)
    || /^(?:fundamental|medio|superior|graduacao)(?:\s+complet[oa])?$/.test(normalized);
}

/** Narrative clauses are not role names, even when copied literally from an edital. */
export function isProceduralRole(value: string): boolean {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /^(?:que|ao|aos|em|e\s+as?|publico|publica|vagas?|qualificacao)\b/.test(normalized)
    || /\b(?:compreendera|compreenderao|trata|tratarem|serao|sera|vierem|inscreveu|distribuidos|distribuidas|classificado|classificada)\b/.test(normalized);
}

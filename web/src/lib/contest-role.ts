/** Schooling categories describe eligibility, never a position by themselves. */
export function isSchoolingCategory(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return /^(?:(?:de\s+)?nivel|ensino|escolaridade|formacao)\s+(?:fundamental|medio|tecnico|superior|graduacao)\b/.test(normalized)
    || /^(?:fundamental|medio|superior|graduacao)(?:\s+complet[oa])?$/.test(normalized);
}

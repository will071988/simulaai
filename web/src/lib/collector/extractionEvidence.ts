import { BRAZILIAN_STATE_CODES, type ExtractConcurso } from "./schemas";

export type ExtractionEvidenceField = keyof NonNullable<ExtractConcurso["evidence"]>;
export const normalizeEvidenceText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
export const SCHOOLING_EVIDENCE_PATTERNS: Record<string, RegExp> = {
  FUNDAMENTAL: /(?:ensino|n[ií]vel|escolaridade|requisito|forma[cç][aã]o)[^.;\n]{0,80}fundamental|fundamental\s+completo/i,
  MEDIO: /(?:ensino|n[ií]vel|escolaridade|requisito|forma[cç][aã]o)[^.;\n]{0,80}m[eé]dio|m[eé]dio\s+completo/i,
  TECNICO: /(?:curso|ensino|n[ií]vel|escolaridade|requisito|forma[cç][aã]o|diploma)[^.;\n]{0,80}t[eé]cnic[oa]|t[eé]cnic[oa]\s+complet[oa]/i,
  SUPERIOR: /(?:ensino|n[ií]vel|curso|escolaridade|requisito|forma[cç][aã]o|diploma)[^.;\n]{0,80}superior|gradua[cç][aã]o|superior\s+complet[oa]|\bbacharel(?:ado)?\b|\blicenciatura\b/i,
};
export function extractionEvidenceQuotes(value: unknown): string[] {
  return typeof value === "string" ? [value] : Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
export function serializeExtractionEvidence(value: unknown): string | undefined {
  const quotes = extractionEvidenceQuotes(value);
  return quotes.length === 1 ? quotes[0] : quotes.length ? JSON.stringify(quotes) : undefined;
}

export function numericEvidenceMatches(field: "vagas" | "salario" | "cadastro_reserva", quote: string): Array<{ value: number; start: number; end: number }> {
  const patterns = {
    vagas: /\b(\d+(?:\.\d{3})*)(?:\s*\([^)]{1,40}\))?\s+vagas?\b|\bvagas?(?:\s+(?:imediatas|ofertadas|dispon[ií]veis|totais))?\s*[:=]\s*(\d+(?:\.\d{3})*)/gi,
    salario: /(?:sal[aá]rio|remunera[cç][aã]o|vencimentos?|subs[ií]dio)[^.;\n]{0,80}?R\$\s*(\d+(?:[.,]\d+)*)/gi,
    cadastro_reserva: /\b(\d+(?:\.\d{3})*)\s+(?:vagas?\s+)?(?:para\s+)?(?:cadastro(?:\s+de)?\s+reserva|CR)\b|\b(?:cadastro(?:\s+de)?\s+reserva|CR)\s*[:=]\s*(\d+(?:\.\d{3})*)/gi,
  };
  return [...quote.matchAll(patterns[field])].map((match) => {
    const text = match[1] || match[2];
    const value = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text);
    return { value, start: match.index!, end: match.index! + match[0].length };
  });
}

export function isLiteralExtractionEvidence(field: ExtractionEvidenceField, quote: unknown, rawText: string, value?: unknown): boolean {
  if (Array.isArray(quote)) return quote.length > 0 && quote.every((item) => isLiteralExtractionEvidence(field, item, rawText, value));
  if (typeof quote !== "string") return false;
  const text = quote.trim();
  if (field === "state_code" && text.length === 2 && BRAZILIAN_STATE_CODES.some((code) => code === text.toUpperCase()) && value === text.toUpperCase()) {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${text.toUpperCase()}(?=$|[^\\p{L}\\p{N}])`, "u").test(rawText);
  }
  return text.length >= 3 && normalizeEvidenceText(rawText).includes(normalizeEvidenceText(text));
}

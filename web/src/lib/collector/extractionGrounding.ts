import { z } from "zod";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import { closeSchemaObjects } from "../ai/structured";
import { extractionSemanticIssues } from "./extractionSemantics";
import { numericEvidenceMatches, SCHOOLING_EVIDENCE_PATTERNS, type ExtractionEvidenceField } from "./extractionEvidence";

export const EXTRACTION_PROMPT_VERSION = "extract_concurso_v7_1_source_refs";
const FIELDS = ["orgao", "banca", "vagas", "salario", "inscricao_inicio", "inscricao_fim", "prova_data", "cadastro_reserva", "cargos", "escolaridade", "scope", "state_code", "city", "status"] as const;
const MAX_TEXT = 4000;
const MAX_SPAN = 640;
type Excerpt = { id: string; text: string; start: number; end: number };
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Minimize over-citation while keeping every asserted value. Search exclusively
// inside referenced source spans; never drop a fact to make validation pass.
function supportingQuotes(field: ExtractionEvidenceField, value: unknown, candidates: string[]): string[] {
  const claimed = Array.isArray(value) ? value : [value];
  const selected: Array<{ candidate: string; start: number; end: number }> = [];
  for (const item of claimed) {
    if (item == null) continue;
    let proof: { candidate: string; start: number; end: number } | undefined;
    for (const candidate of candidates) {
      let start = -1, end = -1;
      if (field === "vagas" || field === "salario" || field === "cadastro_reserva") {
        const match = numericEvidenceMatches(field, candidate).find((match) => match.value === item);
        if (match) { start = match.start; end = match.end; }
      } else if (typeof item === "string") {
        let pattern: RegExp | undefined;
        if (field === "scope") pattern = { NACIONAL: /nacional/i, ESTADUAL: /estadual|estado/i, MUNICIPAL: /municipal|munic[ií]pio|prefeitura/i, REGIONAL: /regional/i }[item];
        if (field === "escolaridade") pattern = SCHOOLING_EVIDENCE_PATTERNS[item];
        if (field === "state_code") pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${item}(?=$|[^\\p{L}\\p{N}])`, "u");
        if (["inscricao_inicio", "inscricao_fim", "prova_data"].includes(field)) {
          const [year, month, day] = item.split("-");
          const months = ["janeiro", "fevereiro", "mar[cç]o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
          pattern = new RegExp(`${item}|${day}/${month}/${year}|\\b0?${Number(day)}\\s+de\\s+${months[Number(month) - 1]}\\s+de\\s+${year}\\b`, "i");
        }
        if (pattern) {
          const match = pattern.exec(candidate);
          if (match) { start = match.index; end = start + match[0].length; }
        } else {
          const text = field === "status" ? item.replace(/_/g, " ") : item;
          start = fold(candidate).indexOf(fold(text)); end = start + text.length;
        }
      }
      if (start >= 0 && end >= start) {
        // Bounded, contiguous context from the source, including the field label.
        proof = { candidate, start: Math.max(0, start - 45), end: Math.min(candidate.length, end + 45) };
        break;
      }
    }
    if (!proof) throw new Error("INVALID_EVIDENCE_REFERENCE");
    const existing = selected.find((quote) => quote.candidate === proof!.candidate && Math.max(quote.end, proof!.end) - Math.min(quote.start, proof!.start) <= MAX_SPAN);
    if (existing) { existing.start = Math.min(existing.start, proof.start); existing.end = Math.max(existing.end, proof.end); }
    else selected.push(proof);
  }
  return [...new Set(selected.map((quote) => quote.candidate.slice(quote.start, quote.end)))];
}

// Fixed source spans let the model cite IDs instead of rewriting PDF quotations.
// IDs are stable for this document, independent of which excerpts are selected.
function sourceExcerpts(rawText: string) {
  const source = rawText.replace(/\s+/g, " ").trim();
  const excerpts: Excerpt[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + 160, source.length);
    if (end < source.length) {
      const boundary = source.lastIndexOf(" ", end);
      if (boundary > start + 80) end = boundary;
    }
    excerpts.push({ id: `E${String(excerpts.length + 1).padStart(3, "0")}`, text: source.slice(start, end), start, end });
    start = end;
    while (source[start] === " ") start++;
  }
  const selected = new Set<number>();
  let used = 0;
  const add = (index: number) => {
    const item = excerpts[index];
    if (!item || selected.has(index)) return;
    const size = JSON.stringify({ id: item.id, text: item.text }).length + 1;
    if (used + size > MAX_TEXT) return;
    selected.add(index); used += size;
  };
  for (let index = 0; index < Math.min(6, excerpts.length); index++) add(index);
  const educationIndex = excerpts.findIndex((item, position) => Object.values(SCHOOLING_EVIDENCE_PATTERNS).some((pattern) => pattern.test(`${item.text} ${excerpts[position + 1]?.text || ""}`)));
  if (educationIndex >= 0) { add(educationIndex); add(educationIndex + 1); }
  // Reserve room for different fact types before a long salary/vacancy table
  // consumes the entire input budget and hides the registration calendar.
  for (const pattern of [/\d+\s+vagas?|vagas?\s*[:=]/i, /sal[aá]rio|remunera[cç][aã]o|vencimento|subs[ií]dio/i, /inscri[cç].{0,100}\d|\d.{0,60}inscri[cç]/i, /prova(?:s)?.{0,100}\d|\d.{0,60}prova(?:s)?/i, /cargo\s*\d*\s*:/i, /requisito|escolaridade/i, /abrang[eê]ncia|lota[cç][aã]o/i]) {
    const index = excerpts.findIndex((item, position) => pattern.test(`${item.text} ${excerpts[position + 1]?.text || ""}`));
    if (index >= 0) { add(index); add(index + 1); }
  }
  const priorities = excerpts.map((item, index) => ({ index, score:
    (/(?:R\$|remunera[cç][aã]o|sal[aá]rio|subs[ií]dio|\b\d+\s+vagas?\b|cronograma)/i.test(item.text) ? 4 : 0)
    + (/(?:inscri[cç]|prova(?:s)?|cadastro.{0,8}reserva)/i.test(item.text) ? 3 : 0)
    + (/(?:cargo\s*\d*\s*:|requisito|escolaridade|abrang[eê]ncia|Cebraspe)/i.test(item.text) ? 2 : 0)
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of priorities) { add(item.index); add(item.index + 1); add(item.index - 1); }
  for (let index = 6; index < excerpts.length; index++) add(index);
  return { source, excerpts: [...selected].sort((a, b) => a - b).map((index) => excerpts[index]) };
}

export function buildGroundedExtraction(title: string, rawText: string, sourceName?: string) {
  const { source, excerpts } = sourceExcerpts(rawText);
  if (!excerpts.length) throw new Error("INVALID_INPUT");
  const reference = z.enum(excerpts.map((item) => item.id) as [string, ...string[]]);
  const evidenceShape = Object.fromEntries(FIELDS.map((field) => [field, z.array(reference).max(excerpts.length).optional()])) as Record<typeof FIELDS[number], z.ZodOptional<z.ZodArray<typeof reference>>>;
  const wireSchema = ExtractConcursoSchema.omit({ evidence: true }).extend({ evidence: z.object(evidenceShape) });
  const byId = new Map(excerpts.map((item) => [item.id, item]));
  const decodingIssues: string[] = [];
  return {
    decodingIssues,
    input: { title: title.slice(0, 200), sourceName: sourceName?.slice(0, 100), excerpts: excerpts.map((item) => ({ id: item.id, text: item.text })) },
    schema: closeSchemaObjects(z.toJSONSchema(wireSchema, { io: "input" })),
    decode(value: unknown): ExtractConcurso {
      decodingIssues.length = 0;
      const parsed = wireSchema.safeParse(value);
      if (!parsed.success) {
        decodingIssues.push(...parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".")}:${issue.code}`));
        throw new Error("INVALID_MODEL_OUTPUT");
      }
      const wire = parsed.data;
      const evidence: NonNullable<ExtractConcurso["evidence"]> = {};
      for (const field of FIELDS) {
        const ids = wire.evidence[field];
        const fieldValue = wire[field];
        if (field === "banca" && typeof fieldValue === "string" && fieldValue.toLowerCase() === sourceName?.toLowerCase()) continue;
        if (!ids?.length) {
          const value = wire[field];
          const present = value != null && (!Array.isArray(value) || value.length > 0);
          const trustedSource = field === "banca" && typeof value === "string" && value.toLowerCase() === sourceName?.toLowerCase();
          if (present && !trustedSource) { decodingIssues.push(`${field}:MISSING_EVIDENCE_REFERENCE`); throw new Error("INVALID_EVIDENCE_REFERENCE"); }
          continue;
        }
        const spans = [...new Set(ids)].map((id) => byId.get(id)!).sort((a, b) => a.start - b.start);
        const groups: Array<{ start: number; end: number }> = [];
        for (const span of spans) {
          const previous = groups.at(-1);
          if (previous && span.start <= previous.end + 1) previous.end = span.end;
          else groups.push({ start: span.start, end: span.end });
        }
        let quotes: string[];
        try { quotes = supportingQuotes(field, fieldValue, groups.map((group) => source.slice(group.start, group.end))); }
        catch { decodingIssues.push(`${field}:UNSUPPORTED_REFERENCED_VALUE`); throw new Error("INVALID_EVIDENCE_REFERENCE"); }
        if (!quotes.length) continue;
        if (quotes.length > 4 || quotes.reduce((sum, quote) => sum + quote.length, 0) > MAX_SPAN) { decodingIssues.push(`${field}:EVIDENCE_QUOTE_LIMIT`); throw new Error("INVALID_EVIDENCE_REFERENCE"); }
        // Distant spans stay separate quotes. Never invent a contiguous phrase.
        evidence[field] = quotes.length === 1 ? quotes[0] : quotes;
      }
      return ExtractConcursoSchema.parse({ ...wire, evidence });
    },
  };
}

export function validateStoredExtraction(value: unknown, title: string, rawText: string, sourceName?: string): { success: true; data: ExtractConcurso; issues: string[] } | { success: false; issues: string[] } {
  if (value == null) return { success: false, issues: [] };
  const parsed = ExtractConcursoSchema.safeParse(value);
  if (!parsed.success) return { success: false, issues: ["INVALID_STORED_SCHEMA"] };
  const issues = extractionSemanticIssues(parsed.data, title, rawText, sourceName);
  return issues.length ? { success: false, issues } : { success: true, data: parsed.data, issues: [] };
}

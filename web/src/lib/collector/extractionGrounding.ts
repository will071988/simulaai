import { z } from "zod";
import { createHash } from "node:crypto";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import { closeSchemaObjects } from "../ai/structured";
import { extractionSemanticIssues } from "./extractionSemantics";
import { numericEvidenceMatches, SCHOOLING_EVIDENCE_PATTERNS, type ExtractionEvidenceField } from "./extractionEvidence";
import { CONTEST_STATUSES, findContestStatusEvidence } from "./contestStatus";

export const EXTRACTION_PROMPT_VERSION = "extract_concurso_v8_1_literal_roles";
const FIELDS = ["orgao", "banca", "vagas", "salario", "inscricao_inicio", "inscricao_fim", "prova_data", "cadastro_reserva", "cargos", "escolaridade", "scope", "state_code", "city", "status"] as const;
const MAX_TEXT = 4000;
const MAX_SPAN = 640;
type Excerpt = { id: string; text: string; start: number; end: number };
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Minimize over-citation while keeping every asserted value. The same strict
// field-specific verifier is used for cited spans and full-source recovery.
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
      } else if (field === "status" && typeof item === "string") {
        const match = findContestStatusEvidence(item, candidate);
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
          const text = item;
          start = fold(candidate).indexOf(fold(text)); end = start + text.length;
        }
      }
      if (start >= 0 && end >= start) {
        // Bounded, contiguous context from the source, including the field label.
        const context = field === "cargos" ? 12 : 45;
        proof = { candidate, start: Math.max(0, start - context), end: Math.min(candidate.length, end + context) };
        break;
      }
    }
    if (!proof) throw new Error("INVALID_EVIDENCE_REFERENCE");
    const existing = selected.find((quote) => quote.candidate === proof!.candidate && proof!.start <= quote.end + 24 && quote.start <= proof!.end + 24 && Math.max(quote.end, proof!.end) - Math.min(quote.start, proof!.start) <= MAX_SPAN);
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
  type School = NonNullable<ExtractConcurso["escolaridade"]>[number];
  const schools = Object.entries(SCHOOLING_EVIDENCE_PATTERNS).filter(([, pattern]) => pattern.test(source)).map(([school]) => school as School);
  const statuses = CONTEST_STATUSES.filter((status) => findContestStatusEvidence(status, source));
  const requested = FIELDS.filter((field) => {
    if (field === "escolaridade") return schools.length > 0;
    if (field === "status") return statuses.length > 0;
    if (field === "vagas" || field === "salario" || field === "cadastro_reserva") return numericEvidenceMatches(field, source).length > 0;
    return true;
  });
  const requestedSet = new Set<string>(requested);
  const reference = z.enum(excerpts.map((item) => item.id) as [string, ...string[]]);
  const evidenceShape = Object.fromEntries(requested.map((field) => [field, z.array(reference).max(excerpts.length).optional()]));
  const wireShape: Record<string, z.ZodType> = Object.fromEntries(requested.map((field) => [field, ExtractConcursoSchema.shape[field]]));
  if (schools.length) wireShape.escolaridade = z.array(z.enum(schools as [School, ...School[]])).optional();
  if (statuses.length) wireShape.status = z.enum(statuses as [typeof CONTEST_STATUSES[number], ...(typeof CONTEST_STATUSES[number])[]]).nullable();
  wireShape.evidence = z.object(evidenceShape);
  const wireSchema = z.object(wireShape);
  type Wire = Partial<Omit<ExtractConcurso, "evidence">> & { evidence: Partial<Record<typeof FIELDS[number], string[]>> };
  const byId = new Map(excerpts.map((item) => [item.id, item]));
  const decodingIssues: string[] = [];
  const recoveredFields: string[] = [];
  const unrequestedFields: string[] = [];
  return {
    decodingIssues,
    recoveredFields,
    unrequestedFields,
    input: { title: title.slice(0, 200), sourceName: sourceName?.slice(0, 100), fieldsToExtract: requested, sourceHash: createHash("sha256").update(rawText).digest("hex"), excerpts: excerpts.map((item) => ({ id: item.id, text: item.text })) },
    schema: closeSchemaObjects(z.toJSONSchema(wireSchema, { io: "input" })),
    decode(value: unknown): ExtractConcurso {
      decodingIssues.length = 0;
      recoveredFields.length = 0;
      unrequestedFields.length = 0;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const raw = value as Record<string, unknown>;
        for (const field of FIELDS) if (!requestedSet.has(field) && raw[field] != null && (!Array.isArray(raw[field]) || raw[field].length > 0)) unrequestedFields.push(field);
      }
      const parsed = wireSchema.safeParse(value);
      if (!parsed.success) {
        decodingIssues.push(...parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".")}:${issue.code}`));
        throw new Error("INVALID_MODEL_OUTPUT");
      }
      const wire = parsed.data as Wire;
      const evidence: NonNullable<ExtractConcurso["evidence"]> = {};
      for (const field of requested) {
        const ids = wire.evidence[field];
        const fieldValue = wire[field];
        const present = fieldValue != null && (!Array.isArray(fieldValue) || fieldValue.length > 0);
        if (!present) continue;
        if (field === "banca" && typeof fieldValue === "string" && fieldValue.toLowerCase() === sourceName?.toLowerCase()) continue;
        const spans = [...new Set(ids || [])].map((id) => byId.get(id)!).sort((a, b) => a.start - b.start);
        const groups: Array<{ start: number; end: number }> = [];
        for (const span of spans) {
          const previous = groups.at(-1);
          if (previous && span.start <= previous.end + 1) previous.end = span.end;
          else groups.push({ start: span.start, end: span.end });
        }
        let quotes: string[] = [];
        try { quotes = supportingQuotes(field, fieldValue, groups.map((group) => source.slice(group.start, group.end))); }
        catch { /* A model reference is a hint, never proof on its own. */ }
        if (!quotes.length) {
          try { quotes = supportingQuotes(field, fieldValue, [source]); recoveredFields.push(field); }
          catch { decodingIssues.push(`${field}:UNSUPPORTED_SOURCE_VALUE`); throw new Error("INVALID_EVIDENCE_REFERENCE"); }
        }
        if (!quotes.length) continue;
        const roleCount = field === "cargos" && Array.isArray(fieldValue) ? fieldValue.length : 0;
        const quoteLimit = roleCount ? Math.max(4, roleCount) : 4;
        const textLimit = roleCount ? Math.min(16000, Math.max(MAX_SPAN, (fieldValue as string[]).reduce((sum, role) => sum + role.length, 0) + roleCount * 48)) : MAX_SPAN;
        if (quotes.length > quoteLimit || quotes.reduce((sum, quote) => sum + quote.length, 0) > textLimit) { decodingIssues.push(`${field}:EVIDENCE_QUOTE_LIMIT`); throw new Error("INVALID_EVIDENCE_REFERENCE"); }
        // Distant spans stay separate quotes. Never invent a contiguous phrase.
        evidence[field] = quotes.length === 1 ? quotes[0] : quotes;
      }
      return ExtractConcursoSchema.parse({ vagas: null, status: null, ...wire, evidence });
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

import { isIP } from "node:net";
import { isSafeUrl } from "@/lib/collector/security";

export const conflictFields = ["titulo", "orgao", "banca", "vagas", "salario", "inscricao_inicio", "inscricao_fim", "prova_data", "cadastro_reserva", "cargos", "escolaridade", "status", "scope", "state_code", "city", "location_label", "latitude", "longitude", "edital_number", "process_number"] as const;
export const conflictContestColumns = `id,quality_status,is_publishable,updated_at,${conflictFields.join(",")}`;
export const conflictEvidenceColumns = "id,field_name,value_json,source_url,source_name,source_tier,document_id,evidence_text,confidence,observed_at,invalidation_reason";
export const conflictDocumentColumns = "id,collector_document_id,document_type,relationship_type,source_url,source_name,published_at,observed_at,is_current";
export const conflictChangeColumns = "id,field_name,old_value,new_value,source_url,source_name,source_tier,evidence_text,observed_at,detected_at,relationship_type";

type Row = Record<string, unknown>;
export type ConflictPage = { offset: number; limit: number; total: number; hasMore: boolean };
export type ConflictPagination = { limit: number; evidenceOffset: number; documentsOffset: number; changesOffset: number; auditOffset: number };
export type ConflictEvidence = {
  id: string; value_json: unknown; source_url: string | null; source_name: string | null;
  source_tier: number; document_id: string | null; evidence_text: string; evidence_truncated: boolean;
  confidence: number; observed_at: string; invalidation_reason: string | null;
  relation: "MATCHES_CURRENT" | "DIFFERS_FROM_CURRENT" | "INVALIDATED";
};
export type ConflictDocument = {
  id: string; collector_document_id: string; document_type: string | null; relationship_type: string;
  source_url: string | null; source_name: string | null; published_at: string | null; observed_at: string; is_current: boolean;
};
export type ConflictChange = {
  id: string; field_name: string; old_value: unknown; new_value: unknown; source_url: string | null;
  source_name: string | null; source_tier: number | null; evidence_text: string; evidence_truncated: boolean;
  observed_at: string | null; detected_at: string; relationship_type: string | null;
};
export type ConflictDetail = {
  contest: { id: string; titulo: string; orgao: string; quality_status: string; is_publishable: boolean; updated_at: string };
  fields: { field_name: string; current_value: unknown; evidence: ConflictEvidence[] }[];
  documents: ConflictDocument[];
  acceptedChanges: ConflictChange[];
  latestReview: { review_note: string; reviewed_at: string; reviewed_by: string | null } | null;
  audit: { id: string; action: string; note: string | null; created_at: string; actor_user_id: string | null }[];
  pagination: { evidence: ConflictPage; documents: ConflictPage; acceptedChanges: ConflictPage; audit: ConflictPage };
  /** The collector persists accepted changes, not its historical KEEP_CURRENT/CONFLICT decisions. */
  decisionHistoryAvailable: false;
};

export function parseConflictPagination(params: URLSearchParams): ConflictPagination | null {
  const allowed = new Set(["limit", "evidenceOffset", "documentsOffset", "changesOffset", "auditOffset"]);
  if ([...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1)) return null;
  const values: Record<string, number> = {};
  for (const key of allowed) {
    const raw = params.get(key);
    const value = raw === null ? (key === "limit" ? 50 : 0) : /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < (key === "limit" ? 1 : 0) || value > (key === "limit" ? 100 : 1_000_000)) return null;
    values[key] = value;
  }
  return values as ConflictPagination;
}

/** These are outbound document links only; this endpoint never fetches their contents. */
export function safeConflictSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !isSafeUrl(value)) return null;
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) || !hostname.includes(".") || hostname.endsWith(".localhost") || url.port) return null;
  return url.href;
}

const string = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
const nullableString = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : null;

// Factual fields contain scalars/string arrays, never arbitrary nested objects or raw documents.
function factualValue(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => typeof item === "string" ? item.slice(0, 4000) : typeof item === "number" || typeof item === "boolean" ? item : null);
  return null;
}

export function buildConflictDetail(input: {
  contest: Row; evidence: Row[]; documents: Row[]; changes: Row[]; review: Row | null; audit: Row[];
  counts: { evidence: number; documents: number; changes: number; audit: number }; pagination: ConflictPagination;
}): ConflictDetail {
  const { contest, pagination } = input;
  const page = (offset: number, total: number): ConflictPage => ({ offset, limit: pagination.limit, total, hasMore: offset + pagination.limit < total });
  return {
    contest: { id: string(contest.id), titulo: string(contest.titulo), orgao: string(contest.orgao), quality_status: string(contest.quality_status), is_publishable: contest.is_publishable === true, updated_at: string(contest.updated_at) },
    fields: conflictFields.map((field_name) => ({
      field_name, current_value: factualValue(contest[field_name]),
      evidence: input.evidence.filter((row) => row.field_name === field_name).map((row) => ({
        id: string(row.id), value_json: factualValue(row.value_json), source_url: safeConflictSourceUrl(row.source_url),
        source_name: nullableString(row.source_name), source_tier: Number(row.source_tier), document_id: nullableString(row.document_id),
        evidence_text: string(row.evidence_text), evidence_truncated: typeof row.evidence_text === "string" && row.evidence_text.length > 4000,
        confidence: Number(row.confidence), observed_at: string(row.observed_at), invalidation_reason: nullableString(row.invalidation_reason),
        relation: row.invalidation_reason != null ? "INVALIDATED" : JSON.stringify(contest[field_name]) === JSON.stringify(row.value_json) ? "MATCHES_CURRENT" : "DIFFERS_FROM_CURRENT",
      })),
    })),
    documents: input.documents.map((row) => ({ id: string(row.id), collector_document_id: string(row.collector_document_id), document_type: nullableString(row.document_type), relationship_type: string(row.relationship_type), source_url: safeConflictSourceUrl(row.source_url), source_name: nullableString(row.source_name), published_at: nullableString(row.published_at), observed_at: string(row.observed_at), is_current: row.is_current === true })),
    acceptedChanges: input.changes.filter((row) => conflictFields.includes(row.field_name as typeof conflictFields[number])).map((row) => ({ id: string(row.id), field_name: string(row.field_name), old_value: factualValue(row.old_value), new_value: factualValue(row.new_value), source_url: safeConflictSourceUrl(row.source_url), source_name: nullableString(row.source_name), source_tier: row.source_tier == null ? null : Number(row.source_tier), evidence_text: string(row.evidence_text), evidence_truncated: typeof row.evidence_text === "string" && row.evidence_text.length > 4000, observed_at: nullableString(row.observed_at), detected_at: string(row.detected_at), relationship_type: nullableString(row.relationship_type) })),
    latestReview: input.review ? { review_note: string(input.review.review_note, 2000), reviewed_at: string(input.review.reviewed_at), reviewed_by: nullableString(input.review.reviewed_by) } : null,
    audit: input.audit.map((row) => ({ id: string(row.id), action: string(row.action), note: nullableString(row.note, 2000), created_at: string(row.created_at), actor_user_id: nullableString(row.actor_user_id) })),
    pagination: { evidence: page(pagination.evidenceOffset, input.counts.evidence), documents: page(pagination.documentsOffset, input.counts.documents), acceptedChanges: page(pagination.changesOffset, input.counts.changes), audit: page(pagination.auditOffset, input.counts.audit) },
    decisionHistoryAvailable: false,
  };
}

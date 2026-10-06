import { NextResponse } from "next/server";
import { authorizeOperations } from "@/lib/admin/authorize";
import { buildConflictDetail, conflictChangeColumns, conflictContestColumns, conflictDocumentColumns, conflictEvidenceColumns, conflictFields, parseConflictPagination } from "@/lib/admin/conflict-detail";
import { isContestId } from "@/lib/contest-evidence";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";
import { readCountedPage } from "@/lib/admin/pagination";

export const dynamic = "force-dynamic";
const reply = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });

async function handleGET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorizeOperations(request);
    if (!access.user) return reply({ ok: false, error: access.status === 401 ? "AUTH_REQUIRED" : access.status === 403 ? "ADMIN_ONLY" : "ADMIN_LOOKUP_FAILED" }, access.status);
    const { id } = await context.params;
    if (!isContestId(id)) return reply({ ok: false, error: "INVALID_CONFLICT_ID" }, 400);
    const pagination = parseConflictPagination(new URL(request.url).searchParams);
    if (!pagination) return reply({ ok: false, error: "INVALID_PAGINATION" }, 400);
    const svc = supabaseService();
    const contest = await svc.from("concursos").select(conflictContestColumns).eq("id", id).eq("quality_status", "CONFLICTED").maybeSingle().overrideTypes<Record<string, unknown>, { merge: false }>();
    if (contest.error) return reply({ ok: false, error: "CONFLICT_QUERY_FAILED" }, 503);
    if (!contest.data) return reply({ ok: false, error: "CONFLICT_NOT_FOUND" }, 404);
    const { limit, evidenceOffset, documentsOffset, changesOffset, auditOffset } = pagination;
    const [evidence, documents, changes, review, audit] = await Promise.all([
      readCountedPage(svc.from("concurso_field_evidence").select(conflictEvidenceColumns, { count: "exact" }).eq("concurso_id", id).in("field_name", [...conflictFields]).order("observed_at", { ascending: false }).order("id", { ascending: false }).range(evidenceOffset, evidenceOffset + limit - 1), evidenceOffset, () => svc.from("concurso_field_evidence").select("id", { count: "exact", head: true }).eq("concurso_id", id).in("field_name", [...conflictFields])),
      readCountedPage(svc.from("concurso_documents").select(conflictDocumentColumns, { count: "exact" }).eq("concurso_id", id).order("observed_at", { ascending: false }).order("id", { ascending: false }).range(documentsOffset, documentsOffset + limit - 1), documentsOffset, () => svc.from("concurso_documents").select("id", { count: "exact", head: true }).eq("concurso_id", id)),
      readCountedPage(svc.from("concurso_changes").select(conflictChangeColumns, { count: "exact" }).eq("concurso_id", id).in("field_name", [...conflictFields]).order("detected_at", { ascending: false }).order("id", { ascending: false }).range(changesOffset, changesOffset + limit - 1), changesOffset, () => svc.from("concurso_changes").select("id", { count: "exact", head: true }).eq("concurso_id", id).in("field_name", [...conflictFields])),
      svc.from("ops_conflict_reviews").select("review_note,reviewed_at,reviewed_by").eq("concurso_id", id).maybeSingle(),
      readCountedPage(svc.from("ops_action_log").select("id,action,note,created_at,actor_user_id", { count: "exact" }).eq("target_id", id).eq("action", "REVIEW_CONFLICT").order("created_at", { ascending: false }).order("id", { ascending: false }).range(auditOffset, auditOffset + limit - 1), auditOffset, () => svc.from("ops_action_log").select("id", { count: "exact", head: true }).eq("target_id", id).eq("action", "REVIEW_CONFLICT")),
    ]);
    if ([evidence, documents, changes, review, audit].some((result) => result.error)) return reply({ ok: false, error: "CONFLICT_QUERY_FAILED" }, 503);
    return reply({ ok: true, data: buildConflictDetail({
      contest: contest.data, evidence: evidence.data || [], documents: documents.data || [], changes: changes.data || [], review: review.data, audit: audit.data || [],
      counts: { evidence: evidence.count || 0, documents: documents.count || 0, changes: changes.count || 0, audit: audit.count || 0 }, pagination,
    }) });
  } catch {
    return reply({ ok: false, error: "CONFLICT_UNAVAILABLE" }, 503);
  }
}

export const GET = observeApiRoute("/api/admin/operations/conflicts/[id]", handleGET);

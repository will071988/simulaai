import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";
import { canRetryFailedDocument, validateOperationAction } from "@/lib/admin/operations";
import { aiConfig } from "@/lib/ai/config";
import { refreshOperationalAlerts } from "@/lib/observability/alerts";
import { observeApiRoute, summarizeApiMetrics, type ApiMetricBucket } from "@/lib/observability/operations";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const reply = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: noStore });

async function authorize(request: Request) {
  const user = await authenticatedUser(request);
  if (!user || user.is_anonymous || !user.email_confirmed_at) return { status: 401 as const, user: null };
  const { data, error } = await supabaseService().from("ops_admin_members").select("role").eq("user_id", user.id).maybeSingle();
  if (error) return { status: 503 as const, user: null };
  if (data?.role !== "ADMIN") return { status: 403 as const, user: null };
  return { status: 200 as const, user };
}

async function handleGET(request: Request) {
  try {
    const access = await authorize(request);
    if (!access.user) return reply({ ok: false, error: access.status === 401 ? "AUTH_REQUIRED" : access.status === 403 ? "ADMIN_ONLY" : "ADMIN_LOOKUP_FAILED" }, access.status);
    const svc = supabaseService();
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 300000) * 300000).toISOString();
    const now = new Date().toISOString();
    await refreshOperationalAlerts();
    const [runs, sources, pending, failed, conflicts, duplicates, candidates, budget, aiFailures, reviews, actions, jobs, apiMetrics, runtimeEvents, databaseErrors, alerts, dueBacklog, aiUsage] = await Promise.all([
      svc.from("collector_runs").select("id,started_at,finished_at,status,sources_checked,sources_success,sources_failed,documents_new,ai_requests,ai_success,ai_invalid_schema,ai_pending,parse_failed,errors_count,stage_results").order("started_at", { ascending: false }).limit(20),
      svc.from("collector_sources").select("id,name,base_url,source_type,tier,enabled,health_status,failure_count,last_status,last_error_code,last_success_at,last_failure_at,last_checked_at").order("name").limit(100),
      svc.from("collector_documents").select("id,title,source_url,document_type,status,ai_retry_count,ai_last_error_code,ai_next_attempt_at,collected_at", { count: "exact" }).eq("status", "AI_PENDING").order("collected_at", { ascending: false }).limit(50),
      svc.from("collector_documents").select("id,title,source_url,document_type,status,ai_retry_count,ai_last_error_code,collected_at,metadata", { count: "exact" }).eq("status", "FAILED").order("collected_at", { ascending: false }).limit(50),
      svc.from("concursos").select("id,titulo,orgao,quality_status,updated_at", { count: "exact" }).eq("quality_status", "CONFLICTED").order("updated_at", { ascending: false }).limit(50),
      svc.from("concurso_duplicate_candidates").select("id,concurso_a_id,concurso_b_id,score,reason,status,created_at", { count: "exact" }).eq("status", "POSSIBLE_DUPLICATE").order("created_at", { ascending: false }).limit(50),
      svc.from("source_candidates").select("id,url,domain,reason,confidence,status,official_url,reviewed_at,review_notes,created_at", { count: "exact" }).eq("status", "CANDIDATE").order("created_at", { ascending: false }).limit(50),
      svc.from("ai_daily_budget").select("budget_day,reserved_count").eq("budget_day", today).maybeSingle(),
      svc.from("ai_usage_logs").select("id,provider,model,task_type,error_code,created_at", { count: "exact" }).eq("success", false).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(30),
      svc.from("ops_conflict_reviews").select("concurso_id,review_note,reviewed_at").order("reviewed_at", { ascending: false }).limit(50),
      svc.from("ops_action_log").select("id,action,target_id,note,created_at").order("created_at", { ascending: false }).limit(30),
      svc.from("ops_job_runs").select("id,job_name,trigger_type,status,started_at,finished_at,duration_ms,error_code,counters,collector_run_id").order("started_at", { ascending: false }).limit(30),
      svc.from("ops_api_metric_buckets").select("request_count,error_count,latency_sum_ms,latency_max_ms,latency_le_100,latency_le_500,latency_le_1000,latency_le_3000,latency_gt_3000").gte("bucket_start", dayAgo),
      svc.from("ops_runtime_events").select("id,event_kind,component,error_code,created_at", { count: "exact" }).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(30),
      svc.from("ops_runtime_events").select("id", { count: "exact", head: true }).eq("event_kind", "DB_ERROR").gte("created_at", dayAgo),
      svc.from("ops_alert_state").select("fingerprint,rule_name,severity,status,opened_at,last_seen_at,resolved_at,occurrence_count").order("last_seen_at", { ascending: false }).limit(50),
      svc.from("collector_documents").select("ai_next_attempt_at", { count: "exact" }).eq("status", "AI_PENDING").or(`ai_next_attempt_at.is.null,ai_next_attempt_at.lte.${now}`).order("ai_next_attempt_at", { nullsFirst: true }).limit(1),
      svc.from("ai_usage_logs").select("success,latency_ms,error_code").gte("created_at", dayAgo).limit(1000),
    ]);
    const results = [runs, sources, pending, failed, conflicts, duplicates, candidates, budget, aiFailures, reviews, actions, jobs, apiMetrics, runtimeEvents, databaseErrors, alerts, dueBacklog, aiUsage];
    if (results.some((item) => item.error)) return reply({ ok: false, error: "OPERATIONS_QUERY_FAILED" }, 503);
    const api = summarizeApiMetrics((apiMetrics.data || []) as ApiMetricBucket[]);
    const usage = aiUsage.data || [];
    return reply({ ok: true, data: {
      runs: runs.data || [], sources: sources.data || [], aiPending: pending.data || [], failedDocuments: (failed.data || []).map(({ metadata, ...document }) => ({ ...document, retryable: canRetryFailedDocument({ ...document, metadata }) })),
      conflictedContests: conflicts.data || [], duplicateCandidates: duplicates.data || [], sourceCandidates: candidates.data || [],
      counts: { aiPending: pending.count || 0, failedDocuments: failed.count || 0, conflictedContests: conflicts.count || 0, duplicateCandidates: duplicates.count || 0, sourceCandidates: candidates.count || 0 },
      invalidSchemas: (runs.data || []).reduce((sum, run) => sum + (run.ai_invalid_schema || 0), 0),
      aiBudget: { day: today, reserved: budget.data?.reserved_count || 0, limit: aiConfig.maxPerDay },
      aiFailures: aiFailures.data || [], aiFailureCount7d: aiFailures.count || 0,
      conflictReviews: reviews.data || [], recentActions: actions.data || [],
      observability: {
        api,
        databaseErrors24h: databaseErrors.count || 0,
        runtimeEvents24h: runtimeEvents.count || 0,
        recentEvents: runtimeEvents.data || [],
        jobs: jobs.data || [],
        backlog: { total: pending.count || 0, due: dueBacklog.count || 0, oldestDueAt: dueBacklog.data?.[0]?.ai_next_attempt_at || null },
        ai24h: { calls: usage.length, success: usage.filter((item) => item.success).length, errors: usage.filter((item) => !item.success).length, averageLatencyMs: usage.length ? Math.round(usage.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0) / usage.length) : 0 },
        alerts: alerts.data || [],
      },
    } });
  } catch {
    return reply({ ok: false, error: "OPERATIONS_UNAVAILABLE" }, 503);
  }
}

async function handlePOST(request: Request) {
  try {
    const access = await authorize(request);
    if (!access.user) return reply({ ok: false, error: access.status === 401 ? "AUTH_REQUIRED" : access.status === 403 ? "ADMIN_ONLY" : "ADMIN_LOOKUP_FAILED" }, access.status);
    if (Number(request.headers.get("content-length") || 0) > 4096) return reply({ ok: false, error: "INVALID_ACTION" }, 400);
    const action = validateOperationAction(await request.json());
    if (!action) return reply({ ok: false, error: "INVALID_ACTION" }, 400);
    const { data, error } = await supabaseService().rpc("ops_apply_action", {
      p_actor: access.user.id,
      p_action: action.action,
      p_target: action.targetId,
      p_note: action.note || null,
      p_official_url: action.officialUrl || null,
    });
    if (error) return reply({ ok: false, error: error.message.includes("OPS_TARGET_NOT_ACTIONABLE") ? "TARGET_NOT_ACTIONABLE" : "ACTION_FAILED" }, error.message.includes("OPS_TARGET_NOT_ACTIONABLE") ? 409 : 503);
    return reply({ ok: true, data });
  } catch {
    return reply({ ok: false, error: "INVALID_ACTION" }, 400);
  }
}

export const GET = observeApiRoute("/api/admin/operations", handleGET);
export const POST = observeApiRoute("/api/admin/operations", handlePOST);

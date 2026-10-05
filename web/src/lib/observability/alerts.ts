import { supabaseService } from "@/lib/supabase-server";
import { boundedNumber, summarizeApiMetrics, type ApiMetricBucket } from "./operations";

export type OperationalAlert = { fingerprint: string; rule_name: string; severity: "WARNING" | "HIGH" | "CRITICAL" };
export type OperationalSnapshot = {
  now: number; latestCollectorStatus?: string | null; lastCollectorSuccessAt?: string | null;
  enabledTier1: number; unhealthyTier1: number; dueBacklog: number; oldestDueAt?: string | null;
  aiBudgetReserved: number; aiBudgetLimit: number; apiRequests: number; apiErrors: number;
  dbErrors: number; pendingJobStatus?: string | null; lastPendingJobAt?: string | null;
};

export function evaluateOperationalAlertRules(snapshot: OperationalSnapshot): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const collectorAge = snapshot.lastCollectorSuccessAt ? snapshot.now - Date.parse(snapshot.lastCollectorSuccessAt) : Number.POSITIVE_INFINITY;
  if (snapshot.latestCollectorStatus === "FAILED") alerts.push({ fingerprint: "COLLECTOR_FAILED", rule_name: "COLLECTOR_FAILED", severity: "HIGH" });
  if (collectorAge > 26 * 60 * 60 * 1000) alerts.push({ fingerprint: "COLLECTOR_STALE", rule_name: "COLLECTOR_STALE", severity: "HIGH" });
  if (snapshot.enabledTier1 > 0 && snapshot.unhealthyTier1 === snapshot.enabledTier1) alerts.push({ fingerprint: "ALL_TIER1_UNHEALTHY", rule_name: "ALL_TIER1_UNHEALTHY", severity: "HIGH" });
  const dueAge = snapshot.oldestDueAt ? snapshot.now - Date.parse(snapshot.oldestDueAt) : snapshot.dueBacklog > 0 ? Number.POSITIVE_INFINITY : 0;
  if (snapshot.dueBacklog >= 5 && dueAge > 60 * 60 * 1000) alerts.push({ fingerprint: "AI_BACKLOG_DUE", rule_name: "AI_BACKLOG_DUE", severity: "WARNING" });
  if (snapshot.dueBacklog > 0 && snapshot.aiBudgetLimit > 0 && snapshot.aiBudgetReserved >= snapshot.aiBudgetLimit) alerts.push({ fingerprint: "AI_BUDGET_EXHAUSTED", rule_name: "AI_BUDGET_EXHAUSTED", severity: "WARNING" });
  if (snapshot.apiRequests >= 20 && snapshot.apiErrors / snapshot.apiRequests >= 0.1) alerts.push({ fingerprint: "API_5XX_RATE", rule_name: "API_5XX_RATE", severity: "HIGH" });
  if (snapshot.dbErrors >= 3) alerts.push({ fingerprint: "DATABASE_ERRORS", rule_name: "DATABASE_ERRORS", severity: "HIGH" });
  const pendingAge = snapshot.lastPendingJobAt ? snapshot.now - Date.parse(snapshot.lastPendingJobAt) : Number.POSITIVE_INFINITY;
  if (snapshot.dueBacklog > 0 && (snapshot.pendingJobStatus === "FAILED" || pendingAge > 26 * 60 * 60 * 1000)) alerts.push({ fingerprint: "PENDING_JOB_UNHEALTHY", rule_name: "PENDING_JOB_UNHEALTHY", severity: "HIGH" });
  return alerts;
}

export async function refreshOperationalAlerts() {
  try {
    const svc = supabaseService();
    const now = new Date();
    const hourAgo = new Date(Math.floor((now.getTime() - 60 * 60 * 1000) / 300000) * 300000).toISOString();
    const today = now.toISOString().slice(0, 10);
    const [latestRun, lastSuccess, sources, due, metrics, dbErrors, budget, pendingJob] = await Promise.all([
      svc.from("collector_runs").select("status").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      svc.from("collector_runs").select("finished_at").eq("status", "SUCCESS").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      svc.from("collector_sources").select("health_status").eq("enabled", true).eq("tier", 1),
      svc.from("collector_documents").select("ai_next_attempt_at", { count: "exact" }).eq("status", "AI_PENDING").or(`ai_next_attempt_at.is.null,ai_next_attempt_at.lte.${now.toISOString()}`).order("ai_next_attempt_at", { nullsFirst: true }).limit(1),
      svc.from("ops_api_metric_buckets").select("request_count,error_count,latency_sum_ms,latency_max_ms,latency_le_100,latency_le_500,latency_le_1000,latency_le_3000,latency_gt_3000").gte("bucket_start", hourAgo),
      svc.from("ops_runtime_events").select("id", { count: "exact", head: true }).eq("event_kind", "DB_ERROR").gte("created_at", hourAgo),
      svc.from("ai_daily_budget").select("reserved_count").eq("budget_day", today).maybeSingle(),
      svc.from("ops_job_runs").select("status,started_at").eq("job_name", "AI_PENDING").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if ([latestRun, lastSuccess, sources, due, metrics, dbErrors, budget, pendingJob].some((result) => result.error)) return [];
    const api = summarizeApiMetrics((metrics.data || []) as ApiMetricBucket[]);
    const tier1 = sources.data || [];
    const alerts = evaluateOperationalAlertRules({
      now: now.getTime(), latestCollectorStatus: latestRun.data?.status, lastCollectorSuccessAt: lastSuccess.data?.finished_at,
      enabledTier1: tier1.length, unhealthyTier1: tier1.filter((source) => source.health_status !== "HEALTHY").length,
      dueBacklog: due.count || 0, oldestDueAt: due.data?.[0]?.ai_next_attempt_at,
      aiBudgetReserved: budget.data?.reserved_count || 0, aiBudgetLimit: boundedNumber(process.env.MAX_AI_REQUESTS_PER_DAY, 50, 1, 10000),
      apiRequests: api.requests, apiErrors: api.errors, dbErrors: dbErrors.count || 0,
      pendingJobStatus: pendingJob.data?.status, lastPendingJobAt: pendingJob.data?.started_at,
    });
    const { error } = await svc.rpc("sync_operational_alerts", { p_alerts: alerts, p_evaluated_at: now.toISOString() });
    return error ? [] : alerts;
  } catch { return []; }
}

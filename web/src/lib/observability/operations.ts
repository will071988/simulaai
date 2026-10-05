import { supabaseService } from "@/lib/supabase-server";
import { after } from "next/server";

export type ApiMetricBucket = {
  request_count: number; error_count: number; latency_sum_ms: number; latency_max_ms: number;
  latency_le_100: number; latency_le_500: number; latency_le_1000: number; latency_le_3000: number; latency_gt_3000: number;
};

type OperationalJob =
  | { id: string; started_at: string; acquired: true }
  | { id: null; started_at: null; acquired: false };

export function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function publicHealthPayload(status: "HEALTHY" | "DEGRADED" | "FAILED") {
  const available = status !== "FAILED";
  return { ok: available, status: available ? status.toLowerCase() : "unavailable" };
}

export function summarizeApiMetrics(rows: ApiMetricBucket[]) {
  const totals = rows.reduce((sum, row) => ({
    requests: sum.requests + Number(row.request_count || 0),
    errors: sum.errors + Number(row.error_count || 0),
    latency: sum.latency + Number(row.latency_sum_ms || 0),
    max: Math.max(sum.max, Number(row.latency_max_ms || 0)),
    le100: sum.le100 + Number(row.latency_le_100 || 0),
    le500: sum.le500 + Number(row.latency_le_500 || 0),
    le1000: sum.le1000 + Number(row.latency_le_1000 || 0),
    le3000: sum.le3000 + Number(row.latency_le_3000 || 0),
  }), { requests: 0, errors: 0, latency: 0, max: 0, le100: 0, le500: 0, le1000: 0, le3000: 0 });
  const threshold = totals.requests * 0.95;
  const p95UpperMs = totals.requests === 0 ? 0 : totals.le100 >= threshold ? 100 : totals.le500 >= threshold ? 500 : totals.le1000 >= threshold ? 1000 : totals.le3000 >= threshold ? 3000 : null;
  return { requests: totals.requests, errors: totals.errors, errorRate: totals.requests ? totals.errors / totals.requests : 0, averageLatencyMs: totals.requests ? Math.round(totals.latency / totals.requests) : 0, maxLatencyMs: totals.max, p95UpperMs };
}

function normalizedErrorCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80);
  return code || null;
}

async function responseErrorCode(response: Response) {
  if (response.status < 500) return null;
  try {
    const payload = await response.clone().json() as { error?: unknown };
    return normalizedErrorCode(payload.error) || "HTTP_5XX";
  } catch { return "HTTP_5XX"; }
}

async function recordApiMetric(route: string, method: string, status: number, latencyMs: number, errorCode: string | null) {
  try {
    const { error } = await supabaseService().rpc("record_ops_api_metric", { p_route: route, p_method: method, p_status: status, p_latency_ms: Math.round(latencyMs), p_error_code: errorCode });
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "api_metric", code: "RPC_FAILED" }));
  } catch { console.error(JSON.stringify({ event: "observability_write_failed", component: "api_metric", code: "UNAVAILABLE" })); }
}

// Preserve each route handler's exact signature so Next.js can validate dynamic contexts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function observeApiRoute<T extends (...args: any[]) => any>(route: string, handler: T): T {
  const observed = async (...args: Parameters<T>) => {
    const request = args[0] as Request;
    const started = performance.now();
    let response: Response;
    try {
      response = await handler(...args);
    } catch (error) {
      if (!new URL(request.url).hostname.endsWith(".test")) after(() => recordApiMetric(route, request.method, 500, performance.now() - started, "UNHANDLED_REQUEST_ERROR"));
      throw error;
    }
    if (!new URL(request.url).hostname.endsWith(".test")) {
      const latencyMs = performance.now() - started;
      const errorCode = await responseErrorCode(response);
      after(() => recordApiMetric(route, request.method, response.status, latencyMs, errorCode));
    }
    return response;
  };
  return observed as T;
}

export async function startOperationalJob(jobName: "COLLECTOR" | "AI_PENDING", triggerType: "CRON" | "MANUAL") {
  try {
    const { data, error } = await supabaseService().rpc("start_ops_job", { p_job_name: jobName, p_trigger_type: triggerType }).single();
    return error ? null : data as OperationalJob;
  } catch { return null; }
}

export async function finishOperationalJob(job: { id: string; started_at: string } | null, status: "SUCCESS" | "DEGRADED" | "FAILED" | "SKIPPED", counters: Record<string, number> = {}, errorCode?: string, collectorRunId?: string) {
  if (!job) return;
  try {
    const finishedAt = new Date();
    const { error } = await supabaseService().from("ops_job_runs").update({ status, finished_at: finishedAt.toISOString(), duration_ms: Math.max(0, finishedAt.getTime() - Date.parse(job.started_at)), counters, error_code: normalizedErrorCode(errorCode), collector_run_id: collectorRunId || null }).eq("id", job.id).eq("status", "RUNNING");
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "job_run", code: "UPDATE_FAILED" }));
  } catch { console.error(JSON.stringify({ event: "observability_write_failed", component: "job_run", code: "UNAVAILABLE" })); }
}

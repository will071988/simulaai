import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { refreshOperationalAlerts } from "../src/lib/observability/alerts";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  assert.equal(new URL(url).hostname, "ukwulespvvthyjqgrjfo.supabase.co", "aborting: unexpected Supabase project ref");
  assert.ok(anonKey && serviceKey, "Supabase keys are required");

  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const anon = createClient(url, anonKey, options);
  const svc = createClient(url, serviceKey, options);

  const anonymousRead = await anon.from("ops_api_metric_buckets").select("bucket_start").limit(1);
  assert.ok(anonymousRead.error, "anonymous role must not read operational metrics");

  const metric = await svc.rpc("record_ops_api_metric", {
    p_route: "/api/health",
    p_method: "OPTIONS",
    p_status: 204,
    p_latency_ms: 1,
    p_error_code: null,
  });
  assert.equal(metric.error, null, metric.error?.message);

  const firstStart = await svc.rpc("start_ops_job", { p_job_name: "AI_PENDING", p_trigger_type: "MANUAL" });
  assert.equal(firstStart.error, null, firstStart.error?.message);
  const first = firstStart.data?.[0] as { id: string | null; started_at: string | null; acquired: boolean } | undefined;
  assert.ok(first?.acquired && first.id && first.started_at, "live validation must acquire the AI_PENDING job");

  const secondStart = await svc.rpc("start_ops_job", { p_job_name: "AI_PENDING", p_trigger_type: "MANUAL" });
  assert.equal(secondStart.error, null, secondStart.error?.message);
  assert.equal(secondStart.data?.[0]?.acquired, false, "a concurrent job start must be rejected atomically");

  const finishedAt = new Date();
  const finish = await svc.from("ops_job_runs").update({
    status: "SKIPPED",
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - Date.parse(first.started_at)),
    error_code: "LIVE_VALIDATION",
  }).eq("id", first.id).eq("status", "RUNNING");
  assert.equal(finish.error, null, finish.error?.message);

  await refreshOperationalAlerts();
  const [metrics, jobs, alerts, events] = await Promise.all([
    svc.from("ops_api_metric_buckets").select("request_count", { count: "exact" }).eq("route", "/api/health"),
    svc.from("ops_job_runs").select("status").eq("id", first.id).single(),
    svc.from("ops_alert_state").select("status", { count: "exact" }),
    svc.from("ops_runtime_events").select("id", { count: "exact", head: true }),
  ]);
  for (const result of [metrics, jobs, alerts, events]) assert.equal(result.error, null, result.error?.message);
  assert.equal(jobs.data?.status, "SKIPPED");
  assert.ok((metrics.data || []).reduce((sum, row) => sum + Number(row.request_count), 0) >= 1);

  console.log(JSON.stringify({
    projectRef: "ukwulespvvthyjqgrjfo",
    anonymousOperationalReadDenied: true,
    healthMetricRequests: (metrics.data || []).reduce((sum, row) => sum + Number(row.request_count), 0),
    atomicJobStart: true,
    validationJobStatus: jobs.data?.status,
    alerts: alerts.count || 0,
    runtimeEvents: events.count || 0,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Sprint 2.7 live validation failed");
  process.exitCode = 1;
});

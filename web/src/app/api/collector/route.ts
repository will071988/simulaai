import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { runCollector } from "@/lib/collector/pipeline";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { acquireCollectorLock, releaseCollectorLock } from "@/lib/collector/lock";
import crypto from "crypto";
import { deriveCollectorHealth } from "@/lib/collector/health";
import { refreshOperationalAlerts } from "@/lib/observability/alerts";
import { boundedNumber, finishOperationalJob, observeApiRoute, startOperationalJob } from "@/lib/observability/operations";

async function executeCollectorWithLock(): Promise<{ runId: string; status: string; stats: unknown }> {
  const runId = crypto.randomUUID();
  const acquired = await acquireCollectorLock(runId, 600);
  if (!acquired) throw new Error("LOCKED");
  try {
    const result = await runCollector(runId);
    return result;
  } finally {
    await releaseCollectorLock(runId);
  }
}

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const wantRun = url.searchParams.get("run") === "1";

  const svc = supabaseService();

  // public minimal status (no secrets)
  if (!wantRun) {
    const { data: lastRun, error: runError } = await svc.from("collector_runs").select("started_at,finished_at,status,sources_checked,sources_success,sources_failed,documents_new,documents_unchanged,ai_pending,errors_count,parsed_success,parse_failed").order("started_at", { ascending: false }).limit(1).maybeSingle();
    const { count: pendingAI, error: pendingError } = await svc.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING");
    const { data: sources, error: sourcesError } = await svc.from("collector_sources").select("health_status,failure_count").eq("enabled", true);
    if (runError || pendingError || sourcesError) return NextResponse.json({ ok: false, error: "COLLECTOR_HEALTH_QUERY_FAILED" }, { status: 503 });
    const healthy = sources?.filter((s) => s.health_status === "HEALTHY").length ?? 0;
    const degraded = sources?.filter((s) => s.health_status === "DEGRADED").length ?? 0;
    const failed = sources?.filter((s) => s.health_status === "FAILED").length ?? 0;
    const failureThreshold = boundedNumber(process.env.MAX_CONSECUTIVE_SOURCE_FAILURES, 3, 1, 100);
    const status = deriveCollectorHealth({ lastRun, sourcesHealthy: healthy, sourcesDegraded: degraded, sourcesFailed: failed, sourceFailureThresholdExceeded: Boolean(sources?.some((source) => (source.failure_count || 0) >= failureThreshold)), pendingAI: pendingAI ?? 0, maxPendingAI: boundedNumber(process.env.MAX_PENDING_AI_ALERT, 20, 1, 100000), maxParseFailureRate: boundedNumber(process.env.MAX_PARSE_FAILURE_RATE, 0.25, 0, 1) });
    return NextResponse.json({
      ok: true,
      status,
      timestamp: new Date().toISOString(),
      lastRun,
      sourcesHealthy: healthy,
      sourcesDegraded: degraded,
      sourcesFailed: failed,
      pendingAI: pendingAI ?? 0,
    }, { status: status === "FAILED" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  }

  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const job = await startOperationalJob("COLLECTOR", "CRON");
  if (job?.acquired === false) return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 });
  try {
    const result = await executeCollectorWithLock();
    const jobStatus = result.status === "FAILED" ? "FAILED" : result.status === "SUCCESS" ? "SUCCESS" : result.status === "DISABLED" ? "SKIPPED" : "DEGRADED";
    await finishOperationalJob(job, jobStatus, {}, result.status === "DISABLED" ? "COLLECTOR_DISABLED" : undefined, result.status === "DISABLED" ? undefined : result.runId);
    await refreshOperationalAlerts();
    return NextResponse.json({ ok: result.status !== "FAILED", ...result }, { status: result.status === "FAILED" ? 503 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg === "LOCKED") { await finishOperationalJob(job, "SKIPPED", {}, "LOCKED"); return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 }); }
    await finishOperationalJob(job, "FAILED", {}, msg);
    await refreshOperationalAlerts();
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function handlePOST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const job = await startOperationalJob("COLLECTOR", "MANUAL");
  if (job?.acquired === false) return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 });
  try {
    const result = await executeCollectorWithLock();
    const jobStatus = result.status === "FAILED" ? "FAILED" : result.status === "SUCCESS" ? "SUCCESS" : result.status === "DISABLED" ? "SKIPPED" : "DEGRADED";
    await finishOperationalJob(job, jobStatus, {}, result.status === "DISABLED" ? "COLLECTOR_DISABLED" : undefined, result.status === "DISABLED" ? undefined : result.runId);
    await refreshOperationalAlerts();
    return NextResponse.json({ ok: result.status !== "FAILED", ...result }, { status: result.status === "FAILED" ? 503 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg === "LOCKED") { await finishOperationalJob(job, "SKIPPED", {}, "LOCKED"); return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 }); }
    await finishOperationalJob(job, "FAILED", {}, msg);
    await refreshOperationalAlerts();
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const GET = observeApiRoute("/api/collector", handleGET);
export const POST = observeApiRoute("/api/collector", handlePOST);

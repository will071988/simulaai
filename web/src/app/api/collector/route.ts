import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { runCollector } from "@/lib/collector/pipeline";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { acquireCollectorLock, releaseCollectorLock } from "@/lib/collector/lock";
import crypto from "crypto";
import { deriveCollectorHealth } from "@/lib/collector/health";

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

export async function GET(req: Request) {
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
    const failureThreshold = Number(process.env.MAX_CONSECUTIVE_SOURCE_FAILURES || 3);
    return NextResponse.json({
      ok: true,
      status: deriveCollectorHealth({ lastRun, sourcesHealthy: healthy, sourcesDegraded: degraded, sourcesFailed: failed, sourceFailureThresholdExceeded: Boolean(sources?.some((source) => (source.failure_count || 0) >= failureThreshold)), pendingAI: pendingAI ?? 0, maxPendingAI: Number(process.env.MAX_PENDING_AI_ALERT || 20), maxParseFailureRate: Number(process.env.MAX_PARSE_FAILURE_RATE || 0.25) }),
      timestamp: new Date().toISOString(),
      lastRun,
      sourcesHealthy: healthy,
      sourcesDegraded: degraded,
      sourcesFailed: failed,
      pendingAI: pendingAI ?? 0,
    });
  }

  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await executeCollectorWithLock();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg === "LOCKED") return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await executeCollectorWithLock();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg === "LOCKED") return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 409 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

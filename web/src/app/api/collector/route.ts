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
    const { data: lastRun } = await svc.from("collector_runs").select("started_at,finished_at,status,sources_checked,documents_new").order("started_at", { ascending: false }).limit(1).maybeSingle();
    const { count: pendingAI } = await svc.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING");
    const { data: sources } = await svc.from("collector_sources").select("last_status").eq("enabled", true);
    const healthy = sources?.filter((s) => s.last_status === "SUCCESS").length ?? 0;
    const degraded = sources?.filter((s) => s.last_status === "DEGRADED" || s.last_status === "EMPTY").length ?? 0;
    return NextResponse.json({
      ok: true,
      status: deriveCollectorHealth({ lastRun, sourcesHealthy: healthy, sourcesDegraded: degraded, pendingAI: pendingAI ?? 0 }),
      timestamp: new Date().toISOString(),
      lastRun,
      sourcesHealthy: healthy,
      sourcesDegraded: degraded,
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

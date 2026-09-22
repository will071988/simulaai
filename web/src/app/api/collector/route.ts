import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { runCollector } from "@/lib/collector/pipeline";
import { isCronAuthorized } from "@/lib/collector/cronAuth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantRun = url.searchParams.get("run") === "1";

  const svc = supabaseService();

  // public minimal status (no secrets)
  if (!wantRun) {
    const { data: lastRun } = await svc.from("collector_runs").select("started_at,finished_at,status,sources_checked,documents_new").order("started_at", { ascending: false }).limit(1).maybeSingle();
    const { count: pendingAI } = await svc.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING");
    const { count: sourcesHealthy } = await svc.from("collector_sources").select("id", { count: "exact", head: true }).eq("enabled", true);
    return NextResponse.json({
      ok: true,
      status: "HEALTHY",
      timestamp: new Date().toISOString(),
      lastRun,
      sourcesHealthy: sourcesHealthy ?? 0,
      pendingAI: pendingAI ?? 0,
    });
  }

  // execution requires CRON_SECRET via Authorization Bearer (not query)
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // lock atômico: try insert RUNNING with advisory? Simplified: check RUNNING within 10min
  const { data: running } = await svc.from("collector_runs").select("id,started_at").eq("status", "RUNNING").limit(1).maybeSingle();
  if (running) {
    const ageMs = Date.now() - new Date(running.started_at as string).getTime();
    if (ageMs < 10 * 60 * 1000) return NextResponse.json({ ok: false, error: "Collector already RUNNING" }, { status: 429 });
    // expired lock → mark as FAILED
    await svc.from("collector_runs").update({ status: "FAILED", finished_at: new Date().toISOString() }).eq("id", running.id);
  }

  try {
    const result = await runCollector();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// POST also protected for Vercel cron compatibility
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runCollector();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

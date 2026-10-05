import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { deriveCollectorHealth } from "@/lib/collector/health";
import { boundedNumber, observeApiRoute, publicHealthPayload } from "@/lib/observability/operations";

const headers = { "Cache-Control": "no-store" };

async function health() {
  try {
    const svc = supabaseService();
    const [run, pending, sources] = await Promise.all([
      svc.from("collector_runs").select("started_at,finished_at,status,errors_count,parsed_success,parse_failed").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      svc.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
      svc.from("collector_sources").select("health_status,failure_count").eq("enabled", true),
    ]);
    if (run.error || pending.error || sources.error) return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503, headers });
    const active = sources.data || [];
    const status = deriveCollectorHealth({
      lastRun: run.data,
      sourcesHealthy: active.filter((source) => source.health_status === "HEALTHY").length,
      sourcesDegraded: active.filter((source) => source.health_status === "DEGRADED").length,
      sourcesFailed: active.filter((source) => source.health_status === "FAILED").length,
      sourceFailureThresholdExceeded: active.some((source) => (source.failure_count || 0) >= boundedNumber(process.env.MAX_CONSECUTIVE_SOURCE_FAILURES, 3, 1, 100)),
      pendingAI: pending.count || 0,
      maxPendingAI: boundedNumber(process.env.MAX_PENDING_AI_ALERT, 20, 1, 100000),
      maxParseFailureRate: boundedNumber(process.env.MAX_PARSE_FAILURE_RATE, 0.25, 0, 1),
    });
    const payload = publicHealthPayload(status);
    return NextResponse.json(payload, { status: payload.ok ? 200 : 503, headers });
  } catch {
    return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503, headers });
  }
}

export const GET = observeApiRoute("/api/health", health);

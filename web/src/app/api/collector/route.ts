import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { runCollector } from "@/lib/collector/pipeline";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const run = url.searchParams.get("run") === "1";

  const svc = supabaseService();
  const { data: concursos } = await svc.from("concursos").select("*").order("vagas", { ascending: false });
  const { data: simulados } = await svc.from("simulados").select("id, titulo, banca_alvo, concurso_id").limit(6);
  const { data: sources } = await svc.from("collector_sources").select("name,tier,enabled,last_success_at,failure_count").order("tier");
  const { data: lastRun } = await svc.from("collector_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const { data: pending } = await svc.from("collector_documents").select("id", { count: "exact" }).eq("status", "AI_PENDING");
  const { data: aiLogs } = await svc.from("ai_usage_logs").select("provider,success").order("created_at", { ascending: false }).limit(5);

  let collectorResult: unknown = null;
  if (run) {
    // guard: require header or query to avoid abuse? For demo, allow but rate limit via lock
    const { data: running } = await svc.from("collector_runs").select("id").eq("status", "RUNNING").limit(1).maybeSingle();
    if (running) return NextResponse.json({ ok: false, error: "Collector already RUNNING", lastRun }, { status: 429 });
    try {
      collectorResult = await runCollector();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERR";
      return NextResponse.json({ ok: false, error: msg, lastRun }, { status: 500 });
    }
  }

  // determine AI provider status
  const aiProvider = process.env.GROQ_API_KEY ? "groq" : process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENROUTER_API_KEY ? "openrouter" : "none";
  const aiStatus = aiProvider === "none" ? "DEGRADED_NO_AI" : "available";

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    projeto: "ukwulespvvthyjqgrjfo (will071988's Project - cxqtcqiiwnfgpuxbhtre)",
    cron: "0 6 * * * / 15 / 30 / 00 vercel.json",
    concursos: concursos?.length ?? 0,
    simulados: simulados?.length ?? 0,
    lastRun,
    sources: { active: sources?.filter((s) => s.enabled).length ?? 0, healthy: sources?.filter((s) => (s.failure_count || 0) < 3).length ?? 0, failed: sources?.filter((s) => (s.failure_count || 0) >= 3).length ?? 0, list: sources },
    documents: { pendingAI: pending?.length ?? 0, new: lastRun?.documents_new ?? 0 },
    ai: { provider: aiProvider, status: aiStatus, recent: aiLogs },
    collectorResult,
    data: { concursos: concursos?.slice(0, 3), simulados },
  });
}

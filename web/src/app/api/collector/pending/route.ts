import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { generateWithFallback } from "@/lib/ai/router";
import { isCronAuthorized } from "@/lib/collector/cronAuth";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return handlePending();
}
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return handlePending();
}

async function handlePending() {
  const svc = supabaseService();
  const { data: docs, error } = await svc.from("collector_documents").select("id, raw_text, metadata, ai_retry_count").eq("status", "AI_PENDING").limit(5);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let processed = 0;
  let failed = 0;
  for (const d of docs || []) {
    const retry = (d as unknown as { ai_retry_count?: number }).ai_retry_count ?? 0;
    if (retry >= 3) {
      await svc.from("collector_documents").update({ status: "FAILED", metadata: { ...(d.metadata as object), ai_error: "MAX_RETRIES" } }).eq("id", d.id);
      failed++;
      continue;
    }
    const res = await generateWithFallback<{ orgao: string | null; banca: string | null; vagas: number | null }>(
      { taskType: "EXTRACT_CONCURSO", prompt: "Extraia concurso JSON {orgao,banca,vagas} evidence.", input: { snippet: (d.raw_text || "").slice(0, 4000) }, promptVersion: "extract_concurso_v1" },
      { validate: (x) => typeof x === "object" && x !== null }
    );
    if (res.ok) {
      await svc.from("collector_documents").update({ status: "PROCESSED", metadata: { ...(d.metadata as object), ai_extracted: res.data, ai_provider: res.provider }, processed_at: new Date().toISOString(), ai_retry_count: 0 }).eq("id", d.id);
      processed++;
    } else if (res.errorCode === "BUDGET_EXCEEDED" || res.errorCode === "AI_PENDING") {
      await svc.from("collector_documents").update({ ai_retry_count: retry + 1 }).eq("id", d.id);
      failed++;
    } else {
      await svc.from("collector_documents").update({ ai_retry_count: retry + 1 }).eq("id", d.id);
      failed++;
    }
  }
  return NextResponse.json({ ok: true, processed, failed, pending: (docs || []).length });
}

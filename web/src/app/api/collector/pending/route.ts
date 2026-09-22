import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { generateWithFallback } from "@/lib/ai/router";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { ExtractConcursoSchema } from "@/lib/collector/schemas";
import { syncConcursoFromDocument } from "@/lib/collector/syncConcurso";

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
  const { data: docs, error } = await svc.from("collector_documents").select("id, raw_text, metadata, canonical_url, title").eq("status", "AI_PENDING").limit(5);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let processed = 0;
  let failed = 0;
  for (const d of docs || []) {
    const retry = ((d as unknown as { ai_retry_count?: number }).ai_retry_count ?? 0);
    const meta = (d.metadata as Record<string, unknown>) || {};
    const tier = (meta.tier as number) || 2;
    if (retry >= 3) {
      await svc.from("collector_documents").update({ status: "FAILED", metadata: { ...meta, ai_error: "MAX_RETRIES" } }).eq("id", d.id);
      failed++;
      continue;
    }
    const res = await generateWithFallback(
      { taskType: "EXTRACT_CONCURSO", prompt: "Extraia concurso JSON {orgao,banca,vagas,status,evidence:{orgao,banca,vagas,status}} com evidence trecho pequeno. Não invente. Se não houver, null. Prompt v1.", input: { snippet: (d.raw_text || "").slice(0, 4000), title: (d as unknown as { title?: string }).title || "" }, promptVersion: "extract_concurso_v1" },
      { validate: (x) => ExtractConcursoSchema.safeParse(x).success }
    );
    if (res.ok && res.data) {
      const parsed = ExtractConcursoSchema.safeParse(res.data);
      if (!parsed.success) {
        await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: "INVALID_SCHEMA" } }).eq("id", d.id);
        failed++;
        continue;
      }
      const syncErr = await (async () => {
        try { await syncConcursoFromDocument(svc, { title: (d as unknown as { title: string }).title || "", canonicalUrl: (d as unknown as { canonical_url: string }).canonical_url || "", } as never, parsed.data, tier); return null; } catch (e) { return e instanceof Error ? e.message : "ERR"; }
      })();
      if (syncErr && tier === 1) {
        await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res.provider, sync_error: syncErr } }).eq("id", d.id);
        failed++;
        continue;
      }
      await svc.from("collector_documents").update({ status: "PROCESSED", metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res.provider, ai_model: res.model }, processed_at: new Date().toISOString() }).eq("id", d.id);
      processed++;
    } else if (res.errorCode === "BUDGET_EXCEEDED" || res.errorCode === "AI_PENDING" || res.errorCode === "PAID_MODEL_BLOCKED") {
      await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: res.errorCode } }).eq("id", d.id);
      failed++;
    } else {
      const reason = res.errorCode === "RATE_LIMIT" ? "RATE_LIMIT" : res.errorCode === "PROVIDER_DOWN" ? "PROVIDER_DOWN" : res.errorCode || "AI_ERROR";
      await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: reason } }).eq("id", d.id);
      failed++;
    }
  }
  return NextResponse.json({ ok: true, processed, failed, pending: (docs || []).length });
}

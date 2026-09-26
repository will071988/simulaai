import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { ExtractConcursoSchema } from "@/lib/collector/schemas";
import { extractConcursoWithAI } from "@/lib/collector/extractConcursoWithAI";
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
  try {
    const svc = supabaseService();
    const { data: docs, error } = await svc.from("collector_documents").select("id, raw_text, metadata, canonical_url, source_url, title, ai_retry_count").eq("status", "AI_PENDING").limit(5);
    if (error) throw new Error("PENDING_SELECT_FAILED");
    let processed = 0;
    let failed = 0;
    for (const d of docs || []) {
      const retry = d.ai_retry_count ?? 0;
      const meta = (d.metadata as Record<string, unknown>) || {};
      const tier = (meta.tier as number) || 2;
      if (retry >= 3) {
        const { error: updateError } = await svc.from("collector_documents").update({ status: "FAILED", metadata: { ...meta, ai_error: "MAX_RETRIES" } }).eq("id", d.id);
        if (updateError) throw new Error("PENDING_MAX_RETRIES_WRITE_FAILED");
        failed++;
        continue;
      }
      const res = await extractConcursoWithAI(d.title || "", d.raw_text || "");
      if (res.ok && res.data) {
        const parsed = ExtractConcursoSchema.safeParse(res.data);
        if (!parsed.success) {
          const { error: updateError } = await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: "INVALID_SCHEMA" } }).eq("id", d.id);
          if (updateError) throw new Error("PENDING_INVALID_SCHEMA_WRITE_FAILED");
          failed++;
          continue;
        }
        const syncErr = await (async () => {
          try { await syncConcursoFromDocument(svc, { sourceName: String(meta.source_name || "pending"), canonicalUrl: d.canonical_url || "", title: d.title || "", rawText: d.raw_text || "", documentId: d.id }, parsed.data, tier); return null; } catch (e) { return e instanceof Error ? e.message : "ERR"; }
        })();
        if (syncErr) {
          const { error: updateError } = await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res.provider, sync_error: syncErr } }).eq("id", d.id);
          if (updateError) throw new Error("PENDING_SYNC_RETRY_WRITE_FAILED");
          failed++;
          continue;
        }
        const { error: processedError } = await svc.from("collector_documents").update({ status: "PROCESSED", ai_retry_count: retry, metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res.provider, ai_model: res.model }, processed_at: new Date().toISOString() }).eq("id", d.id);
        if (processedError) throw new Error("PENDING_PROCESSED_WRITE_FAILED");
        processed++;
      } else if (res.errorCode === "BUDGET_EXCEEDED" || res.errorCode === "AI_PENDING" || res.errorCode === "PAID_MODEL_BLOCKED") {
        const { error: updateError } = await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: res.errorCode } }).eq("id", d.id);
        if (updateError) throw new Error("PENDING_RETRY_WRITE_FAILED");
        failed++;
      } else {
        const reason = res.errorCode === "RATE_LIMIT" ? "RATE_LIMIT" : res.errorCode === "PROVIDER_DOWN" ? "PROVIDER_DOWN" : res.errorCode || "AI_ERROR";
        const { error: updateError } = await svc.from("collector_documents").update({ ai_retry_count: retry + 1, metadata: { ...meta, ai_error: reason } }).eq("id", d.id);
        if (updateError) throw new Error("PENDING_FAILURE_WRITE_FAILED");
        failed++;
      }
    }
    return NextResponse.json({ ok: true, processed, failed, pending: (docs || []).length });
  } catch (error) {
    console.error("pending persistence failure", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ ok: false, error: "PENDING_PERSISTENCE_FAILED" }, { status: 500 });
  }
}

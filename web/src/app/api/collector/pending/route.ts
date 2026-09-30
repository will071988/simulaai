import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { ExtractConcursoSchema } from "@/lib/collector/schemas";
import { extractConcursoWithAI } from "@/lib/collector/extractConcursoWithAI";
import { syncConcursoFromDocument } from "@/lib/collector/syncConcurso";
import { getAIRetryDecision } from "@/lib/collector/retryPolicy";
import { GenerationBudget } from "@/lib/ai/generationBudget";
import { aiConfig } from "@/lib/ai/config";

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
    const { data: docs, error } = await svc.rpc("claim_ai_pending_documents", { p_limit: 5 });
    if (error) throw new Error("PENDING_CLAIM_FAILED");
    let processed = 0;
    const budget = new GenerationBudget(aiConfig.maxPerRun);
    let failed = 0;
    const scheduleRetry = async (d: Record<string, unknown>, meta: Record<string, unknown>, errorCode: string) => {
      const retry = Number(d.ai_retry_count || 0);
      const decision = getAIRetryDecision(errorCode, retry);
      const nextAttempt = decision.delaySeconds > 0 ? new Date(Date.now() + decision.delaySeconds * 1000).toISOString() : null;
      let retryUpdate = svc.from("collector_documents").update({
        status: decision.nextStatus,
        ai_retry_count: retry + (decision.incrementRetry ? 1 : 0),
        ai_next_attempt_at: nextAttempt,
        ai_last_error_code: errorCode,
        ai_claimed_at: null,
        ai_claim_token: null,
        ai_claimed_hash: null,
        metadata: { ...meta, ai_error: errorCode },
      }).eq("id", d.id).eq("content_hash", d.content_hash).eq("status", "AI_PENDING");
      if (d.ai_claim_token) retryUpdate = retryUpdate.eq("ai_claim_token", d.ai_claim_token);
      const { error: updateError } = await retryUpdate;
      if (updateError) throw new Error("PENDING_RETRY_WRITE_FAILED");
      failed++;
    };
    for (const d of docs || []) {
      const retry = d.ai_retry_count ?? 0;
      const meta = (d.metadata as Record<string, unknown>) || {};
      const tier = (meta.tier as number) || 2;
      if (retry >= 3) {
        let failedUpdate = svc.from("collector_documents").update({ status: "FAILED", ai_last_error_code: "MAX_RETRIES", ai_claimed_at: null, ai_claim_token: null, ai_claimed_hash: null, metadata: { ...meta, ai_error: "MAX_RETRIES" } }).eq("id", d.id).eq("content_hash", d.content_hash).eq("status", "AI_PENDING");
        if (d.ai_claim_token) failedUpdate = failedUpdate.eq("ai_claim_token", d.ai_claim_token);
        const { error: updateError } = await failedUpdate;
        if (updateError) throw new Error("PENDING_MAX_RETRIES_WRITE_FAILED");
        failed++;
        continue;
      }
      const deterministic = ExtractConcursoSchema.safeParse(meta.ai_extracted);
      const res = deterministic.success ? null : await extractConcursoWithAI(d.title || "", d.raw_text || "", budget);
      if (deterministic.success || (res?.ok && res.data)) {
        const parsed = deterministic.success ? deterministic : ExtractConcursoSchema.safeParse(res?.data);
        if (!parsed.success) {
          await scheduleRetry(d, meta, "INVALID_SCHEMA");
          continue;
        }
        const syncErr = await (async () => {
          try {
            const synced = await syncConcursoFromDocument(svc, { sourceName: String(meta.source_name || "pending"), canonicalUrl: d.canonical_url || "", title: d.title || "", rawText: d.raw_text || "", documentId: d.id, documentType: d.document_type, publishedAt: d.published_at, contestUrl: typeof meta.contest_url === "string" ? meta.contest_url : undefined, identityTitle: typeof meta.identity_title === "string" ? meta.identity_title : undefined, expectedContentHash: d.ai_claimed_hash || d.content_hash, claimToken: d.ai_claim_token, metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res?.provider || meta.ai_provider || "deterministic", ai_model: res?.model || meta.ai_model || "deterministic" } }, parsed.data, tier);
            return synced ? null : "INSUFFICIENT_IDENTITY";
          } catch (e) { return e instanceof Error ? e.message : "ERR"; }
        })();
        if (syncErr) {
          await scheduleRetry(d, { ...meta, ai_extracted: parsed.data, ai_provider: res?.provider || meta.ai_provider || "deterministic", sync_error: syncErr }, syncErr.endsWith("_RETRY") || syncErr === "DOCUMENT_VERSION_CHANGED" || syncErr === "DOCUMENT_CLAIM_CHANGED" ? "CONCURRENCY_RETRY" : "SYNC_FAILED");
          continue;
        }
        processed++;
      } else {
        await scheduleRetry(d, meta, res?.errorCode || "AI_PENDING");
      }
    }
    return NextResponse.json({ ok: true, processed, failed, pending: (docs || []).length, ai_requests: budget.calls });
  } catch (error) {
    console.error("pending persistence failure", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ ok: false, error: "PENDING_PERSISTENCE_FAILED" }, { status: 500 });
  }
}

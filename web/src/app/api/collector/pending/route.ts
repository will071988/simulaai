import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { isCronAuthorized } from "@/lib/collector/cronAuth";
import { ExtractConcursoSchema } from "@/lib/collector/schemas";
import { extractConcursoWithAI } from "@/lib/collector/extractConcursoWithAI";
import { syncConcursoFromDocument } from "@/lib/collector/syncConcurso";
import { getAIRetryDecision } from "@/lib/collector/retryPolicy";
import { GenerationBudget } from "@/lib/ai/generationBudget";
import { aiConfig } from "@/lib/ai/config";
import { refreshOperationalAlerts } from "@/lib/observability/alerts";
import { finishOperationalJob, observeApiRoute, startOperationalJob } from "@/lib/observability/operations";
import { pendingLimit, pendingClaimArguments, pendingProviderOrder } from "@/lib/collector/pendingLimit";
import { extractionSemanticIssues } from "@/lib/collector/extractionSemantics";

async function handleGET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = pendingLimit(req);
  if (limit === null) return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
  const order = pendingProviderOrder(req);
  if (order === null) return NextResponse.json({ ok: false, error: "INVALID_PROVIDER_SELECTION" }, { status: 400 });
  return handlePending("CRON", limit, order);
}
async function handlePOST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = pendingLimit(req);
  if (limit === null) return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
  const order = pendingProviderOrder(req);
  if (order === null) return NextResponse.json({ ok: false, error: "INVALID_PROVIDER_SELECTION" }, { status: 400 });
  return handlePending("MANUAL", limit, order);
}

async function handlePending(triggerType: "CRON" | "MANUAL", limit: 1 | 5, providerOrder?: string[]) {
  const job = await startOperationalJob("AI_PENDING", triggerType);
  if (job?.acquired === false) return NextResponse.json({ ok: false, error: "AI pending job already RUNNING" }, { status: 409 });
  try {
    const svc = supabaseService();
    const { data: docs, error } = await svc.rpc("claim_ai_pending_documents", pendingClaimArguments(limit));
    if (error) throw new Error("PENDING_CLAIM_FAILED");
    let processed = 0;
    const budget = new GenerationBudget(aiConfig.maxPerRun, providerOrder);
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
      const identityTitle = typeof meta.identity_title === "string" ? meta.identity_title : d.title || "";
      const sourceName = typeof meta.source_name === "string" ? meta.source_name : undefined;
      const res = deterministic.success ? null : await extractConcursoWithAI(identityTitle, d.raw_text || "", budget, sourceName);
      if (deterministic.success || (res?.ok && res.data)) {
        const parsed = deterministic.success ? deterministic : ExtractConcursoSchema.safeParse(res?.data);
        if (!parsed.success) {
          await scheduleRetry(d, meta, "INVALID_SCHEMA");
          continue;
        }
        const semanticIssues = extractionSemanticIssues(parsed.data, identityTitle, d.raw_text || "", sourceName);
        if (semanticIssues.length) {
          console.info(JSON.stringify({ event: "ai_extraction_semantic_rejection", issues: semanticIssues }));
          await scheduleRetry(d, meta, "SCHEMA_SEMANTIC_ERROR");
          continue;
        }
        const syncErr = await (async () => {
          try {
            const synced = await syncConcursoFromDocument(svc, { sourceName: String(meta.source_name || "pending"), canonicalUrl: d.canonical_url || "", title: d.title || "", rawText: d.raw_text || "", documentId: d.id, documentType: d.document_type, publishedAt: d.published_at, contestUrl: typeof meta.contest_url === "string" ? meta.contest_url : undefined, identityTitle: typeof meta.identity_title === "string" ? meta.identity_title : undefined, expectedContentHash: d.ai_claimed_hash || d.content_hash, claimToken: d.ai_claim_token, metadata: { ...meta, ai_extracted: parsed.data, ai_provider: res?.provider || meta.ai_provider || "deterministic", ai_model: res?.model || meta.ai_model || "deterministic" } }, parsed.data, tier);
            return synced ? null : "INSUFFICIENT_IDENTITY";
          } catch (e) { return e instanceof Error ? e.message : "ERR"; }
        })();
        if (syncErr) {
          await scheduleRetry(d, { ...meta, ai_extracted: parsed.data, ai_provider: res?.provider || meta.ai_provider || "deterministic", sync_error: syncErr }, syncErr === "INSUFFICIENT_IDENTITY" ? syncErr : syncErr.endsWith("_RETRY") || syncErr === "DOCUMENT_VERSION_CHANGED" || syncErr === "DOCUMENT_CLAIM_CHANGED" ? "CONCURRENCY_RETRY" : "SYNC_FAILED");
          continue;
        }
        processed++;
      } else {
        await scheduleRetry(d, meta, res?.errorCode || "AI_PENDING");
      }
    }
    const counters = { claimed: (docs || []).length, processed, failed, ai_requests: budget.calls };
    await finishOperationalJob(job, failed > 0 ? "DEGRADED" : "SUCCESS", counters);
    await refreshOperationalAlerts();
    return NextResponse.json({ ok: true, processed, failed, pending: (docs || []).length, ai_requests: budget.calls });
  } catch {
    await finishOperationalJob(job, "FAILED", {}, "PENDING_PERSISTENCE_FAILED");
    await refreshOperationalAlerts();
    console.error(JSON.stringify({ event: "job_failed", component: "AI_PENDING", code: "PENDING_PERSISTENCE_FAILED" }));
    return NextResponse.json({ ok: false, error: "PENDING_PERSISTENCE_FAILED" }, { status: 500 });
  }
}

export const GET = observeApiRoute("/api/collector/pending", handleGET);
export const POST = observeApiRoute("/api/collector/pending", handlePOST);

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const base = "https://simulaai-kappa.vercel.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
assert.equal(new URL(url).hostname, "ukwulespvvthyjqgrjfo.supabase.co");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
const day = new Date().toISOString().slice(0, 10);

async function snapshot() {
  const [docs, budget, usage, evidence] = await Promise.all([
    db.from("collector_documents").select("id,status,canonical_url,ai_retry_count,ai_last_error_code,ai_claimed_at", { count: "exact" }),
    db.from("ai_daily_budget").select("reserved_count").eq("budget_day", day).maybeSingle(),
    db.from("ai_usage_logs").select("id", { count: "exact", head: true }).gte("created_at", `${day}T00:00:00Z`),
    db.from("concurso_field_evidence").select("id", { count: "exact", head: true }),
  ]);
  for (const result of [docs, budget, usage, evidence]) assert.equal(result.error, null, "snapshot query failed");
  assert.equal(docs.count, docs.data?.length, "snapshot truncated");
  return { docs: docs.data || [], reserved: budget.data?.reserved_count || 0, calls: usage.count || 0, evidence: evidence.count || 0, pending: docs.data?.filter((d) => d.status === "AI_PENDING").length || 0, claims: docs.data?.filter((d) => d.ai_claimed_at).length || 0, failed: docs.data?.filter((d) => d.status === "FAILED").length || 0 };
}
async function invoke(path: string, healthyProviders?: string[]) {
  const secret = process.env.ROTATED_CRON_SECRET || process.env.CRON_SECRET;
  assert.ok(secret, "runtime credential unavailable");
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}`, ...(healthyProviders ? { "x-ai-healthy-providers": healthyProviders.join(",") } : {}) } });
  assert.equal(response.status, 200, `endpoint HTTP ${response.status}`);
  return await response.json();
}
async function main() {
  const beforeSmoke = await snapshot();
  assert.equal(beforeSmoke.claims, 0, "active claims: stop without modification");
  const smoke = await invoke("/api/collector/provider-smoke");
  const afterSmoke = await snapshot();
  console.log(JSON.stringify({ stage: "providerSmoke", result: smoke, reservationsDelta: afterSmoke.reserved - beforeSmoke.reserved, usageDelta: afterSmoke.calls - beforeSmoke.calls, pending: afterSmoke.pending, claims: afterSmoke.claims }, null, 2));
  assert.ok(smoke.physicalCalls >= 1 && smoke.physicalCalls <= 4, "at most one smoke per configured provider");
  assert.equal(afterSmoke.reserved - beforeSmoke.reserved, smoke.physicalCalls);
  assert.equal(afterSmoke.calls - beforeSmoke.calls, smoke.physicalCalls);
  assert.ok(smoke.results.every((result: { physicalCalls: number }) => result.physicalCalls <= 1));
  assert.equal(smoke.ok, true, "PROVIDER_SMOKE_FAILED: worker execution prohibited");
  const healthyProviders = smoke.results.filter((result: { result: string }) => result.result === "HEALTHY").map((result: { provider: string }) => result.provider);
  console.log(JSON.stringify({ stage: "beforeSingle", pending: afterSmoke.pending, reserved: afterSmoke.reserved, documents: afterSmoke.docs.filter((d) => d.status === "AI_PENDING") }, null, 2));
  const single = await invoke("/api/collector/pending?limit=1", healthyProviders);
  const afterSingle = await snapshot();
  const changed = afterSmoke.docs.filter((d) => d.status === "AI_PENDING" && afterSingle.docs.find((row) => row.id === d.id)?.status !== "AI_PENDING");
  console.log(JSON.stringify({ stage: "single", beforePending: afterSmoke.pending, result: single, afterPending: afterSingle.pending, changedDocumentIds: changed.map((d) => d.id), claims: afterSingle.claims, budgetDelta: afterSingle.reserved - afterSmoke.reserved, callsDelta: afterSingle.calls - afterSmoke.calls, evidenceDelta: afterSingle.evidence - afterSmoke.evidence }, null, 2));
  assert.equal(single.processed, 1, "SINGLE_FAILED: batch prohibited"); assert.equal(single.failed, 0);
  assert.equal(changed.length, 1); assert.equal(afterSingle.claims, 0);
  assert.equal(afterSingle.docs.length, afterSmoke.docs.length, "worker must not create duplicate documents");
  const settled = afterSingle.docs.find((doc) => doc.id === changed[0].id)!;
  assert.equal(settled.status, "PROCESSED");
  const evidence = await db.from("concurso_field_evidence").select("id", { count: "exact", head: true }).eq("source_url", settled.canonical_url);
  assert.equal(evidence.error, null); assert.ok((evidence.count || 0) > 0, "processed document must have persisted source evidence");
  console.log(JSON.stringify({ stage: "singlePersistence", documentId: settled.id, status: settled.status, retryCount: settled.ai_retry_count, claim: settled.ai_claimed_at, evidenceCount: evidence.count }, null, 2));
  assert.equal(afterSingle.reserved - afterSmoke.reserved, single.ai_requests);
  assert.equal(afterSingle.calls - afterSmoke.calls, single.ai_requests);
  const batch = await invoke("/api/collector/pending?limit=5", healthyProviders);
  const afterBatch = await snapshot();
  console.log(JSON.stringify({ stage: "batch", beforePending: afterSingle.pending, result: batch, afterPending: afterBatch.pending, claims: afterBatch.claims, failedDocuments: afterBatch.failed, budgetDelta: afterBatch.reserved - afterSingle.reserved, callsDelta: afterBatch.calls - afterSingle.calls }, null, 2));
  assert.equal(afterBatch.claims, 0); assert.equal(batch.failed, 0); assert.ok(afterBatch.pending <= 20);
  assert.equal(afterBatch.docs.length, afterSingle.docs.length);
  assert.equal(afterSingle.pending - afterBatch.pending, batch.processed);
  assert.equal(afterBatch.reserved - afterSingle.reserved, batch.ai_requests);
  assert.equal(afterBatch.calls - afterSingle.calls, batch.ai_requests);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "controlled verification failed"); process.exitCode = 1; });

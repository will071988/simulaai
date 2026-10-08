import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

type SmokeRow = { requestedModel: string; effectiveModel?: string; httpStatus?: number | null; classification: string; errorCode?: string | null; physicalCalls: number; schemaSuccess: boolean; parseSuccess?: boolean; bodyPresent?: boolean; latencyMs: number; contextLength?: number; historicalCalls?: number; historicalSuccessRate?: number | null };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  assert.equal(new URL(url).hostname, "ukwulespvvthyjqgrjfo.supabase.co");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
  const secret = process.env.ROTATED_CRON_SECRET || process.env.CRON_SECRET;
  assert.ok(secret, "credential unavailable");
  const base = "https://simulaai-kappa.vercel.app/api/collector/provider-smoke";
  const day = new Date().toISOString().slice(0, 10);
  const snapshot = async () => {
    const [budget, usage, pending, claims] = await Promise.all([
      db.from("ai_daily_budget").select("reserved_count").eq("budget_day", day).maybeSingle(),
      db.from("ai_usage_logs").select("id", { count: "exact", head: true }).gte("created_at", `${day}T00:00:00Z`),
      db.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
      db.from("collector_documents").select("id", { count: "exact", head: true }).not("ai_claimed_at", "is", null),
    ]);
    for (const result of [budget, usage, pending, claims]) assert.equal(result.error, null, "snapshot failed");
    return { reserved: budget.data?.reserved_count || 0, calls: usage.count || 0, pending: pending.count || 0, claims: claims.count || 0 };
  };
  const before = await snapshot();
  assert.equal(before.claims, 0, "active claims: stop without cleanup");
  const catalogResponse = await fetch(base, { headers: { authorization: `Bearer ${secret}` } });
  assert.equal(catalogResponse.status, 200, "catalog validation unavailable");
  const catalog = await catalogResponse.json() as { candidates: Array<{ model: string; ok: boolean; errorCode?: string; contextLength?: number }> };
  const approved = catalog.candidates.filter((candidate) => candidate.ok);
  assert.ok(approved.length <= 7);
  assert.ok(before.reserved + approved.length <= 50, "insufficient diagnostic daily budget");
  const history = await db.from("ai_usage_logs").select("model,success", { count: "exact" }).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).limit(10000);
  assert.equal(history.error, null); assert.equal(history.count, history.data?.length, "history truncated");
  const results: SmokeRow[] = [];
  for (const candidate of catalog.candidates) {
    if (!candidate.ok) { results.push({ requestedModel: candidate.model, classification: "UNAVAILABLE", errorCode: candidate.errorCode, physicalCalls: 0, schemaSuccess: false, latencyMs: 0, contextLength: candidate.contextLength }); continue; }
    const response: Response = await fetch(`${base}?model=${encodeURIComponent(candidate.model)}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    assert.equal(response.status, 200, "model smoke endpoint failed");
    const result = await response.json() as SmokeRow;
    assert.ok(result.physicalCalls <= 1, "more than one model smoke call");
    const prior = history.data?.filter((row) => row.model === candidate.model) || [];
    results.push({ ...result, contextLength: candidate.contextLength, historicalCalls: prior.length, historicalSuccessRate: prior.length ? prior.filter((row) => row.success).length / prior.length : null });
  }
  const after = await snapshot();
  const physicalCalls = results.reduce((sum, result) => sum + result.physicalCalls, 0);
  assert.equal(after.reserved - before.reserved, physicalCalls); assert.equal(after.calls - before.calls, physicalCalls);
  assert.equal(after.pending, before.pending); assert.equal(after.claims, 0);
  const ranked = results.filter((result) => result.requestedModel !== "openrouter/free" && result.classification === "HEALTHY" && result.schemaSuccess && (result.contextLength || 0) >= 8192)
    .sort((left, right) => left.latencyMs - right.latencyMs || (right.historicalSuccessRate || 0) - (left.historicalSuccessRate || 0) || (right.contextLength || 0) - (left.contextLength || 0));
  const selectedOrder = ranked.slice(0, 3).map((result) => result.requestedModel);
  console.log(JSON.stringify({ catalog: catalog.candidates, results, ranking: ranked.map((result) => result.requestedModel), selectedOrder, before, after, physicalCalls, reservationsDelta: after.reserved - before.reserved, usageDelta: after.calls - before.calls }, null, 2));
  if (!selectedOrder.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "model matrix failed"); process.exitCode = 1; });

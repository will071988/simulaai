import assert from "node:assert/strict";
import crypto from "node:crypto";
import { supabaseService } from "../src/lib/supabase-server";
import { acquireCollectorLock, releaseCollectorLock } from "../src/lib/collector/lock";
import { runCollector } from "../src/lib/collector/pipeline";
import { POST as processPending } from "../src/app/api/collector/pending/route";

const EXPECTED_HOST = "ukwulespvvthyjqgrjfo.supabase.co";

async function snapshot() {
  const db = supabaseService();
  const [pending, documents, aliases, relationships, evidence, changes, contests, usage, budget, retries] = await Promise.all([
    db.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
    db.from("collector_documents").select("id", { count: "exact", head: true }),
    db.from("concurso_identity_aliases").select("id", { count: "exact", head: true }),
    db.from("concurso_documents").select("id", { count: "exact", head: true }),
    db.from("concurso_field_evidence").select("id", { count: "exact", head: true }),
    db.from("concurso_changes").select("id", { count: "exact", head: true }),
    db.from("concursos").select("id", { count: "exact", head: true }),
    db.from("ai_usage_logs").select("id", { count: "exact", head: true }),
    db.from("ai_daily_budget").select("reserved_count").eq("budget_day", new Date().toISOString().slice(0, 10)).maybeSingle(),
    db.from("collector_documents").select("ai_retry_count").eq("status", "AI_PENDING"),
  ]);
  for (const [name, result] of Object.entries({ pending, documents, aliases, relationships, evidence, changes, contests, usage, budget, retries })) {
    assert.equal(result.error, null, `${name}: ${result.error?.message || "query failed"}`);
  }
  return {
    pendingAI: pending.count || 0,
    documents: documents.count || 0,
    contests: contests.count || 0,
    aliases: aliases.count || 0,
    relationships: relationships.count || 0,
    evidence: evidence.count || 0,
    changes: changes.count || 0,
    aiUsageRows: usage.count || 0,
    dailyBudget: budget.data?.reserved_count || 0,
    pendingRetries: (retries.data || []).reduce((sum, row) => sum + Number(row.ai_retry_count || 0), 0),
  };
}

async function executeCollector() {
  const runId = crypto.randomUUID();
  assert.equal(await acquireCollectorLock(runId, 900), true, "collector lock is already held");
  try {
    return await runCollector(runId);
  } finally {
    await releaseCollectorLock(runId);
  }
}

async function drainPending() {
  const secret = process.env.CRON_SECRET || "";
  assert.ok(secret, "CRON_SECRET is required for the local route invocation");
  const response = await processPending(new Request("http://localhost/api/collector/pending", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  }));
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  assert.equal(new URL(url).hostname, EXPECTED_HOST, "aborting: unexpected Supabase project ref");
  assert.equal(process.env.AI_ENABLED, "true");
  assert.equal(process.env.FREE_AI_ONLY, "true");
  assert.equal(process.env.AI_PROVIDER_ORDER, "openrouter");
  assert.equal(process.env.MAX_AI_REQUESTS_PER_RUN, "10");
  assert.equal(process.env.MAX_AI_REQUESTS_PER_DAY, "50");
  assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required");

  const before = await snapshot();
  const first = await executeCollector();
  const pendingFirst = await drainPending();
  const afterFirst = await snapshot();
  const second = await executeCollector();
  const pendingSecond = await drainPending();
  const afterSecond = await snapshot();

  console.log(JSON.stringify({ projectRef: "ukwulespvvthyjqgrjfo", before, first, pendingFirst, afterFirst, second, pendingSecond, afterSecond }, null, 2));
}

main();

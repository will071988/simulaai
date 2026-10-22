import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "playwright-core";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  assert.equal(new URL(url).hostname, "ukwulespvvthyjqgrjfo.supabase.co");
  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", options);
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", options);
  const snapshot = async () => {
    const day = new Date().toISOString().slice(0, 10);
    const [budget, usage, pending, claims] = await Promise.all([
      db.from("ai_daily_budget").select("reserved_count").eq("budget_day", day).maybeSingle(),
      db.from("ai_usage_logs").select("id", { count: "exact", head: true }).gte("created_at", `${day}T00:00:00Z`),
      db.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
      db.from("collector_documents").select("id", { count: "exact", head: true }).not("ai_claimed_at", "is", null),
    ]);
    for (const result of [budget, usage, pending, claims]) assert.equal(result.error, null, "snapshot failed");
    return { reserved: budget.data?.reserved_count || 0, calls: usage.count || 0, pending: pending.count || 0, claims: claims.count || 0 };
  };
  const before = await snapshot(); assert.equal(before.claims, 0); assert.ok(before.reserved <= 48, "need room for two controlled calls");
  const member = await db.from("ops_admin_members").select("user_id").eq("role", "ADMIN").limit(1).single(); assert.equal(member.error, null);
  const user = await db.auth.admin.getUserById(member.data.user_id); assert.equal(user.error, null); assert.ok(user.data.user.email);
  const link = await db.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email }); assert.equal(link.error, null); assert.ok(link.data.properties?.hashed_token);
  let signedIn = false; let browser: Browser | null = null;
  try {
    const session = await auth.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token }); assert.equal(session.error, null); assert.ok(session.data.session); signedIn = true;
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    const page = await browser.newPage(); await page.goto("https://simulaai-kappa.vercel.app/", { waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Conteúdo disponível para treinar" }).waitFor({ timeout: 60000 });
    const model = "nvidia/nemotron-3-super-120b-a12b:free";
    const results = [];
    for (const policy of ["provider-default", "disabled"]) {
      const result = await page.evaluate(async ({ model, policy, token }) => {
        const response = await fetch(`/api/collector/provider-smoke?model=${encodeURIComponent(model)}&fixture=synthetic-extraction&reasoningPolicy=${policy}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
        if (response.status !== 200) throw new Error(`diagnostic endpoint HTTP ${response.status}`);
        return response.json();
      }, { model, policy, token: session.data.session.access_token });
      assert.ok(result.physicalCalls <= 1); results.push(result);
      if (["AUTH_CONFIGURATION_ERROR", "BUDGET_EXHAUSTED", "MODEL_NOT_FREE", "INVALID_INPUT"].includes(result.errorCode)) break;
    }
    const after = await snapshot();
    const physicalCalls = results.reduce((sum, result) => sum + result.physicalCalls, 0);
    assert.equal(after.reserved - before.reserved, physicalCalls); assert.equal(after.calls - before.calls, physicalCalls); assert.equal(after.pending, before.pending); assert.equal(after.claims, 0);
    const disabledPassed = results.find((result) => result.reasoningPolicy === "disabled")?.ok === true;
    console.log(JSON.stringify({ results, before, after, physicalCalls, reservationsDelta: after.reserved - before.reserved, usageDelta: after.calls - before.calls, disabledPassed }, null, 2));
    if (!disabledPassed) process.exitCode = 1;
  } finally { await browser?.close(); if (signedIn) { const cleanup = await auth.auth.signOut({ scope: "local" }); assert.equal(cleanup.error, null, "session cleanup failed"); } }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "diagnostic failed"); process.exitCode = 1; });

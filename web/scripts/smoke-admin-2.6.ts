import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const productionUrl = process.env.PRODUCTION_URL || "https://simulaai-kappa.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminEmail = process.env.OPS_SMOKE_ADMIN_EMAIL || "";

type OperationsPayload = {
  ok: boolean;
  data: {
    failedDocuments: { id: string; title: string | null; source_url: string; status: string }[];
    aiPending: { id: string }[];
    counts: { aiPending: number; failedDocuments: number };
    recentActions: { action: string; target_id: string }[];
  };
};

async function authenticatedSession() {
  assert.equal(new URL(supabaseUrl).hostname, "ukwulespvvthyjqgrjfo.supabase.co", "unexpected Supabase project");
  assert.ok(anonKey && serviceKey && adminEmail, "required smoke configuration is absent");
  const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: adminEmail, options: { redirectTo: `${productionUrl}/admin/operacoes` } });
  assert.equal(linkError, null, linkError?.message);
  assert.ok(link.properties?.hashed_token, "magic-link token hash was not generated");
  const browser = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await browser.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  assert.equal(error, null, error?.message);
  assert.ok(data.session?.access_token, "authenticated session was not created");
  return data.session.access_token;
}

async function requestOperations(token: string, action?: { action: "RETRY_DOCUMENT"; targetId: string }) {
  const response = await fetch(`${productionUrl}/api/admin/operations`, {
    method: action ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(action ? { "content-type": "application/json" } : {}) },
    body: action ? JSON.stringify(action) : undefined,
    cache: "no-store",
  });
  const payload = await response.json() as OperationsPayload;
  return { response, payload };
}

async function main() {
  const token = await authenticatedSession();
  const before = await requestOperations(token);
  assert.equal(before.response.status, 200, "authenticated operations read failed");
  assert.equal(before.response.headers.get("cache-control"), "private, no-store", "private response must not be cached");
  assert.equal(before.payload.ok, true, "operations response was not successful");

  let retried = false;
  let targetId: string | null = null;
  if (process.env.CONFIRM_OPS_RETRY === "RETRY_ONE_FAILED_DOCUMENT") {
    const requestedTarget = process.env.OPS_SMOKE_RETRY_DOCUMENT_ID || "";
    assert.match(requestedTarget, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "an explicit retry document UUID is required");
    const target = before.payload.data.failedDocuments.find((document) => document.id === requestedTarget);
    assert.ok(target, "the explicit retry target is not currently FAILED");
    targetId = target.id;
    const action = await requestOperations(token, { action: "RETRY_DOCUMENT", targetId });
    assert.equal(action.response.status, 200, "controlled retry action failed");
    assert.equal(action.payload.ok, true, "controlled retry was not acknowledged");
    const after = await requestOperations(token);
    assert.equal(after.response.status, 200, "post-action operations read failed");
    assert.ok(after.payload.data.aiPending.some((document) => document.id === targetId), "retried document did not enter AI_PENDING");
    assert.ok(after.payload.data.recentActions.some((item) => item.action === "RETRY_DOCUMENT" && item.target_id === targetId), "retry action was not audited");
    retried = true;
  }

  console.log(JSON.stringify({
    ok: true,
    authenticatedRead: true,
    cacheControl: "private, no-store",
    countsBefore: before.payload.data.counts,
    controlledRetry: retried,
    targetId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "admin smoke failed");
  process.exitCode = 1;
});

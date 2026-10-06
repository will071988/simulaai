import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/admin/operations/route";

const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
async function main() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://operations-fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-not-a-secret";
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = [];
  let error = "";
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://operations-fixture.supabase.co");
    const body = request.method === "POST" ? await request.json() : null;
    calls.push({ url, method: request.method, body });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: actor, email_confirmed_at: "2026-10-05T00:00:00Z", is_anonymous: false, aud: "authenticated", app_metadata: {}, user_metadata: {} });
    if (url.pathname.endsWith("/ops_admin_members")) return Response.json([{ role: "ADMIN" }]);
    if (url.pathname.includes("/rpc/")) {
      if (error) return Response.json({ message: error, code: "P0001" }, { status: 400 });
      return Response.json({ ok: true, source: { source_id: target, enabled: body?.p_activate_known_adapter === true } });
    }
    if (request.method === "HEAD") return new Response(null, { headers: { "Content-Range": "0-0/0" } });
    assert.equal(request.method, "GET");
    return Response.json([], { headers: { "Content-Range": "0-0/0" } });
  };
  const post = (body: unknown) => POST(new Request("https://simulaai.test/api/admin/operations", { method: "POST", headers: { authorization: "Bearer fixture-user", "content-type": "application/json" }, body: JSON.stringify(body) }));
  const approve = { action: "APPROVE_SOURCE", targetId: target, officialUrl: "https://conhecimento.fgv.br/concursos/fixture", note: "Official evidence checked" };
  try {
    let response = await post(approve);
    assert.equal(response.status, 200);
    let rpc = calls.find((call) => call.url.pathname.includes("/rpc/"))!;
    assert.equal(rpc.url.pathname, "/rest/v1/rpc/ops_approve_source");
    assert.deepEqual(rpc.body, { p_actor: actor, p_target: target, p_note: approve.note, p_official_url: approve.officialUrl, p_activate_known_adapter: false });
    calls.length = 0;
    response = await post({ ...approve, activateKnownAdapter: true });
    assert.equal(response.status, 200);
    rpc = calls.find((call) => call.url.pathname.includes("/rpc/"))!;
    assert.equal(rpc.body?.p_activate_known_adapter, true);
    calls.length = 0;
    response = await post({ ...approve, actorId: target });
    assert.equal(response.status, 400, "request cannot impersonate another actor");
    assert.ok(!calls.some((call) => call.url.pathname.includes("/rpc/")));
    for (const code of ["OPS_ADAPTER_NOT_SUPPORTED", "OPS_SOURCE_IDENTITY_MISMATCH", "OPS_TARGET_NOT_ACTIONABLE"]) {
      error = code; response = await post(approve);
      assert.equal(response.status, 409); assert.equal((await response.json()).error, code.replace("OPS_", ""));
    }
    error = "private database details";
    response = await post(approve); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private database/);
    error = ""; calls.length = 0;
    response = await post({ action: "RETRY_DOCUMENT", targetId: target });
    assert.equal(response.status, 200);
    assert.equal(calls.find((call) => call.url.pathname.includes("/rpc/"))!.url.pathname, "/rest/v1/rpc/ops_apply_action");
    calls.length = 0;
    response = await GET(new Request("https://simulaai.test/api/admin/operations?candidateOffset=50&historyOffset=100", { headers: { authorization: "Bearer fixture-user" } }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = await response.json();
    assert.deepEqual(payload.data.sourcePagination, { candidateOffset: 50, historyOffset: 100, limit: 50 });
    assert.ok(Array.isArray(payload.data.sourceHistory)); assert.equal(payload.data.knownAdapters.length, 8);
    const candidateQueries = calls.filter((call) => call.url.pathname.endsWith("/source_candidates"));
    assert.equal(candidateQueries.length, 2);
    assert.ok(candidateQueries.every((call) => call.url.searchParams.get("select")?.includes("operational_source:collector_sources!source_candidates_operational_source_id_fkey")), "history must include its real operational destination");
    assert.equal(candidateQueries.find((call) => call.url.searchParams.get("status") === "eq.CANDIDATE")!.url.searchParams.get("offset"), "50");
    assert.equal(candidateQueries.find((call) => call.url.searchParams.get("status") === "in.(APPROVED,REJECTED)")!.url.searchParams.get("offset"), "100");
    for (const query of ["candidateOffset=-1", "historyOffset=1.2", "historyOffset=1000001", "historyOffset=1&historyOffset=2", "unexpected=1"]) {
      calls.length = 0;
      response = await GET(new Request(`https://simulaai.test/api/admin/operations?${query}`, { headers: { authorization: "Bearer fixture-user" } }));
      assert.equal(response.status, 400); assert.ok(calls.every((call) => call.url.pathname === "/auth/v1/user" || call.url.pathname.endsWith("/ops_admin_members")));
    }
    console.log("Sprint 2.6 operations API: server-controlled actor, explicit activation, conflict errors, durable destination and independent pagination passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

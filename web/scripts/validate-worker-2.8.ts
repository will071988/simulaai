import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pendingLimit, pendingClaimArguments, pendingProviderOrder } from "../src/lib/collector/pendingLimit";
import { isCronAuthorized } from "../src/lib/collector/cronAuth";
import { parseOpenRouterJson, classifyInvalidJson, OpenRouterProvider } from "../src/lib/ai/openrouter";

async function main() {
  for (const [value, expected] of [["1", 1], ["5", 5], ["0", null], ["6", null], ["abc", null]] as const) {
    assert.equal(pendingLimit(new Request(`https://fixture.test/api/collector/pending?limit=${value}`)), expected);
  }
  assert.equal(pendingLimit(new Request("https://fixture.test/api/collector/pending")), 5);
  assert.equal(pendingLimit(new Request("https://fixture.test/api/collector/pending?limit=1&limit=5")), null);
  assert.equal(pendingProviderOrder(new Request("https://fixture.test")), undefined);
  assert.equal(pendingProviderOrder(new Request("https://fixture.test", { headers: { "x-ai-healthy-providers": "unknown" } })), null);
  assert.equal(pendingProviderOrder(new Request("https://fixture.test", { headers: { "x-ai-healthy-providers": "openrouter,openrouter" } })), null);
  const route = readFileSync("src/app/api/collector/pending/route.ts", "utf8");
  assert.deepEqual(pendingClaimArguments(1), { p_limit: 1 });
  assert.deepEqual(pendingClaimArguments(5), { p_limit: 5 });
  assert.match(route, /"claim_ai_pending_documents", pendingClaimArguments\(limit\)/);
  assert.match(route, /status: 400/);
  const oldSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "fixture-only";
  try {
    assert.equal(isCronAuthorized(new Request("https://fixture.test")), false);
    assert.equal(isCronAuthorized(new Request("https://fixture.test", { headers: { authorization: "Bearer invalid" } })), false);
    assert.equal(isCronAuthorized(new Request("https://fixture.test", { headers: { authorization: "Bearer fixture-only" } })), true);
  } finally { if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret; }
  assert.deepEqual(parseOpenRouterJson('{"ok":true}'), { ok: true });
  assert.deepEqual(parseOpenRouterJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => parseOpenRouterJson('{"ok":'));
  assert.equal(classifyInvalidJson(""), "EMPTY_BODY");
  assert.equal(classifyInvalidJson('{"ok":', "length"), "TRUNCATED_JSON");
  assert.equal(classifyInvalidJson("text"), "FREE_TEXT");
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fixture-only";
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ model: "effective-fixture", choices: [{ message: { content: '{"ok":true}' } }] }); };
    const success = await new OpenRouterProvider().generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture" }, async () => true);
    assert.equal(calls, 1); assert.equal(success.effectiveModel, "effective-fixture"); assert.equal(success.httpStatus, 200);
    globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
    const timeout = await new OpenRouterProvider().generate({ taskType: "EXTRACT_CONCURSO", prompt: "fixture", input: {}, promptVersion: "fixture" }, async () => true);
    assert.equal(timeout.errorCode, "TIMEOUT"); assert.equal(timeout.timeoutSource, "CLIENT_ABORT_SIGNAL");
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; }
  console.log("worker limits, auth, strict JSON and provider diagnostics passed");
}
main().catch(() => { console.error("worker diagnostics validation failed"); process.exitCode = 1; });

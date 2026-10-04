import assert from "node:assert/strict";
import { validateOperationAction } from "../src/lib/admin/operations";
import { GET, POST } from "../src/app/api/admin/operations/route";

const id = "11111111-1111-4111-8111-111111111111";
assert.deepEqual(validateOperationAction({ action: "RETRY_DOCUMENT", targetId: id }), { action: "RETRY_DOCUMENT", targetId: id });
assert.equal(validateOperationAction({ action: "RUN_SQL", targetId: id, sql: "select 1" }), null);
assert.equal(validateOperationAction({ action: "RETRY_DOCUMENT", targetId: id, sql: "select 1" }), null);
assert.equal(validateOperationAction({ action: "REVIEW_CONFLICT", targetId: id, note: "x" }), null);
assert.equal(validateOperationAction({ action: "APPROVE_SOURCE", targetId: id, officialUrl: "http://official.test" }), null);
assert.equal(validateOperationAction({ action: "APPROVE_SOURCE", targetId: id, officialUrl: "https://127.0.0.1/secret" }), null);
assert.equal(validateOperationAction({ action: "APPROVE_SOURCE", targetId: id, officialUrl: "https://user:pass@example.com" }), null);
assert.equal(validateOperationAction({ action: "APPROVE_SOURCE", targetId: id, officialUrl: "https://official.example/edital" }), null);
assert.ok(validateOperationAction({ action: "APPROVE_SOURCE", targetId: id, officialUrl: "https://official.example/edital", note: "Official evidence reviewed" }));
console.log("Sprint 2.6 strict operational action validation passed");

async function verifyUnauthenticated() {
  const request = new Request("https://simulaai.test/api/admin/operations");
  const get = await GET(request);
  assert.equal(get.status, 401);
  assert.equal(get.headers.get("cache-control"), "private, no-store");
  const post = await POST(new Request(request.url, { method: "POST", body: JSON.stringify({ action: "RETRY_DOCUMENT", targetId: id }) }));
  assert.equal(post.status, 401);
  console.log("Sprint 2.6 unauthenticated API access denied");
}
verifyUnauthenticated().catch((error) => { console.error(error); process.exitCode = 1; });

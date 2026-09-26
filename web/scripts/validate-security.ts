import assert from "node:assert/strict";
import { hashRateLimitIdentity, PublicRequestError, readJsonBody } from "../src/lib/api/publicRequest";

async function main() {
  const hash = hashRateLimitIdentity("origin:203.0.113.7", "quiz/start", "server-salt");
  assert.equal(hash.length, 64);
  assert.equal(hash.includes("203.0.113.7"), false);
  await assert.rejects(readJsonBody(new Request("https://example.com", { method: "POST", headers: { "content-length": "40000" }, body: "{}" })), (error) => error instanceof PublicRequestError && error.status === 413);
  await assert.rejects(readJsonBody(new Request("https://example.com", { method: "POST", body: JSON.stringify({ value: "x".repeat(33000) }) })), (error) => error instanceof PublicRequestError && error.status === 413);
  await assert.rejects(readJsonBody(new Request("https://example.com", { method: "POST", body: "{" })), (error) => error instanceof PublicRequestError && error.code === "INVALID_JSON");
  console.log("security validation passed");
}
main();

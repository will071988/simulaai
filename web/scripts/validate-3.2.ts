import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bearerToken } from "../src/lib/auth/server";

const nextConfig = readFileSync("next.config.ts", "utf8");
const authServer = readFileSync("src/lib/auth/server.ts", "utf8");

for (const header of [
  "Strict-Transport-Security",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "X-Permitted-Cross-Domain-Policies",
  "X-DNS-Prefetch-Control",
  "Origin-Agent-Cluster",
]) assert.match(nextConfig, new RegExp(header));

assert.match(nextConfig, /poweredByHeader:\s*false/);
assert.match(nextConfig, /object-src 'none'/);
assert.match(nextConfig, /frame-ancestors 'none'/);
assert.match(nextConfig, /base-uri 'self'/);
assert.doesNotMatch(nextConfig, /script-src[^\n]*unsafe-eval[^\n]*production/i);

assert.equal(bearerToken(new Request("https://example.com")), null);
assert.equal(bearerToken(new Request("https://example.com", { headers: { authorization: "Basic abc" } })), null);
assert.equal(bearerToken(new Request("https://example.com", { headers: { authorization: "Bearer short" } })), null);
assert.equal(bearerToken(new Request("https://example.com", { headers: { authorization: `Bearer ${"a".repeat(9000)}` } })), null);
assert.equal(bearerToken(new Request("https://example.com", { headers: { authorization: `Bearer ${"a".repeat(32)}` } })), "a".repeat(32));
assert.match(authServer, /MAX_BEARER_LENGTH/);
console.log("Sprint 3.2 final security header and bounded bearer-token checks passed");

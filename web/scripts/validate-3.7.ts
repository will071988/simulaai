import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const route = read("src/app/api/admin/release-readiness/route.ts");
const page = read("src/app/admin/release/page.tsx");
const privacy = read("src/app/privacidade/page.tsx");
const terms = read("src/app/termos/page.tsx");
const env = read(".env.example");

for (const gate of [
  "productionRuntime",
  "collectorBacklog",
  "noActiveClaims",
  "sourcesHealthy",
  "billingConfigured",
  "billingLiveMode",
  "supportConfigured",
  "siteUrlConfigured",
  "freeAiGuard",
]) assert.match(route, new RegExp(gate));

assert.match(route, /STRIPE_LIVEMODE/);
assert.match(route, /AI_PENDING/);
assert.match(route, /ai_claimed_at/);
assert.match(route, /NEXT_PUBLIC_SUPPORT_EMAIL/);
assert.match(route, /NEXT_PUBLIC_SITE_URL/);
assert.match(page, /PRONTO PARA LANÇAMENTO/);
assert.match(page, /AINDA BLOQUEADO/);
assert.match(privacy, /NEXT_PUBLIC_SUPPORT_EMAIL/);
assert.match(terms, /NEXT_PUBLIC_SUPPORT_EMAIL/);
assert.match(env, /NEXT_PUBLIC_SITE_URL=/);
assert.match(env, /NEXT_PUBLIC_SUPPORT_EMAIL=/);

console.log("Sprint 3.7 release-candidate readiness checks passed");

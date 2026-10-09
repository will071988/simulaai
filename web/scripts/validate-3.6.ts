import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const checkout = read("src/app/api/billing/checkout/route.ts");
const webhook = read("src/app/api/billing/webhook/route.ts");
const entitlement = read("src/app/api/billing/entitlement/route.ts");
const analytics = read("src/app/api/admin/analytics/route.ts");
const account = read("src/app/conta/page.tsx");
const home = read("src/app/page.tsx");
const contests = read("src/app/concursos/page.tsx");
const privacy = read("src/app/privacidade/page.tsx");
const terms = read("src/app/termos/page.tsx");
const layout = read("src/app/layout.tsx");

assert.match(checkout, /authenticatedUser/);
assert.match(checkout, /client_reference_id/);
assert.match(webhook, /verifyStripeSignature/);
assert.match(webhook, /simulaai_billing_webhook_events/);
assert.match(entitlement, /premiumActive/);
assert.match(analytics, /authorizeOperations/);
assert.match(account, /BillingAccountPanel/);
assert.match(home, /premium_monthly/);
assert.match(home, /premium_annual/);
assert.match(home, /premium_one_time/);
assert.doesNotMatch(home, /Pagamento será disponibilizado em breve/);
assert.match(contests, /Concursos|concursos/);
assert.match(privacy, /Privacidade|privacidade/);
assert.match(terms, /Termos|termos/);
assert.match(layout, /manifest/);

console.log("Sprint 3.6 release-flow contract checks passed");

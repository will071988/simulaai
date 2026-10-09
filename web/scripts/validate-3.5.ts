import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const route = read("src/app/api/admin/analytics/route.ts");
assert.match(route, /authorizeOperations/);
assert.match(route, /private, no-store/);
assert.match(route, /user_profiles/);
assert.match(route, /simulado_attempts/);
assert.match(route, /simulaai_billing_subscriptions/);
assert.match(route, /simulaai_billing_purchases/);
assert.match(route, /STRIPE_PRICE_PREMIUM_MONTHLY/);
assert.match(route, /STRIPE_PRICE_PREMIUM_ANNUAL/);
assert.match(route, /INVALID_ANALYTICS_WINDOW/);

const page = read("src/app/admin/analytics/page.tsx");
assert.match(page, /Analytics comercial/);
assert.match(page, /MRR estimado/);
assert.match(page, /ARR estimado/);
assert.match(page, /Acesso restrito a administradores/);

const layout = read("src/app/admin/layout.tsx");
assert.match(layout, /index: false/);

console.log("Sprint 3.5 first-party commercial analytics checks passed");

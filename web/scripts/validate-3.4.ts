import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const plans = read("src/lib/billing/plans.ts");
assert.match(plans, /premium_monthly/);
assert.match(plans, /premium_annual/);
assert.match(plans, /premium_one_time/);
assert.match(plans, /STRIPE_PRICE_PREMIUM_MONTHLY/);
assert.match(plans, /STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY/);

const stripe = read("src/lib/billing/stripe.ts");
assert.match(stripe, /timingSafeEqual/);
assert.match(stripe, /STRIPE_WEBHOOK_SECRET/);
assert.match(stripe, /AbortSignal\.timeout/);

const checkout = read("src/app/api/billing/checkout/route.ts");
assert.match(checkout, /authenticatedUser/);
assert.match(checkout, /client_reference_id/);
assert.match(checkout, /locked_prefilled_email/);
assert.doesNotMatch(checkout, /STRIPE_SECRET_KEY/);

const webhook = read("src/app/api/billing/webhook/route.ts");
assert.match(webhook, /verifyStripeSignature/);
assert.match(webhook, /billing_webhook_events/);
assert.match(webhook, /checkout\.session\.completed/);
assert.match(webhook, /customer\.subscription\.updated/);

const migration = read("../supabase/migrations/20261009143000_sprint_3_4_billing.sql");
for (const table of ["billing_customers", "billing_subscriptions", "billing_purchases", "billing_webhook_events"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /revoke all on table public\.billing_customers from anon, authenticated/);

const env = read(".env.example");
for (const key of [
  "STRIPE_WEBHOOK_SECRET=",
  "STRIPE_PRICE_PREMIUM_MONTHLY=",
  "STRIPE_PRICE_PREMIUM_ANNUAL=",
  "STRIPE_PRICE_PREMIUM_ONE_TIME=",
  "STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY=",
  "STRIPE_PAYMENT_LINK_PREMIUM_ANNUAL=",
  "STRIPE_PAYMENT_LINK_PREMIUM_ONE_TIME=",
  "STRIPE_PORTAL_LOGIN_URL=",
]) assert.match(env, new RegExp(key));

assert.doesNotMatch(env, /sk_(live|test)_/);
assert.doesNotMatch(env, /whsec_[A-Za-z0-9]{16,}/);

console.log("Sprint 3.4 billing configuration, auth, webhook idempotency and RLS checks passed");

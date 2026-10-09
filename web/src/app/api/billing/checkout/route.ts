import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { BillingPlanCodeSchema, billingPlan } from "@/lib/billing/plans";
import { formBody, stripeRequest } from "@/lib/billing/stripe";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };

type CheckoutSession = { id: string; url: string | null };

async function handlePOST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_BILLING_REQUEST" }, { status: 400, headers: noStore }); }

  const parsed = BillingPlanCodeSchema.safeParse((body as { planCode?: unknown })?.planCode);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400, headers: noStore });

  const plan = billingPlan(parsed.data);
  if (!plan) return NextResponse.json({ error: "BILLING_NOT_CONFIGURED" }, { status: 503, headers: noStore });

  const svc = supabaseService();
  const { data: customerRow } = await svc
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const origin = new URL(request.url).origin;
  const entries: Array<[string, string | number | boolean | null | undefined]> = [
    ["mode", plan.mode],
    ["line_items[0][price]", plan.priceId],
    ["line_items[0][quantity]", 1],
    ["success_url", `${origin}/conta?billing=success`],
    ["cancel_url", `${origin}/?billing=cancelled#planos`],
    ["client_reference_id", user.id],
    ["metadata[user_id]", user.id],
    ["metadata[plan_code]", plan.code],
    ["allow_promotion_codes", true],
  ];

  if (customerRow?.stripe_customer_id) entries.push(["customer", customerRow.stripe_customer_id]);
  else if (user.email) entries.push(["customer_email", user.email]);

  if (plan.mode === "subscription") {
    entries.push(["subscription_data[metadata][user_id]", user.id]);
    entries.push(["subscription_data[metadata][plan_code]", plan.code]);
  } else {
    entries.push(["payment_intent_data[metadata][user_id]", user.id]);
    entries.push(["payment_intent_data[metadata][plan_code]", plan.code]);
  }

  try {
    const session = await stripeRequest<CheckoutSession>("/checkout/sessions", { method: "POST", body: formBody(entries) });
    if (!session.url) throw new Error("CHECKOUT_URL_MISSING");
    return NextResponse.json({ data: { url: session.url } }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "CHECKOUT_CREATE_FAILED" }, { status: 502, headers: noStore });
  }
}

export const POST = observeApiRoute("/api/billing/checkout", handlePOST);

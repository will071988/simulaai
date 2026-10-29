import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/billing/stripe";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
};

function asString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function unixDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function stripeObjectId(value: unknown) {
  return typeof value === "string" && value ? value : value && typeof value === "object" && "id" in value ? asString((value as { id?: unknown }).id) : null;
}

async function mapCustomer(userId: string, customerId: string | null) {
  if (!customerId) return;
  const { error } = await supabaseService().from("simulaai_billing_customers").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error("BILLING_CUSTOMER_WRITE_FAILED");
}

async function resolveUser(customerId: string | null, metadata: Record<string, unknown> | null) {
  const metadataUser = asString(metadata?.user_id);
  if (metadataUser) return metadataUser;
  if (!customerId) return null;
  const { data } = await supabaseService()
    .from("simulaai_billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return asString(data?.user_id);
}

async function syncSubscription(object: Record<string, unknown>) {
  const subscriptionId = asString(object.id);
  const customerId = asString(object.customer);
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : null;
  const userId = await resolveUser(customerId, metadata);
  if (!subscriptionId || !customerId || !userId) throw new Error("BILLING_SUBSCRIPTION_IDENTITY_MISSING");

  const items = object.items && typeof object.items === "object" ? object.items as { data?: Array<Record<string, unknown>> } : null;
  const firstItem = items?.data?.[0];
  const price = firstItem?.price && typeof firstItem.price === "object" ? firstItem.price as Record<string, unknown> : null;

  await mapCustomer(userId, customerId);
  const { error } = await supabaseService().from("simulaai_billing_subscriptions").upsert({
    stripe_subscription_id: subscriptionId,
    user_id: userId,
    stripe_customer_id: customerId,
    price_id: asString(price?.id),
    status: asString(object.status) || "unknown",
    current_period_end: unixDate(object.current_period_end) || unixDate(firstItem?.current_period_end) || unixDate(object.trial_end),
    cancel_at_period_end: object.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error("BILLING_SUBSCRIPTION_WRITE_FAILED");
}

async function markSubscriptionStatus(subscriptionId: string | null, status: string) {
  if (!subscriptionId) return;
  const { error } = await supabaseService()
    .from("simulaai_billing_subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error("BILLING_SUBSCRIPTION_WRITE_FAILED");
}

async function markPurchaseRefunded(paymentIntentId: string | null, refundStatus?: string | null) {
  if (!paymentIntentId || ["failed", "canceled"].includes(refundStatus || "")) return;
  const { error } = await supabaseService()
    .from("simulaai_billing_purchases")
    .update({ status: "REFUNDED" })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "PAID");
  if (error) throw new Error("BILLING_PURCHASE_WRITE_FAILED");
}

async function handlePOST(request: Request) {
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "INVALID_STRIPE_SIGNATURE" }, { status: 400 });
  }

  let event: StripeEvent;
  try { event = JSON.parse(rawBody) as StripeEvent; }
  catch { return NextResponse.json({ error: "INVALID_STRIPE_EVENT" }, { status: 400 }); }
  if (!event.id || !event.type) return NextResponse.json({ error: "INVALID_STRIPE_EVENT" }, { status: 400 });

  const svc = supabaseService();
  const { data: processed } = await svc
    .from("simulaai_billing_webhook_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (processed) return NextResponse.json({ received: true, duplicate: true });

  try {
    const object = event.data?.object || {};
    if (event.type === "checkout.session.completed") {
      const userId = asString(object.client_reference_id) ||
        (object.metadata && typeof object.metadata === "object" ? asString((object.metadata as Record<string, unknown>).user_id) : null);
      const customerId = asString(object.customer);
      if (!userId) throw new Error("BILLING_CHECKOUT_IDENTITY_MISSING");
      await mapCustomer(userId, customerId);

      if (object.mode === "payment" && object.payment_status === "paid") {
        const { error } = await svc.from("simulaai_billing_purchases").upsert({
          stripe_checkout_session_id: asString(object.id),
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_payment_intent_id: asString(object.payment_intent),
          price_id: process.env.STRIPE_PRICE_PREMIUM_ONE_TIME || null,
          status: "PAID",
        }, { onConflict: "stripe_checkout_session_id" });
        if (error) throw new Error("BILLING_PURCHASE_WRITE_FAILED");
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused" ||
      event.type === "customer.subscription.resumed"
    ) {
      await syncSubscription(object);
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
      await markSubscriptionStatus(stripeObjectId(object.subscription), event.type === "invoice.payment_failed" ? "past_due" : "incomplete");
    } else if (event.type === "charge.refunded" || event.type === "refund.created" || event.type === "refund.updated") {
      await markPurchaseRefunded(stripeObjectId(object.payment_intent), asString(object.status));
    }

    const { error: eventError } = await svc.from("simulaai_billing_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
    });
    if (eventError && !String(eventError.code || "").includes("23505")) throw new Error("BILLING_EVENT_WRITE_FAILED");

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "BILLING_WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}

export const POST = observeApiRoute("/api/billing/webhook", handlePOST);

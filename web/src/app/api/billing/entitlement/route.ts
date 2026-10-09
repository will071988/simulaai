import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };
const activeStatuses = ["active", "trialing"];

async function handleGET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  const svc = supabaseService();
  const [subscriptions, purchases] = await Promise.all([
    svc
      .from("simulaai_billing_subscriptions")
      .select("stripe_subscription_id,status,current_period_end,cancel_at_period_end,price_id")
      .eq("user_id", user.id)
      .in("status", activeStatuses)
      .order("updated_at", { ascending: false })
      .limit(1),
    svc
      .from("simulaai_billing_purchases")
      .select("stripe_checkout_session_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "PAID")
      .is("consumed_at", null),
  ]);

  if (subscriptions.error || purchases.error) {
    return NextResponse.json({ error: "BILLING_ENTITLEMENT_QUERY_FAILED" }, { status: 500, headers: noStore });
  }

  const subscription = subscriptions.data?.[0] || null;
  const oneTimeCredits = purchases.count || 0;
  return NextResponse.json({
    data: {
      premiumActive: Boolean(subscription),
      subscription,
      oneTimeCredits,
    },
  }, { headers: noStore });
}

export const GET = observeApiRoute("/api/billing/entitlement", handleGET);

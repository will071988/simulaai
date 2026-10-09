import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { BillingPlanCodeSchema, billingPlan } from "@/lib/billing/plans";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };

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

  try {
    const url = new URL(plan.paymentLink);
    url.searchParams.set("client_reference_id", user.id);
    if (user.email) url.searchParams.set("locked_prefilled_email", user.email);
    return NextResponse.json({ data: { url: url.toString() } }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "CHECKOUT_CREATE_FAILED" }, { status: 502, headers: noStore });
  }
}

export const POST = observeApiRoute("/api/billing/checkout", handlePOST);

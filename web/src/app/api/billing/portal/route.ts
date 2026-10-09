import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { formBody, stripeRequest } from "@/lib/billing/stripe";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };

type PortalSession = { url: string };

async function handlePOST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  const { data, error } = await supabaseService()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.stripe_customer_id) {
    return NextResponse.json({ error: "BILLING_CUSTOMER_NOT_FOUND" }, { status: 404, headers: noStore });
  }

  try {
    const origin = new URL(request.url).origin;
    const session = await stripeRequest<PortalSession>("/billing_portal/sessions", {
      method: "POST",
      body: formBody([
        ["customer", data.stripe_customer_id],
        ["return_url", `${origin}/conta`],
      ]),
    });
    return NextResponse.json({ data: { url: session.url } }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "PORTAL_CREATE_FAILED" }, { status: 502, headers: noStore });
  }
}

export const POST = observeApiRoute("/api/billing/portal", handlePOST);

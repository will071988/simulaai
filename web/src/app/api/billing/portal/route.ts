import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };

async function handlePOST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  const portalUrl = process.env.STRIPE_PORTAL_LOGIN_URL;
  if (!portalUrl) return NextResponse.json({ error: "BILLING_NOT_CONFIGURED" }, { status: 503, headers: noStore });

  return NextResponse.json({ data: { url: portalUrl } }, { headers: noStore });
}

export const POST = observeApiRoute("/api/billing/portal", handlePOST);

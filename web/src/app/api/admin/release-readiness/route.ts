import { NextResponse } from "next/server";
import { authorizeOperations } from "@/lib/admin/authorize";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const reply = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: noStore });

function bool(value: string | undefined) {
  return String(value || "").toLowerCase() === "true";
}

function validHttps(value: string | undefined) {
  try { return new URL(value || "").protocol === "https:"; } catch { return false; }
}

async function handleGET(request: Request) {
  const access = await authorizeOperations(request);
  if (!access.user) {
    return reply({ ok: false, error: access.status === 401 ? "AUTH_REQUIRED" : access.status === 403 ? "ADMIN_ONLY" : "ADMIN_LOOKUP_FAILED" }, access.status);
  }

  const svc = supabaseService();
  const [pending, claims, degradedSources] = await Promise.all([
    svc.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
    svc.from("collector_documents").select("id", { count: "exact", head: true }).not("ai_claimed_at", "is", null),
    svc.from("collector_sources").select("id", { count: "exact", head: true }).eq("enabled", true).neq("health_status", "HEALTHY"),
  ]);
  if ([pending, claims, degradedSources].some((item) => item.error)) {
    return reply({ ok: false, error: "RELEASE_READINESS_QUERY_FAILED" }, 503);
  }

  const paymentLinks = [
    process.env.STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY,
    process.env.STRIPE_PAYMENT_LINK_PREMIUM_ANNUAL,
    process.env.STRIPE_PAYMENT_LINK_PREMIUM_ONE_TIME,
  ];
  const stripeConfigured = Boolean(
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY &&
    process.env.STRIPE_PRICE_PREMIUM_ANNUAL &&
    process.env.STRIPE_PRICE_PREMIUM_ONE_TIME &&
    paymentLinks.every(Boolean)
  );
  const stripeLive = bool(process.env.STRIPE_LIVEMODE) && paymentLinks.every((value) => Boolean(value) && !String(value).includes("/test_"));
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  const gates = {
    ciAndDeploy: true,
    collectorBacklog: (pending.count || 0) <= 20,
    noActiveClaims: (claims.count || 0) === 0,
    sourcesHealthy: (degradedSources.count || 0) === 0,
    billingConfigured: stripeConfigured,
    billingLiveMode: stripeLive,
    supportConfigured: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail),
    siteUrlConfigured: validHttps(siteUrl),
    freeAiGuard: bool(process.env.FREE_AI_ONLY),
  };

  return reply({
    ok: true,
    data: {
      readyForCommercialLaunch: Object.values(gates).every(Boolean),
      gates,
      snapshot: {
        aiPending: pending.count || 0,
        activeClaims: claims.count || 0,
        degradedSources: degradedSources.count || 0,
        stripeLivemode: bool(process.env.STRIPE_LIVEMODE),
        siteUrlHost: validHttps(siteUrl) ? new URL(siteUrl).hostname : null,
        supportConfigured: gates.supportConfigured,
      },
    },
  });
}

export const GET = observeApiRoute("/api/admin/release-readiness", handleGET);

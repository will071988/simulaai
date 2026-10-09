import { NextResponse } from "next/server";
import { authorizeOperations } from "@/lib/admin/authorize";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const reply = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: noStore });

function money(value: number) {
  return Math.round(value * 100) / 100;
}

async function handleGET(request: Request) {
  const access = await authorizeOperations(request);
  if (!access.user) {
    return reply(
      { ok: false, error: access.status === 401 ? "AUTH_REQUIRED" : access.status === 403 ? "ADMIN_ONLY" : "ADMIN_LOOKUP_FAILED" },
      access.status,
    );
  }

  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== "days" || params.getAll(key).length !== 1)) {
    return reply({ ok: false, error: "INVALID_ANALYTICS_WINDOW" }, 400);
  }

  const daysRaw = params.get("days") || "30";
  const days = Number(daysRaw);
  if (![7, 30, 90].includes(days)) return reply({ ok: false, error: "INVALID_ANALYTICS_WINDOW" }, 400);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const svc = supabaseService();

  const [
    registrations,
    attemptsStarted,
    attemptsCompleted,
    activeUsers,
    subscriptions,
    oneTime,
    cancellations,
  ] = await Promise.all([
    svc.from("user_profiles").select("user_id", { count: "exact", head: true }).gte("created_at", since),
    svc.from("simulado_attempts").select("id", { count: "exact", head: true }).gte("started_at", since),
    svc.from("simulado_attempts").select("id", { count: "exact", head: true }).not("completed_at", "is", null).gte("completed_at", since),
    svc.from("simulado_attempts").select("user_id").not("user_id", "is", null).gte("started_at", since).limit(10000),
    svc.from("simulaai_billing_subscriptions").select("user_id,price_id,status,cancel_at_period_end,created_at,updated_at"),
    svc.from("simulaai_billing_purchases").select("user_id,status,created_at").eq("status", "PAID").gte("created_at", since),
    svc.from("simulaai_billing_subscriptions").select("stripe_subscription_id", { count: "exact", head: true }).eq("cancel_at_period_end", true).gte("updated_at", since),
  ]);

  const results = [registrations, attemptsStarted, attemptsCompleted, activeUsers, subscriptions, oneTime, cancellations];
  if (results.some((item) => item.error)) return reply({ ok: false, error: "ANALYTICS_QUERY_FAILED" }, 503);

  const activeUserCount = new Set((activeUsers.data || []).map((item) => item.user_id).filter(Boolean)).size;
  const activeSubscriptions = (subscriptions.data || []).filter((item) => ["active", "trialing"].includes(String(item.status).toLowerCase()));
  const newSubscriptions = activeSubscriptions.filter((item) => item.created_at >= since);
  const monthlyPrice = process.env.STRIPE_PRICE_PREMIUM_MONTHLY || "";
  const annualPrice = process.env.STRIPE_PRICE_PREMIUM_ANNUAL || "";
  const monthlySubscribers = activeSubscriptions.filter((item) => item.price_id === monthlyPrice).length;
  const annualSubscribers = activeSubscriptions.filter((item) => item.price_id === annualPrice).length;
  const unknownSubscribers = Math.max(0, activeSubscriptions.length - monthlySubscribers - annualSubscribers);

  const mrr = monthlySubscribers * 29.9 + annualSubscribers * (299 / 12);
  const arr = mrr * 12;
  const oneTimeRevenueWindow = (oneTime.data || []).length * 14.9;
  const registrationCount = registrations.count || 0;
  const completionRate = (attemptsStarted.count || 0) > 0 ? (attemptsCompleted.count || 0) / (attemptsStarted.count || 1) : 0;
  const paidConversion = registrationCount > 0 ? newSubscriptions.length / registrationCount : 0;

  return reply({
    ok: true,
    data: {
      windowDays: days,
      acquisition: {
        registrations: registrationCount,
        activeUsers: activeUserCount,
      },
      engagement: {
        attemptsStarted: attemptsStarted.count || 0,
        attemptsCompleted: attemptsCompleted.count || 0,
        completionRate,
      },
      monetization: {
        activeSubscriptions: activeSubscriptions.length,
        newSubscriptions: newSubscriptions.length,
        monthlySubscribers,
        annualSubscribers,
        unknownSubscribers,
        oneTimePurchases: (oneTime.data || []).length,
        cancellationsRequested: cancellations.count || 0,
        paidConversion,
        mrrBrl: money(mrr),
        arrBrl: money(arr),
        oneTimeRevenueWindowBrl: money(oneTimeRevenueWindow),
      },
    },
  });
}

export const GET = observeApiRoute("/api/admin/analytics", handleGET);

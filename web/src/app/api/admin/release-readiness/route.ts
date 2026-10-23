import { NextResponse } from "next/server";
import { authorizeOperations } from "@/lib/admin/authorize";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";
import { loadPublishedQuestionPool } from "@/lib/simulados/published-pool";
import { OpenRouterProvider } from "@/lib/ai/openrouter";
import { configuredOpenRouterModels, fetchOpenRouterCatalog, approveFreeModel } from "@/lib/ai/openrouterModels";
import { providerConfiguration } from "@/lib/ai/registry";

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
  let publishedQuestions = 0;
  let trustedExplanationCount = 0;
  let contestsWithFullExam = 0;
  try {
    const pool = await loadPublishedQuestionPool();
    publishedQuestions = pool.questions.length;
    contestsWithFullExam = pool.contests.filter((contest) => pool.questions.filter((question) => question.concurso_id === contest.id).length >= 30).length;
    if (publishedQuestions) {
      const explanations = await svc.from("question_explanations").select("questao_id,explanation_cache!inner(id)", { count: "exact", head: true }).in("questao_id", pool.questions.map((question) => question.id)).eq("explanation_cache.quality_status", "VALIDATED").gte("explanation_cache.confidence", 0.8).gte("explanation_cache.explanation_quality", 0.8);
      if (explanations.error) throw new Error("EXPLANATION_COVERAGE_FAILED");
      trustedExplanationCount = explanations.count || 0;
    }
  } catch { return reply({ ok: false, error: "RELEASE_CONTENT_QUERY_FAILED" }, 503); }
  const credential = await new OpenRouterProvider().healthCheck();
  const extractionModels = configuredOpenRouterModels();
  let freeModelsAvailable = false;
  if (credential.healthy && extractionModels.length) {
    try { const catalog = await fetchOpenRouterCatalog(); const approvals = extractionModels.map((model) => approveFreeModel(model, catalog)); freeModelsAvailable = approvals.every((approval) => approval.ok) && (process.env.AI_EXTRACT_REASONING_POLICY !== "disabled" || approvals.some((approval) => approval.reasoningDisableSupported)); }
    catch { freeModelsAvailable = false; }
  }

  const gates = {
    productionRuntime: process.env.VERCEL_ENV === "production",
    collectorBacklog: (pending.count || 0) <= 20,
    noActiveClaims: (claims.count || 0) === 0,
    sourcesHealthy: (degradedSources.count || 0) === 0,
    billingConfigured: stripeConfigured,
    billingLiveMode: stripeLive,
    supportConfigured: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail),
    siteUrlConfigured: validHttps(siteUrl),
    freeAiGuard: bool(process.env.FREE_AI_ONLY),
    publishedQuestionBank: publishedQuestions >= 30,
    trustedExplanations: publishedQuestions > 0 && trustedExplanationCount === publishedQuestions,
    contestQuestionCoverage: contestsWithFullExam > 0,
    aiCredentialValid: credential.healthy,
    freeExtractionModelsAvailable: freeModelsAvailable,
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
        publishedQuestions,
        trustedExplanationCount,
        contestsWithFullExam,
        aiCredentialHttpStatus: credential.credentialHttpStatus || null,
        extractionModels,
        aiProviders: providerConfiguration(),
      },
    },
  });
}

export const GET = observeApiRoute("/api/admin/release-readiness", handleGET);

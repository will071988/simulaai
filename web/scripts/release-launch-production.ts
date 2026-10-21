import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { starterBank, STARTER_BANK_REVISION } from "../src/lib/questions/starter-bank";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  assert.equal(new URL(url).hostname, "ukwulespvvthyjqgrjfo.supabase.co");
  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", options);
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", options);
  const base = "https://simulaai-kappa.vercel.app";
  const snapshot = async () => {
    const docs = await service.from("collector_documents").select("status,ai_claimed_at");
    const budget = await service.from("ai_daily_budget").select("reserved_count").eq("budget_day", new Date().toISOString().slice(0, 10)).maybeSingle();
    assert.equal(docs.error, null); assert.equal(budget.error, null);
    return { pending: docs.data?.filter((doc) => doc.status === "AI_PENDING").length || 0, claims: docs.data?.filter((doc) => doc.ai_claimed_at).length || 0, failed: docs.data?.filter((doc) => doc.status === "FAILED").length || 0, reserved: budget.data?.reserved_count || 0 };
  };
  const before = await snapshot();
  const anonymousAnswers = await auth.from("questoes").select("id,resposta_correta").limit(1);
  assert.equal(anonymousAnswers.error?.code, "42501", "apply the reviewed answer-access migration before publishing");
  const membership = await service.from("ops_admin_members").select("user_id").eq("role", "ADMIN").limit(1).single();
  assert.equal(membership.error, null, "administrator unavailable");
  const user = await service.auth.admin.getUserById(membership.data.user_id);
  assert.equal(user.error, null); assert.ok(user.data.user.email);
  const link = await service.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email });
  assert.equal(link.error, null); assert.ok(link.data.properties?.hashed_token);
  let signedIn = false;
  try {
    const session = await auth.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    assert.equal(session.error, null, "operator session failed"); assert.ok(session.data.session);
    signedIn = true;
    const authenticatedAnswers = await auth.from("questoes").select("id,resposta_correta").limit(1);
    assert.equal(authenticatedAnswers.error?.code, "42501", "authenticated users must not read raw answers");
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${session.data.session!.access_token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
      const payload = await response.json(); assert.ok(response.ok, `${path} HTTP ${response.status}: ${payload.error || "request failed"}`); return payload;
    };
    const released = await request("/api/admin/content/starter", { action: "PUBLISH_STARTER_BANK", revision: STARTER_BANK_REVISION });
    const repeated = await request("/api/admin/content/starter", { action: "PUBLISH_STARTER_BANK", revision: STARTER_BANK_REVISION });
    assert.equal(released.data.publishedQuestions, 30); assert.equal(repeated.data.insertedQuestions, 0); assert.equal(repeated.data.alreadyPublished, 30);
    const bank = starterBank();
    const stored = await service.from("questoes").select("id,question_fingerprint").in("question_fingerprint", bank.map((item) => item.fingerprint));
    assert.equal(stored.error, null); assert.equal(stored.data?.length, 30);
    const currentBank = new Map(stored.data!.map((row) => [row.id, bank.find((item) => item.fingerprint === row.question_fingerprint)!]));
    const available = await request("/api/simulados/generate");
    assert.ok(available.data.totalQuestions >= 30);
    const priorProgress = await request("/api/progress");
    const generated = await request("/api/simulados/generate", { sessionId: crypto.randomUUID(), mode: "RAPIDO", quantidade: 3, disciplina: "Matemática", seed: `launch-verification-${Date.now()}`, excludeQuestionIds: available.data.questions.filter((question: { id: string }) => !currentBank.has(question.id)).map((question: { id: string }) => question.id) });
    assert.equal(generated.data.questions.length, 3);
    assert.doesNotMatch(JSON.stringify(generated.data.questions), /gabarito|resposta_correta|isCorrect|correctAnswer/);
    const answers = Object.fromEntries(generated.data.questions.map((question: { id: string; alternativas: Array<{ key: string }> }, index: number) => {
      const authored = currentBank.get(question.id); assert.ok(authored, "smoke must use verified bundle questions");
      return [question.id, index === 0 ? question.alternativas.find((alternative) => alternative.key !== authored.question.respostaCorreta)!.key : authored.question.respostaCorreta];
    }));
    const completed = await request(`/api/simulados/attempts/${generated.data.attemptId}/complete`, { token: generated.data.token, answers });
    assert.equal(completed.data.correctCount, 2); assert.equal(Number(completed.data.score), 66.67);
    assert.equal(completed.data.corrections.filter((correction: { explanation?: { conceptualReference?: string } }) => correction.explanation?.conceptualReference?.includes(STARTER_BANK_REVISION)).length, 3);
    const duplicate = await request(`/api/simulados/attempts/${generated.data.attemptId}/complete`, { token: generated.data.token, answers: {} });
    assert.equal(Number(duplicate.data.score), 66.67);
    const progress = await request("/api/progress"); assert.equal(progress.data.summary.attempts, priorProgress.data.summary.attempts + 1);
    const readiness = await request("/api/admin/release-readiness");
    assert.equal(readiness.data.gates.publishedQuestionBank, true);
    assert.equal(readiness.data.gates.trustedExplanations, true);
    const after = await snapshot(); assert.deepEqual(after, before, "content release must not change collector queue, claims or AI budget");
    console.log(JSON.stringify({ release: released.data, repeated: repeated.data, eligibleQuestions: available.data.totalQuestions, productionSmoke: { serverScore: completed.data.score, correctCount: completed.data.correctCount, comments: completed.data.corrections.length, historyDelta: 1, idempotentCompletion: true }, readiness: readiness.data, before, after }, null, 2));
  } finally { if (signedIn) { const result = await auth.auth.signOut({ scope: "local" }); assert.equal(result.error, null, "operator session cleanup failed"); } }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "release verification failed"); process.exitCode = 1; });

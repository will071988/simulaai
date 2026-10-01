import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const coverage = await db.query<{ published: number; linked: number; cached: number }>(`select
      (select count(*) from questoes where quality_status='PUBLISHED') as published,
      (select count(*) from question_explanations) as linked,
      (select count(*) from explanation_cache where quality_status='VALIDATED') as cached`);
    assert.equal(coverage.rows[0].published, coverage.rows[0].linked);
    assert.equal(coverage.rows[0].linked, coverage.rows[0].cached);

    const questions = await db.query<{ id: string; resposta_correta: string }>("select id,resposta_correta from questoes where validated_by='sprint-1.8-seed' order by id limit 3");
    const ids = questions.rows.map((row) => row.id);
    const tokenHash = "e".repeat(64);
    const created = await db.query<{ result: { attemptId: string } }>("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4) as result", [JSON.stringify({ mode: "RAPIDO", title: "Correção inteligente", seed: "sprint-1.9" }), ids, "30000000-0000-4000-8000-000000000001", tokenHash]);
    const answers = Object.fromEntries(questions.rows.map((row, index) => [row.id, index === 0 ? row.resposta_correta : "Z"]));
    const completed = await db.query<{ result: { corrections: Array<{ questionId: string; correctAnswer: string; isCorrect: boolean; explanation: null | { text: string; wrongAlternatives: Record<string, string>; conceptualReference: string; explanationQuality: number; confidence: number } }> } }>("select complete_simulado_attempt($1::uuid,$2,$3::jsonb) as result", [created.rows[0].result.attemptId, tokenHash, JSON.stringify(answers)]);
    assert.equal(completed.rows[0].result.corrections.length, 3);
    assert.ok(completed.rows[0].result.corrections.every((correction) => correction.correctAnswer && correction.explanation));
    assert.ok(completed.rows[0].result.corrections.every((correction) => Object.keys(correction.explanation!.wrongAlternatives).length >= 1));
    assert.ok(completed.rows[0].result.corrections.every((correction) => correction.explanation!.conceptualReference && Number(correction.explanation!.confidence) >= 0.8));

    const firstId = ids[0];
    await db.query("update explanation_cache set quality_status='DRAFT',confidence=0.500,explanation_quality=0.500 where id=(select explanation_id from question_explanations where questao_id=$1)", [firstId]);
    const secondToken = "f".repeat(64);
    const second = await db.query<{ result: { attemptId: string } }>("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4) as result", [JSON.stringify({ mode: "RAPIDO", title: "Gate de confiança", seed: "sprint-1.9-low" }), [firstId], "30000000-0000-4000-8000-000000000002", secondToken]);
    const gated = await db.query<{ result: { corrections: Array<{ explanation: unknown }> } }>("select complete_simulado_attempt($1::uuid,$2,$3::jsonb) as result", [second.rows[0].result.attemptId, secondToken, JSON.stringify({ [firstId]: questions.rows[0].resposta_correta })]);
    assert.equal(gated.rows[0].result.corrections[0].explanation, null, "low-confidence explanations must not be disclosed");

    const cache = await db.query<{ cache_key: string; correct_answer: string; explanation: string; wrong_alternatives: unknown; conceptual_reference: string; explanation_quality: number; confidence: number; quality_status: string; source: string }>("select cache_key,correct_answer,explanation,wrong_alternatives,conceptual_reference,explanation_quality,confidence,quality_status,source from explanation_cache limit 1");
    const row = cache.rows[0];
    await assert.rejects(db.query("insert into explanation_cache(cache_key,correct_answer,explanation,wrong_alternatives,conceptual_reference,explanation_quality,confidence,quality_status,source) values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)", [row.cache_key,row.correct_answer,row.explanation,JSON.stringify(row.wrong_alternatives),row.conceptual_reference,row.explanation_quality,row.confidence,row.quality_status,row.source]), /unique|duplicate/i);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from explanation_cache"), /permission denied/);
    console.log("Sprint 1.9 PostgreSQL explanation coverage, correction disclosure, confidence gate, cache uniqueness and RLS tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

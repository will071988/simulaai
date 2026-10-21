import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { starterBank, verifyStarterQuestion } from "../src/lib/questions/starter-bank";
import { publishStarterBank } from "../src/lib/questions/publish-starter";
import { loadPublishedQuestionPool, publishedQuestionOptions } from "../src/lib/simulados/published-pool";
import { matchesQuestionFilters } from "../src/lib/simulados/filters";
import { createQuestionBankFixture } from "./support/questionBankFixture";
import { loadPublicPracticeCatalog } from "../src/lib/simulados/practice-catalog";

async function main() {
  const bank = starterBank();
  assert.equal(bank.length, 30);
  assert.deepEqual(bank.slice(0, 5).map((item) => item.values[item.question.alternativas.findIndex((alternative) => alternative.key === item.question.respostaCorreta)]), [180, 132, 300, 360, 192]);
  assert.deepEqual(bank.slice(25).map((item) => item.values[item.question.alternativas.findIndex((alternative) => alternative.key === item.question.respostaCorreta)]), [false, true, true, false, true]);
  const corrupted = structuredClone(bank[0]); corrupted.values[0] = 999;
  assert.throws(() => verifyStarterQuestion(corrupted));
  const unsupported = structuredClone(bank[0]); unsupported.question.banca = "Cebraspe";
  assert.throws(() => verifyStarterQuestion(unsupported));
  const { db, service } = await createQuestionBankFixture();
  try {
    const before = await loadPublishedQuestionPool(service);
    assert.ok(before.questions.length > 0); assert.equal(before.contests.length, 0, "hidden contest questions must remain quarantined");
    const first = await publishStarterBank(service, "11111111-1111-4111-8111-111111111111");
    assert.equal(first.insertedQuestions, 30); assert.equal(first.publishedQuestions, 30);
    const second = await publishStarterBank(service, "11111111-1111-4111-8111-111111111111");
    assert.equal(second.insertedQuestions, 0); assert.equal(second.alreadyPublished, 30);
    const pool = await loadPublishedQuestionPool(service);
    assert.equal(pool.questions.length, before.questions.length + 30);
    assert.equal(pool.contests.length, 0);
    const catalog = await loadPublicPracticeCatalog(service);
    assert.equal(catalog.totalQuestions, pool.questions.length);
    assert.deepEqual(Object.keys(catalog).sort(), ["disciplines", "totalQuestions"]);
    assert.doesNotMatch(JSON.stringify(catalog), /enunciado|alternativas|resposta_correta|gabarito|user_id|score/);
    const options = publishedQuestionOptions(pool);
    assert.equal(options.filter((question) => matchesQuestionFilters(question, {})).length, pool.questions.length);
    assert.equal(options.filter((question) => matchesQuestionFilters(question, { concursoId: "22222222-2222-4222-8222-222222222222" })).length, 0);
    assert.equal(options.filter((question) => matchesQuestionFilters(question, { disciplina: "Matemática", dificuldade: "DIFICIL" })).length, 0);
    const ids = (await db.query<{ id: string; resposta_correta: string }>("select id,resposta_correta from questoes where validated_by like 'starter:%' order by id limit 3")).rows;
    const created = await db.query<{ result: { attemptId: string } }>("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4::text) result", [JSON.stringify({ mode: "RAPIDO", title: "Verificação de fundamentos", seed: "fixture" }), ids.map((question) => question.id), "22222222-2222-4222-8222-222222222222", "b".repeat(64)]);
    const answers = Object.fromEntries(ids.map((question, index) => [question.id, index === 0 ? "Z" : question.resposta_correta]));
    const completed = await db.query<{ result: { score: number; correctCount: number; corrections: Array<{ explanation: { source: string } | null }> } }>("select complete_simulado_attempt($1::uuid,$2::text,$3::jsonb) result", [created.rows[0].result.attemptId, "b".repeat(64), JSON.stringify(answers)]);
    assert.equal(completed.rows[0].result.correctCount, 2); assert.equal(Number(completed.rows[0].result.score), 66.67);
    assert.ok(completed.rows[0].result.corrections.every((correction) => correction.explanation?.source === "AI_ASSISTED"));
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select resposta_correta,alternativas from questoes limit 1"), /permission denied/);
    await db.exec("set role postgres");
    const row = (await db.query<{ id: string }>("select id from questoes where validated_by like 'starter:%' limit 1")).rows[0];
    await db.query("update questoes set explicacao='Alteração editorial externa que deve ser preservada pelo publicador de conteúdo.' where id=$1", [row.id]);
    await assert.rejects(publishStarterBank(service, "11111111-1111-4111-8111-111111111111"), /STARTER_EXISTING_CONTENT_MISMATCH/);
    for (const file of ["src/app/page.tsx", "src/app/simulados/page.tsx", "src/app/simulados/[slug]/page.tsx"]) assert.doesNotMatch(readFileSync(file, "utf8"), /@\/lib\/mock|ranking mock|getSimulado/);
    console.log("launch foundation: exact proofs, real PostgreSQL quality gates, public-only general pool, idempotent publication, scoring and comments passed");
  } finally { await db.exec("set role postgres").catch(() => undefined); await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

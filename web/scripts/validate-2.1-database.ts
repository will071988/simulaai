import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

type Progress = {
  summary: { attempts: number; averageScore: number; averageTimeSeconds: number; questionsAnswered: number; correctAnswers: number; errors: number; accuracy: number };
  recentAttempts: Array<{ attemptId: string; title: string; score: number; durationSeconds: number; answeredCount: number; correctCount: number; errorCount: number }>;
  evolution: Array<{ attemptId: string; score: number }>;
  disciplines: Array<{ discipline: string; answeredCount: number; correctCount: number; errorCount: number; accuracy: number }>;
  strongDisciplines: Array<{ discipline: string; accuracy: number }>;
  weakDisciplines: Array<{ discipline: string; accuracy: number }>;
};

async function main() {
  const { db } = await createCollectorDatabase();
  const owner = "41000000-0000-4000-8000-000000000001";
  const stranger = "41000000-0000-4000-8000-000000000002";
  try {
    await db.query("insert into auth.users(id,email) values($1,'dono@example.test'),($2,'outro@example.test')", [owner, stranger]);
    const published = await db.query<{ id: string; resposta_correta: string }>("select id,resposta_correta from questoes where quality_status='PUBLISHED' order by id limit 3");
    assert.equal(published.rows.length, 3);
    const ids = published.rows.map((row) => row.id);
    const correct = Object.fromEntries(published.rows.map((row) => [row.id, row.resposta_correta]));
    const partial = Object.fromEntries(published.rows.map((row, index) => [row.id, index === 0 ? row.resposta_correta : "Z"]));
    const config = (title: string) => JSON.stringify({ mode: "RAPIDO", title, seed: title, quantidade: 3 });

    const first = await db.query<{ result: { attemptId: string } }>(
      "select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4,$5::uuid) as result",
      [config("Primeiro"), ids, "42000000-0000-4000-8000-000000000001", "a".repeat(64), owner],
    );
    await db.query("update simulado_attempts set started_at=clock_timestamp()-interval '120 seconds' where id=$1", [first.rows[0].result.attemptId]);
    await db.query("select complete_simulado_attempt($1::uuid,$2,$3::jsonb)", [first.rows[0].result.attemptId, "a".repeat(64), JSON.stringify(partial)]);

    const second = await db.query<{ result: { attemptId: string } }>(
      "select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4,$5::uuid) as result",
      [config("Segundo"), ids, "42000000-0000-4000-8000-000000000002", "b".repeat(64), owner],
    );
    await db.query("update simulado_attempts set started_at=clock_timestamp()-interval '60 seconds' where id=$1", [second.rows[0].result.attemptId]);
    await db.query("select complete_simulado_attempt($1::uuid,$2,$3::jsonb)", [second.rows[0].result.attemptId, "b".repeat(64), JSON.stringify(correct)]);

    const result = await db.query<{ progress: Progress }>("select get_user_progress($1::uuid) as progress", [owner]);
    const progress = result.rows[0].progress;
    assert.equal(Number(progress.summary.attempts), 2);
    assert.equal(Number(progress.summary.questionsAnswered), 6);
    assert.equal(Number(progress.summary.correctAnswers), 4);
    assert.equal(Number(progress.summary.errors), 2);
    assert.equal(Number(progress.summary.averageScore), 66.67);
    assert.equal(Number(progress.summary.accuracy), 66.67);
    assert.ok(Number(progress.summary.averageTimeSeconds) >= 89 && Number(progress.summary.averageTimeSeconds) <= 92);
    assert.deepEqual(progress.recentAttempts.map((attempt) => attempt.title), ["Segundo", "Primeiro"]);
    assert.deepEqual(progress.evolution.map((attempt) => attempt.attemptId), [first.rows[0].result.attemptId, second.rows[0].result.attemptId]);
    assert.equal(progress.disciplines.reduce((sum, item) => sum + Number(item.answeredCount), 0), 6);
    assert.equal(progress.disciplines.reduce((sum, item) => sum + Number(item.correctCount), 0), 4);
    assert.ok(progress.strongDisciplines.length > 0 && progress.weakDisciplines.length > 0);

    const empty = (await db.query<{ progress: Progress }>("select get_user_progress($1::uuid) as progress", [stranger])).rows[0].progress;
    assert.equal(Number(empty.summary.attempts), 0);
    assert.deepEqual(empty.recentAttempts, []);
    assert.deepEqual(empty.disciplines, []);
    await assert.rejects(db.query("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4,$5::uuid)", [config("Inválido"), ids, "42000000-0000-4000-8000-000000000003", "c".repeat(64), "41000000-0000-4000-8000-000000000099"]), /AUTH_USER_NOT_FOUND/);

    await db.exec("set role authenticated");
    await assert.rejects(db.query("select get_user_progress($1::uuid)", [owner]), /permission denied/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select get_user_progress($1::uuid)", [owner]), /permission denied/);
    console.log("Sprint 2.1 PostgreSQL ownership, history, metrics, discipline ranking and RPC isolation tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

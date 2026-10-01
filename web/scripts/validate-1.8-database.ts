import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const published = await db.query<{ id: string; resposta_correta: string }>("select id, resposta_correta from questoes where validated_by='sprint-1.8-seed' order by id limit 3");
    assert.equal(published.rows.length, 3);
    const ids = published.rows.map((row) => row.id);
    const tokenHash = "a".repeat(64);
    const sessionId = "20000000-0000-4000-8000-000000000001";
    const config = JSON.stringify({ mode: "RAPIDO", title: "Fixture seguro", seed: "fixture-seed", quantidade: 3 });
    const created = await db.query<{ result: { attemptId: string; simuladoId: string; questionCount: number } }>(
      "select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4) as result", [config, ids, sessionId, tokenHash],
    );
    assert.equal(created.rows[0].result.questionCount, 3);
    const attemptId = created.rows[0].result.attemptId;
    const answers = Object.fromEntries(published.rows.map((row, index) => [row.id, index === 0 ? row.resposta_correta : "Z"]));

    await assert.rejects(db.query("select complete_simulado_attempt($1::uuid,$2,$3::jsonb)", [attemptId, "b".repeat(64), JSON.stringify(answers)]), /ATTEMPT_NOT_FOUND/);
    const completed = await db.query<{ result: { score: number; correctCount: number; total: number; status: string } }>(
      "select complete_simulado_attempt($1::uuid,$2,$3::jsonb) as result", [attemptId, tokenHash, JSON.stringify(answers)],
    );
    assert.equal(completed.rows[0].result.correctCount, 1);
    assert.equal(completed.rows[0].result.total, 3);
    assert.equal(Number(completed.rows[0].result.score), 33.33);
    assert.equal(completed.rows[0].result.status, "COMPLETED");
    const persisted = await db.query<{ score: number; status: string; answers: Record<string, string> }>("select score,status,answers from simulado_attempts where id=$1", [attemptId]);
    assert.equal(Number(persisted.rows[0].score), 33.33);
    assert.equal(persisted.rows[0].status, "COMPLETED");
    assert.deepEqual(Object.keys(persisted.rows[0].answers).sort(), ids.sort());

    const repeated = await db.query<{ result: { score: number; correctCount: number } }>(
      "select complete_simulado_attempt($1::uuid,$2,$3::jsonb) as result", [attemptId, tokenHash, JSON.stringify({})],
    );
    assert.equal(Number(repeated.rows[0].result.score), 33.33, "completion must be idempotent and cannot overwrite the server score");

    const draft = await db.query<{ id: string }>("insert into questoes(disciplina,assunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,source_type) values('Teste','Segurança','Esta questão de teste permanece em rascunho e nunca pode compor um simulado publicado','[{\"key\":\"A\",\"text\":\"Resposta válida\",\"isCorrect\":true},{\"key\":\"B\",\"text\":\"Outra resposta\"}]','A','A resposta válida existe apenas para testar o bloqueio de publicação.','MEDIO','QUESTAO_AUTORAL','OWN_CONTENT') returning id");
    await assert.rejects(db.query("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4)", [config, [draft.rows[0].id], sessionId, "c".repeat(64)]), /UNPUBLISHED_SIMULADO_QUESTION/);

    await db.exec("set role anon");
    await assert.rejects(db.query("select * from simulado_attempts"), /permission denied/);
    await assert.rejects(db.query("select complete_simulado_attempt('00000000-0000-4000-8000-000000000001','" + "d".repeat(64) + "','{}')"), /permission denied/);
    console.log("Sprint 1.8 PostgreSQL atomic start, authoritative scoring, idempotency and RLS tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

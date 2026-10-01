import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  const follower = "44000000-0000-4000-8000-000000000001";
  const favoriteOnly = "44000000-0000-4000-8000-000000000002";
  try {
    await db.query("insert into auth.users(id,email) values($1,'segue@example.test'),($2,'favorita@example.test')", [follower, favoriteOnly]);
    const contest = (await db.query<{ id: string }>("insert into concursos(orgao,titulo,status,inscricao_inicio,inscricao_fim) values('Órgão alerta','Concurso alerta','PREVISTO','2026-10-01','2026-10-03') returning id")).rows[0].id;
    await db.query("insert into contest_follows(user_id,concurso_id,is_favorite,is_following) values($1,$3,true,true),($2,$3,true,false)", [follower, favoriteOnly, contest]);
    await db.query("insert into concurso_field_evidence(concurso_id,field_name,value_json,value_hash,source_url,source_name,source_tier,evidence_text,confidence) values($1,'prova_data','\"2026-12-01\"'::jsonb,'fixture-date','https://oficial.example/prova','Órgão oficial',1,'A prova será realizada em 1 de dezembro de 2026.',0.99)", [contest]);
    await db.query("insert into concurso_changes(concurso_id,field_name,old_value,new_value,source_url) values($1,'prova_data','null'::jsonb,'\"2026-12-01\"'::jsonb,'https://oficial.example/prova')", [contest]);
    const events = await db.query<{ event_type: string }>("select event_type from notification_events where concurso_id=$1", [contest]);
    assert.deepEqual(events.rows, [{ event_type: "PROVA_MARCADA" }]);
    assert.equal((await db.query("select event_id from user_notifications where user_id=$1", [follower])).rows.length, 1);
    assert.equal((await db.query("select event_id from user_notifications where user_id=$1", [favoriteOnly])).rows.length, 0, "favorite-only user must not receive alerts");
    const deadlineCount = await db.query<{ count: number }>("select materialize_deadline_notifications($1::uuid,'2026-10-01'::date) as count", [follower]);
    assert.equal(Number(deadlineCount.rows[0].count), 0, "fanout trigger already delivers materialized events without duplicate backfill");
    const deadlineTypes = await db.query<{ event_type: string }>("select event_type from notification_events where concurso_id=$1 and event_type like 'INSCRICAO_%' order by event_type", [contest]);
    assert.deepEqual(deadlineTypes.rows.map((row) => row.event_type), ["INSCRICAO_ABERTA", "INSCRICAO_ENCERRANDO"]);
    await db.query("select materialize_deadline_notifications($1::uuid,'2026-10-01'::date)", [follower]);
    assert.equal((await db.query("select event_id from user_notifications where user_id=$1", [follower])).rows.length, 3, "repeated materialization must not spam duplicates");

    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [favoriteOnly]);
    assert.equal((await db.query("select * from user_notifications")).rows.length, 0);
    assert.equal((await db.query("select * from contest_follows")).rows.length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [follower]);
    assert.equal((await db.query("select * from user_notifications")).rows.length, 3);
    await db.query("update user_notifications set read_at=now()");
    assert.ok((await db.query<{ read_at: string | null }>("select read_at from user_notifications")).rows[0].read_at);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from contest_follows"), /permission denied/);
    await assert.rejects(db.query("select * from user_notifications"), /permission denied/);
    console.log("Sprint 2.3 PostgreSQL follow-only fanout, favorites, read state and strict user isolation tests passed");
  } finally { await db.exec("set role postgres").catch(() => undefined); await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

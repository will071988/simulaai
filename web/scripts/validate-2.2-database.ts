import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  const owner = "43000000-0000-4000-8000-000000000001";
  const stranger = "43000000-0000-4000-8000-000000000002";
  try {
    await db.query("insert into auth.users(id,email) values($1,'plano@example.test'),($2,'outro-plano@example.test')", [owner, stranger]);
    const contest = (await db.query<{ id: string }>("insert into concursos(orgao,titulo,status) values('Órgão teste','Concurso teste','PREVISTO') returning id")).rows[0].id;
    await db.query(`insert into study_plans(user_id,concurso_id,cargo,exam_date,daily_minutes,disciplines,discipline_weights,performance_fingerprint,allocation,schedule,days_remaining)
      values($1,$2,'Analista','2026-12-01',60,array['Direito'], '{"Direito":3}', 'fingerprint', '[{"discipline":"Direito","dailyMinutes":60}]', '[{"date":"2026-10-01","totalMinutes":60}]', 61)`, [owner, contest]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    assert.equal((await db.query("select id from study_plans")).rows.length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [stranger]);
    assert.equal((await db.query("select id from study_plans")).rows.length, 0, "another user must not see the plan");
    assert.equal((await db.query("update study_plans set daily_minutes=90 returning id")).rows.length, 0, "another user must not update the plan");
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from study_plans"), /permission denied/);
    await db.exec("set role postgres");
    await db.query("delete from auth.users where id=$1", [owner]);
    assert.equal((await db.query("select id from study_plans where user_id=$1", [owner])).rows.length, 0, "account deletion must remove the personal plan");
    console.log("Sprint 2.2 PostgreSQL strict plan ownership, RLS and account-deletion cascade tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

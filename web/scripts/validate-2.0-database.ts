import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  const first = "40000000-0000-4000-8000-000000000001";
  const second = "40000000-0000-4000-8000-000000000002";
  try {
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'ana@example.test',$2::jsonb),($3,'bia@example.test',$4::jsonb)", [first, JSON.stringify({ nome: "Ana Silva", ignored: "not persisted" }), second, JSON.stringify({ nome: "Bia Souza" })]);
    const profiles = await db.query<{ user_id: string; nome: string }>("select user_id,nome from user_profiles order by nome");
    assert.deepEqual(profiles.rows, [{ user_id: first, nome: "Ana Silva" }, { user_id: second, nome: "Bia Souza" }]);
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='user_profiles' order by ordinal_position");
    assert.deepEqual(columns.rows.map((row) => row.column_name), ["user_id", "nome", "created_at", "updated_at"]);

    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [first]);
    const own = await db.query<{ user_id: string; nome: string }>("select user_id,nome from user_profiles");
    assert.deepEqual(own.rows, [{ user_id: first, nome: "Ana Silva" }]);
    assert.equal((await db.query("update user_profiles set nome='Tentativa indevida' where user_id=$1 returning user_id", [second])).rows.length, 0);
    await db.query("update user_profiles set nome='Ana Atualizada' where user_id=$1", [first]);
    assert.equal((await db.query<{ nome: string }>("select nome from user_profiles where user_id=$1", [first])).rows[0].nome, "Ana Atualizada");
    await db.exec("set role postgres");
    assert.equal((await db.query<{ nome: string }>("select nome from user_profiles where user_id=$1", [second])).rows[0].nome, "Bia Souza");
    await db.query("delete from auth.users where id=$1", [first]);
    assert.equal((await db.query("select user_id from user_profiles where user_id=$1", [first])).rows.length, 0, "account deletion must cascade to profile");

    await db.exec("set role anon");
    await assert.rejects(db.query("select * from user_profiles"), /permission denied/);
    await assert.rejects(db.query("select handle_new_auth_user()"), /permission denied/);
    console.log("Sprint 2.0 PostgreSQL profile trigger, strict own-row RLS, minimization and delete cascade tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

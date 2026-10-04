import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const source = await db.query<{ id: string }>("select id from collector_sources limit 1");
    const document = await db.query<{ id: string }>("insert into collector_documents(source_id,canonical_url,source_url,title,content_hash,status) values($1,'https://official.test/contest','https://official.test/contest','Contest','sprint-2.5-cookie','PARSED') returning id", [source.rows[0].id]);
    const contest = await db.query<{ id: string }>("insert into concursos(orgao,titulo,status,quality_status,is_publishable) values('Órgão','Concurso','previsto','VERIFIED',true) returning id");
    await db.query("insert into concurso_field_evidence(concurso_id,field_name,value_json,value_hash,source_url,source_name,source_tier,document_id,evidence_text,confidence) values($1,'escolaridade','\"TECNICO\"','cookie','https://official.test/contest','Official',1,$2,'Nosso website coleta informações do seu dispositivo e utiliza cookies para melhorar o funcionamento técnico das páginas',0.8)", [contest.rows[0].id, document.rows[0].id]);
    await db.query("insert into concurso_field_evidence(concurso_id,field_name,value_json,value_hash,source_url,source_name,source_tier,document_id,evidence_text,confidence) values($1,'escolaridade','\"SUPERIOR\"','valid','https://official.test/contest','Official',1,$2,'Escolaridade exigida: nível superior completo',1)", [contest.rows[0].id, document.rows[0].id]);
    const before = await db.query("select id, value_json, evidence_text from concurso_field_evidence where concurso_id=$1 order by id", [contest.rows[0].id]);
    await db.exec(readFileSync("../supabase/migrations/20261002032516_remove_nonfactual_cookie_evidence.sql", "utf8"));
    const remaining = await db.query<{ count: number }>("select count(*)::int count from concurso_field_evidence where concurso_id=$1 and field_name='escolaridade'", [contest.rows[0].id]);
    assert.equal(Number(remaining.rows[0].count), 2, "quarantine must preserve every audit row");
    const after = await db.query("select id, value_json, evidence_text from concurso_field_evidence where concurso_id=$1 order by id", [contest.rows[0].id]);
    assert.deepEqual(after.rows, before.rows, "original IDs, values and excerpts must remain unchanged");
    const marked = await db.query<{ value_hash: string; invalidation_reason: string | null }>("select value_hash,invalidation_reason from concurso_field_evidence where concurso_id=$1 order by value_hash", [contest.rows[0].id]);
    assert.deepEqual(marked.rows, [{ value_hash: "cookie", invalidation_reason: "NONFACTUAL_COOKIE_BANNER" }, { value_hash: "valid", invalidation_reason: null }]);
    await assert.rejects(db.query("insert into concurso_changes(concurso_id,field_name,new_value,source_url) values($1,'escolaridade','\"TECNICO\"','https://official.test/contest')", [contest.rows[0].id]), /CHANGE_EVIDENCE_REQUIRED/);
    await db.query("insert into concurso_changes(concurso_id,field_name,new_value,source_url) values($1,'escolaridade','\"SUPERIOR\"','https://official.test/contest')", [contest.rows[0].id]);
    await db.exec(readFileSync("../supabase/migrations/20261002032516_remove_nonfactual_cookie_evidence.sql", "utf8"));
    const repeated = await db.query("select id, value_json, evidence_text from concurso_field_evidence where concurso_id=$1 order by id", [contest.rows[0].id]);
    assert.deepEqual(repeated.rows, before.rows, "repeat migration is non-destructive and idempotent");
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>("select has_function_privilege('anon','persist_contest_document(jsonb)','execute') anon, has_function_privilege('authenticated','persist_contest_document(jsonb)','execute') authenticated, has_function_privilege('service_role','persist_contest_document(jsonb)','execute') service");
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true });
    await db.query("update concursos set cargos='[\"Nível Superior\"]'::jsonb where id=$1", [contest.rows[0].id]);
    await db.query("insert into concurso_field_evidence(concurso_id,field_name,value_json,value_hash,source_url,source_tier,evidence_text,confidence) values($1,'cargos','[\"Nível Superior\"]','schooling-role','https://official.test/contest',1,'para cargos de Nível Superior, conforme disposto no Edital.',0.75)", [contest.rows[0].id]);
    const schoolingMigration = readFileSync("../supabase/migrations/20261004162956_quarantine_schooling_as_role.sql", "utf8");
    await db.exec(schoolingMigration);
    const role = await db.query<{ cargos: string[] }>("select cargos from concursos where id=$1", [contest.rows[0].id]);
    assert.deepEqual(role.rows[0].cargos, []);
    const correction = await db.query<{ old_value: string[]; new_value: string[] }>("select old_value,new_value from concurso_field_corrections where concurso_id=$1", [contest.rows[0].id]);
    assert.deepEqual(correction.rows, [{ old_value: ["Nível Superior"], new_value: [] }]);
    const quarantinedRole = await db.query<{ invalidation_reason: string }>("select invalidation_reason from concurso_field_evidence where concurso_id=$1 and value_hash='schooling-role'", [contest.rows[0].id]);
    assert.equal(quarantinedRole.rows[0].invalidation_reason, "SCHOOLING_NOT_A_ROLE");
    await db.exec(schoolingMigration);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from concurso_field_corrections where concurso_id=$1", [contest.rows[0].id])).rows[0].count, 1);
    const auditAccess = await db.query<{ anon: boolean; authenticated: boolean; rls: boolean }>("select has_table_privilege('anon','concurso_field_corrections','select') anon, has_table_privilege('authenticated','concurso_field_corrections','select') authenticated, (select relrowsecurity from pg_class where oid='concurso_field_corrections'::regclass) rls");
    assert.deepEqual(auditAccess.rows[0], { anon: false, authenticated: false, rls: true });
    console.log("Sprint 2.5 PostgreSQL evidence quarantine preserves audit data, rejects invalid changes, remains idempotent and restricts RPC privileges");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

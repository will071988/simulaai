import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCollectorDatabase } from "./support/collectorDatabase";
import { mayActivateCandidate } from "../src/lib/collector/sourceRegistry";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const before = await db.query<{ count: number }>("select count(*)::int count from collector_documents");
    await db.exec(readFileSync("../supabase/migrations/20261004203913_admin_operations.sql", "utf8"));
    const after = await db.query<{ count: number }>("select count(*)::int count from collector_documents");
    assert.equal(after.rows[0].count, before.rows[0].count, "migration may not modify existing documents");
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from ops_admin_members")).rows[0].count, 0, "no implicit admin");
    const roles = await db.query<{ anon: boolean; authenticated: boolean; service: boolean; rls: boolean }>("select has_function_privilege('anon','ops_apply_action(uuid,text,uuid,text,text)','execute') anon, has_function_privilege('authenticated','ops_apply_action(uuid,text,uuid,text,text)','execute') authenticated, has_function_privilege('service_role','ops_apply_action(uuid,text,uuid,text,text)','execute') service, (select relrowsecurity from pg_class where oid='ops_admin_members'::regclass) rls");
    assert.deepEqual(roles.rows[0], { anon: false, authenticated: false, service: true, rls: true });
    const actor = (await db.query<{ id: string }>("insert into auth.users(email) values('operator@fixture.test') returning id")).rows[0].id;
    const outsider = (await db.query<{ id: string }>("insert into auth.users(email) values('outsider@fixture.test') returning id")).rows[0].id;
    const source = (await db.query<{ id: string }>("select id from collector_sources limit 1")).rows[0].id;
    const doc = (await db.query<{ id: string }>("insert into collector_documents(source_id,canonical_url,source_url,title,content_hash,status,raw_text) values($1,'https://official.test/retry','https://official.test/retry','Retry','ops-retry','FAILED','document body') returning id", [source])).rows[0].id;
    await assert.rejects(db.query("select ops_apply_action($1,'RETRY_DOCUMENT',$2)", [outsider, doc]), /OPS_FORBIDDEN/);
    assert.equal((await db.query<{ status: string }>("select status from collector_documents where id=$1", [doc])).rows[0].status, "FAILED");
    await db.query("insert into ops_admin_members(user_id) values($1)", [actor]);
    await db.query("select ops_apply_action($1,'RETRY_DOCUMENT',$2)", [actor, doc]);
    assert.equal((await db.query<{ status: string; ai_retry_count: number }>("select status,ai_retry_count from collector_documents where id=$1", [doc])).rows[0].status, "AI_PENDING");
    await assert.rejects(db.query("select ops_apply_action($1,'RETRY_DOCUMENT',$2)", [actor, doc]), /OPS_TARGET_NOT_ACTIONABLE/);
    const candidate = (await db.query<{ id: string }>("insert into source_candidates(url,domain) values('https://official.test/contest','official.test') returning id")).rows[0].id;
    await assert.rejects(db.query("select ops_apply_action($1,'APPROVE_SOURCE',$2,'Checked official source','http://official.test')", [actor, candidate]), /OPS_INVALID_OFFICIAL_URL/);
    await db.query("select ops_apply_action($1,'APPROVE_SOURCE',$2,'Verified official contest page','https://official.test/contest')", [actor, candidate]);
    const approved = (await db.query<{ status: string; official_url: string; reviewed_by: string; reviewed_at: string }>("select status,official_url,reviewed_by,reviewed_at from source_candidates where id=$1", [candidate])).rows[0];
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.official_url, "https://official.test/contest");
    assert.equal(approved.reviewed_by, actor);
    assert.ok(approved.reviewed_at);
    assert.equal(mayActivateCandidate({ status: approved.status, officialUrl: approved.official_url, reviewedBy: approved.reviewed_by }), true);
    await db.query("insert into collector_sources(name,base_url,type,tier,source_type,adapter,approved_candidate_id) values('Approved ops fixture','https://official.test/contest','portal',3,'DISCOVERY_AUXILIAR','Approved ops fixture',$1)", [candidate]);
    assert.equal((await db.query<{ enabled: boolean }>("select enabled from collector_sources where name='Approved ops fixture'")).rows[0].enabled, true, "approved candidate must satisfy source governance");
    const rejected = (await db.query<{ id: string }>("insert into source_candidates(url,domain) values('https://aggregator.test/logo.png','aggregator.test') returning id")).rows[0].id;
    await db.query("select ops_apply_action($1,'REJECT_SOURCE_CANDIDATE',$2,'Image is not a source')", [actor, rejected]);
    assert.equal((await db.query<{ status: string }>("select status from source_candidates where id=$1", [rejected])).rows[0].status, "REJECTED");
    await assert.rejects(db.query("insert into collector_sources(name,base_url,type,tier,source_type,adapter,approved_candidate_id) values('Rejected ops fixture','https://rejected.test','portal',3,'DISCOVERY_AUXILIAR','Rejected ops fixture',$1)", [rejected]), /SOURCE_APPROVAL_REQUIRED/);
    const contest = (await db.query<{ id: string }>("insert into concursos(orgao,titulo,status,quality_status,is_publishable) values('Órgão','Conflito','previsto','CONFLICTED',false) returning id")).rows[0].id;
    await db.query("select ops_apply_action($1,'REVIEW_CONFLICT',$2,'Aguardando edital para resolver')", [actor, contest]);
    assert.equal((await db.query<{ quality_status: string }>("select quality_status from concursos where id=$1", [contest])).rows[0].quality_status, "CONFLICTED", "review must not rewrite factual quality");
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from ops_conflict_reviews where concurso_id=$1", [contest])).rows[0].count, 1);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from ops_action_log", [])).rows[0].count, 4, "only successful actions are audited");
    assert.deepEqual((await db.query<{ actor_user_id: string; action: string; target_id: string; official_url: string }>("select actor_user_id,action,target_id,details->>'official_url' official_url from ops_action_log where action='APPROVE_SOURCE'")).rows[0], { actor_user_id: actor, action: "APPROVE_SOURCE", target_id: candidate, official_url: "https://official.test/contest" }, "source approval must retain actor and official evidence in audit");
    await assert.rejects(db.query("select ops_apply_action($1,'ARBITRARY_SQL',$2)", [actor, contest]), /OPS_UNKNOWN_ACTION/);
    console.log("Sprint 2.6 PostgreSQL RBAC, restricted actions, audit and data preservation passed");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

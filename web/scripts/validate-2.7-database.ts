import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    await db.exec(readFileSync("../supabase/migrations/20261004203913_admin_operations.sql", "utf8"));
    await db.exec(readFileSync("../supabase/migrations/20261005120000_restrict_admin_document_retry.sql", "utf8"));
    const documentsBefore = (await db.query<{ count: number }>("select count(*)::int count from collector_documents")).rows[0].count;
    await db.exec(readFileSync("../supabase/migrations/20261005140000_operational_observability.sql", "utf8"));
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from collector_documents")).rows[0].count, documentsBefore);
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service: boolean; service_delete: boolean; service_truncate: boolean; service_job_insert: boolean; sync_service: boolean; start_service: boolean; rls: boolean; security_definer: boolean; sync_security_definer: boolean }>("select has_function_privilege('anon','record_ops_api_metric(text,text,int,int,text)','execute') anon, has_function_privilege('authenticated','record_ops_api_metric(text,text,int,int,text)','execute') authenticated, has_function_privilege('service_role','record_ops_api_metric(text,text,int,int,text)','execute') service, has_table_privilege('service_role','ops_api_metric_buckets','delete') service_delete, has_table_privilege('service_role','ops_api_metric_buckets','truncate') service_truncate, has_table_privilege('service_role','ops_job_runs','insert') service_job_insert, has_function_privilege('service_role','sync_operational_alerts(jsonb,timestamptz)','execute') sync_service, has_function_privilege('service_role','start_ops_job(text,text)','execute') start_service, (select relrowsecurity from pg_class where oid='ops_api_metric_buckets'::regclass) rls, (select prosecdef from pg_proc where oid='record_ops_api_metric(text,text,int,int,text)'::regprocedure) security_definer, (select prosecdef from pg_proc where oid='sync_operational_alerts(jsonb,timestamptz)'::regprocedure) sync_security_definer");
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true, service_delete: false, service_truncate: false, service_job_insert: false, sync_service: true, start_service: true, rls: true, security_definer: true, sync_security_definer: true });
    await db.query("select record_ops_api_metric('/api/concursos/[id]','GET',200,80,null)");
    await db.query("select record_ops_api_metric('/api/concursos/[id]','GET',204,120,null)");
    await db.query("select record_ops_api_metric('/api/concursos/[id]','GET',503,700,'DETAIL_QUERY_FAILED')");
    const metric = (await db.query<{ request_count: number; error_count: number; latency_sum_ms: number; latency_max_ms: number }>("select sum(request_count)::int request_count,sum(error_count)::int error_count,sum(latency_sum_ms)::int latency_sum_ms,max(latency_max_ms)::int latency_max_ms from ops_api_metric_buckets")).rows[0];
    assert.deepEqual(metric, { request_count: 3, error_count: 1, latency_sum_ms: 900, latency_max_ms: 700 });
    assert.equal((await db.query<{ request_count: number }>("select request_count::int from ops_api_metric_buckets where status_class=2")).rows[0].request_count, 2);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from ops_runtime_events where event_kind='DB_ERROR' and error_code='DETAIL_QUERY_FAILED'")).rows[0].count, 1);
    await assert.rejects(db.query("select record_ops_api_metric('/api/health','GET',null,1,null)"), /OPS_INVALID_METRIC/);
    await db.query("select record_ops_api_metric('/api/health','HEAD',200,1,null)");
    for (let index = 0; index < 16; index++) await db.query("select record_ops_api_metric('/api/health','GET',503,10,'HTTP_5XX')");
    assert.equal((await db.query<{ status: string }>("select status from ops_alert_state where fingerprint='API_5XX_RATE'")).rows[0].status, "OPEN", "5xx threshold opens an alert without waiting for a job");
    const started = (await db.query<{ id: string; acquired: boolean }>("select * from start_ops_job('AI_PENDING','CRON')")).rows[0];
    assert.equal(started.acquired, true);
    assert.deepEqual((await db.query<{ id: string | null; acquired: boolean }>("select * from start_ops_job('AI_PENDING','MANUAL')")).rows[0], { id: null, started_at: null, acquired: false });
    const job = started.id;
    await db.query("update ops_job_runs set status='SUCCESS',finished_at=now(),duration_ms=25 where id=$1", [job]);
    assert.equal((await db.query<{ status: string }>("select status from ops_job_runs where id=$1", [job])).rows[0].status, "SUCCESS");
    const apiAlert = '[{\"fingerprint\":\"API_5XX_RATE\",\"rule_name\":\"API_5XX_RATE\",\"severity\":\"HIGH\"}]';
    await assert.rejects(db.query("select sync_operational_alerts(null)"), /OPS_INVALID_ALERTS/);
    await assert.rejects(db.query(`select sync_operational_alerts('${apiAlert}'::jsonb || '${apiAlert}'::jsonb)`), /OPS_DUPLICATE_ALERT/);
    const evaluationBase = Date.now() + 10_000;
    const evaluatedAt = (offsetMs: number) => new Date(evaluationBase + offsetMs).toISOString();
    await assert.rejects(db.query("select sync_operational_alerts('[]'::jsonb,$1::timestamptz)", [new Date(Date.now() + 10 * 60 * 1000).toISOString()]), /OPS_INVALID_ALERTS/);
    await db.query("select sync_operational_alerts($1::jsonb,$2::timestamptz)", [apiAlert, evaluatedAt(10_000)]);
    await db.query("select sync_operational_alerts($1::jsonb,$2::timestamptz)", [apiAlert, evaluatedAt(20_000)]);
    assert.equal((await db.query<{ occurrence_count: number }>("select occurrence_count::int from ops_alert_state where fingerprint='API_5XX_RATE'")).rows[0].occurrence_count, 1);
    await db.query("select sync_operational_alerts('[]'::jsonb,$1::timestamptz)", [evaluatedAt(15_000)]);
    assert.equal((await db.query<{ status: string }>("select status from ops_alert_state where fingerprint='API_5XX_RATE'")).rows[0].status, "OPEN");
    await db.query("select sync_operational_alerts('[]'::jsonb,$1::timestamptz)", [evaluatedAt(30_000)]);
    await db.query("select sync_operational_alerts($1::jsonb,$2::timestamptz)", [apiAlert, evaluatedAt(40_000)]);
    const reopened = (await db.query<{ status: string; occurrence_count: number; opened_at: string }>("select status,occurrence_count::int,opened_at::text from ops_alert_state where fingerprint='API_5XX_RATE'")).rows[0];
    assert.deepEqual({ status: reopened.status, occurrence_count: reopened.occurrence_count }, { status: "OPEN", occurrence_count: 2 });
    assert.equal(Date.parse(reopened.opened_at), Date.parse(evaluatedAt(40_000)));
    await db.query("select sync_operational_alerts('[]'::jsonb,$1::timestamptz)", [evaluatedAt(50_000)]);
    const collectorAlert = '[{\"fingerprint\":\"COLLECTOR_FAILED\",\"rule_name\":\"COLLECTOR_FAILED\",\"severity\":\"HIGH\"}]';
    await db.query("select sync_operational_alerts($1::jsonb,$2::timestamptz)", [collectorAlert, evaluatedAt(45_000)]);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from ops_alert_state where fingerprint='COLLECTOR_FAILED'")).rows[0].count, 0, "stale snapshots cannot introduce unseen alerts");
    console.log("Sprint 2.7 PostgreSQL metrics, RLS, jobs and alert deduplication passed");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

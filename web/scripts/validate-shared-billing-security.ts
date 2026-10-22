import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const db = new PGlite();
  const sql = readFileSync("../supabase/migrations/20261022190000_protect_shared_billing_webhook_events.sql", "utf8");
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(sql); // Safe in an isolated SimulaAi database without the shared table.
    await db.exec("create table billing_webhook_events(id bigserial primary key,provider text not null,event_key text not null,payload jsonb not null,received_at timestamptz not null default now(),unique(provider,event_key)); grant all on billing_webhook_events to anon,authenticated,service_role; grant all on sequence billing_webhook_events_id_seq to anon,authenticated,service_role; insert into billing_webhook_events(provider,event_key,payload) values('fixture','preserved','{\"fixture\":true}');");
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query<{ enabled: boolean }>("select relrowsecurity enabled from pg_class where oid='public.billing_webhook_events'::regclass")).rows[0].enabled, true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const statement of ["select payload from billing_webhook_events", "insert into billing_webhook_events(provider,event_key,payload) values('blocked','blocked','{}')", "update billing_webhook_events set payload='{}'", "delete from billing_webhook_events", "truncate billing_webhook_events", "select nextval('billing_webhook_events_id_seq')"]) await assert.rejects(db.exec(statement), /permission denied/, `${role} must not access the raw ledger`);
      await db.exec("set role postgres");
    }
    await db.exec("set role service_role");
    assert.equal(Number((await db.query<{ n: number }>("select count(*) n from billing_webhook_events")).rows[0].n), 1);
    await db.exec("insert into billing_webhook_events(provider,event_key,payload) values('fixture','server-write','{}'); update billing_webhook_events set payload='{\"server\":true}' where event_key='server-write'; delete from billing_webhook_events where event_key='server-write';");
    await db.exec("set role postgres");
    const preserved = await db.query<{ event_key: string; payload: { fixture: boolean } }>("select event_key,payload from billing_webhook_events");
    assert.deepEqual(preserved.rows, [{ event_key: "preserved", payload: { fixture: true } }]);
    console.log("shared webhook ledger: idempotent/missing-table-safe migration, anonymous/authenticated CRUD+sequence denied, service-role CRUD preserved and rows unchanged");
  } finally { await db.exec("set role postgres").catch(() => undefined); await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

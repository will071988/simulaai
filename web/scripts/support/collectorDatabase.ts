import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export async function createCollectorDatabase() {
  const db = new PGlite();
  await db.exec("create role service_role; create role anon; create role authenticated;");
  const migrations = [
    "20260921174006_simulaai_init", "20260922141814_collector_core",
    "20260922173024_collector_health_versioning", "20260922174745_collector_lock",
    "20260922174957_concursos_location_hot", "20260922175020_collector_binary_hash",
    "20260923140000_collector_enrichment", "20260923150000_duplicate_candidates",
    "20260923160000_contest_identity_signals", "20260923170000_document_relationships",
    "20260924100000_canonical_contest_entities",
  ];
  for (const name of migrations) await db.exec(readFileSync(`../supabase/migrations/${name}.sql`, "utf8"));
  await db.exec('alter table concursos enable row level security; create policy "public read concursos" on concursos for select using (true); grant select on concursos to anon;');
  for (const name of ["20260928150000_disable_unsupported_collector_sources", "20260928170000_publication_and_change_idempotency"]) await db.exec(readFileSync(`../supabase/migrations/${name}.sql`, "utf8"));
  for (const name of ["20260929120000_autonomous_collector", "20260929121000_atomic_contest_document", "20260930020000_collector_retry_recovery", "20260930021000_retry_official_url_identity_failures", "20260930022000_cleanup_false_factual_evidence", "20260930030000_source_registry_and_curated_status", "20260930031000_backfill_change_evidence", "20260930032000_register_evaluated_discovery_sources", "20260930040000_professional_question_bank", "20260930050000_simulado_engine", "20260930051000_attempt_token_uniqueness"]) await db.exec(readFileSync(`../supabase/migrations/${name}.sql`, "utf8"));
  const identifier = (value: string) => {
    if (!/^[a-z_]+$/.test(value)) throw new Error("INVALID_TEST_SQL_IDENTIFIER");
    return `"${value}"`;
  };
  const svc = createClient("https://database.fixture.invalid", "fixture-only", {
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").at(-1)!;
      try {
        if (url.pathname.includes("/rpc/")) {
          if (table !== "persist_contest_document") throw new Error("UNEXPECTED_TEST_RPC");
          const { p_plan } = JSON.parse(String(init?.body));
          const result = await db.query<{ result: unknown }>("select persist_contest_document($1::jsonb) as result", [JSON.stringify(p_plan)]);
          return Response.json(result.rows[0].result);
        }
        if (init?.method !== "GET") throw new Error("WRITE_OUTSIDE_ATOMIC_RPC");
        const fields = (url.searchParams.get("select") || "*").split(",").map(identifier).join(",");
        const params: unknown[] = [];
        const clauses: string[] = [];
        for (const [field, condition] of url.searchParams) {
          if (["select", "limit", "order"].includes(field)) continue;
          if (condition === "is.null") clauses.push(`${identifier(field)} is null`);
          else if (condition.startsWith("eq.")) { params.push(condition.slice(3)); clauses.push(`${identifier(field)} = $${params.length}`); }
          else throw new Error("UNSUPPORTED_TEST_FILTER");
        }
        const limit = Number(url.searchParams.get("limit") || 1000);
        const result = await db.query(`select ${fields} from ${identifier(table)}${clauses.length ? ` where ${clauses.join(" and ")}` : ""} limit ${limit}`, params);
        const headers = new Headers(init?.headers);
        return Response.json(headers.get("accept")?.includes("vnd.pgrst.object") ? result.rows[0] || null : result.rows);
      } catch (error) {
        return Response.json({ message: error instanceof Error ? error.message : "TEST_DATABASE_ERROR", code: "TEST_DB_FAILURE" }, { status: 400 });
      }
    } },
  });
  return { db, svc };
}

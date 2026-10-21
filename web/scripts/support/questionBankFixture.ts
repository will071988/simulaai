import { createClient } from "@supabase/supabase-js";
import { createCollectorDatabase } from "./collectorDatabase";

export async function createQuestionBankFixture() {
  const { db } = await createCollectorDatabase();
  const identifier = (value: string) => { if (!/^[a-z_]+$/.test(value)) throw new Error("INVALID_FIXTURE_IDENTIFIER"); return `"${value}"`; };
  const value = (input: unknown) => input && typeof input === "object" ? JSON.stringify(input) : input;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    try {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.pathname.includes("/rpc/")) {
        if (table === "record_ops_api_metric") return Response.json(null);
        if (table === "create_simulado_attempt") return Response.json((await db.query<{ result: unknown }>("select create_simulado_attempt($1::jsonb,$2::uuid[],$3::uuid,$4::text,$5::uuid) result", [JSON.stringify(body.p_config), body.p_question_ids, body.p_session_id, body.p_token_hash, body.p_user_id])).rows[0].result);
        if (table === "complete_simulado_attempt") return Response.json((await db.query<{ result: unknown }>("select complete_simulado_attempt($1::uuid,$2::text,$3::jsonb) result", [body.p_attempt_id, body.p_token_hash, JSON.stringify(body.p_answers)])).rows[0].result);
        if (table === "get_user_progress") return Response.json((await db.query<{ result: unknown }>("select get_user_progress($1::uuid) result", [body.p_user_id])).rows[0].result);
        throw new Error("UNEXPECTED_FIXTURE_RPC");
      }
      if (!["questoes", "concursos", "explanation_cache", "question_explanations", "ops_admin_members"].includes(table)) throw new Error("UNEXPECTED_FIXTURE_TABLE");
      const params: unknown[] = [];
      const clauses: string[] = [];
      for (const [field, condition] of url.searchParams) {
        if (["select", "limit", "order", "on_conflict", "columns"].includes(field)) continue;
        if (condition === "is.null") clauses.push(`${identifier(field)} is null`);
        else if (condition.startsWith("eq.")) { params.push(condition.slice(3)); clauses.push(`${identifier(field)} = $${params.length}`); }
        else if (condition.startsWith("in.(")) { const values = condition.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")); const binds = values.map((item) => { params.push(item); return `$${params.length}`; }); clauses.push(`${identifier(field)} in (${binds.join(",")})`); }
        else throw new Error("UNSUPPORTED_FIXTURE_FILTER");
      }
      const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      const method = init?.method || "GET";
      if (method === "GET" || method === "HEAD") {
        const fields = (url.searchParams.get("select") || "*").split(",").map((field) => field === "*" ? "*" : identifier(field)).join(",");
        const rows = await db.query(`select ${fields} from ${identifier(table)}${where} limit ${Number(url.searchParams.get("limit") || 1000)}`, params);
        return method === "HEAD" ? new Response(null, { headers: { "Content-Range": `*/${rows.rows.length}` } }) : Response.json(rows.rows, { headers: { "Content-Range": `0-${Math.max(0, rows.rows.length - 1)}/${rows.rows.length}` } });
      }
      if (!["questoes", "explanation_cache", "question_explanations"].includes(table)) throw new Error("FIXTURE_WRITE_DENIED");
      if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        const keys = Object.keys(rows[0]); const binds: unknown[] = [];
        const tuples = rows.map((row) => `(${keys.map((key) => { binds.push(value(row[key])); return `$${binds.length}`; }).join(",")})`);
        const conflict = url.searchParams.get("on_conflict");
        const sql = `insert into ${identifier(table)}(${keys.map(identifier).join(",")}) values ${tuples.join(",")}${conflict ? ` on conflict (${identifier(conflict)}) do nothing` : ""} returning *`;
        return Response.json((await db.query(sql, binds)).rows, { status: 201 });
      }
      if (method === "PATCH") {
        const sets = Object.entries(body).map(([key, entry]) => { params.push(value(entry)); return `${identifier(key)}=$${params.length}`; });
        return Response.json((await db.query(`update ${identifier(table)} set ${sets.join(",")}${where} returning *`, params)).rows);
      }
      throw new Error("UNEXPECTED_FIXTURE_METHOD");
    } catch (error) { return Response.json({ code: "FIXTURE_DB_ERROR", message: error instanceof Error ? error.message : "fixture failed" }, { status: 400 }); }
  };
  const service = createClient("https://question-bank.fixture.invalid", "fixture-only", { auth: { persistSession: false }, global: { fetch: transport } });
  return { db, service, transport };
}

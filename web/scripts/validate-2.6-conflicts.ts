import assert from "node:assert/strict";
import { GET } from "../src/app/api/admin/operations/conflicts/[id]/route";
import { parseConflictPagination, safeConflictSourceUrl, type ConflictDetail } from "../src/lib/admin/conflict-detail";

const contestId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const at = "2026-10-04T12:00:00Z";
type Row = Record<string, unknown>;

async function main() {
  assert.deepEqual(parseConflictPagination(new URLSearchParams()), { limit: 50, evidenceOffset: 0, documentsOffset: 0, changesOffset: 0, auditOffset: 0 });
  for (const query of ["limit=0", "limit=101", "limit=2&limit=3", "evidenceOffset=-1", "auditOffset=2.5", "documentsOffset=1000001", "unexpected=1"]) assert.equal(parseConflictPagination(new URLSearchParams(query)), null);
  for (const url of ["javascript:alert(1)", "https://user:secret@official.example/doc", "https://127.0.0.2/doc", "http://[::1]/doc", "https://service.internal/doc", "https://service.localhost/doc"]) assert.equal(safeConflictSourceUrl(url), null);
  assert.equal(safeConflictSourceUrl("https://official.example/edital.pdf"), "https://official.example/edital.pdf");

  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ops-fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-not-a-secret";
  let mode: "admin" | "outsider" | "anonymous" | "unconfirmed" | "invalid" = "admin";
  let failingTable = "";
  const calls: URL[] = [];
  const rows: Record<string, Row[]> = {
    concursos: [{ id: contestId, titulo: "Concurso com vagas divergentes", orgao: "Órgão fixture", quality_status: "CONFLICTED", is_publishable: false, updated_at: at, vagas: 10, private_metadata: "must-not-leak" }, { id: otherId, titulo: "Concurso alheio", quality_status: "VERIFIED", is_publishable: true }],
    concurso_field_evidence: [
      { id: "e3", concurso_id: contestId, field_name: "vagas", value_json: 10, source_url: "https://official.example/original", source_name: "Órgão fixture", source_tier: 1, evidence_text: "São oferecidas 10 vagas.", confidence: 1, observed_at: at, invalidation_reason: null, raw_text: "must-not-leak" },
      { id: "e2", concurso_id: contestId, field_name: "vagas", value_json: 20, source_url: "https://official.example/second", source_name: "Órgão fixture", source_tier: 1, evidence_text: "São oferecidas 20 vagas.", confidence: 0.9, observed_at: at, invalidation_reason: null },
      { id: "e1", concurso_id: contestId, field_name: "cargos", value_json: ["Nível superior"], source_url: "javascript:alert(1)", source_name: "Fixture", source_tier: 1, evidence_text: "x".repeat(5000), confidence: 0.7, observed_at: at, invalidation_reason: "SCHOOLING_NOT_A_ROLE" },
      { id: "unrelated", concurso_id: otherId, field_name: "vagas", value_json: 999, source_url: "https://other.example", observed_at: at },
    ],
    concurso_documents: [{ id: "d1", concurso_id: contestId, collector_document_id: "collector1", document_type: "EDITAL_PDF", relationship_type: "ORIGINAL", source_url: "https://official.example/original", source_name: "Órgão fixture", published_at: at, observed_at: at, is_current: true, raw_text: "must-not-leak" }],
    concurso_changes: [{ id: "c1", concurso_id: contestId, field_name: "vagas", old_value: 5, new_value: 10, source_url: "https://official.example/original", source_name: "Órgão fixture", source_tier: 1, evidence_text: "Vagas ampliadas para 10.", observed_at: at, detected_at: at, relationship_type: "RETIFICATION" }],
    ops_conflict_reviews: [{ concurso_id: contestId, review_note: "Aguardando retificação da divergência.", reviewed_at: at, reviewed_by: actorId }],
    ops_action_log: [{ id: "a1", target_id: contestId, action: "REVIEW_CONFLICT", note: "Aguardando retificação da divergência.", created_at: at, actor_user_id: actorId }, { id: "a2", target_id: otherId, action: "REVIEW_CONFLICT", note: "Nota de outro concurso", created_at: at }, { id: "a3", target_id: contestId, action: "RETRY_DOCUMENT", note: "Ação com alvo de outro tipo", created_at: at }],
  };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://ops-fixture.supabase.co", "all network calls must remain inside the local fixture");
    assert.equal(request.method, "GET", "conflict inspection cannot mutate any state");
    calls.push(url);
    if (url.pathname === "/auth/v1/user") {
      if (mode === "invalid") return Response.json({ message: "invalid test token" }, { status: 401 });
      return Response.json({ id: actorId, aud: "authenticated", created_at: at, is_anonymous: mode === "anonymous", email_confirmed_at: mode === "unconfirmed" ? null : at, app_metadata: {}, user_metadata: {} });
    }
    const table = url.pathname.split("/").pop() || "";
    if (table === failingTable) return Response.json({ code: "FIXTURE_ERROR", message: "sensitive-database-error" }, { status: 500 });
    let data = table === "ops_admin_members" ? mode === "outsider" ? [] : [{ user_id: actorId, role: "ADMIN" }] : rows[table];
    assert.ok(data, `unexpected table ${table}`);
    const columns = url.searchParams.get("select")?.split(",") || [];
    assert.ok(!columns.includes("*") && !columns.some((column) => ["raw_text", "metadata", "private_metadata"].includes(column)), "only explicit review fields may be queried");
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) data = data.filter((row) => String(row[key]) === value.slice(3));
      if (value.startsWith("in.(")) data = data.filter((row) => value.slice(4, -1).split(",").includes(String(row[key])));
    }
    const total = data.length;
    const order = (url.searchParams.get("order") || "").split(",").filter(Boolean);
    data = [...data].sort((a, b) => {
      for (const item of order) {
        const [key, direction] = item.split(".");
        const compared = String(a[key]).localeCompare(String(b[key]));
        if (compared) return direction === "desc" ? -compared : compared;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || total);
    const selected = data.slice(offset, offset + limit).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
    return Response.json(selected, { headers: { "Content-Range": `${offset}-${Math.max(offset, offset + selected.length - 1)}/${total}` } });
  };

  const get = (id = contestId, query = "", authenticated = true) => GET(new Request(`https://simulaai.test/api/admin/operations/conflicts/${id}${query}`, { headers: authenticated ? { authorization: "Bearer fixture-user-token" } : {} }), { params: Promise.resolve({ id }) });
  try {
    let response = await get(contestId, "", false);
    assert.equal(response.status, 401); assert.equal(calls.length, 0);
    for (const [nextMode, expected] of [["invalid", 401], ["anonymous", 401], ["unconfirmed", 401], ["outsider", 403]] as const) {
      mode = nextMode; calls.length = 0;
      response = await get();
      assert.equal(response.status, expected, `${mode} must not read private conflict details`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(calls.every((url) => url.pathname === "/auth/v1/user" || (mode === "outsider" && url.pathname.endsWith("/ops_admin_members"))));
    }
    mode = "admin"; calls.length = 0;
    response = await get("not-a-uuid"); assert.equal(response.status, 400);
    assert.ok(calls.every((url) => !url.pathname.endsWith("/concursos")));
    response = await get(contestId, "?limit=101"); assert.equal(response.status, 400);
    response = await get(otherId); assert.equal(response.status, 404, "non-conflicted records are not this review target");

    response = await get(contestId, "?limit=2");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const first = (await response.json()).data as ConflictDetail;
    assert.equal(first.contest.is_publishable, false, "admin can inspect the actual unpublished conflict");
    assert.equal(first.contest.quality_status, "CONFLICTED");
    const vacancies = first.fields.find((field) => field.field_name === "vagas")!;
    assert.equal(vacancies.current_value, 10);
    assert.deepEqual(vacancies.evidence.map((item) => [item.value_json, item.relation]), [[10, "MATCHES_CURRENT"], [20, "DIFFERS_FROM_CURRENT"]]);
    assert.deepEqual(first.pagination.evidence, { offset: 0, limit: 2, total: 3, hasMore: true });
    assert.equal(first.acceptedChanges[0].old_value, 5); assert.equal(first.acceptedChanges[0].new_value, 10);
    assert.equal(first.documents[0].source_url, "https://official.example/original");
    assert.equal(first.latestReview?.review_note, "Aguardando retificação da divergência.");
    assert.equal(first.audit.length, 1); assert.equal(first.audit[0].actor_user_id, actorId);
    assert.equal(first.decisionHistoryAvailable, false, "comparison must not invent a stored resolver decision");
    assert.doesNotMatch(JSON.stringify(first), /must-not-leak|999|Nota de outro concurso/);

    response = await get(contestId, "?limit=2&evidenceOffset=2");
    const second = (await response.json()).data as ConflictDetail;
    const invalid = second.fields.find((field) => field.field_name === "cargos")!.evidence[0];
    assert.equal(invalid.relation, "INVALIDATED"); assert.equal(invalid.source_url, null);
    assert.equal(invalid.evidence_text.length, 4000); assert.equal(invalid.evidence_truncated, true);
    assert.deepEqual(second.pagination.evidence, { offset: 2, limit: 2, total: 3, hasMore: false });
    assert.equal(second.documents.length, 1, "paging evidence must not advance another dataset");
    assert.equal(second.fields.find((field) => field.field_name === "vagas")!.current_value, 10);

    failingTable = "concurso_field_evidence";
    response = await get(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive-database-error/);
    failingTable = "ops_admin_members";
    response = await get(); assert.equal(response.status, 503); assert.equal((await response.json()).error, "ADMIN_LOOKUP_FAILED");
    assert.equal(rows.concursos[0].quality_status, "CONFLICTED"); assert.equal(rows.concursos[0].is_publishable, false);
    console.log("Sprint 2.6 private conflict detail: Auth/RBAC, evidence differences, quarantine, history, safe links, scoped pagination and fail-closed reads passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

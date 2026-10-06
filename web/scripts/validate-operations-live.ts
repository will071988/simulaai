import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const expected = process.env.EXPECT_OPS_SOURCE_MIGRATION;
  if (expected !== "absent" && expected !== "present") throw new Error("Expected migration state must be specified");
  if (process.env.OPS_USE_LINKED_CLI === "true") {
    assert.equal(readFileSync("../supabase/.temp/project-ref", "utf8").trim(), "ukwulespvvthyjqgrjfo");
    const output = execFileSync(process.platform === "win32" ? "supabase.exe" : "supabase", ["db", "query", "--linked", "--project-ref", "ukwulespvvthyjqgrjfo", "--file", "scripts/support/operationsSnapshot.sql", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const payload = JSON.parse(output);
    const row = (Array.isArray(payload) ? payload : payload.rows || payload.result)?.[0];
    if (!row) throw new Error("Linked snapshot returned no rows");
    const present = expected === "present";
    assert.equal(row.destination_column, present); assert.equal(row.destination_relation, present); assert.equal(row.approval_rpc, present);
    assert.equal(row.permanent_retry_guard, true); assert.equal(Number(row.exact_verified_admins), 1);
    if (present) { assert.equal(row.anon_execute, false); assert.equal(row.authenticated_execute, false); assert.equal(row.service_execute, true); }
    console.log(JSON.stringify({ ok: true, expectedMigration: expected, readOnly: true, ...row }));
    return;
  }
  if (!url || new URL(url).hostname !== "ukwulespvvthyjqgrjfo.supabase.co") throw new Error("Unexpected or missing project configuration");
  if (!key) throw new Error("Service-role configuration is unavailable");
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [sources, documents, admins, candidates, destination] = await Promise.all([
    service.from("collector_sources").select("id,name,hostname,base_url,adapter,tier,source_type,enabled,health_status,failure_count,last_error_code").order("id"),
    service.from("collector_documents").select("id,status,content_hash").order("id"),
    service.from("ops_admin_members").select("user_id", { count: "exact", head: true }),
    service.from("source_candidates").select("id,status", { count: "exact" }).order("id"),
    service.from("source_candidates").select("id,operational_source_id,operational_source:collector_sources!source_candidates_operational_source_id_fkey(id,name,enabled)").limit(1),
  ]);
  for (const [index, result] of [sources, documents, admins, candidates].entries()) if (result.error) throw new Error(`Read-only snapshot query ${index + 1} failed (${result.status}, ${result.error.code || "no code"})`);
  if (expected === "absent") assert.ok(destination.error, "new destination relation unexpectedly exists before migration");
  else {
    assert.equal(destination.error, null, "operational destination relation is unavailable");
    // Deliberately use a nonexistent actor: this verifies the deployed RPC
    // without granting a session or mutating any candidate.
    const denied = await service.rpc("ops_approve_source", { p_actor: "00000000-0000-4000-8000-000000000000", p_target: "00000000-0000-4000-8000-000000000000", p_note: "Read-only authorization verification", p_official_url: "https://official.example/", p_activate_known_adapter: false });
    assert.ok(denied.error?.message.includes("OPS_FORBIDDEN"));
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ sources: sources.data, documents: documents.data, candidates: candidates.data })).digest("hex");
  console.log(JSON.stringify({ ok: true, expectedMigration: expected, readOnly: true, sources: sources.data?.length, documents: documents.data?.length, candidates: candidates.count, admins: admins.count, existingDataFingerprint: fingerprint }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Read-only operations deployment verification failed"); process.exitCode = 1; });

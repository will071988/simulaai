import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_HOST = "ukwulespvvthyjqgrjfo.supabase.co";
const fingerprint = (rows: unknown[]) => crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const sorted = <T extends Record<string, unknown>>(rows: T[], fields: (keyof T)[]) => rows
  .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])))
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  assert.equal(new URL(url).hostname, EXPECTED_HOST, "aborting: unexpected Supabase project ref");
  assert.ok(key, "SUPABASE_SERVICE_ROLE_KEY is required");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const source = await db.from("collector_sources").select("id,name,health_status,last_status,last_error_code,last_documents_count,consecutive_empty_runs,failure_count,last_success_at,last_failure_at").eq("name", "Cebraspe").single();
  assert.equal(source.error, null, source.error?.message);
  const documents = await db.from("collector_documents").select("id,canonical_url,content_hash,binary_hash,text_hash,status,document_type,title", { count: "exact" }).eq("source_id", source.data.id).limit(1000);
  assert.equal(documents.error, null, documents.error?.message);
  const documentRows = documents.data || [];
  assert.equal(documents.count, documentRows.length, "Cebraspe documents snapshot was truncated");
  const documentIds = documentRows.map((row) => row.id);
  const relationships = documentIds.length
    ? await db.from("concurso_documents").select("concurso_id,collector_document_id,relationship_type,source_url,document_type", { count: "exact" }).in("collector_document_id", documentIds).limit(1000)
    : { data: [], error: null, count: 0 };
  assert.equal(relationships.error, null, relationships.error?.message);
  assert.equal(relationships.count, relationships.data?.length || 0, "relationships snapshot was truncated");
  const contestIds = [...new Set((relationships.data || []).map((row) => row.concurso_id))];
  const [contests, aliases, evidence, changes, duplicateCandidates, conflicts, failed] = await Promise.all([
    contestIds.length ? db.from("concursos").select("id,logical_key,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,merged_into_id,quality_status,is_publishable", { count: "exact" }).in("id", contestIds) : Promise.resolve({ data: [], error: null, count: 0 }),
    contestIds.length ? db.from("concurso_identity_aliases").select("concurso_id,alias_type,alias_value,source_name,source_url,is_current", { count: "exact" }).in("concurso_id", contestIds).limit(5000) : Promise.resolve({ data: [], error: null, count: 0 }),
    contestIds.length ? db.from("concurso_field_evidence").select("concurso_id,field_name,source_url,value_hash,invalidation_reason", { count: "exact" }).in("concurso_id", contestIds).limit(5000) : Promise.resolve({ data: [], error: null, count: 0 }),
    contestIds.length ? db.from("concurso_changes").select("concurso_id,field_name,source_url,change_key,relationship_type", { count: "exact" }).in("concurso_id", contestIds).limit(5000) : Promise.resolve({ data: [], error: null, count: 0 }),
    db.from("concurso_duplicate_candidates").select("concurso_a_id,concurso_b_id,score,reason,status", { count: "exact" }).eq("status", "POSSIBLE_DUPLICATE").limit(1000),
    db.from("concursos").select("id,quality_status,is_publishable,merged_into_id", { count: "exact" }).eq("quality_status", "CONFLICTED").order("id"),
    db.from("collector_documents").select("id,status,ai_last_error_code,canonical_url", { count: "exact" }).eq("status", "FAILED").order("id").limit(1000),
  ]);
  for (const [name, result] of Object.entries({ contests, aliases, evidence, changes, duplicateCandidates, conflicts, failed })) {
    assert.equal(result.error, null, `${name}: ${result.error?.message || "query failed"}`);
    assert.equal(result.count, result.data?.length || 0, `${name} snapshot was truncated`);
  }
  const semantic = {
    documents: sorted(documentRows, ["canonical_url", "content_hash", "binary_hash", "text_hash", "status", "document_type", "title"]),
    relationships: sorted(relationships.data || [], ["concurso_id", "collector_document_id", "relationship_type", "source_url", "document_type"]),
    contests: sorted(contests.data || [], ["id", "logical_key", "edital_number", "process_number", "official_slug", "official_source", "cargo_key", "cargo_group_key", "merged_into_id", "quality_status", "is_publishable"]),
    aliases: sorted(aliases.data || [], ["concurso_id", "alias_type", "alias_value", "source_name", "source_url", "is_current"]),
    evidence: sorted(evidence.data || [], ["concurso_id", "field_name", "source_url", "value_hash", "invalidation_reason"]),
    changes: sorted(changes.data || [], ["concurso_id", "field_name", "source_url", "change_key", "relationship_type"]),
    duplicateCandidates: sorted(duplicateCandidates.data || [], ["concurso_a_id", "concurso_b_id", "score", "reason", "status"]),
  };
  console.log(JSON.stringify({
    projectRef: "ukwulespvvthyjqgrjfo",
    source: { ...source.data, id: undefined },
    counts: {
      cebraspeDocuments: semantic.documents.length,
      relationships: semantic.relationships.length,
      contests: semantic.contests.length,
      aliases: semantic.aliases.length,
      evidence: semantic.evidence.length,
      changes: semantic.changes.length,
      possibleDuplicates: semantic.duplicateCandidates.length,
      conflicts: conflicts.data?.length || 0,
      failedDocuments: failed.data?.length || 0,
    },
    fingerprints: {
      cebraspeSemantic: fingerprint(Object.values(semantic).flat()),
      conflicts: fingerprint(conflicts.data || []),
      failedDocuments: fingerprint(failed.data || []),
    },
    duplicateRows: {
      canonicalUrls: semantic.documents.length - new Set(semantic.documents.map((row) => row.canonical_url)).size,
      aliases: semantic.aliases.length - new Set(semantic.aliases.map((row) => `${row.concurso_id}|${row.alias_type}|${row.alias_value}|${row.source_name}`)).size,
      relationships: semantic.relationships.length - new Set(semantic.relationships.map((row) => row.collector_document_id)).size,
      evidence: semantic.evidence.length - new Set(semantic.evidence.map((row) => `${row.concurso_id}|${row.field_name}|${row.source_url}|${row.value_hash}`)).size,
      changes: semantic.changes.length - new Set(semantic.changes.map((row) => row.change_key)).size,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

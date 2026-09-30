import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_HOST = "ukwulespvvthyjqgrjfo.supabase.co";

function duplicateCount<T>(rows: T[], key: (row: T) => string): number {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) || 0) + 1);
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  assert.equal(new URL(url).hostname, EXPECTED_HOST, "aborting: unexpected Supabase project ref");
  assert.ok(key, "SUPABASE_SERVICE_ROLE_KEY is required");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [
    pending,
    documentsResult,
    versionsResult,
    evidence,
    aliasesResult,
    relationshipsResult,
    changesResult,
    contestsResult,
    duplicateCandidates,
    sourcesResult,
  ] = await Promise.all([
    db.from("collector_documents").select("id", { count: "exact", head: true }).eq("status", "AI_PENDING"),
    db.from("collector_documents").select("id,content_hash,canonical_url,status,source_id").limit(10000),
    db.from("collector_document_versions").select("document_id,content_hash").limit(10000),
    db.from("concurso_field_evidence").select("id", { count: "exact", head: true }),
    db.from("concurso_identity_aliases").select("concurso_id,alias_type,alias_value,source_name").limit(10000),
    db.from("concurso_documents").select("concurso_id,collector_document_id,relationship_type,source_url").limit(10000),
    db.from("concurso_changes").select("concurso_id,field_name,source_url,new_value,change_key").limit(10000),
    db.from("concursos").select("id,merged_into_id,quality_status").limit(10000),
    db.from("concurso_duplicate_candidates").select("id", { count: "exact", head: true }).eq("status", "POSSIBLE_DUPLICATE"),
    db.from("collector_sources").select("id,name,tier,enabled,last_status,last_error_code").order("tier").order("name"),
  ]);

  const checks = { pending, documentsResult, versionsResult, evidence, aliasesResult, relationshipsResult, changesResult, contestsResult, duplicateCandidates, sourcesResult };
  for (const [name, result] of Object.entries(checks)) {
    assert.equal(result.error, null, `${name}: ${result.error?.message || "query failed"}`);
  }

  const documents = documentsResult.data || [];
  const versions = versionsResult.data || [];
  const aliases = aliasesResult.data || [];
  const relationships = relationshipsResult.data || [];
  const changes = changesResult.data || [];
  const contests = contestsResult.data || [];
  const sources = sourcesResult.data || [];
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  const officialDocuments = documents.filter((document) => ["FGV", "Cebraspe"].includes(sourceNames.get(document.source_id) || ""));
  const retifications = relationships.filter((document) => document.relationship_type === "RETIFICATION");

  console.log(JSON.stringify({
    projectRef: "ukwulespvvthyjqgrjfo",
    counts: {
      contests: contests.length,
      canonical: contests.filter((contest) => contest.merged_into_id === null).length,
      merged: contests.filter((contest) => contest.merged_into_id !== null).length,
      pendingAI: pending.count || 0,
      documents: documents.length,
      officialDocuments: officialDocuments.length,
      fgvDocuments: officialDocuments.filter((document) => sourceNames.get(document.source_id) === "FGV").length,
      cebraspeDocuments: officialDocuments.filter((document) => sourceNames.get(document.source_id) === "Cebraspe").length,
      retifications: retifications.length,
      evidence: evidence.count || 0,
      possibleDuplicates: duplicateCandidates.count || 0,
    },
    duplicateRows: {
      documentVersions: duplicateCount(versions, (row) => `${row.document_id}|${row.content_hash}`),
      aliases: duplicateCount(aliases, (row) => `${row.concurso_id}|${row.alias_type}|${row.alias_value}|${row.source_name}`),
      relationships: duplicateCount(relationships, (row) => row.collector_document_id),
      changes: duplicateCount(changes, (row) => row.change_key || `${row.concurso_id}|${row.field_name}|${row.source_url}|${JSON.stringify(row.new_value)}`),
    },
    sources: sources.map(({ name, tier, enabled, last_status, last_error_code }) => ({ name, tier, enabled, last_status, last_error_code })),
  }, null, 2));
}

main();

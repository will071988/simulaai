import assert from "node:assert/strict";
import { supabaseService } from "../src/lib/supabase-server";
import { normalizeOrganization } from "../src/lib/collector/entityResolution";
import { resolveCanonicalContestId } from "../src/lib/collector/canonicalContest";

const PROJECT_REF = "ukwulespvvthyjqgrjfo";

function arg(name: string) { return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || null; }
function requireProject() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  assert.equal(new URL(url).hostname, `${PROJECT_REF}.supabase.co`, "aborting: unexpected Supabase project ref");
}
function priority(value: string | null) { return { RETIFICATION: 5, REPUBLICATION: 4, REOPENING: 3, SAME_CONTEST_UPDATE: 2, ORIGINAL: 1, UNKNOWN: 0 }[value || "UNKNOWN"] || 0; }

async function counts(svc: ReturnType<typeof supabaseService>, id: string) {
  const [{ count: aliases }, { count: documents }, { count: evidence }, { count: changes }] = await Promise.all([
    svc.from("concurso_identity_aliases").select("id", { count: "exact", head: true }).eq("concurso_id", id),
    svc.from("concurso_documents").select("id", { count: "exact", head: true }).eq("concurso_id", id),
    svc.from("concurso_field_evidence").select("id", { count: "exact", head: true }).eq("concurso_id", id),
    svc.from("concurso_changes").select("id", { count: "exact", head: true }).eq("concurso_id", id),
  ]);
  return { aliases: aliases || 0, documents: documents || 0, evidence: evidence || 0, changes: changes || 0 };
}

async function main() {
  const canonicalId = arg("canonical");
  const duplicateId = arg("duplicate");
  const reason = arg("reason") || "administrative reconciliation: same official contest context";
  const apply = process.argv.includes("--apply");
  requireProject();
  assert.ok(canonicalId && duplicateId, "canonical and duplicate arguments are required");
  assert.notEqual(canonicalId, duplicateId, "canonical and duplicate must differ");
  const svc = supabaseService();
  const select = "id,orgao,banca,titulo,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,logical_key,edital_url,merged_into_id";
  const [{ data: canonical, error: canonicalError }, { data: duplicate, error: duplicateError }] = await Promise.all([
    svc.from("concursos").select(select).eq("id", canonicalId).maybeSingle(),
    svc.from("concursos").select(select).eq("id", duplicateId).maybeSingle(),
  ]);
  if (canonicalError) throw canonicalError;
  if (duplicateError) throw duplicateError;
  assert.ok(canonical, "canonical contest not found");
  assert.ok(duplicate, "duplicate contest not found");
  assert.equal(normalizeOrganization(canonical.orgao), normalizeOrganization(duplicate.orgao), "hard conflict: different organizations");
  if (canonical.process_number && duplicate.process_number && canonical.process_number !== duplicate.process_number) throw new Error("hard conflict: different process numbers");
  if (canonical.cargo_key && duplicate.cargo_key && canonical.cargo_key !== duplicate.cargo_key) throw new Error("hard conflict: different cargo keys");
  if (canonical.cargo_group_key && duplicate.cargo_group_key && canonical.cargo_group_key !== duplicate.cargo_group_key) throw new Error("hard conflict: different cargo groups");
  const [{ data: canonicalAliases }, { data: duplicateAliases }, { data: duplicateDocuments }] = await Promise.all([
    svc.from("concurso_identity_aliases").select("alias_type,alias_value,source_name,source_url,confidence,is_current").eq("concurso_id", canonicalId),
    svc.from("concurso_identity_aliases").select("alias_type,alias_value,source_name,source_url,confidence,is_current").eq("concurso_id", duplicateId),
    svc.from("concurso_documents").select("id,collector_document_id,document_type,relationship_type,source_url,source_name,published_at,observed_at,is_current").eq("concurso_id", duplicateId),
  ]);
  const aliasPairs = new Set((canonicalAliases || []).map((alias) => `${alias.alias_type}:${alias.alias_value}`));
  const duplicateAliasPairs = (duplicateAliases || []).map((alias) => `${alias.alias_type}:${alias.alias_value}`);
  const sameEdittal = duplicateAliasPairs.includes("EDITAL:01/2026") || aliasPairs.has("EDITAL:01/2026");
  if (!sameEdittal && canonical.edital_number !== duplicate.edital_number) throw new Error("hard conflict: no shared edital identity");
  const before = { canonical: await counts(svc, canonicalId), duplicate: await counts(svc, duplicateId) };
  console.log(JSON.stringify({ projectRef: PROJECT_REF, apply, canonical: { ...canonical, merged_into_id: canonical.merged_into_id }, duplicate: { ...duplicate, merged_into_id: duplicate.merged_into_id }, before, aliases: { canonical: (canonicalAliases || []).length, duplicate: (duplicateAliases || []).length }, documents: (duplicateDocuments || []).length }));
  if (!apply) return;
  const duplicateCanonical = await resolveCanonicalContestId(svc, duplicateId);
  if (duplicateCanonical !== duplicateId && duplicateCanonical !== canonicalId) throw new Error(`duplicate already maps to ${duplicateCanonical}`);
  const canonicalTarget = await resolveCanonicalContestId(svc, canonicalId);
  assert.equal(canonicalTarget, canonicalId, "canonical target is already merged");
  if ((duplicateAliases || []).length) {
    for (const alias of duplicateAliases || []) {
      const { error } = await svc.from("concurso_identity_aliases").upsert({ ...alias, concurso_id: canonicalId, is_current: true }, { onConflict: "concurso_id,alias_type,alias_value,source_name" });
      if (error) throw new Error(`reconcile alias: ${error.message}`);
    }
    const { error } = await svc.from("concurso_identity_aliases").update({ is_current: false }).eq("concurso_id", duplicateId);
    if (error) throw new Error(`archive duplicate aliases: ${error.message}`);
  }
  for (const document of duplicateDocuments || []) {
    const { data: existing } = await svc.from("concurso_documents").select("id,relationship_type").eq("concurso_id", canonicalId).eq("collector_document_id", document.collector_document_id).maybeSingle();
    if (!existing) {
      const { error } = await svc.from("concurso_documents").update({ concurso_id: canonicalId }).eq("id", document.id).eq("concurso_id", duplicateId);
      if (error) throw new Error(`reconcile document: ${error.message}`);
    } else if (priority(document.relationship_type) > priority(existing.relationship_type)) {
      const { error } = await svc.from("concurso_documents").update({ document_type: document.document_type, relationship_type: document.relationship_type, source_url: document.source_url, source_name: document.source_name, published_at: document.published_at, is_current: document.is_current }).eq("id", existing.id);
      if (error) throw new Error(`preserve informative document relationship: ${error.message}`);
    }
  }
  for (const table of ["concurso_field_evidence", "concurso_changes"] as const) {
    const { error } = await svc.from(table).update({ concurso_id: canonicalId }).eq("concurso_id", duplicateId);
    if (error) throw new Error(`reconcile ${table}: ${error.message}`);
  }
  const { error: mappingError } = await svc.from("concursos").update({ merged_into_id: canonicalId, merged_at: new Date().toISOString(), merge_reason: reason }).eq("id", duplicateId).is("merged_into_id", null);
  if (mappingError) throw new Error(`persist canonical mapping: ${mappingError.message}`);
  for (const [a, b] of [[canonicalId, duplicateId], [duplicateId, canonicalId]]) {
    const { error } = await svc.from("concurso_duplicate_candidates").update({ status: "RESOLVED", resolved_at: new Date().toISOString() }).eq("concurso_a_id", a).eq("concurso_b_id", b);
    if (error) throw new Error(`resolve duplicate candidate: ${error.message}`);
  }
  const after = { canonical: await counts(svc, canonicalId), duplicate: await counts(svc, duplicateId) };
  console.log(JSON.stringify({ projectRef: PROJECT_REF, applied: true, canonicalId, duplicateId, after }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "reconciliation failed"); process.exitCode = 1; });

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { resolveRequestedContest } from "@/lib/collector/canonicalContest";
import { findSensitivePaths } from "@/lib/api/exposure";
import { filterCurrentContestEvidence, isContestId } from "@/lib/contest-evidence";
import { observeApiRoute } from "@/lib/observability/operations";

async function handleGET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isContestId(id)) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const svc = supabaseService();
  let resolved;
  try { resolved = await resolveRequestedContest(svc, id); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CANONICAL_RESOLUTION_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
  if (!resolved) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { canonicalId, requestedId, mergedIntoId, isMerged } = resolved;
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,quality_status,logical_key,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,edital_url,updated_at,merged_into_id,is_publishable,simulados(slug)").eq("id", canonicalId).not("simulados.slug", "is", null).order("created_at", { referencedTable: "simulados", ascending: true }).limit(1, { referencedTable: "simulados" }).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "DETAIL_CONTEST_QUERY_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (!data) return NextResponse.json({ ok: false, error: "CANONICAL_CONTEST_NOT_FOUND" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (!data.is_publishable) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const [evidenceResult, aliasesResult, documentsResult, mergedFromResult] = await Promise.all([
    svc.from("concurso_field_evidence").select("field_name,value_json,source_url,source_name,source_tier,evidence_text,confidence,observed_at").eq("concurso_id", canonicalId).is("invalidation_reason", null).order("observed_at", { ascending: false }).limit(100),
    svc.from("concurso_identity_aliases").select("alias_type,alias_value,source_name,source_url,confidence,valid_from,valid_until,is_current").eq("concurso_id", canonicalId).order("created_at", { ascending: false }).limit(100),
    svc.from("concurso_documents").select("document_type,relationship_type,source_url,source_name,published_at,observed_at,is_current").eq("concurso_id", canonicalId).order("observed_at", { ascending: false }).limit(100),
    svc.from("concursos").select("id").eq("merged_into_id", canonicalId),
  ]);
  if (evidenceResult.error) return NextResponse.json({ ok: false, error: "DETAIL_EVIDENCE_QUERY_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (aliasesResult.error) return NextResponse.json({ ok: false, error: "DETAIL_ALIASES_QUERY_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (documentsResult.error) return NextResponse.json({ ok: false, error: "DETAIL_DOCUMENTS_QUERY_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (mergedFromResult.error) return NextResponse.json({ ok: false, error: "DETAIL_MERGED_FROM_QUERY_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  const evidence = evidenceResult.data || [];
  const identityAliases = aliasesResult.data || [];
  const documents = documentsResult.data || [];
  const mergedFrom = mergedFromResult.data || [];
  const { simulados, ...concurso } = data;
  delete (concurso as { is_publishable?: boolean }).is_publishable;
  const publicEvidence = filterCurrentContestEvidence(concurso as Record<string, unknown>, evidence, documents);
  const detail = { ...concurso, id: canonicalId, requested_id: requestedId, canonical_id: canonicalId, merged_into_id: mergedIntoId, is_merged: isMerged, merged_from: mergedFrom.map((row) => row.id), simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null, evidence: publicEvidence, identity_aliases: identityAliases, documents };
  if (findSensitivePaths(detail).length) return NextResponse.json({ ok: false, error: "DETAIL_EXPOSURE_GUARD_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = observeApiRoute("/api/concursos/[id]", handleGET);

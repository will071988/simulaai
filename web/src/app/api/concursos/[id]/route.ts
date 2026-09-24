import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { resolveCanonicalContestId } from "@/lib/collector/canonicalContest";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const svc = supabaseService();
  const { data: requested, error: requestedError } = await svc.from("concursos").select("id,merged_into_id").eq("id", id).maybeSingle();
  if (requestedError) return NextResponse.json({ ok: false, error: requestedError.message }, { status: 500 });
  if (!requested) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  const canonicalId = await resolveCanonicalContestId(svc, id);
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,quality_status,logical_key,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,edital_url,merged_into_id,simulados(slug)").eq("id", canonicalId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  const { data: evidence } = await svc.from("concurso_field_evidence").select("field_name,value_json,source_url,source_name,source_tier,evidence_text,confidence,observed_at").eq("concurso_id", canonicalId).order("observed_at", { ascending: false }).limit(100);
  const { data: identityAliases } = await svc.from("concurso_identity_aliases").select("alias_type,alias_value,source_name,source_url,confidence,valid_from,valid_until,is_current").eq("concurso_id", canonicalId).order("created_at", { ascending: false }).limit(100);
  const { data: documents } = await svc.from("concurso_documents").select("document_type,relationship_type,source_url,source_name,published_at,observed_at,is_current").eq("concurso_id", canonicalId).order("observed_at", { ascending: false }).limit(100);
  const { data: mergedFrom } = await svc.from("concursos").select("id").eq("merged_into_id", canonicalId);
  const { simulados, ...concurso } = data;
  return NextResponse.json({ ok: true, data: { ...concurso, merged_into_id: requested.merged_into_id || null, canonical_id: canonicalId, merged_from: (mergedFrom || []).map((row) => row.id), requested_id: id, simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null, evidence: evidence || [], identity_aliases: identityAliases || [], documents: documents || [] } });
}

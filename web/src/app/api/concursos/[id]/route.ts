import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const svc = supabaseService();
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,quality_status,logical_key,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,edital_url,simulados(slug)").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  const { data: evidence } = await svc.from("concurso_field_evidence").select("field_name,value_json,source_url,source_name,source_tier,evidence_text,confidence,observed_at").eq("concurso_id", id).order("observed_at", { ascending: false }).limit(100);
  const { simulados, ...concurso } = data;
  return NextResponse.json({ ok: true, data: { ...concurso, simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null, evidence: evidence || [] } });
}

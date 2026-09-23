import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET() {
  const svc = supabaseService();
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,edital_url,simulados(slug)").order("hot_score", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const filtered = (data || [])
    .filter((c) => c.hot_score != null && c.hot_score >= 5 && c.latitude != null && c.longitude != null && c.scope != null)
    .map(({ simulados, ...concurso }) => ({ ...concurso, simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null }));
  return NextResponse.json({ ok: true, data: filtered });
}

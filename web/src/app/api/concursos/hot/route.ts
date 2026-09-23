import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET() {
  const svc = supabaseService();
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,edital_url,simulados(slug)").gte("hot_score", 5).not("latitude", "is", null).not("longitude", "is", null).not("scope", "is", null).order("hot_score", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = (data || []).map(({ simulados, ...concurso }) => ({ ...concurso, simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null }));
  return NextResponse.json({ ok: true, data: result }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

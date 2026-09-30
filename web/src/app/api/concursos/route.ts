import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const fields = "id,orgao,titulo,banca,vagas,salario,status,edital_url,prova_data,created_at,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,scope,state_code,city,latitude,longitude,location_label,hot_score,hot_reasons,quality_status";
  const { data, error } = await supabase.from("concursos").select(fields).eq("is_publishable", true).is("merged_into_id", null).order("created_at");
  if (error) return NextResponse.json({ ok: false, error: "CONTEST_LIST_QUERY_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET() {
  const svc = supabaseService();
  const { data, error } = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,status,scope,state_code,city,latitude,longitude,location_label,hot_score,edital_url").order("hot_score", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const filtered = (data || []).filter((c) => c.hot_score && c.hot_score >= 50 && c.latitude && c.longitude);
  return NextResponse.json({ ok: true, data: filtered });
}

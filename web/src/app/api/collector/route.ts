import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET() {
  const svc = supabaseService();
  // lê concursos já no Supabase (populados via migration)
  const { data: concursos, error } = await svc.from("concursos").select("*").order("vagas", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: simulados } = await svc.from("simulados").select("id, titulo, banca_alvo, concurso_id").limit(6);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    projeto: "ukwulespvvthyjqgrjfo (will071988's Project - cxqtcqiiwnfgpuxbhtre)",
    concursos: concursos?.length ?? 0,
    simulados: simulados?.length ?? 0,
    data: { concursos, simulados },
    cron: "0 6 * * * vercel.json",
  });
}

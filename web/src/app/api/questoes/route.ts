import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { toPublicQuestion } from "@/lib/questions/publicQuestion";

const publicFields = "id,concurso_id,disciplina,assunto,subassunto,enunciado,alternativas,dificuldade,origem,banca,ano,cargo,source_url,source_type,created_at";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(Number(params.get("limit") || 20) || 20, 50));
  const disciplina = params.get("disciplina")?.trim().slice(0, 120);
  const assunto = params.get("assunto")?.trim().slice(0, 160);
  let query = supabaseService().from("questoes").select(publicFields).eq("quality_status", "PUBLISHED").order("created_at", { ascending: false }).limit(limit);
  if (disciplina) query = query.eq("disciplina", disciplina);
  if (assunto) query = query.eq("assunto", assunto);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "QUESTIONS_QUERY_FAILED" }, { status: 500 });
  return NextResponse.json({ data: (data || []).map((row) => toPublicQuestion(row as Record<string, unknown>)) });
}

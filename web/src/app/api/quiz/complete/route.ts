import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, answers, primary_profile, primary_concurso_slug, primary_score, secondary_concurso_slug, secondary_score, completed_at } = body;
    if (!session_id || !answers) return NextResponse.json({ ok: false }, { status: 400 });
    const svc = supabaseService();
    const { data: existing } = await svc.from("quiz_responses").select("id").eq("session_id", session_id).limit(1).maybeSingle();
    if (existing) {
      await svc.from("quiz_responses").update({ answers, primary_profile, primary_concurso_slug, primary_score, secondary_concurso_slug, secondary_score, completed_at: completed_at || new Date().toISOString() }).eq("session_id", session_id);
    } else {
      await svc.from("quiz_responses").insert({ session_id, answers, primary_profile, primary_concurso_slug, primary_score, secondary_concurso_slug, secondary_score, completed_at: completed_at || new Date().toISOString() });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "err";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

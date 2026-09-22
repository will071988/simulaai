import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
export async function POST(req: Request) {
  try {
    const { session_id, started_at } = await req.json();
    if (!session_id || typeof session_id !== "string") return NextResponse.json({ ok: false }, { status: 400 });
    const svc = supabaseService();
    await svc.from("quiz_responses").insert({ session_id, answers: {}, started_at: started_at || new Date().toISOString(), converted_to_simulado: false });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "err";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

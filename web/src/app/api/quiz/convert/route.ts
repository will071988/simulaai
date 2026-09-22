import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
export async function POST(req: Request) {
  try {
    const { session_id } = await req.json();
    if (!session_id) return NextResponse.json({ ok: false }, { status: 400 });
    const svc = supabaseService();
    await svc.from("quiz_responses").update({ converted_to_simulado: true }).eq("session_id", session_id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "err";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

function isValidUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const { session_id, started_at } = await req.json();
    if (!session_id || typeof session_id !== "string" || !isValidUUID(session_id)) return NextResponse.json({ ok: false, error: "session_id inválido" }, { status: 400 });
    const svc = supabaseService();
    const { error } = await svc.from("quiz_responses").insert({ session_id, answers: {}, started_at: started_at || new Date().toISOString(), converted_to_simulado: false });
    if (error && !error.message.includes("duplicate")) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "err";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

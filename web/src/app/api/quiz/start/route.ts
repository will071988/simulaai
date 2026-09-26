import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { enforceQuizRateLimit, PublicRequestError, readJsonBody } from "@/lib/api/publicRequest";

function isValidUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const { session_id, started_at } = await readJsonBody<{ session_id?: string; started_at?: string }>(req);
    if (!session_id || typeof session_id !== "string" || !isValidUUID(session_id)) return NextResponse.json({ ok: false, error: "session_id inválido" }, { status: 400 });
    const rate = await enforceQuizRateLimit(req, "quiz/start", session_id);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    const svc = supabaseService();
    const { error } = await svc.from("quiz_responses").insert({ session_id, answers: {}, started_at: started_at || new Date().toISOString(), converted_to_simulado: false });
    if (error && !error.message.includes("duplicate")) return NextResponse.json({ ok: false, error: "QUIZ_PERSISTENCE_FAILED" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof PublicRequestError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

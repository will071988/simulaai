import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { enforceQuizRateLimit, PublicRequestError, readJsonBody } from "@/lib/api/publicRequest";

function isValidUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const { session_id } = await readJsonBody<{ session_id?: string }>(req);
    if (!session_id || typeof session_id !== "string" || !isValidUUID(session_id)) return NextResponse.json({ ok: false, error: "session_id inválido" }, { status: 400 });
    const rate = await enforceQuizRateLimit(req, "quiz/convert", session_id);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    const svc = supabaseService();
    const { error, count } = await svc.from("quiz_responses").update({ converted_to_simulado: true }).eq("session_id", session_id).select("id");
    if (error) return NextResponse.json({ ok: false, error: "QUIZ_PERSISTENCE_FAILED" }, { status: 500 });
    // count check not critical, service_role allows
    return NextResponse.json({ ok: true, matched: count ?? 0 });
  } catch (e: unknown) {
    if (e instanceof PublicRequestError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

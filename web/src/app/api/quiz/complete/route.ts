import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { calculateQuizResult, perguntas } from "@/lib/quiz";
import { enforceQuizRateLimit, PublicRequestError, readJsonBody } from "@/lib/api/publicRequest";

function isValidUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody<{ session_id?: string; answers?: unknown; completed_at?: string }>(req);
    const { session_id, answers, completed_at } = body;
    if (!session_id || typeof session_id !== "string" || !isValidUUID(session_id)) return NextResponse.json({ ok: false, error: "session_id inválido" }, { status: 400 });
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return NextResponse.json({ ok: false, error: "answers inválido" }, { status: 400 });
    const rate = await enforceQuizRateLimit(req, "quiz/complete", session_id);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    // validar que answers contém apenas ids de perguntas e opções válidas
    const allowedQ = new Set(perguntas.map((p) => p.id));
    const allowedOpt = new Set(perguntas.flatMap((p) => p.opcoes.map((o) => o.id)));
    for (const [k, v] of Object.entries(answers as Record<string, string>)) {
      if (!allowedQ.has(k)) return NextResponse.json({ ok: false, error: `pergunta inválida ${k}` }, { status: 400 });
      if (typeof v !== "string" || !allowedOpt.has(v)) return NextResponse.json({ ok: false, error: `opção inválida ${v}` }, { status: 400 });
    }
    // recalcular server-side, não confiar no cliente
    const result = calculateQuizResult(answers as Record<string, string>);
    const svc = supabaseService();
    const payload = {
      answers,
      primary_profile: result.primaryPerfil,
      primary_concurso_slug: result.primaryConcurso.slug,
      primary_score: result.primaryConcurso.compat,
      secondary_concurso_slug: result.secondaryConcurso.slug,
      secondary_score: result.secondaryConcurso.compat,
      completed_at: completed_at || new Date().toISOString(),
    };
    const { data: existing, error: existingError } = await svc.from("quiz_responses").select("id").eq("session_id", session_id).limit(1).maybeSingle();
    if (existingError) return NextResponse.json({ ok: false, error: "QUIZ_PERSISTENCE_FAILED" }, { status: 500 });
    if (existing) {
      const { error } = await svc.from("quiz_responses").update(payload).eq("session_id", session_id);
      if (error) return NextResponse.json({ ok: false, error: "QUIZ_PERSISTENCE_FAILED" }, { status: 500 });
    } else {
      const { error } = await svc.from("quiz_responses").insert({ session_id, ...payload, started_at: new Date().toISOString() });
      if (error) return NextResponse.json({ ok: false, error: "QUIZ_PERSISTENCE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, primary: result.primaryConcurso.slug, secondary: result.secondaryConcurso.slug });
  } catch (e: unknown) {
    if (e instanceof PublicRequestError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

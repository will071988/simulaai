import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { toPublicQuestion } from "@/lib/questions/publicQuestion";
import { GenerateSimuladoSchema, selectQuestions, simuladoTitle, type QuestionCandidate } from "@/lib/simulados/engine";
import { createAttemptToken, hashAttemptToken } from "@/lib/simulados/security";
import { authenticatedUser, bearerToken } from "@/lib/auth/server";
import { observeApiRoute } from "@/lib/observability/operations";
import { loadPublishedQuestionPool, publishedQuestionOptions } from "@/lib/simulados/published-pool";

async function handleGET(_request: Request) {
  void _request;
  try {
    const { questions, contests } = await loadPublishedQuestionPool();
    const options = publishedQuestionOptions({ questions, contests });
    const values = (key: "cargo" | "disciplina" | "assunto" | "dificuldade") =>
      [...new Set(questions.flatMap((question) => question[key] ? [String(question[key])] : []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const bancas = [...new Set(options.flatMap((question) => question.banca ? [question.banca] : []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const niveis = [...new Set(questions.flatMap((question) => question.nivel ? [question.nivel] : []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return NextResponse.json({ data: { concursos: contests.map((contest) => ({ ...contest, questionCount: questions.filter((q) => q.concurso_id === contest.id).length })), cargos: values("cargo"), disciplinas: values("disciplina"), assuntos: values("assunto"), bancas, niveis, dificuldades: values("dificuldade"), questions: publishedQuestionOptions({ questions, contests }), totalQuestions: questions.length } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SIMULADO_OPTIONS_FAILED" }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  try {
    const presentedToken = bearerToken(request);
    const user = presentedToken ? await authenticatedUser(request) : null;
    if (presentedToken && !user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const parsed = GenerateSimuladoSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SIMULADO_REQUEST", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const input = { ...parsed.data, seed: parsed.data.seed || randomBytes(16).toString("hex") };
    const { questions, contests } = await loadPublishedQuestionPool();
    const contestMap = new Map(contests.map((contest) => [contest.id, contest]));
    const candidates: QuestionCandidate[] = publishedQuestionOptions({ questions, contests });
    let selected: QuestionCandidate[];
    try { selected = selectQuestions(candidates, input); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith("INSUFFICIENT_QUESTIONS:")) {
        const [, available, requested] = error.message.split(":");
        return NextResponse.json({ error: "INSUFFICIENT_QUESTIONS", available: Number(available), requested: Number(requested) }, { status: 422 });
      }
      throw error;
    }
    const token = createAttemptToken();
    const contest = input.concursoId ? contestMap.get(input.concursoId) : undefined;
    const config = {
      concursoId: input.concursoId, cargo: input.cargo, disciplina: input.disciplina, assunto: input.assunto,
      banca: input.banca, nivel: input.nivel, dificuldade: input.dificuldade, mode: input.mode,
      quantidade: selected.length, seed: input.seed, title: simuladoTitle(input, contest?.titulo),
    };
    const { data, error } = await supabaseService().rpc("create_simulado_attempt", {
      p_config: config,
      p_question_ids: selected.map((question) => question.id),
      p_session_id: input.sessionId,
      p_token_hash: hashAttemptToken(token),
      p_user_id: user?.id || null,
    });
    if (error || !data) return NextResponse.json({ error: "SIMULADO_CREATE_FAILED" }, { status: 500 });
    const rows = new Map(questions.map((question) => [question.id, question]));
    const publicQuestions = selected.map((candidate) => toPublicQuestion(rows.get(candidate.id)! as unknown as Record<string, unknown>));
    return NextResponse.json({ data: { ...(data as Record<string, unknown>), token, seed: input.seed, title: config.title, mode: input.mode, questions: publicQuestions } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "SIMULADO_CREATE_FAILED" }, { status: 500 });
  }
}

export const GET = observeApiRoute("/api/simulados/generate", handleGET);
export const POST = observeApiRoute("/api/simulados/generate", handlePOST);

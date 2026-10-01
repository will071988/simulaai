import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { toPublicQuestion } from "@/lib/questions/publicQuestion";
import { GenerateSimuladoSchema, selectQuestions, simuladoTitle, type QuestionCandidate } from "@/lib/simulados/engine";
import { createAttemptToken, hashAttemptToken } from "@/lib/simulados/security";

type QuestionRow = {
  id: string; concurso_id: string | null; cargo: string | null; disciplina: string; assunto: string;
  banca: string | null; nivel: string | null; dificuldade: "FACIL" | "MEDIO" | "DIFICIL";
  enunciado: string; alternativas: unknown; subassunto: string | null; origem: string; ano: number | null;
};
type ContestRow = { id: string; titulo: string; orgao: string; banca: string | null; escolaridade: string[] | null };

const questionFields = "id,concurso_id,cargo,disciplina,assunto,subassunto,banca,nivel,dificuldade,enunciado,alternativas,origem,ano";

async function loadPublishedQuestions() {
  const svc = supabaseService();
  const { data, error } = await svc.from("questoes").select(questionFields).eq("quality_status", "PUBLISHED").limit(1000);
  if (error) throw new Error("QUESTIONS_QUERY_FAILED");
  const questions = (data || []) as QuestionRow[];
  const contestIds = [...new Set(questions.flatMap((row) => row.concurso_id ? [row.concurso_id] : []))];
  if (!contestIds.length) return { questions, contests: [] as ContestRow[] };
  const result = await svc.from("concursos").select("id,titulo,orgao,banca,escolaridade").in("id", contestIds);
  if (result.error) throw new Error("CONTESTS_QUERY_FAILED");
  return { questions, contests: (result.data || []) as ContestRow[] };
}

export async function GET() {
  try {
    const { questions, contests } = await loadPublishedQuestions();
    const contestMap = new Map(contests.map((contest) => [contest.id, contest]));
    const values = (key: "cargo" | "disciplina" | "assunto" | "dificuldade") =>
      [...new Set(questions.flatMap((question) => question[key] ? [String(question[key])] : []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const bancas = [...new Set(questions.flatMap((question) => {
      const banca = question.banca || (question.concurso_id ? contestMap.get(question.concurso_id)?.banca : null);
      return banca ? [banca] : [];
    }))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const niveis = [...new Set(questions.flatMap((question) => question.nivel ? [question.nivel] : []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return NextResponse.json({ data: { concursos: contests.map((contest) => ({ ...contest, questionCount: questions.filter((q) => q.concurso_id === contest.id).length })), cargos: values("cargo"), disciplinas: values("disciplina"), assuntos: values("assunto"), bancas, niveis, dificuldades: values("dificuldade") } });
  } catch {
    return NextResponse.json({ error: "SIMULADO_OPTIONS_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = GenerateSimuladoSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SIMULADO_REQUEST", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const input = { ...parsed.data, seed: parsed.data.seed || randomBytes(16).toString("hex") };
    const { questions, contests } = await loadPublishedQuestions();
    const contestMap = new Map(contests.map((contest) => [contest.id, contest]));
    const candidates: QuestionCandidate[] = questions.map((question) => {
      const contest = question.concurso_id ? contestMap.get(question.concurso_id) : undefined;
      return {
        id: question.id, concursoId: question.concurso_id, cargo: question.cargo, disciplina: question.disciplina,
        assunto: question.assunto, banca: question.banca || contest?.banca || null, nivel: question.nivel,
        dificuldade: question.dificuldade,
      };
    });
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
    });
    if (error || !data) return NextResponse.json({ error: "SIMULADO_CREATE_FAILED" }, { status: 500 });
    const rows = new Map(questions.map((question) => [question.id, question]));
    const publicQuestions = selected.map((candidate) => toPublicQuestion(rows.get(candidate.id)! as unknown as Record<string, unknown>));
    return NextResponse.json({ data: { ...(data as Record<string, unknown>), token, seed: input.seed, title: config.title, mode: input.mode, questions: publicQuestions } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "SIMULADO_CREATE_FAILED" }, { status: 500 });
  }
}

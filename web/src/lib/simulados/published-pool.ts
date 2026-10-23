import { supabaseService } from "../supabase-server";
import type { QuestionOption } from "./filters";

export type PublishedQuestion = {
  id: string; concurso_id: string | null; cargo: string | null; disciplina: string; assunto: string;
  banca: string | null; nivel: string | null; dificuldade: "FACIL" | "MEDIO" | "DIFICIL";
  enunciado: string; alternativas: unknown; subassunto: string | null; origem: string; ano: number | null;
};
export type PublishedContest = { id: string; titulo: string; orgao: string; banca: string | null; escolaridade: string[] | null };
export type PublishedPool = { questions: PublishedQuestion[]; contests: PublishedContest[] };

export async function publicContestsForQuestions(questions: Array<{ concurso_id: string | null }>, service = supabaseService(), signal = AbortSignal.timeout(5000)): Promise<PublishedContest[]> {
  const contestIds = [...new Set(questions.flatMap((question) => question.concurso_id ? [question.concurso_id] : []))];
  if (!contestIds.length) return [];
  const result = await service.from("concursos").select("id,titulo,orgao,banca,escolaridade").in("id", contestIds).eq("is_publishable", true).is("merged_into_id", null).in("quality_status", ["VERIFIED", "PARTIAL"]).abortSignal(signal);
  if (result.error) throw new Error("CONTESTS_QUERY_FAILED");
  return (result.data || []) as PublishedContest[];
}

export async function loadPublishedQuestionPool(service = supabaseService(), signal = AbortSignal.timeout(5000)): Promise<PublishedPool> {
  const result = await service.from("questoes").select("id,concurso_id,cargo,disciplina,assunto,subassunto,banca,nivel,dificuldade,enunciado,alternativas,origem,ano").eq("quality_status", "PUBLISHED").limit(1000).abortSignal(signal);
  if (result.error) throw new Error("QUESTIONS_QUERY_FAILED");
  const questions = (result.data || []) as PublishedQuestion[];
  const contests = await publicContestsForQuestions(questions, service, signal);
  const publicContestIds = new Set(contests.map((contest) => contest.id));
  return { questions: questions.filter((question) => !question.concurso_id || publicContestIds.has(question.concurso_id)), contests };
}

export function publishedQuestionOptions(pool: PublishedPool): Array<QuestionOption & { dificuldade: PublishedQuestion["dificuldade"] }> {
  const contests = new Map(pool.contests.map((contest) => [contest.id, contest]));
  return pool.questions.map((question) => ({ id: question.id, concursoId: question.concurso_id, cargo: question.cargo,
    disciplina: question.disciplina, assunto: question.assunto, banca: question.banca || (question.origem === "QUESTAO_OFICIAL" && question.concurso_id ? contests.get(question.concurso_id)?.banca || null : null), nivel: question.nivel, dificuldade: question.dificuldade }));
}

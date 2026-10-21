import { unstable_cache } from "next/cache";
import { supabaseService } from "../supabase-server";
import { publicContestsForQuestions } from "./published-pool";

export const PRACTICE_CATALOG_TAG = "public-practice-catalog";
// Only anonymous/public aggregates cross the cache boundary: no stems, alternatives,
// answer keys, user sessions, scores or account data.
export async function loadPublicPracticeCatalog(service = supabaseService()) {
  const signal = AbortSignal.timeout(2500);
  const result = await service.from("questoes").select("concurso_id,disciplina").eq("quality_status", "PUBLISHED").limit(1000).abortSignal(signal);
  if (result.error) throw new Error("PRACTICE_CATALOG_FAILED");
  const rows = result.data || [];
  const contests = await publicContestsForQuestions(rows, service, signal);
  const visible = new Set(contests.map((contest) => contest.id));
  const questions = rows.filter((question) => !question.concurso_id || visible.has(question.concurso_id));
  const disciplines = [...new Set(questions.map((question) => question.disciplina))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((disciplina) => ({ disciplina, questionCount: questions.filter((question) => question.disciplina === disciplina).length }));
  return { totalQuestions: questions.length, disciplines };
}
export const getPublicPracticeCatalog = unstable_cache(() => loadPublicPracticeCatalog(), ["public-practice-catalog-v1", process.env.NEXT_PUBLIC_SUPABASE_URL || "unconfigured"], { revalidate: 60, tags: [PRACTICE_CATALOG_TAG] });

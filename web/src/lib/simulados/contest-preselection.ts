import { isContestId } from "../contest-evidence";

type AvailableContest = { id: string; questionCount: number };
export async function resolveContestPreselection(requested: string | undefined, available: AvailableContest[], request: typeof fetch = fetch, signal?: AbortSignal) {
  if (requested === undefined) return { concursoId: "", message: "" };
  if (!isContestId(requested)) return { concursoId: "", message: "O link contém um concurso inválido. Selecione um concurso abaixo." };
  const response = await request(`/api/concursos/${encodeURIComponent(requested)}`, { cache: "no-store", signal });
  if (response.status === 404) return { concursoId: "", message: "Este concurso não está disponível. Selecione outro concurso abaixo." };
  if (!response.ok) throw new Error("CONTEST_PRESELECTION_FAILED");
  const payload = await response.json();
  const id = payload.data?.canonical_id;
  if (typeof id !== "string" || !isContestId(id)) throw new Error("INVALID_CONTEST_RESPONSE");
  const option = available.find((contest) => contest.id === id && contest.questionCount > 0);
  if (!option) return { concursoId: "", message: "Este concurso ainda não possui questões publicadas disponíveis para simulado. Você pode escolher outro concurso." };
  return { concursoId: option.id, message: "Concurso selecionado a partir da página de origem." };
}

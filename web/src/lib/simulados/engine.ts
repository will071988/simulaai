import { createHash } from "node:crypto";
import { z } from "zod";

export const SimuladoModeSchema = z.enum(["RAPIDO", "COMPLETO", "POR_MATERIA", "POR_ASSUNTO", "PROVA_SIMULADA"]);
export const DifficultySchema = z.enum(["FACIL", "MEDIO", "DIFICIL"]);

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();

export const GenerateSimuladoSchema = z.object({
  sessionId: z.string().uuid(),
  concursoId: z.string().uuid().optional(),
  cargo: optionalText(120),
  disciplina: optionalText(120),
  assunto: optionalText(160),
  banca: optionalText(120),
  nivel: optionalText(80),
  dificuldade: DifficultySchema.optional(),
  mode: SimuladoModeSchema,
  quantidade: z.number().int().min(1).max(100).optional(),
  seed: optionalText(160),
  excludeQuestionIds: z.array(z.string().uuid()).max(500).default([]),
}).superRefine((value, context) => {
  if (value.mode === "POR_MATERIA" && !value.disciplina) context.addIssue({ code: "custom", path: ["disciplina"], message: "DISCIPLINA_REQUIRED" });
  if (value.mode === "POR_ASSUNTO" && !value.assunto) context.addIssue({ code: "custom", path: ["assunto"], message: "ASSUNTO_REQUIRED" });
});

export type GenerateSimuladoInput = z.infer<typeof GenerateSimuladoSchema>;
export type SimuladoDifficulty = z.infer<typeof DifficultySchema>;

export type QuestionCandidate = {
  id: string;
  concursoId: string | null;
  cargo: string | null;
  disciplina: string;
  assunto: string;
  banca: string | null;
  nivel: string | null;
  dificuldade: SimuladoDifficulty;
};

const modeDefaults: Record<z.infer<typeof SimuladoModeSchema>, number> = {
  RAPIDO: 5,
  COMPLETO: 20,
  POR_MATERIA: 10,
  POR_ASSUNTO: 10,
  PROVA_SIMULADA: 30,
};

export function requestedQuantity(input: Pick<GenerateSimuladoInput, "mode" | "quantidade">): number {
  return input.quantidade ?? modeDefaults[input.mode];
}

function same(left: string | null, right?: string) {
  return !right || left?.localeCompare(right, "pt-BR", { sensitivity: "accent" }) === 0;
}

function rank(seed: string, id: string) {
  return createHash("sha256").update(`${seed}:${id}`).digest("hex");
}

function deterministicOrder(candidates: QuestionCandidate[], seed: string, excluded: Set<string>) {
  return [...candidates].sort((left, right) => {
    const repeatDelta = Number(excluded.has(left.id)) - Number(excluded.has(right.id));
    return repeatDelta || rank(seed, left.id).localeCompare(rank(seed, right.id));
  });
}

export function selectQuestions(candidates: QuestionCandidate[], input: GenerateSimuladoInput): QuestionCandidate[] {
  const amount = requestedQuantity(input);
  const eligible = candidates.filter((candidate) =>
    (!input.concursoId || candidate.concursoId === input.concursoId) &&
    same(candidate.cargo, input.cargo) && same(candidate.disciplina, input.disciplina) &&
    same(candidate.assunto, input.assunto) && same(candidate.banca, input.banca) &&
    same(candidate.nivel, input.nivel) && (!input.dificuldade || candidate.dificuldade === input.dificuldade)
  );
  if (eligible.length < amount) throw new Error(`INSUFFICIENT_QUESTIONS:${eligible.length}:${amount}`);

  const seed = input.seed || "simulaai-default-seed";
  const excluded = new Set(input.excludeQuestionIds);
  if (input.dificuldade) return deterministicOrder(eligible, seed, excluded).slice(0, amount);

  const desired: Record<SimuladoDifficulty, number> = {
    FACIL: Math.round(amount * 0.3),
    DIFICIL: Math.round(amount * 0.2),
    MEDIO: 0,
  };
  desired.MEDIO = amount - desired.FACIL - desired.DIFICIL;
  const selected: QuestionCandidate[] = [];
  for (const difficulty of ["FACIL", "MEDIO", "DIFICIL"] as const) {
    selected.push(...deterministicOrder(eligible.filter((item) => item.dificuldade === difficulty), `${seed}:${difficulty}`, excluded).slice(0, desired[difficulty]));
  }
  const selectedIds = new Set(selected.map((item) => item.id));
  const remaining = deterministicOrder(eligible.filter((item) => !selectedIds.has(item.id)), `${seed}:fill`, excluded);
  selected.push(...remaining.slice(0, amount - selected.length));
  return deterministicOrder(selected, `${seed}:final`, new Set());
}

export function simuladoTitle(input: GenerateSimuladoInput, contestTitle?: string | null) {
  const focus = input.assunto || input.disciplina || input.cargo || contestTitle || "Personalizado";
  const mode = input.mode.toLowerCase().replaceAll("_", " ");
  return `Simulado ${mode} · ${focus}`;
}

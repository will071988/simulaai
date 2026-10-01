import { z } from "zod";

export const StudyPlanRequestSchema = z.object({
  concursoId: z.string().uuid(),
  cargo: z.string().trim().min(2).max(160),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyMinutes: z.number().int().min(15).max(720),
  disciplines: z.array(z.string().trim().min(2).max(120)).min(1).max(20).transform((items) => [...new Set(items)]),
}).strict();

export type DisciplineSignal = { discipline: string; weight: number; answeredCount: number; errorCount: number; accuracy: number };
export type StudyAllocation = DisciplineSignal & { priority: number; dailyMinutes: number; reasons: string[] };
export type StudyDay = { date: string; totalMinutes: number; sessions: Array<{ discipline: string; minutes: number }> };
export type StudyPlan = { daysRemaining: number; horizonDays: number; urgency: number; dailyMinutes: number; allocation: StudyAllocation[]; schedule: StudyDay[] };

function utcDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_STUDY_DATE");
  return date;
}

function iso(date: Date) { return date.toISOString().slice(0, 10); }

export function buildStudyPlan(input: { today: string; examDate: string; dailyMinutes: number; disciplines: DisciplineSignal[] }): StudyPlan {
  if (!input.disciplines.length) throw new Error("NO_STUDY_DISCIPLINES");
  const today = utcDay(input.today);
  const exam = utcDay(input.examDate);
  const daysRemaining = Math.ceil((exam.getTime() - today.getTime()) / 86_400_000);
  if (daysRemaining < 1) throw new Error("EXAM_DATE_MUST_BE_FUTURE");
  const horizonDays = Math.min(14, daysRemaining);
  const urgency = daysRemaining <= 7 ? 1.35 : daysRemaining <= 30 ? 1.2 : daysRemaining <= 90 ? 1.1 : 1;
  const totalWeight = input.disciplines.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || input.disciplines.length;
  const scored = input.disciplines.map((item) => {
    const weight = (Math.max(0, item.weight) || (totalWeight === input.disciplines.length ? 1 : 0)) / totalWeight;
    const weakness = item.answeredCount ? Math.max(0, Math.min(1, (100 - item.accuracy) / 100)) : 0.5;
    const errorFrequency = item.answeredCount ? Math.max(0, Math.min(1, item.errorCount / item.answeredCount)) : 0.5;
    const raw = urgency * (weight * 0.45 + weakness * 0.35 + errorFrequency * 0.2);
    const reasons = [
      `peso ${(weight * 100).toFixed(1)}%`,
      item.answeredCount ? `precisão ${item.accuracy.toFixed(1)}%` : "sem histórico: prioridade neutra",
      item.answeredCount ? `${item.errorCount} erros em ${item.answeredCount}` : "frequência de erros ainda não medida",
      `${daysRemaining} dias até a prova`,
    ];
    return { ...item, raw, reasons };
  });
  const totalRaw = scored.reduce((sum, item) => sum + item.raw, 0);
  const base = scored.map((item) => {
    const exact = input.dailyMinutes * item.raw / totalRaw;
    return { ...item, exact, minutes: Math.floor(exact) };
  });
  const remaining = input.dailyMinutes - base.reduce((sum, item) => sum + item.minutes, 0);
  const remainderOrder = [...base].sort((a, b) => (b.exact - b.minutes) - (a.exact - a.minutes) || a.discipline.localeCompare(b.discipline, "pt-BR"));
  for (let index = 0; index < remaining; index++) remainderOrder[index % remainderOrder.length].minutes++;
  const allocation: StudyAllocation[] = base.map((item) => ({
    discipline: item.discipline, weight: item.weight, answeredCount: item.answeredCount, errorCount: item.errorCount,
    accuracy: item.accuracy, priority: Number((item.raw / totalRaw * 100).toFixed(2)), dailyMinutes: item.minutes, reasons: item.reasons,
  })).sort((a, b) => b.priority - a.priority || a.discipline.localeCompare(b.discipline, "pt-BR"));
  const schedule = Array.from({ length: horizonDays }, (_, offset) => {
    const date = new Date(today); date.setUTCDate(date.getUTCDate() + offset);
    const sessions = allocation.filter((item) => item.dailyMinutes > 0).map((item) => ({ discipline: item.discipline, minutes: item.dailyMinutes }));
    return { date: iso(date), totalMinutes: sessions.reduce((sum, item) => sum + item.minutes, 0), sessions };
  });
  return { daysRemaining, horizonDays, urgency, dailyMinutes: input.dailyMinutes, allocation, schedule };
}

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";
import { buildStudyPlan, StudyPlanRequestSchema, type DisciplineSignal } from "@/lib/study-plan/engine";
import { observeApiRoute } from "@/lib/observability/operations";

type ProgressDiscipline = { discipline: string; answeredCount: number; errorCount: number; accuracy: number };
type StoredPlan = {
  id: string; concurso_id: string; cargo: string; exam_date: string; daily_minutes: number; disciplines: string[];
  discipline_weights: Record<string, number>; performance_fingerprint: string; allocation: unknown[]; schedule: unknown[];
  days_remaining: number; generated_for: string; updated_at: string;
};

const noStore = { "cache-control": "no-store" };
const today = () => new Date().toISOString().slice(0, 10);

function fingerprint(signals: DisciplineSignal[]) {
  return createHash("sha256").update(JSON.stringify(signals.map((item) => [item.discipline, item.weight, item.answeredCount, item.errorCount, item.accuracy]))).digest("hex");
}

async function progressFor(userId: string) {
  const { data, error } = await supabaseService().rpc("get_user_progress", { p_user_id: userId });
  if (error || !data) throw new Error("PROGRESS_QUERY_FAILED");
  return ((data as { disciplines?: ProgressDiscipline[] }).disciplines || []);
}

function signalsFor(disciplines: string[], weights: Record<string, number>, progress: ProgressDiscipline[]) {
  const byDiscipline = new Map(progress.map((item) => [item.discipline, item]));
  return disciplines.map((discipline) => {
    const measured = byDiscipline.get(discipline);
    return { discipline, weight: weights[discipline] || 1, answeredCount: Number(measured?.answeredCount || 0), errorCount: Number(measured?.errorCount || 0), accuracy: Number(measured?.accuracy || 0) };
  });
}

function publicPlan(row: StoredPlan) {
  return { id: row.id, concursoId: row.concurso_id, cargo: row.cargo, examDate: row.exam_date, dailyMinutes: row.daily_minutes, disciplines: row.disciplines, allocation: row.allocation, schedule: row.schedule, daysRemaining: row.days_remaining, generatedFor: row.generated_for, updatedAt: row.updated_at };
}

async function options() {
  const svc = supabaseService();
  const [contests, questions] = await Promise.all([
    svc.from("concursos").select("id,titulo,orgao,prova_data,cargos").eq("is_publishable", true).is("merged_into_id", null).order("hot_score", { ascending: false }).limit(100),
    svc.from("questoes").select("disciplina").eq("quality_status", "PUBLISHED").limit(1000),
  ]);
  if (contests.error || questions.error) throw new Error("STUDY_OPTIONS_FAILED");
  return {
    contests: contests.data || [],
    disciplines: [...new Set((questions.data || []).map((row) => String(row.disciplina)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

async function handleGET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
    const svc = supabaseService();
    const [available, stored, progress] = await Promise.all([
      options(),
      svc.from("study_plans").select("id,concurso_id,cargo,exam_date,daily_minutes,disciplines,discipline_weights,performance_fingerprint,allocation,schedule,days_remaining,generated_for,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      progressFor(user.id),
    ]);
    if (stored.error) throw new Error("STUDY_PLAN_QUERY_FAILED");
    let row = stored.data as StoredPlan | null;
    if (row) {
      const signals = signalsFor(row.disciplines, row.discipline_weights, progress);
      const currentFingerprint = fingerprint(signals);
      if (row.performance_fingerprint !== currentFingerprint || row.generated_for !== today()) {
        const computed = buildStudyPlan({ today: today(), examDate: row.exam_date, dailyMinutes: row.daily_minutes, disciplines: signals });
        const update = await svc.from("study_plans").update({ performance_fingerprint: currentFingerprint, allocation: computed.allocation, schedule: computed.schedule, days_remaining: computed.daysRemaining, generated_for: today(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("user_id", user.id).select("id,concurso_id,cargo,exam_date,daily_minutes,disciplines,discipline_weights,performance_fingerprint,allocation,schedule,days_remaining,generated_for,updated_at").single();
        if (update.error) throw new Error("STUDY_PLAN_REFRESH_FAILED");
        row = update.data as StoredPlan;
      }
    }
    return NextResponse.json({ data: { options: available, plan: row ? publicPlan(row) : null } }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "STUDY_PLAN_QUERY_FAILED" }, { status: 500, headers: noStore });
  }
}

async function handlePOST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
    const parsed = StudyPlanRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_STUDY_PLAN", details: parsed.error.flatten().fieldErrors }, { status: 400, headers: noStore });
    const input = parsed.data;
    if (input.examDate <= today()) return NextResponse.json({ error: "EXAM_DATE_MUST_BE_FUTURE" }, { status: 400, headers: noStore });
    const svc = supabaseService();
    const [contest, questions, progress] = await Promise.all([
      svc.from("concursos").select("id").eq("id", input.concursoId).eq("is_publishable", true).is("merged_into_id", null).maybeSingle(),
      svc.from("questoes").select("concurso_id,cargo,disciplina").eq("quality_status", "PUBLISHED").in("disciplina", input.disciplines).limit(1000),
      progressFor(user.id),
    ]);
    if (contest.error || !contest.data) return NextResponse.json({ error: "CONTEST_NOT_AVAILABLE" }, { status: 404, headers: noStore });
    if (questions.error) throw new Error("STUDY_QUESTION_WEIGHTS_FAILED");
    const rows = questions.data || [];
    const specific = rows.filter((row) => row.concurso_id === input.concursoId && (!row.cargo || row.cargo === input.cargo));
    const source = specific.length ? specific : rows;
    const weights = Object.fromEntries(input.disciplines.map((discipline) => [discipline, Math.max(1, source.filter((row) => row.disciplina === discipline).length)]));
    const signals = signalsFor(input.disciplines, weights, progress);
    const computed = buildStudyPlan({ today: today(), examDate: input.examDate, dailyMinutes: input.dailyMinutes, disciplines: signals });
    const saved = await svc.from("study_plans").upsert({
      user_id: user.id, concurso_id: input.concursoId, cargo: input.cargo, exam_date: input.examDate, daily_minutes: input.dailyMinutes,
      disciplines: input.disciplines, discipline_weights: weights, performance_fingerprint: fingerprint(signals), allocation: computed.allocation,
      schedule: computed.schedule, days_remaining: computed.daysRemaining, generated_for: today(), updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,concurso_id,cargo" }).select("id,concurso_id,cargo,exam_date,daily_minutes,disciplines,discipline_weights,performance_fingerprint,allocation,schedule,days_remaining,generated_for,updated_at").single();
    if (saved.error || !saved.data) throw new Error("STUDY_PLAN_SAVE_FAILED");
    return NextResponse.json({ data: publicPlan(saved.data as StoredPlan) }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "EXAM_DATE_MUST_BE_FUTURE") return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
    return NextResponse.json({ error: "STUDY_PLAN_SAVE_FAILED" }, { status: 500, headers: noStore });
  }
}

export const GET = observeApiRoute("/api/study-plan", handleGET);
export const POST = observeApiRoute("/api/study-plan", handlePOST);

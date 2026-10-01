"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

type Contest = { id: string; titulo: string; orgao: string; prova_data: string | null; cargos: string[] | null };
type Allocation = { discipline: string; priority: number; dailyMinutes: number; answeredCount: number; errorCount: number; accuracy: number; reasons: string[] };
type StudyDay = { date: string; totalMinutes: number; sessions: Array<{ discipline: string; minutes: number }> };
type Plan = { id: string; concursoId: string; cargo: string; examDate: string; dailyMinutes: number; disciplines: string[]; allocation: Allocation[]; schedule: StudyDay[]; daysRemaining: number; generatedFor: string };
type Options = { contests: Contest[]; disciplines: string[] };

const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));

export default function StudyPlanPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [options, setOptions] = useState<Options>({ contests: [], disciplines: [] });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ concursoId: "", cargo: "", examDate: "", dailyMinutes: "60", disciplines: [] as string[] });
  const contest = useMemo(() => options.contests.find((item) => item.id === form.concursoId), [options.contests, form.concursoId]);

  async function load(active: Session) {
    setLoading(true); setError("");
    const response = await fetch("/api/study-plan", { headers: { authorization: `Bearer ${active.access_token}` }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) setError("Não foi possível carregar seu plano agora.");
    else { setOptions(payload.data.options); setPlan(payload.data.plan); }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) void load(data.session); else setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, active) => { setSession(active); if (active) void load(active); else { setPlan(null); setLoading(false); } });
    return () => data.subscription.unsubscribe();
  }, []);

  function selectContest(value: string) {
    const selected = options.contests.find((item) => item.id === value);
    setForm((current) => ({ ...current, concursoId: value, cargo: selected?.cargos?.[0] || "", examDate: selected?.prova_data || current.examDate }));
  }

  function toggleDiscipline(value: string) {
    setForm((current) => ({ ...current, disciplines: current.disciplines.includes(value) ? current.disciplines.filter((item) => item !== value) : [...current.disciplines, value] }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!session) return;
    setSaving(true); setError("");
    const response = await fetch("/api/study-plan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ ...form, dailyMinutes: Number(form.dailyMinutes) }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error === "EXAM_DATE_MUST_BE_FUTURE" ? "A data da prova precisa estar no futuro." : "Revise os dados do plano e tente novamente.");
    else setPlan(payload.data);
    setSaving(false);
  }

  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-3xl font-bold">Plano de estudos</h1><p className="mt-1 text-white/60">Agenda quantitativa que se adapta ao seu desempenho real.</p></div><Link href="/dashboard" className="text-sm text-cyan-300 hover:text-cyan-200">Ver progresso →</Link></div>
    {loading ? <div className="mt-6 glass rounded-3xl p-8">Preparando seu plano…</div> : !session ? <div className="mt-6 rounded-3xl bg-white p-8 text-zinc-900"><h2 className="font-display text-2xl font-bold">Entre para criar seu plano</h2><p className="mt-2 text-zinc-600">O plano usa seu histórico pessoal e fica vinculado à sua conta.</p><Link href="/conta" className="mt-5 inline-block rounded-full bg-zinc-900 px-6 py-3 font-bold text-white">Entrar ou criar conta</Link></div> : <>
      <form onSubmit={save} className="mt-6 rounded-3xl bg-white p-6 text-zinc-900">
        <h2 className="font-display text-xl font-bold">Configuração</h2><p className="text-sm text-zinc-500">A distribuição usa peso das questões, fraqueza, erros e proximidade da prova.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Concurso<select required value={form.concursoId} onChange={(event) => selectContest(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 p-3"><option value="">Selecione</option>{options.contests.map((item) => <option key={item.id} value={item.id}>{item.orgao} · {item.titulo}</option>)}</select></label>
          <label className="text-sm font-medium">Cargo<input required minLength={2} value={form.cargo} onChange={(event) => setForm((current) => ({ ...current, cargo: event.target.value }))} list="study-plan-cargos" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /><datalist id="study-plan-cargos">{contest?.cargos?.map((cargo) => <option key={cargo} value={cargo} />)}</datalist></label>
          <label className="text-sm font-medium">Data da prova<input required type="date" value={form.examDate} onChange={(event) => setForm((current) => ({ ...current, examDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
          <label className="text-sm font-medium">Tempo diário (minutos)<input required type="number" min="15" max="720" value={form.dailyMinutes} onChange={(event) => setForm((current) => ({ ...current, dailyMinutes: event.target.value }))} className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
        </div>
        <fieldset className="mt-5"><legend className="text-sm font-bold">Disciplinas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{options.disciplines.map((item) => <label key={item} className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm"><input type="checkbox" checked={form.disciplines.includes(item)} onChange={() => toggleDiscipline(item)} />{item}</label>)}</div></fieldset>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={saving || !form.disciplines.length} className="mt-5 rounded-full bg-zinc-900 px-6 py-3 font-bold text-white disabled:opacity-40">{saving ? "Calculando…" : plan ? "Atualizar plano" : "Criar plano"}</button>
      </form>
      {plan && <>
        <section className="mt-6 glass rounded-3xl p-6"><h2 className="font-display text-xl font-bold">Distribuição diária · {plan.dailyMinutes} min</h2><p className="text-sm text-white/50">{plan.daysRemaining} dias até a prova. Atualizado automaticamente quando seu desempenho muda.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{plan.allocation.map((item) => <article key={item.discipline} className="rounded-2xl bg-white/5 p-4"><div className="flex justify-between gap-3"><b>{item.discipline}</b><span className="font-black text-cyan-300">{item.dailyMinutes} min/dia</span></div><p className="mt-1 text-xs text-white/50">Prioridade {item.priority.toFixed(1)}% · {item.answeredCount ? `${item.errorCount} erros · ${item.accuracy.toFixed(1)}% de precisão` : "sem histórico pessoal"}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${item.priority}%` }} /></div></article>)}</div></section>
        <section className="mt-6 rounded-3xl bg-white p-6 text-zinc-900"><h2 className="font-display text-xl font-bold">Agenda dos próximos {plan.schedule.length} dias</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{plan.schedule.map((day) => <article key={day.date} className="rounded-2xl border border-zinc-200 p-4"><div className="flex justify-between"><b className="capitalize">{formatDate(day.date)}</b><span className="text-sm text-zinc-500">{day.totalMinutes} min</span></div><ul className="mt-2 space-y-1 text-sm">{day.sessions.map((session) => <li key={session.discipline} className="flex justify-between"><span>{session.discipline}</span><b>{session.minutes} min</b></li>)}</ul></article>)}</div></section>
      </>}
    </>}
  </main><Footer /></div>;
}

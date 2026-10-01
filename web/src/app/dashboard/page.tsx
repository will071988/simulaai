"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

type Summary = { attempts: number; averageScore: number; averageTimeSeconds: number; questionsAnswered: number; correctAnswers: number; errors: number; accuracy: number };
type Attempt = { attemptId: string; title: string; completedAt: string; score: number; durationSeconds: number; questionCount: number; answeredCount: number; correctCount: number; errorCount: number };
type Discipline = { discipline: string; answeredCount: number; correctCount: number; errorCount: number; accuracy: number };
type FocusDiscipline = { discipline: string; accuracy: number; answeredCount: number };
type Progress = { summary: Summary; recentAttempts: Attempt[]; evolution: Array<{ attemptId: string; completedAt: string; score: number }>; disciplines: Discipline[]; strongDisciplines: FocusDiscipline[]; weakDisciplines: FocusDiscipline[] };

const emptySummary: Summary = { attempts: 0, averageScore: 0, averageTimeSeconds: 0, questionsAnswered: 0, correctAnswers: 0, errors: 0, accuracy: 0 };

function duration(seconds: number) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(active: Session) {
    setLoading(true); setError("");
    const response = await fetch("/api/progress", { headers: { authorization: `Bearer ${active.access_token}` }, cache: "no-store" });
    if (!response.ok) setError("Não foi possível carregar seu progresso agora.");
    else setProgress((await response.json()).data);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void load(data.session); else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, active) => {
      setSession(active);
      if (active) void load(active); else { setProgress(null); setLoading(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const summary = progress?.summary || emptySummary;
  return <div className="mesh min-h-screen">
    <Header />
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="font-display text-3xl font-bold">Seu progresso</h1>
      <p className="mt-1 text-white/60">Métricas calculadas somente com suas tentativas concluídas.</p>

      {loading ? <div className="mt-6 glass rounded-3xl p-8">Calculando seu histórico…</div> : !session ? <div className="mt-6 rounded-3xl bg-white p-8 text-zinc-900">
        <h2 className="font-display text-2xl font-bold">Entre para acompanhar sua evolução</h2>
        <p className="mt-2 text-zinc-600">Tentativas anônimas continuam funcionando, mas somente as realizadas com sua conta entram no histórico pessoal.</p>
        <Link href="/conta" className="mt-5 inline-block rounded-full bg-zinc-900 px-6 py-3 font-bold text-white">Entrar ou criar conta</Link>
      </div> : error ? <p role="alert" className="mt-6 rounded-2xl bg-red-500/15 p-4 text-red-100">{error}</p> : <>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass rounded-3xl p-6"><p className="text-sm text-white/60">Precisão</p><p className="mt-1 text-3xl font-black">{Number(summary.accuracy).toFixed(1)}%</p><p className="mt-1 text-xs text-white/50">{summary.correctAnswers} acertos · {summary.errors} erros</p></div>
          <div className="glass rounded-3xl p-6"><p className="text-sm text-white/60">Simulados concluídos</p><p className="mt-1 text-3xl font-black">{summary.attempts}</p><p className="mt-1 text-xs text-white/50">{summary.questionsAnswered} questões respondidas</p></div>
          <div className="glass rounded-3xl p-6"><p className="text-sm text-white/60">Pontuação média</p><p className="mt-1 text-3xl font-black">{Number(summary.averageScore).toFixed(1)}%</p><p className="mt-1 text-xs text-white/50">média das tentativas concluídas</p></div>
          <div className="rounded-3xl bg-white p-6 text-zinc-900"><p className="text-sm text-zinc-500">Tempo médio</p><p className="mt-1 text-3xl font-black">{duration(summary.averageTimeSeconds)}</p><p className="mt-1 text-xs text-zinc-500">medido no servidor</p></div>
        </div>

        {summary.attempts === 0 ? <div className="mt-6 rounded-3xl bg-white p-8 text-zinc-900">
          <h2 className="font-display text-2xl font-bold">Seu histórico começa no próximo simulado</h2>
          <p className="mt-2 text-zinc-600">Conclua um simulado enquanto estiver conectado. Os indicadores aparecerão aqui sem estimativas ou dados fictícios.</p>
          <Link href="/simulados" className="mt-5 inline-block rounded-full bg-zinc-900 px-6 py-3 font-bold text-white">Fazer um simulado</Link>
        </div> : <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 text-zinc-900">
              <h2 className="font-display text-xl font-bold">Evolução da pontuação</h2>
              <p className="text-sm text-zinc-500">Últimas {progress!.evolution.length} tentativas, em ordem cronológica.</p>
              <div className="mt-6 flex h-48 items-end gap-2 border-b border-zinc-200">{progress!.evolution.map((item, index) => <div key={item.attemptId} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${date(item.completedAt)} · ${Number(item.score).toFixed(1)}%`}>
                <span className="text-[10px] font-bold text-zinc-500">{Number(item.score).toFixed(0)}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 to-cyan-400" style={{ height: `${Math.max(3, Number(item.score))}%` }} />
                <span className="pb-1 text-[10px] text-zinc-400">{index + 1}</span>
              </div>)}</div>
            </div>
            <div className="glass rounded-3xl p-6">
              <h2 className="font-display text-xl font-bold">Disciplinas</h2>
              <p className="text-sm text-white/50">Precisão calculada apenas nas questões respondidas.</p>
              <div className="mt-4 space-y-3">{progress!.disciplines.map((item) => <div key={item.discipline}>
                <div className="flex justify-between gap-3 text-sm"><span>{item.discipline}</span><b>{Number(item.accuracy).toFixed(1)}% · {item.answeredCount} questões</b></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Number(item.accuracy)}%` }} /></div>
              </div>)}</div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="glass rounded-3xl p-6"><h2 className="font-display text-xl font-bold">Disciplinas mais fortes</h2><ul className="mt-4 space-y-2">{progress!.strongDisciplines.map((item) => <li key={item.discipline} className="flex justify-between rounded-2xl bg-emerald-500/10 p-3 text-sm"><span>{item.discipline}</span><b>{Number(item.accuracy).toFixed(1)}%</b></li>)}</ul></div>
            <div className="glass rounded-3xl p-6"><h2 className="font-display text-xl font-bold">Prioridades de revisão</h2><ul className="mt-4 space-y-2">{progress!.weakDisciplines.map((item) => <li key={item.discipline} className="flex justify-between rounded-2xl bg-amber-500/10 p-3 text-sm"><span>{item.discipline}</span><b>{Number(item.accuracy).toFixed(1)}%</b></li>)}</ul></div>
          </section>

          <section className="mt-6 rounded-3xl bg-white p-6 text-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-bold">Últimos simulados</h2><p className="text-sm text-zinc-500">Histórico real das suas tentativas concluídas.</p></div><div className="flex gap-2"><Link href="/plano" className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-bold">Plano de estudos</Link><Link href="/simulados" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-bold text-white">Novo simulado</Link></div></div>
            <div className="mt-4 divide-y">{progress!.recentAttempts.map((attempt) => <div key={attempt.attemptId} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div><p className="font-bold">{attempt.title}</p><p className="text-xs text-zinc-500">{date(attempt.completedAt)} · {attempt.answeredCount}/{attempt.questionCount} respondidas · {attempt.correctCount} acertos · {attempt.errorCount} erros</p></div>
              <span className="text-sm text-zinc-500">{duration(attempt.durationSeconds)}</span><b className="text-lg text-violet-700">{Number(attempt.score).toFixed(1)}%</b>
            </div>)}</div>
          </section>
        </>}
      </>}
    </main>
    <Footer />
  </div>;
}

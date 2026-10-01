"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ContestOption = { id: string; titulo: string; orgao: string; banca: string | null; questionCount: number };
type Options = { concursos: ContestOption[]; cargos: string[]; disciplinas: string[]; assuntos: string[]; bancas: string[]; niveis: string[] };
type PublicQuestion = { id: string; disciplina: string; assunto: string; dificuldade: string; enunciado: string; alternativas: Array<{ key: string; text: string }> };
type Attempt = { attemptId: string; token: string; seed: string; title: string; mode: string; questions: PublicQuestion[] };
type Correction = { questionId: string; userAnswer: string | null; correctAnswer: string; isCorrect: boolean; explanation: null | { text: string; wrongAlternatives: Record<string, string>; conceptualReference: string; explanationQuality: number; confidence: number; source: string } };
type Result = { score: number; correctCount: number; total: number; durationSeconds: number; status: string; corrections: Correction[] };

const modes = [
  ["RAPIDO", "Rápido"], ["COMPLETO", "Completo"], ["POR_MATERIA", "Por matéria"],
  ["POR_ASSUNTO", "Por assunto"], ["PROVA_SIMULADA", "Prova simulada"],
] as const;

function browserSessionId() {
  const key = "simulaai-session-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function SimuladoGenerator() {
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ concursoId: "", mode: "RAPIDO", quantidade: "3", cargo: "", disciplina: "", assunto: "", banca: "", nivel: "", dificuldade: "", seed: "" });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/simulados/generate", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((payload) => setOptions(payload.data)).catch(() => setError("Não foi possível carregar as opções agora."));
  }, []);

  useEffect(() => {
    if (!attempt || result) return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [attempt, result]);

  const selectedContest = useMemo(() => options?.concursos.find((contest) => contest.id === form.concursoId), [form.concursoId, options]);
  const canGenerate = Boolean(form.concursoId && (!selectedContest || Number(form.quantidade) <= selectedContest.questionCount) &&
    (form.mode !== "POR_MATERIA" || form.disciplina) && (form.mode !== "POR_ASSUNTO" || form.assunto));

  async function generate() {
    if (!canGenerate) return;
    setBusy(true); setError(""); setResult(null); setAnswers({}); setElapsed(0);
    try {
      const recent = JSON.parse(localStorage.getItem("simulaai-recent-question-ids") || "[]") as string[];
      const body = Object.fromEntries(Object.entries({ ...form, quantidade: Number(form.quantidade), sessionId: browserSessionId(), excludeQuestionIds: recent.slice(-100) }).filter(([, value]) => value !== ""));
      const { data: auth } = await supabase.auth.getSession();
      const response = await fetch("/api/simulados/generate", { method: "POST", headers: { "content-type": "application/json", ...(auth.session ? { authorization: `Bearer ${auth.session.access_token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.error === "INSUFFICIENT_QUESTIONS") throw new Error(`Há ${payload.available} questões para esses filtros; reduza a quantidade solicitada.`);
        throw new Error("Não foi possível iniciar o simulado.");
      }
      setAttempt(payload.data);
      const ids = [...recent, ...payload.data.questions.map((question: PublicQuestion) => question.id)];
      localStorage.setItem("simulaai-recent-question-ids", JSON.stringify([...new Set(ids)].slice(-100)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível iniciar o simulado.");
    } finally { setBusy(false); }
  }

  async function complete() {
    if (!attempt) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/simulados/attempts/${attempt.attemptId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: attempt.token, answers }) });
      const payload = await response.json();
      if (!response.ok) throw new Error("Não foi possível corrigir a tentativa.");
      setResult(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível corrigir a tentativa."); }
    finally { setBusy(false); }
  }

  function reset() { setAttempt(null); setResult(null); setAnswers({}); setElapsed(0); setError(""); }

  if (attempt) return (
    <section id="gerador" className="mt-8">
      <div className="glass rounded-[28px] p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black tracking-widest text-cyan-300">{attempt.mode.replaceAll("_", " ")}</p><h2 className="font-display text-2xl font-bold">{attempt.title}</h2></div>
          <span className="rounded-full bg-white px-4 py-2 font-mono text-sm font-bold text-zinc-900">{Math.floor(elapsed / 60).toString().padStart(2, "0")}:{(elapsed % 60).toString().padStart(2, "0")}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${(Object.keys(answers).length / attempt.questions.length) * 100}%` }} /></div>
        <p className="mt-2 text-xs text-white/60">{Object.keys(answers).length}/{attempt.questions.length} respondidas · semente {attempt.seed.slice(0, 10)}</p>
      </div>

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[28px] bg-white p-7 text-zinc-900">
            <p className="text-sm font-bold text-violet-600">CORREÇÃO CONCLUÍDA NO SERVIDOR</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
              <div><h3 className="font-display text-4xl font-black">{Number(result.score).toFixed(2)}%</h3><p className="mt-1 text-zinc-600">{result.correctCount} acertos em {result.total} questões · {Math.floor(result.durationSeconds / 60)}m {result.durationSeconds % 60}s</p></div>
              <button onClick={reset} className="rounded-full bg-zinc-900 px-6 py-3 font-bold text-white">Criar outro simulado</button>
            </div>
          </div>
          {result.corrections.map((correction, index) => {
            const question = attempt.questions.find((item) => item.id === correction.questionId);
            return <article key={correction.questionId} className={`rounded-3xl border-2 bg-white p-6 text-zinc-900 ${correction.isCorrect ? "border-emerald-200" : "border-red-200"}`}>
              <p className="text-xs font-black tracking-widest text-violet-600">QUESTÃO {index + 1} · {correction.isCorrect ? "ACERTO" : "REVISAR"}</p>
              <p className="mt-2 font-medium">{question?.enunciado}</p>
              <p className="mt-3 text-sm">Sua resposta: <b>{correction.userAnswer || "Não respondida"}</b> · Resposta correta: <b>{correction.correctAnswer}</b></p>
              {correction.explanation ? <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                <h4 className="font-bold text-violet-700">Explicação confiável</h4>
                <p className="mt-1 text-sm leading-relaxed text-zinc-700">{correction.explanation.text}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Por que as demais estão erradas</p>
                <ul className="mt-2 space-y-2 text-sm text-zinc-700">{Object.entries(correction.explanation.wrongAlternatives).map(([key, reason]) => <li key={key}><b>{key})</b> {reason}</li>)}</ul>
                <p className="mt-3 border-t pt-3 text-xs text-zinc-500">Referência conceitual: {correction.explanation.conceptualReference} · qualidade {(Number(correction.explanation.explanationQuality) * 100).toFixed(0)}% · confiança {(Number(correction.explanation.confidence) * 100).toFixed(0)}%</p>
              </div> : <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Explicação não exibida: ainda não atingiu o nível mínimo de confiança.</p>}
            </article>;
          })}
        </div>
      ) : (
        <>
          {attempt.questions.map((question, index) => <article key={question.id} className="mt-4 rounded-3xl bg-white p-6 text-zinc-900">
            <p className="text-xs font-black tracking-widest text-violet-600">Q{index + 1} · {question.disciplina} · {question.dificuldade}</p>
            <p className="mt-2 font-medium leading-relaxed">{question.enunciado}</p>
            <div className="mt-4 space-y-2">{question.alternativas.map((alternative) => {
              const selected = answers[question.id] === alternative.key;
              return <label key={alternative.key} className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition ${selected ? "border-violet-600 bg-violet-50" : "border-zinc-100 hover:border-zinc-300"}`}>
                <input type="radio" name={question.id} checked={selected} onChange={() => setAnswers((current) => ({ ...current, [question.id]: alternative.key }))} className="mt-1 accent-violet-600" />
                <span><b>{alternative.key})</b> {alternative.text}</span>
              </label>;
            })}</div>
          </article>)}
          {error && <p role="alert" className="mt-4 rounded-2xl bg-red-500/20 p-4 text-sm text-red-100">{error}</p>}
          <button onClick={complete} disabled={busy} className="mt-6 w-full rounded-full bg-white py-4 text-lg font-bold text-black disabled:opacity-50">{busy ? "Corrigindo…" : "Finalizar e receber nota"}</button>
        </>
      )}
    </section>
  );

  return (
    <section id="gerador" className="mt-8 rounded-[28px] bg-gradient-to-br from-violet-500 to-cyan-400 p-[1px]">
      <div className="rounded-[27px] bg-[#0F1233] p-6 sm:p-8">
        <p className="text-xs font-black tracking-[0.2em] text-cyan-300">NOVO · MOTOR REAL</p>
        <h2 className="mt-2 font-display text-3xl font-bold">Monte seu simulado</h2>
        <p className="mt-2 text-sm text-white/65">Escolha o concurso e personalize o treino. A nota é calculada com segurança no servidor.</p>
        {!options ? <p className="mt-6 text-sm text-white/60">Carregando banco de questões…</p> : <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Concurso *<select value={form.concursoId} onChange={(event) => setForm((current) => ({ ...current, concursoId: event.target.value, banca: "", cargo: "" }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Selecione</option>{options.concursos.map((contest) => <option key={contest.id} value={contest.id}>{contest.orgao} · {contest.titulo} ({contest.questionCount})</option>)}</select></label>
          <label className="text-sm">Modo<select value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900">{modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm">Quantidade<input type="number" min="1" max={selectedContest?.questionCount || 100} value={form.quantidade} onChange={(event) => setForm((current) => ({ ...current, quantidade: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900" /></label>
          <label className="text-sm">Disciplina<select value={form.disciplina} onChange={(event) => setForm((current) => ({ ...current, disciplina: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Todas</option>{options.disciplinas.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm">Assunto<select value={form.assunto} onChange={(event) => setForm((current) => ({ ...current, assunto: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Todos</option>{options.assuntos.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm">Dificuldade<select value={form.dificuldade} onChange={(event) => setForm((current) => ({ ...current, dificuldade: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Equilibrada</option><option value="FACIL">Fácil</option><option value="MEDIO">Média</option><option value="DIFICIL">Difícil</option></select></label>
          <label className="text-sm">Cargo<select value={form.cargo} onChange={(event) => setForm((current) => ({ ...current, cargo: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Todos</option>{options.cargos.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm">Banca<select value={form.banca} onChange={(event) => setForm((current) => ({ ...current, banca: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Todas</option>{options.bancas.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm">Nível<select value={form.nivel} onChange={(event) => setForm((current) => ({ ...current, nivel: event.target.value }))} className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900"><option value="">Todos</option>{options.niveis.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm md:col-span-2">Semente reproduzível (opcional)<input value={form.seed} onChange={(event) => setForm((current) => ({ ...current, seed: event.target.value }))} maxLength={160} placeholder="Ex.: revisao-semana-1" className="mt-1 w-full rounded-xl bg-white p-3 text-zinc-900" /></label>
          <div className="flex items-end"><button onClick={generate} disabled={!canGenerate || busy} className="w-full rounded-full bg-white px-6 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Iniciando…" : "Iniciar simulado"}</button></div>
        </div>}
        {selectedContest && Number(form.quantidade) > selectedContest.questionCount && <p className="mt-4 text-sm text-amber-200">Esse concurso possui {selectedContest.questionCount} questões publicadas; reduza a quantidade.</p>}
        {error && <p role="alert" className="mt-4 rounded-2xl bg-red-500/20 p-4 text-sm text-red-100">{error}</p>}
      </div>
    </section>
  );
}

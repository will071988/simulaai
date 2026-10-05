"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";
import type { OperationAction } from "@/lib/admin/operations";

type Source = { id: string; name: string; base_url: string; enabled: boolean; health_status: string; failure_count: number; last_error_code: string | null; last_checked_at: string | null };
type Run = { id: string; started_at: string; status: string; sources_checked: number; sources_failed: number; ai_requests: number; ai_success: number; ai_invalid_schema: number; errors_count: number };
type Document = { id: string; title: string | null; source_url: string; status: string; ai_retry_count: number; ai_last_error_code: string | null; ai_next_attempt_at?: string | null; retryable?: boolean };
type Candidate = { id: string; url: string; domain: string; reason: string; confidence: number; status: string };
type Conflict = { id: string; titulo: string; orgao: string; quality_status: string };
type Duplicate = { id: string; concurso_a_id: string; concurso_b_id: string; score: number; reason: string };
type ActionLog = { id: string; action: string; target_id: string; note: string | null; created_at: string };
type Operations = {
  runs: Run[]; sources: Source[]; aiPending: Document[]; failedDocuments: Document[];
  conflictedContests: Conflict[]; duplicateCandidates: Duplicate[]; sourceCandidates: Candidate[];
  counts: { aiPending: number; failedDocuments: number; conflictedContests: number; duplicateCandidates: number; sourceCandidates: number };
  invalidSchemas: number; aiBudget: { day: string; reserved: number; limit: number };
  aiFailures: { id: string; provider: string | null; model: string | null; task_type: string | null; error_code: string | null; created_at: string }[];
  aiFailureCount7d: number;
  conflictReviews: { concurso_id: string; review_note: string; reviewed_at: string }[];
  recentActions: ActionLog[];
};

const date = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const box = "rounded-3xl border border-white/10 bg-white/5 p-5";

export default function OperationsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [officialUrls, setOfficialUrls] = useState<Record<string, string>>({});
  const requestGeneration = useRef(0);
  const currentToken = useRef<string | null>(null);

  const load = useCallback(async (accessToken: string) => {
    const generation = ++requestGeneration.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/operations", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      if (generation !== requestGeneration.current || currentToken.current !== accessToken) return;
      if (response.status === 403) { setForbidden(true); setData(null); return; }
      if (!response.ok) throw new Error("LOAD_FAILED");
      const payload = await response.json();
      if (generation !== requestGeneration.current || currentToken.current !== accessToken) return;
      setForbidden(false); setData(payload.data);
    } catch { if (generation === requestGeneration.current && currentToken.current === accessToken) setError("Não foi possível carregar o painel operacional."); }
    finally { if (generation === requestGeneration.current && currentToken.current === accessToken) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const generationRef = requestGeneration;
    const tokenRef = currentToken;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      tokenRef.current = session?.access_token || null;
      setToken(session?.access_token || null);
      setData(null);
      if (session) void load(session.access_token);
      else { generationRef.current++; setForbidden(false); setLoading(false); }
    });
    return () => { active = false; tokenRef.current = null; generationRef.current++; listener.subscription.unsubscribe(); };
  }, [load]);

  async function act(action: OperationAction) {
    if (!token || busy) return;
    if (!window.confirm(`Confirmar ${action.action} para ${action.targetId}?`)) return;
    setBusy(action.targetId); setError("");
    try {
      const response = await fetch("/api/admin/operations", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(action), cache: "no-store",
      });
      if (!response.ok) throw new Error("ACTION_FAILED");
      if (currentToken.current !== token) return;
      await load(token);
    } catch {
      if (currentToken.current === token) {
        await load(token);
        setError("Não foi possível confirmar o resultado da ação. Confira o estado e a auditoria antes de tentar novamente.");
      }
    }
    finally { setBusy(null); }
  }

  const input = (id: string, placeholder: string) => <input aria-label={placeholder} value={notes[id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder={placeholder} maxLength={2000} className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-950 px-3 py-2 text-sm text-white" />;
  const button = (label: string, action: OperationAction, disabled = false) => <button type="button" disabled={Boolean(busy) || disabled} onClick={() => void act(action)} className="mt-2 rounded-full border border-cyan-300/50 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-40">{label}</button>;

  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-7xl px-6 py-10">
    <h1 className="font-display text-3xl font-bold">Operações</h1>
    <p className="mt-2 text-white/60">Painel privado. Ações restritas, auditadas e sem SQL livre ou comandos arbitrários.</p>
    {data && token && <button type="button" onClick={() => void load(token)} disabled={loading || Boolean(busy)} className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold disabled:opacity-40">Atualizar dados</button>}
    {loading ? <p role="status" className="mt-8">Carregando acesso…</p> : !token ? <section className={`${box} mt-8`}><p>Entre com uma conta administradora para acessar o painel.</p><Link href="/conta" className="mt-3 inline-block underline">Entrar</Link></section> : forbidden ? <p role="alert" className="mt-8">Acesso restrito a administradores.</p> : data ? <div className="mt-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <section className={box}><h2 className="font-bold">Saúde do coletor</h2><p className="mt-2 text-2xl">{data.runs[0]?.status || "Sem execução"}</p><p className="text-sm text-white/60">Última execução: {date(data.runs[0]?.started_at)}</p></section>
        <section className={box}><h2 className="font-bold">Fila de IA</h2><p className="mt-2 text-2xl">{data.counts.aiPending}</p><p className="text-sm text-white/60">Documentos pendentes (até 50 exibidos)</p></section>
        <section className={box}><h2 className="font-bold">Orçamento de IA</h2><p className="mt-2 text-2xl">{data.aiBudget.reserved} / {data.aiBudget.limit}</p><p className="text-sm text-white/60">Reservas em {data.aiBudget.day}; {data.aiFailureCount7d} falhas de IA em 7 dias</p></section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={box}><h2 className="text-xl font-bold">IA pendente ({data.counts.aiPending})</h2><p className="text-sm text-white/60">Até 50 documentos mais recentes; o processamento é feito pela fila, sem disparo manual arbitrário.</p><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.aiPending.map((doc) => <article key={doc.id} className="rounded-xl bg-white/5 p-3"><b>{doc.title || "Documento sem título"}</b><p className="break-all text-xs text-white/60">{doc.source_url}</p><p className="text-xs">Próxima tentativa: {date(doc.ai_next_attempt_at)} · {doc.ai_last_error_code || "sem erro registrado"}</p></article>)}{!data.aiPending.length && <p className="text-white/60">Nenhum documento aguardando IA.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Fontes ({data.sources.length})</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.sources.map((source) => <article key={source.id} className="rounded-xl bg-white/5 p-3"><b>{source.name}</b> · {source.health_status} {source.enabled ? "" : "(desativada)"}<p className="text-xs text-white/60">{source.base_url} · {source.failure_count} falhas · última checagem {date(source.last_checked_at)}</p></article>)}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Falhas de fontes</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.sources.filter((source) => source.enabled && source.health_status !== "HEALTHY").map((source) => <article key={source.id} className="rounded-xl bg-red-500/10 p-3"><b>{source.name}</b> · {source.health_status}<p className="text-xs">{source.last_error_code || "Sem código de erro"}</p></article>)}{!data.sources.some((source) => source.enabled && source.health_status !== "HEALTHY") && <p className="text-white/60">Nenhuma fonte ativa degradada.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Documentos falhos ({data.counts.failedDocuments})</h2><div className="mt-3 max-h-96 space-y-3 overflow-auto">{data.failedDocuments.map((doc) => <article key={doc.id} className="rounded-xl bg-white/5 p-3"><b>{doc.title || doc.source_url}</b><p className="break-all text-xs text-white/60">{doc.source_url}</p><p className="text-xs">{doc.ai_last_error_code || "Falha sem código"} · {doc.ai_retry_count} tentativas</p>{button(doc.retryable ? "Tentar novamente" : "Retry indisponível", { action: "RETRY_DOCUMENT", targetId: doc.id }, !doc.retryable)}</article>)}{!data.failedDocuments.length && <p className="text-white/60">Nenhum documento falho.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Candidatos de fonte ({data.counts.sourceCandidates})</h2><div className="mt-3 max-h-96 space-y-3 overflow-auto">{data.sourceCandidates.map((candidate) => <article key={candidate.id} className="rounded-xl bg-white/5 p-3"><b>{candidate.domain}</b><p className="break-all text-xs text-white/60">{candidate.url}</p><p className="text-xs">{candidate.reason} · confiança {candidate.confidence}</p><input aria-label={`URL oficial para ${candidate.domain}`} value={officialUrls[candidate.id] || ""} onChange={(event) => setOfficialUrls((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="URL HTTPS oficial verificada" className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-950 px-3 py-2 text-sm" />{input(candidate.id, "Nota de revisão")}<div className="flex gap-2">{button("Aprovar fonte", { action: "APPROVE_SOURCE", targetId: candidate.id, officialUrl: officialUrls[candidate.id], note: notes[candidate.id] }, !officialUrls[candidate.id] || (notes[candidate.id] || "").trim().length < 5)}{button("Rejeitar candidato", { action: "REJECT_SOURCE_CANDIDATE", targetId: candidate.id, note: notes[candidate.id] }, (notes[candidate.id] || "").trim().length < 5)}</div></article>)}{!data.sourceCandidates.length && <p className="text-white/60">Nenhum candidato pendente.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Concursos em conflito ({data.counts.conflictedContests})</h2><div className="mt-3 max-h-96 space-y-3 overflow-auto">{data.conflictedContests.map((contest) => <article key={contest.id} className="rounded-xl bg-white/5 p-3"><b>{contest.titulo}</b><p className="text-xs text-white/60">{contest.orgao} · {contest.id}</p>{data.conflictReviews.find((review) => review.concurso_id === contest.id) && <p className="mt-1 text-xs text-amber-200">Última revisão: {date(data.conflictReviews.find((review) => review.concurso_id === contest.id)?.reviewed_at)}</p>}{input(contest.id, "Nota da revisão do conflito")}{button("Registrar revisão", { action: "REVIEW_CONFLICT", targetId: contest.id, note: notes[contest.id] }, (notes[contest.id] || "").trim().length < 5)}</article>)}{!data.conflictedContests.length && <p className="text-white/60">Nenhum conflito aberto.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Duplicatas candidatas ({data.counts.duplicateCandidates})</h2><div className="mt-3 max-h-96 space-y-2 overflow-auto">{data.duplicateCandidates.map((item) => <article key={item.id} className="rounded-xl bg-white/5 p-3"><b>Pontuação {item.score}</b><p className="text-xs text-white/60">{item.concurso_a_id} ↔ {item.concurso_b_id}</p><p className="text-xs">{item.reason}</p></article>)}{!data.duplicateCandidates.length && <p className="text-white/60">Nenhuma duplicata pendente.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Esquemas inválidos</h2><p className="mt-2 text-2xl">{data.invalidSchemas}</p><p className="text-sm text-white/60">Ocorrências nas últimas 20 execuções.</p><div className="mt-3 max-h-48 space-y-2 overflow-auto">{data.runs.filter((run) => run.ai_invalid_schema > 0).map((run) => <p key={run.id} className="rounded-xl bg-amber-500/10 p-2 text-sm">{date(run.started_at)} · {run.ai_invalid_schema} resposta(s) inválida(s) · execução {run.id}</p>)}{!data.runs.some((run) => run.ai_invalid_schema > 0) && <p className="text-sm text-white/60">Nenhuma ocorrência recente.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Falhas recentes de IA ({data.aiFailureCount7d} em 7 dias)</h2><p className="text-sm text-white/60">Até 30 falhas mais recentes.</p><div className="mt-3 max-h-48 space-y-2 overflow-auto">{data.aiFailures.map((item) => <p key={item.id} className="rounded-xl bg-red-500/10 p-2 text-sm">{date(item.created_at)} · {item.provider || "Provedor não informado"} · {item.error_code || "sem código"}</p>)}{!data.aiFailures.length && <p className="text-sm text-white/60">Nenhuma falha em sete dias.</p>}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Execuções recentes</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.runs.map((run) => <p key={run.id} className="rounded-xl bg-white/5 p-2 text-sm">{date(run.started_at)} · {run.status} · {run.sources_failed} fontes falhas · {run.errors_count} erros</p>)}</div></section>
        <section className={box}><h2 className="text-xl font-bold">Ações recentes</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.recentActions.map((item) => <p key={item.id} className="rounded-xl bg-white/5 p-2 text-sm">{date(item.created_at)} · {item.action} · {item.target_id}</p>)}{!data.recentActions.length && <p className="text-white/60">Nenhuma ação registrada.</p>}</div></section>
      </div>
    </div> : null}
    {error && <p role="alert" className="mt-6 rounded-xl bg-red-500/20 p-4 text-red-100">{error}</p>}
  </main><Footer /></div>;
}

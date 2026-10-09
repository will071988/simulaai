"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

type Readiness = {
  readyForCommercialLaunch: boolean;
  gates: Record<string, boolean>;
  snapshot: {
    aiPending: number;
    activeClaims: number;
    degradedSources: number;
    stripeLivemode: boolean;
    siteUrlHost: string | null;
    supportConfigured: boolean;
  };
};

const labels: Record<string, string> = {
  productionRuntime: "Runtime de produção",
  collectorBacklog: "Backlog de IA ≤ 20",
  noActiveClaims: "Sem claims ativas",
  sourcesHealthy: "Fontes ativas saudáveis",
  billingConfigured: "Billing configurado",
  billingLiveMode: "Stripe em modo live",
  supportConfigured: "Canal de suporte configurado",
  siteUrlConfigured: "URL pública HTTPS configurada",
  freeAiGuard: "Proteção FREE_AI_ONLY ativa",
};

export default function ReleaseReadinessPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const currentToken = useRef<string | null>(null);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/release-readiness", {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (currentToken.current !== accessToken) return;
      if (response.status === 403) { setForbidden(true); setData(null); return; }
      if (!response.ok) throw new Error("LOAD_FAILED");
      const payload = await response.json();
      if (currentToken.current !== accessToken) return;
      setForbidden(false); setData(payload.data);
    } catch {
      if (currentToken.current === accessToken) setError("Não foi possível calcular a prontidão de lançamento.");
    } finally {
      if (currentToken.current === accessToken) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      currentToken.current = session?.access_token || null;
      setToken(session?.access_token || null);
      if (session) void load(session.access_token);
      else { setData(null); setForbidden(false); setLoading(false); }
    });
    return () => { active = false; currentToken.current = null; listener.subscription.unsubscribe(); };
  }, [load]);

  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-5xl px-6 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-display text-3xl font-bold">Release Candidate</h1><p className="mt-2 text-white/60">Gate operacional antes de habilitar cobrança comercial.</p></div>
      {token && <button type="button" onClick={() => void load(token)} disabled={loading} className="rounded-full border border-white/20 px-5 py-2.5 font-semibold disabled:opacity-50">Revalidar</button>}
    </div>
    {loading ? <p role="status" className="mt-8">Validando gates…</p> : !token ? <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6"><p>Entre com uma conta administradora.</p><Link href="/conta" className="mt-3 inline-block underline">Entrar</Link></section> : forbidden ? <p role="alert" className="mt-8">Acesso restrito a administradores.</p> : data ? <div className="mt-8 space-y-6">
      <section className={`rounded-3xl border p-6 ${data.readyForCommercialLaunch ? "border-emerald-400/40 bg-emerald-500/10" : "border-amber-400/40 bg-amber-500/10"}`}>
        <p className="text-sm uppercase tracking-widest text-white/60">Estado</p>
        <p className="mt-2 text-3xl font-black">{data.readyForCommercialLaunch ? "PRONTO PARA LANÇAMENTO" : "AINDA BLOQUEADO"}</p>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(data.gates).map(([key, value]) => <article key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between gap-3"><span>{labels[key] || key}</span><strong className={value ? "text-emerald-300" : "text-amber-300"}>{value ? "PASS" : "BLOCK"}</strong></div></article>)}
      </div>
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
        <h2 className="font-display text-lg font-bold text-white">Snapshot operacional</h2>
        <p className="mt-3">AI_PENDING: {data.snapshot.aiPending}</p>
        <p>Claims ativas: {data.snapshot.activeClaims}</p>
        <p>Fontes degradadas: {data.snapshot.degradedSources}</p>
        <p>Stripe live: {data.snapshot.stripeLivemode ? "sim" : "não"}</p>
        <p>Host público: {data.snapshot.siteUrlHost || "não configurado"}</p>
      </section>
    </div> : null}
    {error && <p role="alert" className="mt-6 text-red-200">{error}</p>}
  </main><Footer /></div>;
}

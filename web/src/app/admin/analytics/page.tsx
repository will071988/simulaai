"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

type AnalyticsData = {
  windowDays: number;
  acquisition: { registrations: number; activeUsers: number };
  engagement: { attemptsStarted: number; attemptsCompleted: number; completionRate: number };
  monetization: { activeSubscriptions: number; newSubscriptions: number; monthlySubscribers: number; annualSubscribers: number; oneTimePurchases: number; cancellationsRequested: number; paidConversion: number; mrrBrl: number; arrBrl: number; oneTimeRevenueWindowBrl: number };
};

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const card = "rounded-3xl border border-white/10 bg-white/5 p-5";

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const currentToken = useRef<string | null>(null);

  const load = useCallback(async (accessToken: string, windowDays: number) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/analytics?days=${windowDays}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      if (currentToken.current !== accessToken) return;
      if (response.status === 403) { setForbidden(true); setData(null); return; }
      if (!response.ok) throw new Error("LOAD_FAILED");
      const payload = await response.json();
      if (currentToken.current !== accessToken) return;
      setForbidden(false); setData(payload.data);
    } catch { if (currentToken.current === accessToken) setError("Não foi possível carregar os indicadores comerciais."); }
    finally { if (currentToken.current === accessToken) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      currentToken.current = session?.access_token || null;
      setToken(session?.access_token || null);
      if (session) void load(session.access_token, days);
      else { setData(null); setForbidden(false); setLoading(false); }
    });
    return () => { active = false; currentToken.current = null; listener.subscription.unsubscribe(); };
  }, [days, load]);

  const metric = (label: string, value: string | number, hint?: string) => <article className={card}><p className="text-sm text-white/60">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p>{hint && <p className="text-xs text-white/50">{hint}</p>}</article>;

  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-7xl px-6 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-bold">Analytics comercial</h1><p className="mt-2 text-white/60">Aquisição, engajamento e monetização com dados first-party do SimulaAí.</p></div><div className="flex gap-2">{[7,30,90].map((value) => <button key={value} type="button" onClick={() => setDays(value)} className={`rounded-full px-4 py-2 text-sm ${days === value ? "bg-white text-black" : "border border-white/20"}`}>{value} dias</button>)}</div></div>
    {loading ? <p role="status" className="mt-8">Carregando métricas…</p> : !token ? <section className={`${card} mt-8`}><p>Entre com uma conta administradora.</p><Link href="/conta" className="mt-3 inline-block underline">Entrar</Link></section> : forbidden ? <p role="alert" className="mt-8">Acesso restrito a administradores.</p> : data ? <div className="mt-8 space-y-8">
      <section><h2 className="font-display text-xl font-bold">Aquisição</h2><div className="mt-3 grid gap-4 md:grid-cols-2">{metric("Novos perfis", data.acquisition.registrations)}{metric("Usuários ativos em simulados", data.acquisition.activeUsers)}</div></section>
      <section><h2 className="font-display text-xl font-bold">Engajamento</h2><div className="mt-3 grid gap-4 md:grid-cols-3">{metric("Simulados iniciados", data.engagement.attemptsStarted)}{metric("Simulados concluídos", data.engagement.attemptsCompleted)}{metric("Taxa de conclusão", pct(data.engagement.completionRate))}</div></section>
      <section><h2 className="font-display text-xl font-bold">Monetização</h2><div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{metric("Assinaturas ativas", data.monetization.activeSubscriptions, `${data.monetization.monthlySubscribers} mensal · ${data.monetization.annualSubscribers} anual`)}{metric("MRR estimado", brl(data.monetization.mrrBrl))}{metric("ARR estimado", brl(data.monetization.arrBrl))}{metric("Conversão paga", pct(data.monetization.paidConversion))}{metric("Novas assinaturas", data.monetization.newSubscriptions)}{metric("Compras avulsas", data.monetization.oneTimePurchases)}{metric("Receita avulsa", brl(data.monetization.oneTimeRevenueWindowBrl))}{metric("Cancelamentos solicitados", data.monetization.cancellationsRequested)}</div></section>
    </div> : null}
    {error && <p role="alert" className="mt-6 text-red-200">{error}</p>}
  </main><Footer /></div>;
}

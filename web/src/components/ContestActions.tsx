"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Follow = { concurso_id: string; is_favorite: boolean; is_following: boolean };

export function ContestActions({ contestId, simuladoSlug }: { contestId: string; simuladoSlug: string | null }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false);
  const [state, setState] = useState<Follow>({ concurso_id: contestId, is_favorite: false, is_following: false }); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { supabase.auth.getSession().then(async ({ data }) => {
    setSession(data.session); setReady(true); if (!data.session) return;
    const response = await fetch(`/api/follows?concursoId=${contestId}`, { headers: { authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
    if (response.ok) { const payload = await response.json(); if (payload.data.follow) setState(payload.data.follow); }
  }); }, [contestId]);
  async function save(favorite: boolean, following: boolean) {
    if (!session) { router.push("/conta"); return; }
    setSaving(true); setError(""); const response = await fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ concursoId: contestId, favorite, following }) });
    if (response.ok) setState({ concurso_id: contestId, is_favorite: favorite, is_following: following }); else setError("Não foi possível salvar agora."); setSaving(false);
  }
  return <div><div className="flex flex-wrap gap-3"><Link href={simuladoSlug ? `/simulados/${simuladoSlug}` : "/simulados"} className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3 font-bold text-white">Fazer simulado</Link><button disabled={!ready || saving} onClick={() => void save(!state.is_favorite, state.is_following)} className={`rounded-full px-6 py-3 font-bold disabled:opacity-50 ${state.is_favorite ? "bg-amber-400 text-zinc-950" : "border border-white/25"}`}>{state.is_favorite ? "★ Favorito" : "☆ Favoritar"}</button><button disabled={!ready || saving} onClick={() => void save(state.is_favorite, !state.is_following)} className={`rounded-full px-6 py-3 font-bold disabled:opacity-50 ${state.is_following ? "bg-cyan-300 text-zinc-950" : "border border-white/25"}`}>{state.is_following ? "Acompanhando" : "Acompanhar concurso"}</button></div>{error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}</div>;
}

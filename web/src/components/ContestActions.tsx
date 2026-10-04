"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createContestFollowController, initialFollowState } from "@/lib/contest-follow-controller";

export function ContestActions({ contestId }: { contestId: string; simuladoSlug?: string | null }) {
  return <ContestActionsForId key={contestId} contestId={contestId} />;
}

function ContestActionsForId({ contestId }: { contestId: string }) {
  const router = useRouter();
  const [state, setState] = useState(initialFollowState);
  const controller = useRef<ReturnType<typeof createContestFollowController> | null>(null);
  useEffect(() => {
    const instance = createContestFollowController(contestId, setState);
    controller.current = instance;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { void instance.load(session); });
    return () => { instance.dispose(); data.subscription.unsubscribe(); controller.current = null; };
  }, [contestId]);
  async function toggle(field: "favorite" | "following") {
    if (await controller.current?.toggle(field) === "login") router.push("/conta");
  }
  return <div><div className="flex flex-wrap gap-3">
    <Link href={`/simulados?concursoId=${encodeURIComponent(contestId)}#gerador`} className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3 font-bold text-white">Fazer simulado</Link>
    <button disabled={!state.ready || state.saving} aria-pressed={state.favorite} onClick={() => void toggle("favorite")} className={`rounded-full px-6 py-3 font-bold disabled:opacity-50 ${state.favorite ? "bg-amber-400 text-zinc-950" : "border border-white/25"}`}>{state.favorite ? "★ Favorito" : "☆ Favoritar"}</button>
    <button disabled={!state.ready || state.saving} aria-pressed={state.following} onClick={() => void toggle("following")} className={`rounded-full px-6 py-3 font-bold disabled:opacity-50 ${state.following ? "bg-cyan-300 text-zinc-950" : "border border-white/25"}`}>{state.following ? "Acompanhando" : "Acompanhar concurso"}</button>
  </div>{state.error && <div role="alert" className="mt-3 text-sm text-red-200"><p>{state.error}</p><button onClick={() => void controller.current?.retry()} className="mt-2 underline">Recarregar preferências</button></div>}{!state.ready && !state.error && <p role="status" className="mt-3 text-sm text-white/60">Carregando preferências…</p>}</div>;
}

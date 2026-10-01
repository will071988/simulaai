"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function AccountNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  return <>
    <Link href="/conta" className="hidden sm:inline text-sm px-4 py-2 rounded-full border border-white/15 hover:bg-white hover:text-black transition">{signedIn ? "Minha conta" : "Entrar"}</Link>
    <Link href={signedIn ? "/dashboard" : "/conta"} className="text-sm px-5 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-zinc-100 transition shimmer">{signedIn ? "Meu painel" : "Criar conta"}</Link>
  </>;
}

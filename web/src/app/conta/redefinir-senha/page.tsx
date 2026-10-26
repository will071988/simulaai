"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const invalidLink = new URLSearchParams(window.location.hash.slice(1)).has("error") || new URLSearchParams(window.location.search).has("error");
    const invalidMessage = "Este link é inválido ou expirou. Solicite um novo link em Esqueci minha senha.";
    // The SDK validates the recovery tokens; a URL flag alone never authorizes a change.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted || invalidLink) return;
      setAuthorized(Boolean(session));
    });
    supabase.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
      if (!mounted) return;
      const valid = !invalidLink && !sessionError && Boolean(sessionData.session);
      setAuthorized(valid); setLoading(false);
      if (!valid) setError(invalidMessage);
    }).catch(() => {
      if (mounted) { setLoading(false); setError(invalidMessage); }
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!authorized || busy || complete) return;
    setError("");
    if (password.length < 8) { setError("Use uma senha com pelo menos 8 caracteres."); return; }
    if (password !== confirmation) { setError("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setError(authError.code === "same_password" ? "Escolha uma senha diferente da anterior." : "Não foi possível atualizar a senha. Tente novamente ou solicite um novo link de recuperação.");
        return;
      }
      setPassword(""); setConfirmation(""); setComplete(true);
    } catch { setError("Não foi possível conectar ao serviço de autenticação. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <div className="mesh min-h-screen">
    <Header />
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold">Redefinir senha</h1>
      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm text-red-100">{error}</p>}
      {loading ? <p role="status" className="mt-6">Verificando link de recuperação…</p> : complete ? <p role="status" className="mt-6 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 p-4 text-emerald-100">Senha atualizada com sucesso. Use a nova senha no próximo acesso.</p> : authorized ? <form onSubmit={savePassword} className="mt-6 space-y-4 rounded-3xl bg-white p-6 text-zinc-900">
        <p className="text-sm text-zinc-600">Escolha uma nova senha com pelo menos 8 caracteres.</p>
        <label className="block text-sm font-semibold">Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
        <label className="block text-sm font-semibold">Confirmar nova senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
        <button disabled={busy} className="w-full rounded-full bg-zinc-900 py-3 font-bold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar nova senha"}</button>
      </form> : null}
      <Link href="/conta" className="mt-6 inline-block text-sm underline">{complete ? "Voltar à minha conta" : "Voltar para entrar ou solicitar outro link"}</Link>
    </main>
    <Footer />
  </div>;
}

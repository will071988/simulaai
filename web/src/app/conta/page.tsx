"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/lib/supabase";

type Profile = { userId: string; nome: string; email: string | null; createdAt: string; updatedAt: string };
type Mode = "entrar" | "cadastro";

function authMessage(code?: string) {
  if (code === "email_not_confirmed") return "Confirme seu e-mail antes de entrar.";
  if (code === "invalid_credentials") return "E-mail ou senha inválidos.";
  if (code === "user_already_exists") return "Já existe uma conta com este e-mail.";
  return "Não foi possível concluir a autenticação. Revise os dados e tente novamente.";
}

async function accountRequest(session: Session, method: "GET" | "PATCH" | "DELETE", body?: unknown) {
  return fetch("/api/account", {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

export default function ContaPage() {
  const [mode, setMode] = useState<Mode>("entrar");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadProfile(active: Session) {
    const response = await accountRequest(active, "GET");
    if (!response.ok) { setError("Não foi possível carregar seu perfil."); return; }
    const payload = await response.json();
    setProfile(payload.data); setNome(payload.data.nome);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setLoading(false);
      if (data.session) void loadProfile(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, active) => {
      setSession(active); setLoading(false);
      if (active) void loadProfile(active); else setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submitCredentials(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "cadastro") {
        if (nome.trim().length < 2 || password.length < 8) { setError("Informe seu nome e use uma senha com pelo menos 8 caracteres."); return; }
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}/conta` } });
        if (authError) { setError(authMessage(authError.code)); return; }
        // A successful signUp can also be an obfuscated response for an existing account.
        setNotice(data.session ? "Sessão iniciada com segurança." : "Solicitação de cadastro recebida. Se o endereço precisar de confirmação, verifique sua caixa de entrada e o spam. Se você já tem uma conta, use Entrar com sua senha original; repetir o cadastro não altera a senha.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) { setError(authMessage(authError.code)); return; }
        setNotice("Sessão iniciada com segurança.");
      }
      setPassword("");
    } finally { setBusy(false); }
  }

  async function sendMagicLink() {
    if (!email.trim()) { setError("Informe seu e-mail primeiro."); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/conta`, shouldCreateUser: false } });
    if (authError) setError("Não foi possível enviar o link. A conta precisa existir e estar apta para login.");
    else setNotice("Link mágico enviado. Verifique sua caixa de entrada.");
    setBusy(false);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(""); setNotice("");
    const response = await accountRequest(session, "PATCH", { nome });
    if (!response.ok) setError("Não foi possível salvar o perfil.");
    else { const payload = await response.json(); setProfile((current) => current ? { ...current, ...payload.data } : current); setNotice("Nome atualizado."); }
    setBusy(false);
  }

  async function logout() {
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signOut({ scope: "local" });
    if (authError) setError("Não foi possível encerrar a sessão."); else setNotice("Sessão encerrada.");
    setBusy(false);
  }

  async function exportAccountData() {
    if (!session) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account/export", { headers: { authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!response.ok) { setError("Não foi possível exportar seus dados."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "simulaai-dados.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice("Exportação concluída.");
    } finally { setBusy(false); }
  }

  async function deleteAccount() {
    if (!session || deletePhrase !== "EXCLUIR") return;
    setBusy(true); setError(""); setNotice("");
    const response = await accountRequest(session, "DELETE");
    if (!response.ok) { setError("Não foi possível excluir a conta."); setBusy(false); return; }
    await supabase.auth.signOut({ scope: "local" });
    setDeletePhrase(""); setNotice("Conta e perfil excluídos permanentemente."); setBusy(false);
  }

  return <div className="mesh min-h-screen">
    <Header />
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-white/60 hover:text-white">← Início</Link>
      <h1 className="mt-4 font-display text-4xl font-bold">{session ? "Minha conta" : "Sua conta SimulaAí"}</h1>
      <p className="mt-2 text-white/65">Identidade persistente com Supabase Auth. Coletamos apenas o necessário para personalizar sua experiência.</p>

      {notice && <p role="status" className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 p-4 text-sm text-emerald-100">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm text-red-100">{error}</p>}

      {loading ? <div className="mt-8 glass rounded-3xl p-8">Verificando sessão…</div> : session ? <div className="mt-8 space-y-5">
        <form onSubmit={saveProfile} className="rounded-3xl bg-white p-6 text-zinc-900">
          <h2 className="font-display text-xl font-bold">Perfil</h2>
          <p className="mt-1 text-sm text-zinc-500">Conta: {profile?.email || session.user.email}</p>
          <label className="mt-5 block text-sm font-semibold">Nome<input value={nome} onChange={(event) => setNome(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
          <button disabled={busy || nome.trim().length < 2} className="mt-5 rounded-full bg-zinc-900 px-6 py-3 font-bold text-white disabled:opacity-50">Salvar perfil</button>
        </form>
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xl font-bold">Sessão</h2>
          <p className="mt-1 text-sm text-white/60">Sua sessão é renovada automaticamente e pode ser encerrada neste dispositivo.</p>
          <button onClick={logout} disabled={busy} className="mt-4 rounded-full border border-white/20 px-6 py-3 font-bold hover:bg-white hover:text-black disabled:opacity-50">Sair da conta</button>
        </div>
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6">
          <h2 className="font-display text-xl font-bold text-red-100">Excluir conta</h2>
          <p className="mt-1 text-sm text-red-100/70">Esta ação remove permanentemente sua identidade e seu perfil. Digite EXCLUIR para habilitar.</p>
          <input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} aria-label="Confirmação para excluir conta" className="mt-4 w-full rounded-xl bg-white p-3 text-zinc-900" placeholder="EXCLUIR" />
          <button type="button" onClick={deleteAccount} disabled={busy || deletePhrase !== "EXCLUIR"} className="mt-4 rounded-full bg-red-600 px-6 py-3 font-bold text-white disabled:opacity-40">Excluir minha conta permanentemente</button>
        </div>
      </div> : <div className="mt-8 rounded-3xl bg-white p-6 text-zinc-900">
        <div className="flex rounded-full bg-zinc-100 p-1">
          <button onClick={() => { setMode("entrar"); setError(""); }} className={`flex-1 rounded-full px-4 py-2 text-sm font-bold ${mode === "entrar" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>Entrar</button>
          <button onClick={() => { setMode("cadastro"); setError(""); }} className={`flex-1 rounded-full px-4 py-2 text-sm font-bold ${mode === "cadastro" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>Criar conta</button>
        </div>
        <form onSubmit={submitCredentials} className="mt-6 space-y-4">
          {mode === "cadastro" && <label className="block text-sm font-semibold">Nome<input value={nome} onChange={(event) => setNome(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>}
          <label className="block text-sm font-semibold">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
          <label className="block text-sm font-semibold">Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "cadastro" ? "new-password" : "current-password"} className="mt-1 w-full rounded-xl border border-zinc-200 p-3" /></label>
          <button disabled={busy} className="w-full rounded-full bg-zinc-900 py-3 font-bold text-white disabled:opacity-50">{busy ? "Aguarde…" : mode === "cadastro" ? "Criar conta" : "Entrar"}</button>
        </form>
        {mode === "entrar" && <><div className="my-5 flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />ou<span className="h-px flex-1 bg-zinc-200" /></div><button onClick={sendMagicLink} disabled={busy || !email.trim()} className="w-full rounded-full border border-zinc-300 py-3 font-bold disabled:opacity-50">Enviar link mágico</button></>}
        <p className="mt-5 text-xs text-zinc-500">Já tem uma conta? Use Entrar com sua senha original. Repetir o cadastro não altera a senha. Ao usar link mágico, a conta precisa existir.</p>
      </div>}
    </main>
    <Footer />
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

type Entitlement = {
  premiumActive: boolean;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  oneTimeCredits: number;
};

export function BillingAccountPanel({ session }: { session: Session }) {
  const [data, setData] = useState<Entitlement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/billing/entitlement", {
      headers: { authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    if (!response.ok) { setError("Não foi possível carregar sua assinatura."); return; }
    const payload = await response.json();
    setData(payload.data);
  }

  useEffect(() => { void load(); }, [session.access_token]);

  async function openPortal() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data?.url) {
        setError("Portal de cobrança indisponível para esta conta.");
        return;
      }
      window.location.href = payload.data.url;
    } finally { setBusy(false); }
  }

  return (
    <section className="glass rounded-3xl p-6">
      <h2 className="font-display text-xl font-bold">Plano e cobrança</h2>
      {!data && !error ? <p className="mt-2 text-sm text-white/60">Carregando…</p> : null}
      {data ? (
        <div className="mt-3 text-sm text-white/70">
          <p><strong>Plano:</strong> {data.premiumActive ? "Trilha Ilimitada" : "Grátis"}</p>
          {data.subscription?.current_period_end && <p><strong>Válido até:</strong> {new Date(data.subscription.current_period_end).toLocaleDateString("pt-BR")}</p>}
          <p><strong>Créditos avulsos:</strong> {data.oneTimeCredits}</p>
          {data.subscription && (
            <button type="button" onClick={openPortal} disabled={busy} className="mt-4 rounded-full bg-white px-5 py-2.5 font-bold text-black disabled:opacity-50">
              {busy ? "Abrindo…" : "Gerenciar assinatura"}
            </button>
          )}
        </div>
      ) : null}
      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    </section>
  );
}

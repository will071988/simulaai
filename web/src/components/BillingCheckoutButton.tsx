"use client";

import { useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { BillingPlanCode } from "@/lib/billing/plans";

export function BillingCheckoutButton({
  planCode,
  children,
  className,
}: {
  planCode: BillingPlanCode;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        window.location.href = "/conta?billing=login-required";
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ planCode }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data?.url) {
        setError("Não foi possível iniciar o pagamento agora.");
        return;
      }
      window.location.href = payload.data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={checkout} disabled={busy} className={className}>
        {busy ? "Abrindo pagamento…" : children}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

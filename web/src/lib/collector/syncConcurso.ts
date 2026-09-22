import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractConcurso } from "./schemas";

function normalizeOrgao(v: string | null): string | null {
  if (!v) return null;
  const m: Record<string, string> = { "POLICIA FEDERAL": "PF", "POLÍCIA FEDERAL": "PF", PRF: "PRF", "PC-BA": "PC-BA" };
  const up = v.trim().toUpperCase();
  return m[up] || v.trim().slice(0, 80);
}
function normalizeBanca(v: string | null): string | null {
  if (!v) return null;
  const low = v.trim().toLowerCase();
  if (low.includes("cebraspe")) return "Cebraspe";
  if (low.includes("fgv")) return "FGV";
  if (low.includes("aocp")) return "Instituto AOCP";
  if (low.includes("cesgranrio")) return "Cesgranrio";
  if (low.includes("fcc")) return "FCC";
  return v.trim().slice(0, 50);
}

import { calcHotScore } from "./hotScore";

const locationMap: Record<string, { scope: string; state_code: string | null; latitude: number; longitude: number; label: string }> = {
  PF: { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia (sede)" },
  PRF: { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia (sede)" },
  INSS: { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia (sede)" },
  BACEN: { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia (sede)" },
  "PC-BA": { scope: "ESTADUAL", state_code: "BA", latitude: -12.9714, longitude: -38.5124, label: "Bahia (estadual)" },
  Transpetro: { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia (sede)" },
};

export async function syncConcursoFromDocument(
  svc: SupabaseClient,
  doc: { title: string; canonicalUrl: string },
  extracted: ExtractConcurso,
  tier: number
): Promise<number | null> {
  if (tier === 2 && !extracted.orgao) return null;
  const orgao = normalizeOrgao(extracted.orgao);
  const banca = normalizeBanca(extracted.banca);
  if (!orgao || !banca) return null;
  const loc = locationMap[orgao] || { scope: "NACIONAL", state_code: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - Brasilia" };
  const hot = calcHotScore({ status: extracted.status, vagas: extracted.vagas, tier });
  const { error } = await svc
    .from("concursos")
    .upsert({ orgao, titulo: doc.title.slice(0, 200), banca, vagas: extracted.vagas, status: extracted.status || "previsto", edital_url: doc.canonicalUrl, scope: loc.scope, state_code: loc.state_code, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label, hot_score: hot }, { onConflict: "edital_url" });
  if (error) throw new Error(`syncConcurso upsert: ${error.message}`);
  return tier === 1 ? 0.95 : 0.7;
}

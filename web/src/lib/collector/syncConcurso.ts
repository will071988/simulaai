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

type Location = { scope: string | null; state_code: string | null; city: string | null; latitude: number | null; longitude: number | null; label: string | null; confidence: number };

const locationMap: Record<string, Location> = {
  PF: { scope: "NACIONAL", state_code: null, city: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - sede administrativa em Brasilia", confidence: 1 },
  PRF: { scope: "NACIONAL", state_code: null, city: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - sede administrativa em Brasilia", confidence: 1 },
  INSS: { scope: "NACIONAL", state_code: null, city: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - sede administrativa em Brasilia", confidence: 1 },
  BACEN: { scope: "NACIONAL", state_code: null, city: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - sede administrativa em Brasilia", confidence: 1 },
  Transpetro: { scope: "NACIONAL", state_code: null, city: null, latitude: -15.7939, longitude: -47.8828, label: "Nacional - sede administrativa em Brasilia", confidence: 1 },
  "PC-BA": { scope: "ESTADUAL", state_code: "BA", city: null, latitude: -12.9714, longitude: -38.5124, label: "Bahia - abrangencia estadual", confidence: 0.9 },
  "PC-RJ": { scope: "ESTADUAL", state_code: "RJ", city: null, latitude: null, longitude: null, label: "Rio de Janeiro - abrangencia estadual", confidence: 0.9 },
};

const cityMap: Record<string, Location> = {
  "PREFEITURA DE NITEROI": { scope: "MUNICIPAL", state_code: "RJ", city: "Niteroi", latitude: -22.8832, longitude: -43.1034, label: "Niteroi - abrangencia municipal", confidence: 0.8 },
};

export function resolveLocation(orgao: string, title: string): Location {
  const normalized = `${orgao} ${title}`.toUpperCase();
  for (const [name, location] of Object.entries(cityMap)) if (normalized.includes(name)) return location;
  for (const [name, location] of Object.entries(locationMap)) if (orgao === name || normalized.includes(name)) return location;
  return { scope: null, state_code: null, city: null, latitude: null, longitude: null, label: null, confidence: 0 };
}

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
  const loc = resolveLocation(orgao, doc.title);
  const hot = calcHotScore({ status: extracted.status, vagas: extracted.vagas, salario: extracted.salario, prova_data: extracted.prova_data, tier });
  const { error } = await svc
    .from("concursos")
    .upsert({ orgao, titulo: doc.title.slice(0, 200), banca, vagas: extracted.vagas, salario: extracted.salario ?? null, prova_data: extracted.prova_data ?? null, status: extracted.status || "previsto", edital_url: doc.canonicalUrl, scope: loc.scope, state_code: loc.state_code, city: loc.city, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label, hot_score: hot }, { onConflict: "edital_url" });
  if (error) throw new Error(`syncConcurso upsert: ${error.message}`);
  return tier === 1 ? 0.95 : 0.7;
}

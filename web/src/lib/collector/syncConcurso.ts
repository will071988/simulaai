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

import { calcHotScoreWithReasons } from "./hotScore";
import { enrichDocument, valueHash, type Evidence } from "./enrichment";
import { resolveField } from "./fieldResolver";
import { scoreEntity, stableEntityKey } from "./entityResolution";

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
  doc: { title: string; canonicalUrl: string; sourceName?: string; rawText?: string; documentId?: string | null },
  extracted: ExtractConcurso,
  tier: number
): Promise<number | null> {
  if (tier === 2 && !extracted.orgao) return null;
  const orgao = normalizeOrgao(extracted.orgao);
  const banca = normalizeBanca(extracted.banca);
  if (!orgao || !banca) return null;
  const deterministic = enrichDocument(doc.title, doc.rawText || "");
  const loc = deterministic.scope ? { scope: deterministic.scope, state_code: deterministic.state_code, city: deterministic.city, latitude: null, longitude: null, label: deterministic.location_label } : resolveLocation(orgao, doc.title);
  const values = { vagas: deterministic.vagas ?? extracted.vagas, salario: deterministic.salario ?? extracted.salario ?? null, prova_data: deterministic.prova_data ?? extracted.prova_data ?? null, inscricao_inicio: deterministic.inscricao_inicio, inscricao_fim: deterministic.inscricao_fim, cadastro_reserva: deterministic.cadastro_reserva, cargos: deterministic.cargos, escolaridade: deterministic.escolaridade };
  const hot = calcHotScoreWithReasons({ status: extracted.status, vagas: values.vagas, salario: values.salario, prova_data: values.prova_data, inscricao_inicio: values.inscricao_inicio, inscricao_fim: values.inscricao_fim, tier });
  const key = stableEntityKey(orgao, banca, doc.title);
  let { data: matched } = await svc.from("concursos").select("id,orgao,banca,titulo,vagas,salario,prova_data,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,status,scope,state_code,city").eq("logical_key", key).maybeSingle();
  if (!matched) {
    const { data: candidates } = await svc.from("concursos").select("id,orgao,banca,titulo,vagas,salario,prova_data,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,status,scope,state_code,city").limit(200);
    const scored = (candidates || []).map((candidate) => ({ candidate, ...scoreEntity(candidate, { orgao, banca, titulo: doc.title }) })).sort((a, b) => b.score - a.score)[0];
    if (scored?.score >= 80 || (scored?.score >= 70 && (!banca || banca === "UNKNOWN" || !scored.candidate.banca))) matched = scored.candidate;
  }
  const incoming: Record<string, unknown> = { orgao, banca, titulo: doc.title.slice(0, 200), ...values, status: extracted.status || "previsto", scope: loc.scope, state_code: loc.state_code, city: loc.city };
  let conflicted = false;
  if (matched) for (const [field, value] of Object.entries(incoming)) {
    const { data: evidence } = await svc.from("concurso_field_evidence").select("value_json,source_tier,observed_at,source_url,evidence_text").eq("concurso_id", matched.id).eq("field_name", field);
    const decision = resolveField((matched as Record<string, unknown>)[field], value, { tier, observedAt: new Date().toISOString(), isAmendment: /retifica|altera[cç][aã]o|comunicado/i.test(`${doc.title} ${doc.rawText || ""}`) }, evidence || []);
    incoming[field] = decision.resolvedValue;
    conflicted ||= decision.conflict;
  }
  const payload = { ...incoming, edital_url: doc.canonicalUrl, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label, logical_key: key, hot_score: hot.score, hot_reasons: hot.reasons, updated_at: new Date().toISOString(), quality_status: conflicted ? "CONFLICTED" : tier === 1 && deterministic.evidence.length >= 3 ? "VERIFIED" : "PARTIAL" };
  const result = matched?.id ? await svc.from("concursos").update(payload).eq("id", matched.id).select("id").single() : await svc.from("concursos").upsert(payload, { onConflict: "edital_url" }).select("id").single();
  if (result.error || !result.data) throw new Error(`syncConcurso upsert: ${result.error?.message}`);
  const evidence: Evidence[] = [
    { field: "orgao", value: orgao, evidence: doc.title, confidence: 0.75 },
    { field: "banca", value: banca, evidence: doc.title, confidence: 0.7 },
    { field: "titulo", value: doc.title, evidence: doc.title, confidence: 0.9 },
    ...deterministic.evidence,
  ];
  for (const item of evidence) await svc.from("concurso_field_evidence").upsert({ concurso_id: result.data.id, field_name: item.field, value_json: item.value, value_hash: valueHash(item.value), source_url: doc.canonicalUrl, source_name: doc.sourceName || null, source_tier: tier, document_id: doc.documentId || null, evidence_text: item.evidence, confidence: Math.min(item.confidence, tier === 1 ? 1 : 0.7) }, { onConflict: "concurso_id,field_name,source_url,value_hash" });
  if (matched) {
    const tracked: Record<string, unknown> = { orgao, banca, titulo: doc.title.slice(0, 200), ...values, status: extracted.status || "previsto" };
    // The resolver has already determined whether the incoming evidence conflicts.
    for (const [field, nextValue] of Object.entries(tracked)) {
      const oldValue = (matched as Record<string, unknown>)[field];
      if (oldValue == null || nextValue == null || JSON.stringify(oldValue) === JSON.stringify(nextValue)) continue;
      const { data: prior } = await svc.from("concurso_field_evidence").select("source_tier,value_json").eq("concurso_id", result.data.id).eq("field_name", field).order("source_tier", { ascending: true }).limit(1).maybeSingle();
      if (prior && prior.source_tier === tier && JSON.stringify(prior.value_json) !== JSON.stringify(nextValue)) conflicted = true;
      await svc.from("concurso_changes").insert({ concurso_id: result.data.id, field_name: field, old_value: oldValue, new_value: nextValue, source_url: doc.canonicalUrl });
    }
    if (conflicted) await svc.from("concursos").update({ quality_status: "CONFLICTED" }).eq("id", result.data.id);
  }
  return tier === 1 ? 0.95 : 0.7;
}

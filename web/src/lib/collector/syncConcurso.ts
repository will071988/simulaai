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
import { resolveField, type FieldEvidence } from "./fieldResolver";
import { extractIdentitySignals, scoreEntity, stableEntityKey, type ContestIdentity } from "./entityResolution";
import { aliasesFromIdentity, aliasesFromText, findAliasCandidates, persistIdentityAliases, type IdentityAlias } from "./identityAliases";
import { resolveCanonicalContestId, resolveCanonicalContestIds } from "./canonicalContest";
import { classifyDocumentRelationship, type DocumentRelationship } from "./documentRelationship";

type Location = { scope: string | null; state_code: string | null; city: string | null; latitude: number | null; longitude: number | null; label: string | null; confidence: number };
type ContestRow = { id: string; orgao: string; banca: string | null; titulo: string; cargos?: string[] | null; escolaridade?: string[] | null; edital_number?: string | null; process_number?: string | null; official_slug?: string | null; official_source?: string | null; cargo_key?: string | null; cargo_group_key?: string | null; edital_url?: string | null; [key: string]: unknown };
export type TrackedFieldDecision = { decision: "ACCEPT_NEW" | "KEEP_CURRENT" | "CONFLICT"; conflict: boolean; resolvedValue: unknown; isAmendment: boolean };
export function resolveIncomingFields(current: Record<string, unknown>, incoming: Record<string, unknown>, evidenceByField: Record<string, FieldEvidence[]>, tier: number, relationship: DocumentRelationship) {
  const resolved = { ...incoming };
  const fieldDecisions: Record<string, TrackedFieldDecision> = {};
  const isAmendment = relationship === "RETIFICATION" || relationship === "REPUBLICATION" || relationship === "REOPENING";
  let conflicted = false;
  for (const [field, value] of Object.entries(incoming)) {
    const decision = resolveField(current[field], value, { tier, observedAt: new Date().toISOString(), isAmendment }, evidenceByField[field] || []);
    resolved[field] = decision.resolvedValue;
    fieldDecisions[field] = { decision: decision.decision, conflict: decision.conflict, resolvedValue: decision.resolvedValue, isAmendment };
    conflicted ||= decision.decision === "CONFLICT" || (decision.conflict && decision.decision !== "ACCEPT_NEW");
  }
  return { resolved, fieldDecisions, conflicted };
}
function candidateToIdentity(candidate: ContestRow): ContestIdentity { return { ...extractIdentitySignals({ title: candidate.titulo, url: candidate.official_slug ? `https://candidate.invalid/concursos/${candidate.official_slug}` : "https://candidate.invalid/", orgao: candidate.orgao, banca: candidate.banca, cargos: candidate.cargos, escolaridade: candidate.escolaridade }), editalNumber: candidate.edital_number || null, processNumber: candidate.process_number || null, officialSlug: candidate.official_slug || null, officialSource: candidate.official_source || null, cargoKey: candidate.cargo_key || null, cargoGroupKey: candidate.cargo_group_key || null }; }

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
  doc: { title: string; canonicalUrl: string; sourceName?: string; rawText?: string; documentId?: string | null; documentType?: string; publishedAt?: string },
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
  const identity = extractIdentitySignals({ title: doc.title, url: doc.canonicalUrl, rawText: doc.rawText, sourceName: doc.sourceName, orgao, banca, cargos: values.cargos, escolaridade: values.escolaridade });
  const incomingAliases = [...aliasesFromIdentity(identity, doc.sourceName, doc.canonicalUrl), ...aliasesFromText(`${doc.title}\n${doc.rawText || ""}`, doc.sourceName, doc.canonicalUrl)];
  const key = stableEntityKey(identity);
  let possibleDuplicate: { id: string; score: number; reason: string; hardConflicts: string[] } | null = null;
  const selectContest = "id,orgao,banca,titulo,vagas,salario,prova_data,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,status,scope,state_code,city,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,edital_url,logical_key";
  const aliasRows = await findAliasCandidates(svc, incomingAliases);
  const aliasContestIds = await resolveCanonicalContestIds(svc, aliasRows.map((alias) => alias.concurso_id));
  let aliasCandidate: ContestRow | null = null;
  if (aliasContestIds.length === 1) {
    const { data } = await svc.from("concursos").select(selectContest).eq("id", aliasContestIds[0]).maybeSingle();
    aliasCandidate = data as ContestRow | null;
  }
  const candidateAliases: IdentityAlias[] = aliasRows.map((alias) => ({ ...alias, source_name: "" }));
  let relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: aliasCandidate ? candidateToIdentity(aliasCandidate) : null, candidateAliases });
  let { data: matched } = aliasCandidate && relationship.relationship !== "NEW_CONTEST" && relationship.confidence >= 0.9 ? { data: aliasCandidate } : key ? await svc.from("concursos").select(selectContest).eq("logical_key", key).is("merged_into_id", null).maybeSingle() : { data: null };
  if (matched) {
    const canonicalId = await resolveCanonicalContestId(svc, matched.id);
    if (canonicalId !== matched.id) {
      const { data: canonical } = await svc.from("concursos").select(selectContest).eq("id", canonicalId).maybeSingle();
      matched = canonical as ContestRow | null;
    }
  }
  if (matched && !aliasCandidate) relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: candidateToIdentity(matched), candidateAliases });
  if (!matched) {
    const { data: candidates } = await svc.from("concursos").select(selectContest).is("merged_into_id", null).limit(200);
    const scored = (candidates || []).map((candidate) => ({ candidate, resolution: scoreEntity(candidateToIdentity(candidate), identity) })).sort((a, b) => b.resolution.score - a.resolution.score)[0];
    if (scored?.resolution.decision === "AUTO_MATCH") { matched = scored.candidate; relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: candidateToIdentity(scored.candidate) }); }
    else if (scored?.resolution.decision === "POSSIBLE_DUPLICATE") {
      // Keep a separate entity; the pair is recorded after insertion below.
      possibleDuplicate = { id: scored.candidate.id, score: scored.resolution.score, reason: scored.resolution.reason, hardConflicts: scored.resolution.hardConflicts };
    }
  }
  const incoming: Record<string, unknown> = { orgao, banca, titulo: doc.title.slice(0, 200), ...values, status: extracted.status || "previsto", scope: loc.scope, state_code: loc.state_code, city: loc.city };
  let conflicted = false;
  let fieldDecisions: Record<string, TrackedFieldDecision> = {};
  if (matched) {
    const evidenceByField: Record<string, FieldEvidence[]> = {};
    for (const field of Object.keys(incoming)) {
      const { data: evidence } = await svc.from("concurso_field_evidence").select("value_json,source_tier,observed_at,source_url,evidence_text").eq("concurso_id", matched.id).eq("field_name", field);
      evidenceByField[field] = (evidence || []) as FieldEvidence[];
    }
    const resolvedFields = resolveIncomingFields(matched as Record<string, unknown>, incoming, evidenceByField, tier, relationship.relationship);
    Object.assign(incoming, resolvedFields.resolved);
    fieldDecisions = resolvedFields.fieldDecisions;
    conflicted = resolvedFields.conflicted;
  }
  const payload = { ...incoming, edital_url: matched?.edital_url || doc.canonicalUrl, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label, logical_key: matched?.logical_key || key || `TEMP:${valueHash(doc.canonicalUrl)}`, edital_number: identity.editalNumber || matched?.edital_number || null, process_number: identity.processNumber || matched?.process_number || null, official_slug: identity.officialSlug || matched?.official_slug || null, official_source: identity.officialSource || matched?.official_source || null, cargo_key: identity.cargoKey || matched?.cargo_key || null, cargo_group_key: identity.cargoGroupKey || matched?.cargo_group_key || null, hot_score: hot.score, hot_reasons: hot.reasons, updated_at: new Date().toISOString(), quality_status: conflicted ? "CONFLICTED" : tier === 1 && deterministic.evidence.length >= 3 ? "VERIFIED" : "PARTIAL" };
  const result = matched?.id ? await svc.from("concursos").update(payload).eq("id", matched.id).select("id").single() : await svc.from("concursos").upsert(payload, { onConflict: "edital_url" }).select("id").single();
  if (result.error || !result.data) throw new Error(`syncConcurso upsert: ${result.error?.message}`);
  const persistedRelationship: DocumentRelationship = matched ? relationship.relationship : "ORIGINAL";
  console.info(JSON.stringify({ event: "relationship_detected", relationship: persistedRelationship, confidence: relationship.confidence, reasons: relationship.reasons, hardConflicts: relationship.hardConflicts }));
  await persistIdentityAliases(svc, result.data.id, incomingAliases);
  if (doc.documentId) {
    const { error } = await svc.from("concurso_documents").upsert({ concurso_id: result.data.id, collector_document_id: doc.documentId, document_type: doc.documentType || null, relationship_type: persistedRelationship, source_url: doc.canonicalUrl, source_name: doc.sourceName || null, published_at: doc.publishedAt || null, is_current: true }, { onConflict: "collector_document_id" });
    if (error) throw new Error(`persist document relationship: ${error.message}`);
  }
  if (possibleDuplicate && possibleDuplicate.id !== result.data.id) await svc.from("concurso_duplicate_candidates").upsert({ concurso_a_id: possibleDuplicate.id, concurso_b_id: result.data.id, score: possibleDuplicate.score, reason: possibleDuplicate.reason, hard_conflicts: possibleDuplicate.hardConflicts, identity_signals: identity, status: "POSSIBLE_DUPLICATE" }, { onConflict: "concurso_a_id,concurso_b_id" });
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
      const decision = fieldDecisions[field];
      if (!decision || decision.decision !== "ACCEPT_NEW" || JSON.stringify(oldValue) === JSON.stringify(decision.resolvedValue)) continue;
      const { error } = await svc.from("concurso_changes").insert({ concurso_id: result.data.id, field_name: field, old_value: oldValue, new_value: decision.resolvedValue, source_url: doc.canonicalUrl, relationship_type: persistedRelationship });
      if (error) throw new Error(`persist concurso change: ${error.message}`);
    }
    if (conflicted) await svc.from("concursos").update({ quality_status: "CONFLICTED" }).eq("id", result.data.id);
  }
  return tier === 1 ? 0.95 : 0.7;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractConcurso } from "./schemas";

function normalizeOrgao(v: string | null): string | null {
  if (!v) return null;
  const m: Record<string, string> = { "POLICIA FEDERAL": "PF", "POLÍCIA FEDERAL": "PF", PRF: "PRF", "PC-BA": "PC-BA" };
  const up = v.trim().toUpperCase();
  return m[up] || v.trim().slice(0, 100);
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
import { aliasesFromIdentity, aliasesFromText, findAliasCandidates, type IdentityAlias } from "./identityAliases";
import { resolveCanonicalContestId, resolveCanonicalContestIds } from "./canonicalContest";
import { classifyDocumentRelationship, type DocumentRelationship } from "./documentRelationship";
import { deriveQualityStatus } from "./publicationPolicy";
import { canTransitionContestStatus, normalizeContestStatus, resolveEvidencedContestStatus } from "./contestStatus";

type Location = { scope: string | null; state_code: string | null; city: string | null; latitude: number | null; longitude: number | null; label: string | null; confidence: number };
type ContestRow = { id: string; orgao: string; banca: string | null; titulo: string; cargos?: string[] | null; escolaridade?: string[] | null; edital_number?: string | null; process_number?: string | null; official_slug?: string | null; official_source?: string | null; cargo_key?: string | null; cargo_group_key?: string | null; edital_url?: string | null; logical_key?: string | null; quality_status?: string | null; merged_into_id?: string | null; [key: string]: unknown };
export type SyncConcursoResult = { concursoId: string; created: boolean; updated: boolean; conflicted: boolean; publishable: boolean; duplicateCandidate: boolean };
export type TrackedFieldDecision = { decision: "ACCEPT_NEW" | "KEEP_CURRENT" | "CONFLICT"; conflict: boolean; resolvedValue: unknown; isAmendment: boolean };
export function resolveIncomingFields(current: Record<string, unknown>, incoming: Record<string, unknown>, evidenceByField: Record<string, FieldEvidence[]>, tier: number, relationship: DocumentRelationship, observedAt = new Date().toISOString()) {
  const resolved = { ...incoming };
  const fieldDecisions: Record<string, TrackedFieldDecision> = {};
  const isAmendment = relationship === "RETIFICATION" || relationship === "REPUBLICATION" || relationship === "REOPENING";
  let conflicted = false;
  for (const [field, value] of Object.entries(incoming)) {
    const decision = resolveField(current[field], value, { tier, observedAt, isAmendment }, evidenceByField[field] || []);
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
  doc: { title: string; canonicalUrl: string; sourceName?: string; rawText?: string; documentId?: string | null; documentType?: string; publishedAt?: string; contestUrl?: string; identityTitle?: string; expectedContentHash?: string | null; claimToken?: string | null; metadata?: Record<string, unknown> },
  extracted: ExtractConcurso,
  tier: number
): Promise<SyncConcursoResult | null> {
  if (tier !== 1) return null;
  const orgao = normalizeOrgao(extracted.orgao);
  const banca = normalizeBanca(extracted.banca);
  if (!orgao || !banca) return null;
  const normalizeText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const sourceText = `${doc.title}\n${doc.rawText || ""}`;
  if (!normalizeText(sourceText).includes(normalizeText(extracted.orgao || orgao))) return null;
  if (normalizeBanca(doc.sourceName || null) !== banca && !normalizeText(sourceText).includes(normalizeText(banca))) return null;
  const deterministic = enrichDocument(doc.title, doc.rawText || "");
  const rawText = doc.rawText || "";
  const aiEvidence = extracted.evidence || {};
  const hasLiteralEvidence = (field: keyof typeof aiEvidence) => {
    const snippet = aiEvidence[field];
    return typeof snippet === "string" && snippet.trim().length >= 3 && rawText.toLocaleLowerCase("pt-BR").includes(snippet.trim().toLocaleLowerCase("pt-BR"));
  };
  const aiValue = <T>(field: keyof typeof aiEvidence, value: T | null | undefined): T | null => hasLiteralEvidence(field) && value != null ? value : null;
  const fallbackLocation = resolveLocation(orgao, doc.identityTitle || doc.title);
  const loc = deterministic.scope
    ? { scope: deterministic.scope, state_code: deterministic.state_code, city: deterministic.city, latitude: fallbackLocation.latitude, longitude: fallbackLocation.longitude, label: deterministic.location_label || fallbackLocation.label }
    : fallbackLocation;
  const values = {
    vagas: deterministic.vagas ?? aiValue("vagas", extracted.vagas),
    salario: deterministic.salario ?? aiValue("salario", extracted.salario),
    prova_data: deterministic.prova_data ?? aiValue("prova_data", extracted.prova_data),
    inscricao_inicio: deterministic.inscricao_inicio ?? aiValue("inscricao_inicio", extracted.inscricao_inicio),
    inscricao_fim: deterministic.inscricao_fim ?? aiValue("inscricao_fim", extracted.inscricao_fim),
    cadastro_reserva: deterministic.cadastro_reserva ?? aiValue("cadastro_reserva", extracted.cadastro_reserva),
    cargos: deterministic.cargos.length ? deterministic.cargos : aiValue("cargos", extracted.cargos) || [],
    escolaridade: deterministic.escolaridade.length ? deterministic.escolaridade : aiValue("escolaridade", extracted.escolaridade) || [],
  };
  const evidencedStatus = resolveEvidencedContestStatus({ value: extracted.status, evidence: aiEvidence.status, rawText, sourceTier: tier });
  const hot = calcHotScoreWithReasons({ status: evidencedStatus, vagas: values.vagas, salario: values.salario, prova_data: values.prova_data, inscricao_inicio: values.inscricao_inicio, inscricao_fim: values.inscricao_fim, tier });
  const identity = extractIdentitySignals({ title: doc.identityTitle || doc.title, url: doc.contestUrl || doc.canonicalUrl, rawText: doc.rawText, sourceName: doc.sourceName, orgao, banca, cargos: values.cargos, escolaridade: values.escolaridade });
  const incomingAliases = [...aliasesFromIdentity(identity, doc.sourceName, doc.canonicalUrl), ...aliasesFromText(`${doc.title}\n${doc.rawText || ""}`, doc.sourceName, doc.canonicalUrl)];
  const key = stableEntityKey(identity);
  let possibleDuplicate: { id: string; score: number; reason: string; hardConflicts: string[] } | null = null;
  const selectContest = "id,orgao,banca,titulo,vagas,salario,prova_data,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,status,scope,state_code,city,edital_number,process_number,official_slug,official_source,cargo_key,cargo_group_key,edital_url,logical_key,quality_status,merged_into_id,updated_at";
  const aliasRows = await findAliasCandidates(svc, incomingAliases);
  const aliasContestIds = await resolveCanonicalContestIds(svc, aliasRows.map((alias) => alias.concurso_id));
  let aliasCandidate: ContestRow | null = null;
  if (aliasContestIds.length === 1) {
    const { data, error } = await svc.from("concursos").select(selectContest).eq("id", aliasContestIds[0]).maybeSingle();
    if (error) throw new Error("IDENTITY_QUERY_FAILED");
    aliasCandidate = data as ContestRow | null;
  }
  const candidateAliases: IdentityAlias[] = aliasRows.map((alias) => ({ ...alias, source_name: "" }));
  let relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: aliasCandidate ? candidateToIdentity(aliasCandidate) : null, candidateAliases });
  const officialUrlMatch = await svc.from("concursos").select(selectContest).eq("edital_url", doc.canonicalUrl).limit(1).maybeSingle();
  if (officialUrlMatch.error) throw new Error("OFFICIAL_URL_QUERY_FAILED");
  const matchedByOfficialUrl = Boolean(officialUrlMatch.data);
  const matchQuery = officialUrlMatch.data
    ? officialUrlMatch
    : aliasCandidate && relationship.relationship !== "NEW_CONTEST" && relationship.confidence >= 0.9
      ? { data: aliasCandidate, error: null }
      : key
        ? await svc.from("concursos").select(selectContest).eq("logical_key", key).is("merged_into_id", null).maybeSingle()
        : { data: null, error: null };
  if (matchQuery.error) throw new Error("IDENTITY_QUERY_FAILED");
  let matched = matchQuery.data;
  if (matched) {
    const canonicalId = await resolveCanonicalContestId(svc, matched.id);
    if (canonicalId !== matched.id) {
      const { data: canonical, error } = await svc.from("concursos").select(selectContest).eq("id", canonicalId).maybeSingle();
      if (error) throw new Error("CANONICAL_QUERY_FAILED");
      matched = canonical as ContestRow | null;
    }
  }
  if (matched && !aliasCandidate) relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: candidateToIdentity(matched), candidateAliases });
  if (matched && matchedByOfficialUrl && relationship.relationship === "NEW_CONTEST") {
    relationship = { relationship: "SAME_CONTEST_UPDATE", confidence: 1, reasons: ["EXACT_OFFICIAL_URL"], hardConflicts: [] };
  }
  if (matched && relationship.relationship === "NEW_CONTEST") matched = null;
  if (!matched) {
    const { data: candidates, error } = await svc.from("concursos").select(selectContest).is("merged_into_id", null).limit(200);
    if (error) throw new Error("CANDIDATES_QUERY_FAILED");
    const scoredCandidates = (candidates || []).map((candidate) => ({ candidate, resolution: scoreEntity(candidateToIdentity(candidate), identity) })).sort((a, b) => b.resolution.score - a.resolution.score);
    const scored = scoredCandidates[0];
    const ambiguous = scored?.resolution.decision === "AUTO_MATCH" && scoredCandidates[1]?.resolution.decision === "AUTO_MATCH" && scoredCandidates[1].resolution.score === scored.resolution.score;
    if (scored?.resolution.decision === "AUTO_MATCH" && !ambiguous) { matched = scored.candidate; relationship = classifyDocumentRelationship({ title: doc.title, rawText: doc.rawText, incoming: identity, candidate: candidateToIdentity(scored.candidate) }); }
    else if (scored?.resolution.decision === "POSSIBLE_DUPLICATE" || ambiguous) {
      // Keep a separate entity; the pair is recorded after insertion below.
      possibleDuplicate = { id: scored.candidate.id, score: scored.resolution.score, reason: scored.resolution.reason, hardConflicts: scored.resolution.hardConflicts };
    }
  }
  const previousStatus = normalizeContestStatus(typeof matched?.status === "string" ? matched.status : null);
  const transitionIsAmendment = ["RETIFICATION", "REPUBLICATION", "REOPENING"].includes(relationship.relationship);
  const acceptedStatus = evidencedStatus && canTransitionContestStatus(previousStatus, evidencedStatus, { sourceTier: tier, hasEvidence: true, isAmendment: transitionIsAmendment }) ? evidencedStatus : (matched?.status ?? null);
  const incoming: Record<string, unknown> = { orgao, banca, titulo: matched?.titulo || doc.title.slice(0, 200), ...values, status: acceptedStatus, scope: loc.scope, state_code: loc.state_code, city: loc.city };
  let conflicted = false;
  let fieldDecisions: Record<string, TrackedFieldDecision> = {};
  if (matched) {
    const evidenceByField: Record<string, FieldEvidence[]> = {};
    for (const field of Object.keys(incoming)) {
      const { data: evidence, error } = await svc.from("concurso_field_evidence").select("value_json,source_tier,observed_at,source_url,evidence_text").eq("concurso_id", matched.id).eq("field_name", field).is("invalidation_reason", null);
      if (error) throw new Error("FIELD_EVIDENCE_QUERY_FAILED");
      evidenceByField[field] = (evidence || []) as FieldEvidence[];
    }
    const resolvedFields = resolveIncomingFields(matched as Record<string, unknown>, incoming, evidenceByField, tier, relationship.relationship, doc.publishedAt || new Date().toISOString());
    Object.assign(incoming, resolvedFields.resolved);
    fieldDecisions = resolvedFields.fieldDecisions;
    conflicted = resolvedFields.conflicted;
  }
  const preliminaryQuality = deriveQualityStatus({ current: matched?.quality_status, conflicted, sourceTier: tier, officialEvidenceCount: tier === 1 ? deterministic.evidence.length : 0 });
  const payload = { ...incoming, edital_url: matched?.edital_url || doc.canonicalUrl, latitude: loc.latitude, longitude: loc.longitude, location_label: loc.label, logical_key: matched?.logical_key || key || `TEMP:${valueHash(doc.canonicalUrl)}`, edital_number: identity.editalNumber || matched?.edital_number || null, process_number: identity.processNumber || matched?.process_number || null, official_slug: identity.officialSlug || matched?.official_slug || null, official_source: identity.officialSource || matched?.official_source || null, cargo_key: identity.cargoKey || matched?.cargo_key || null, cargo_group_key: identity.cargoGroupKey || matched?.cargo_group_key || null, hot_score: hot.score, hot_reasons: hot.reasons, updated_at: new Date().toISOString(), quality_status: preliminaryQuality, is_publishable: false };
  const persistedRelationship: DocumentRelationship = matched ? relationship.relationship : "ORIGINAL";
  const evidence: Evidence[] = [
    { field: "orgao", value: orgao, evidence: extracted.orgao || orgao, confidence: 0.9 },
    { field: "banca", value: banca, evidence: normalizeBanca(doc.sourceName || null) === banca ? `Fonte oficial: ${doc.sourceName}` : banca, confidence: 0.9 },
    { field: "titulo", value: doc.title.slice(0, 200), evidence: doc.title, confidence: 0.9 },
    ...deterministic.evidence,
  ];
  for (const [field, snippet] of Object.entries(aiEvidence)) {
    const value = (values as Record<string, unknown>)[field];
    if (typeof snippet === "string" && value != null && hasLiteralEvidence(field as keyof typeof aiEvidence)) evidence.push({ field, value, evidence: snippet, confidence: 0.65 });
  }
  const changes: Record<string, unknown>[] = [];
  if (matched) {
    const tracked: Record<string, unknown> = { orgao, banca, ...values, status: acceptedStatus };
    // The resolver has already determined whether the incoming evidence conflicts.
    for (const [field, nextValue] of Object.entries(tracked)) {
      const oldValue = (matched as Record<string, unknown>)[field];
      if (oldValue == null || nextValue == null || JSON.stringify(oldValue) === JSON.stringify(nextValue)) continue;
      const decision = fieldDecisions[field];
      if (!decision || decision.decision !== "ACCEPT_NEW" || JSON.stringify(oldValue) === JSON.stringify(decision.resolvedValue)) continue;
      const matchingEvidence = evidence.find((item) => item.field === field && JSON.stringify(item.value) === JSON.stringify(decision.resolvedValue));
      changes.push({ field_name: field, old_value: oldValue, new_value: decision.resolvedValue, source_url: doc.canonicalUrl, source_name: doc.sourceName || null, source_tier: tier, evidence_text: matchingEvidence?.evidence || aiEvidence[field as keyof typeof aiEvidence] || doc.title, observed_at: doc.publishedAt || new Date().toISOString(), relationship_type: persistedRelationship });
    }
  }
  if (!doc.documentId) throw new Error("COLLECTOR_DOCUMENT_REQUIRED");
  const { data: committed, error: commitError } = await svc.rpc("persist_contest_document", { p_plan: {
    contest_id: matched?.id || null,
    expected_updated_at: matched?.updated_at || null,
    payload,
    aliases: incomingAliases,
    document: { collector_document_id: doc.documentId, document_type: doc.documentType || null, relationship_type: persistedRelationship, source_url: doc.canonicalUrl, source_name: doc.sourceName || null, published_at: doc.publishedAt || null, expected_content_hash: doc.expectedContentHash || null, claim_token: doc.claimToken || null, metadata: doc.metadata || null },
    evidence: evidence.map((item) => ({ field_name: item.field, value_json: item.value, value_hash: valueHash(item.value), source_url: doc.canonicalUrl, source_name: doc.sourceName || null, source_tier: tier, document_id: doc.documentId, evidence_text: item.evidence, confidence: Math.min(item.confidence, tier === 1 ? 1 : 0.7), observed_at: doc.publishedAt || null })),
    changes,
    duplicate: possibleDuplicate ? { ...possibleDuplicate, identity } : null,
  } });
  if (commitError || !committed) {
    const safeDatabaseCodes = [
      "CONTEST_CHANGED_RETRY", "CANONICAL_CHANGED_RETRY", "DOCUMENT_VERSION_CHANGED", "DOCUMENT_CLAIM_CHANGED",
      "DOCUMENT_SOURCE_MISMATCH", "DOCUMENT_SOURCE_REQUIRED", "FIELD_EVIDENCE_REQUIRED", "DOCUMENT_ALREADY_ASSIGNED",
      "EVIDENCE_SOURCE_MISMATCH", "EVIDENCE_TIER_MISMATCH",
    ];
    const safeCode = safeDatabaseCodes.find((code) => commitError?.message.startsWith(code));
    if (safeCode) throw new Error(safeCode);
    if (process.env.COLLECTOR_DEBUG_SAFE_ERRORS === "true" && commitError) {
      const databaseCode = String(commitError.code || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 20);
      const safeMessage = String(commitError.message || "UNKNOWN")
        .replace(/[^A-Z0-9_ :.,()/-]/gi, "")
        .slice(0, 180);
      throw new Error(`CONTEST_ATOMIC_PERSISTENCE_FAILED:${databaseCode}:${safeMessage}`);
    }
    throw new Error("CONTEST_ATOMIC_PERSISTENCE_FAILED");
  }
  return committed as SyncConcursoResult;
}

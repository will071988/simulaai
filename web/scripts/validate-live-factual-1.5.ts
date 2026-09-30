import assert from "node:assert/strict";
import { supabaseService } from "../src/lib/supabase-server";
import { enrichDocument } from "../src/lib/collector/enrichment";

const SAMPLE_IDS = [
  "84e7028e-23c4-413a-801f-5b4aeba88b0e", // FGV retification PDF
  "bbd807a7-f4a9-44e5-bdd3-fc0e981696ff", // Cebraspe
  "fe245b69-71dd-4b10-bb1e-5d1d9fdd3c0a", // Cebraspe
  "0174d5f2-4743-4d8d-a452-b225607bc7d9", // FGV original
  "df9c0303-e6eb-4e50-ba58-0b772a46b17a", // FGV update
  "11808a4d-bb94-4157-a0a9-655a8dbb6577", // FGV update
  "fc7a7f53-7361-44be-a835-0217e8c39e96", // FGV update
  "e8cd7301-e5f7-437c-abd0-5ce82bef62d7", // FGV update
];

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

function availableFields(title: string, rawText: string, metadata: Record<string, unknown>) {
  const deterministic = enrichDocument(title, rawText);
  const fields = new Set<string>(["titulo", "banca"]);
  const extracted = (metadata.ai_extracted || {}) as Record<string, unknown>;
  if (typeof extracted.orgao === "string" && extracted.orgao.trim()) fields.add("orgao");
  for (const field of ["vagas", "salario", "inscricao_inicio", "inscricao_fim", "prova_data", "cadastro_reserva", "scope", "state_code", "city"] as const) {
    if (deterministic[field] != null) fields.add(field);
  }
  if (deterministic.cargos.length) fields.add("cargos");
  if (deterministic.escolaridade.length) fields.add("escolaridade");
  return fields;
}

async function main() {
  const db = supabaseService();
  const [{ data: documents, error: documentsError }, { data: relations, error: relationsError }, { data: evidence, error: evidenceError }, { data: sources, error: sourcesError }] = await Promise.all([
    db.from("collector_documents").select("id,source_id,title,document_type,status,canonical_url,source_url,raw_text,metadata").in("id", SAMPLE_IDS),
    db.from("concurso_documents").select("collector_document_id,relationship_type,source_name,source_url").in("collector_document_id", SAMPLE_IDS),
    db.from("concurso_field_evidence").select("document_id,field_name,evidence_text,source_name,source_tier").in("document_id", SAMPLE_IDS),
    db.from("collector_sources").select("id,name,base_url,tier"),
  ]);
  for (const [name, result] of Object.entries({ documentsError, relationsError, evidenceError, sourcesError })) assert.equal(result, null, `${name}: ${result?.message}`);
  assert.equal(documents?.length, SAMPLE_IDS.length, "factual sample must contain exactly eight existing documents");

  const sourceById = new Map((sources || []).map((source) => [source.id, source]));
  const sourceByName = new Map((sources || []).map((source) => [source.name, source]));
  const relationByDocument = new Map((relations || []).map((relation) => [relation.collector_document_id, relation]));
  const evidenceByDocument = new Map<string, typeof evidence>();
  for (const item of evidence || []) evidenceByDocument.set(item.document_id, [...(evidenceByDocument.get(item.document_id) || []), item]);

  let supportedClaims = 0;
  let totalClaims = 0;
  let availableClaims = 0;
  let coveredClaims = 0;
  const rows = (documents || []).map((document) => {
    const relation = relationByDocument.get(document.id);
    const source = sourceById.get(document.source_id) || sourceByName.get(relation?.source_name || "");
    assert.ok(source && ["FGV", "Cebraspe"].includes(source.name), `unexpected source for ${document.id}`);
    const officialUrl = relation?.source_url || document.canonical_url || document.source_url;
    assert.equal(new URL(officialUrl).protocol, "https:", `non-HTTPS official URL for ${document.id}`);
    assert.equal(new URL(officialUrl).hostname, new URL(source.base_url).hostname, `source host mismatch for ${document.id}`);
    const rawText = document.raw_text || "";
    const searchable = normalize(`${document.title}\n${rawText}`);
    const metadata = (document.metadata || {}) as Record<string, unknown>;
    const available = availableFields(document.title || "", rawText, metadata);
    const claims = evidenceByDocument.get(document.id) || [];
    const covered = new Set<string>();
    const unsupported: string[] = [];
    for (const claim of claims) {
      totalClaims++;
      const attestedBanca = claim.field_name === "banca" && claim.evidence_text === `Fonte oficial: ${source.name}`;
      const literal = Boolean(claim.evidence_text && searchable.includes(normalize(claim.evidence_text)));
      const supported = claim.source_tier === 1 && (literal || attestedBanca);
      if (supported) {
        supportedClaims++;
        covered.add(claim.field_name);
      } else unsupported.push(claim.field_name);
    }
    availableClaims += available.size;
    coveredClaims += [...available].filter((field) => covered.has(field)).length;
    return {
      id: document.id,
      source: source.name,
      title: document.title,
      type: document.document_type,
      status: document.status,
      relationship: relation?.relationship_type || null,
      availableFacts: available.size,
      evidencedFacts: [...available].filter((field) => covered.has(field)).length,
      evidenceClaims: claims.length,
      unsupportedClaims: unsupported,
    };
  });

  const precision = totalClaims === 0 ? 0 : supportedClaims / totalClaims;
  const coverage = availableClaims === 0 ? 0 : coveredClaims / availableClaims;
  assert.ok(rows.some((row) => row.source === "FGV"), "FGV missing from factual sample");
  assert.ok(rows.some((row) => row.source === "Cebraspe"), "Cebraspe missing from factual sample");
  assert.ok(rows.some((row) => row.relationship === "RETIFICATION" && row.type === "RETIFICATION"), "official retification PDF missing from factual sample");
  assert.ok(rows.some((row) => row.relationship !== "RETIFICATION"), "edital/original document missing from factual sample");
  const report = {
    projectRef: "ukwulespvvthyjqgrjfo",
    sampleSize: rows.length,
    sources: Object.fromEntries(["FGV", "Cebraspe"].map((name) => [name, rows.filter((row) => row.source === name).length])),
    documentTypes: Object.fromEntries([...new Set(rows.map((row) => row.type))].map((type) => [type, rows.filter((row) => row.type === type).length])),
    precision: Number((precision * 100).toFixed(2)),
    coverage: Number((coverage * 100).toFixed(2)),
    supportedClaims,
    totalClaims,
    coveredClaims,
    availableClaims,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  assert.ok(precision >= 0.95, `factual precision below target: ${(precision * 100).toFixed(2)}%`);
}

main();

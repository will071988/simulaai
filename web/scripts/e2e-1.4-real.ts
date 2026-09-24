import assert from "node:assert/strict";
import { extractPdfText } from "../src/lib/collector/http";
import { extractIdentitySignals } from "../src/lib/collector/entityResolution";
import { classifyDocumentRelationship } from "../src/lib/collector/documentRelationship";
import { aliasesFromIdentity } from "../src/lib/collector/identityAliases";
import { supabaseService } from "../src/lib/supabase-server";
import { syncConcursoFromDocument } from "../src/lib/collector/syncConcurso";

async function main() {
  const originalUrl = "https://conhecimento.fgv.br/concursos/pms2026";
  const updateUrl = "https://conhecimento.fgv.br/sites/default/files/concursos/3-retificacao-do-edital-n-01-de-2026.pdf";
  const originalResponse = await fetch(originalUrl);
  const updateResponse = await fetch(updateUrl);
  assert.equal(originalResponse.ok, true);
  assert.equal(updateResponse.ok, true);
  const updatePdf = await extractPdfText(Buffer.from(await updateResponse.arrayBuffer()));

  const candidate = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026", url: originalUrl, sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV" });
  const incoming = extractIdentitySignals({ title: "3ª Retificação do Edital nº 01/2026 - Prefeitura Municipal do Salvador", url: updateUrl, rawText: updatePdf.text, sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV" });
  const relationship = classifyDocumentRelationship({ title: "3ª Retificação do Edital nº 01/2026 - Prefeitura Municipal do Salvador", rawText: updatePdf.text, incoming, candidate, candidateAliases: aliasesFromIdentity(candidate, "FGV", originalUrl) });
  assert.equal(relationship.relationship, "RETIFICATION");
  assert.ok(relationship.confidence >= 0.8);
  if (process.env.E2E_PERSIST === "1") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    assert.equal(new URL(supabaseUrl).hostname, "ukwulespvvthyjqgrjfo.supabase.co", "aborting: unexpected Supabase project ref");
    const svc = supabaseService();
    const { data: originalContest, error: originalError } = await svc.from("concursos").select("id").eq("edital_url", originalUrl).maybeSingle();
    assert.equal(originalError, null, originalError?.message);
    assert.ok(originalContest?.id, "original contest must already exist before persistent E2E");
    const { data: collectorDocument, error: documentError } = await svc.from("collector_documents").select("id").eq("canonical_url", updateUrl).maybeSingle();
    assert.equal(documentError, null, documentError?.message);
    assert.ok(collectorDocument?.id, "retification collector document must already be ingested");
    await syncConcursoFromDocument(svc, { title: "3ª Retificação do Edital nº 01 de 2026 - Prefeitura Municipal do Salvador", canonicalUrl: updateUrl, sourceName: "FGV", rawText: updatePdf.text, documentId: collectorDocument.id, documentType: "RETIFICATION" }, { orgao: "Prefeitura Municipal do Salvador", banca: "FGV", vagas: null, status: null, evidence: {} }, 1);
    const { data: after } = await svc.from("concursos").select("id").eq("edital_url", originalUrl).maybeSingle();
    assert.equal(after?.id, originalContest.id, "retification changed concurso_id");
    const { data: aliases } = await svc.from("concurso_identity_aliases").select("alias_type,alias_value").eq("concurso_id", originalContest.id).eq("is_current", true);
    const { data: documents } = await svc.from("concurso_documents").select("relationship_type,source_url").eq("concurso_id", originalContest.id).eq("source_url", updateUrl);
    assert.ok((aliases || []).length > 0);
    assert.ok((documents || []).some((document) => document.relationship_type === "RETIFICATION"));
    console.log(JSON.stringify({ projectRef: "ukwulespvvthyjqgrjfo", concursoIdOriginal: originalContest.id, concursoIdAfter: after?.id, aliases, documents }));
  }
  console.log(JSON.stringify({ source: "FGV", originalUrl, updateUrl, pdfStatus: updatePdf.status, relationship: relationship.relationship, confidence: relationship.confidence, reasons: relationship.reasons }));
}

main();

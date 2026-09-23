import assert from "node:assert/strict";
import { extractPdfText } from "../src/lib/collector/http";
import { extractIdentitySignals } from "../src/lib/collector/entityResolution";
import { classifyDocumentRelationship } from "../src/lib/collector/documentRelationship";
import { aliasesFromIdentity } from "../src/lib/collector/identityAliases";

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
  console.log(JSON.stringify({ source: "FGV", originalUrl, updateUrl, pdfStatus: updatePdf.status, relationship: relationship.relationship, confidence: relationship.confidence, reasons: relationship.reasons }));
}

main();

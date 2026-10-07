import assert from "node:assert/strict";
import { adapters, isOfficialSourceUrl, parseCebraspeDocuments, parseCebraspeEvents, parseSourceLinks, selectCebraspeDocuments } from "../src/lib/collector/adapters";

for (const name of ["FCC", "Cesgranrio", "JC Concursos"]) assert.ok(adapters.some((adapter) => adapter.sourceName === name));
const source = { name: "FCC", baseUrl: "https://www.concursosfcc.com.br", tier: 1, path: /^\/concursos\/[^/]+\/index\.html$/ };
const docs = parseSourceLinks('<a href="/concursos/mprev126/index.html">Manaus Previdência</a><a href="/concursos/mprev126/index.html">Manaus Previdência</a><a href="https://evil.example/concursos/a/index.html">Falso concurso</a>', source);
assert.equal(docs.length, 1);
assert.equal(docs[0].tier, 1);
assert.equal(docs[0].canonicalUrl, "https://www.concursosfcc.com.br/concursos/mprev126/index.html");
assert.equal(adapters.find((adapter) => adapter.sourceName === "JC Concursos")?.tier, 2);
assert.equal(adapters.find((adapter) => adapter.sourceName === "PCI Concursos")?.tier, 2);
assert.equal(isOfficialSourceUrl("https://conhecimento.fgv.br", "https://evil.example/concursos/falso", /^\/concursos\//), false);
assert.equal(isOfficialSourceUrl("https://www.cebraspe.org.br", "https://www.cebraspe.org.br/concursos/real", /^\/concursos\//), true);
const cebraspeEvents = parseCebraspeEvents([
  { faseEvento: "Novos", eventos: [{ eventoURL: "EVENTO_26", eventoNomeAbreviado: " Evento 26 " }] },
  { faseEvento: "Encerrados", eventos: [{ eventoURL: "ANTIGO_20", eventoNomeAbreviado: "Antigo 20" }] },
]);
assert.deepEqual(cebraspeEvents, [{ slug: "EVENTO_26", title: "Evento 26" }]);
const cebraspeDocs = parseCebraspeDocuments({ arquivosEdital: [
  { nomeArquivo: "EDITAL.pdf", descricaoArquivo: "Edital de abertura", tipoExtensaoArquivo: "_.pdf", isGuid: false, dataArquivoObj: "2026-10-01T10:00:00" },
  { nomeArquivo: "EDITAL_ATUALIZADO.pdf", descricaoArquivo: "Edital nº 1 - Abertura - Atualizado conforme retificações", tipoExtensaoArquivo: "_.pdf", isGuid: false, dataArquivoObj: "2026-10-01T10:00:05" },
  { nomeArquivo: "RESPOSTAS.pdf", descricaoArquivo: "Respostas às impugnações do Edital nº 1", tipoExtensaoArquivo: "_.pdf", isGuid: false, dataArquivoObj: "2026-10-01T12:00:00" },
  { nomeArquivo: "EDITAL.html", descricaoArquivo: "Edital em HTML", tipoExtensaoArquivo: "_.html", isGuid: false },
  { nomeArquivo: "../evil.pdf", descricaoArquivo: "Arquivo inválido", tipoExtensaoArquivo: "_.pdf", isGuid: false },
], arquivosGabarito: [{ nomeArquivo: "GABARITO.pdf", descricaoArquivo: "Gabarito", tipoExtensaoArquivo: "_.pdf", isGuid: true, dataArquivoObj: "2026-10-02T10:00:00" }] }, cebraspeEvents[0]);
assert.equal(cebraspeDocs.length, 4);
assert.equal(cebraspeDocs[0].canonicalUrl, "https://cdn.cebraspe.org.br/GABARITO.pdf");
assert.equal(cebraspeDocs[0].contestUrl, "https://www.cebraspe.org.br/concursos/EVENTO_26");
assert.equal(cebraspeDocs[0].documentType, "PDF_GABARITO");
assert.equal(cebraspeDocs[3].canonicalUrl, "https://cdn.cebraspe.org.br/concursos/EVENTO_26/arquivos/EDITAL.pdf");
assert.equal(cebraspeDocs[3].publishedAt, "2026-10-01T13:00:00.000Z");
assert.equal(new Set(cebraspeDocs.map((document) => document.contestUrl)).size, 1);
const selectedCebraspeDocs = selectCebraspeDocuments([{ slug: "EVENTO_26", title: "Evento 26", contestUrl: "https://www.cebraspe.org.br/concursos/EVENTO_26", officialTitle: "Evento 26", status: "Abertura", registrationPeriod: null, roleCount: 0, documents: cebraspeDocs }]);
assert.equal(selectedCebraspeDocs[0].title, "Edital de abertura", "opening notice must be the primary identity document");
assert.equal(selectedCebraspeDocs[1].title, "Respostas às impugnações do Edital nº 1", "newer official notice remains discoverable after the opening notice");
assert.equal(selectedCebraspeDocs.some((document) => document.documentType === "PDF_GABARITO"), false, "answer keys must not feed contest fact synchronization");
assert.deepEqual(adapters.find((adapter) => adapter.sourceName === "Cebraspe")?.documentOrigins, ["https://www.cebraspe.org.br", "https://cdn.cebraspe.org.br"]);
console.log("adapter contracts validation passed");

import assert from "node:assert/strict";
import { aliasesFromIdentity } from "../src/lib/collector/identityAliases";
import { discoverCebraspeManifest, selectCebraspeDocuments } from "../src/lib/collector/adapters";
import { enrichDocument } from "../src/lib/collector/enrichment";
import { extractIdentitySignals } from "../src/lib/collector/entityResolution";
import { extractPdfText, hashBuffer, safeFetch } from "../src/lib/collector/http";
import { isSchoolingCategory } from "../src/lib/contest-role";

type LiveDocument = {
  canonicalUrl: string;
  contentHash: string;
  documentIdentity: string;
  parsedCharacters: number;
  edital: string | null;
  process: string | null;
  aliases: string[];
};

function relationshipFromTitle(title: string) {
  if (/retifica|errata|corre[cç][aã]o/i.test(title)) return "RETIFICATION";
  if (/republica/i.test(title)) return "REPUBLICATION";
  if (/comunicado/i.test(title)) return "COMMUNICATION";
  if (/abertura/i.test(title)) return "ORIGINAL";
  return "UNKNOWN";
}

async function cycle() {
  const manifest = await discoverCebraspeManifest(12);
  assert.equal(manifest.length, 12, "live discovery must return 12 distinct Cebraspe contests");
  assert.equal(new Set(manifest.map((entry) => entry.slug)).size, 12, "event slugs must be unique");
  assert.equal(new Set(manifest.map((entry) => entry.contestUrl)).size, 12, "official contest URLs must be unique");

  const documents: LiveDocument[] = [];
  const contests = [];
  for (const entry of manifest) {
    const selected = selectCebraspeDocuments([entry])[0];
    assert.ok(selected, `${entry.slug} has no official PDF`);
    const fetched = await safeFetch(selected.canonicalUrl, {
      allowedTypes: ["application/pdf"],
      allowedOrigin: ["https://www.cebraspe.org.br", "https://cdn.cebraspe.org.br"],
      timeoutMs: 15000,
    });
    assert.equal(fetched.ok, true, `${entry.slug}: ${fetched.error || fetched.status}`);
    assert.ok(fetched.buffer && fetched.buffer.length > 1000, `${entry.slug} returned an empty PDF`);
    const parsed = await extractPdfText(fetched.buffer);
    assert.equal(parsed.status, "PARSED", `${entry.slug} PDF text extraction failed`);
    const facts = enrichDocument(entry.title, parsed.text);
    assert.ok(facts.cargos.every((cargo) => !isSchoolingCategory(cargo)), `${entry.slug} classified schooling as a role`);
    const identity = extractIdentitySignals({
      title: entry.title,
      url: entry.contestUrl,
      rawText: parsed.text,
      sourceName: "Cebraspe",
      orgao: entry.officialTitle || entry.title,
      banca: "Cebraspe",
      cargos: facts.cargos,
      escolaridade: facts.escolaridade,
    });
    const aliases = aliasesFromIdentity(identity, "Cebraspe", entry.contestUrl);
    const strongAliases = aliases.filter((alias) => ["EDITAL", "PROCESS", "OFFICIAL_SLUG", "OFFICIAL_URL"].includes(alias.alias_type));
    assert.ok(aliases.some((alias) => alias.alias_type === "OFFICIAL_SLUG" && alias.alias_value === entry.slug.toLowerCase()));
    assert.ok(aliases.some((alias) => alias.alias_type === "OFFICIAL_URL" && alias.alias_value === entry.contestUrl));
    const documentIdentity = `${entry.slug}|${selected.documentType}|${selected.publishedAt || ""}|${selected.title}`;
    documents.push({
      canonicalUrl: selected.canonicalUrl,
      contentHash: hashBuffer(fetched.buffer),
      documentIdentity,
      parsedCharacters: parsed.text.length,
      edital: identity.editalNumber,
      process: identity.processNumber,
      aliases: aliases.map((alias) => `${alias.alias_type}:${alias.alias_value}`).sort(),
    });
    contests.push({
      sourceIdentifier: entry.slug,
      title: entry.title,
      banca: "Cebraspe",
      officialUrl: entry.contestUrl,
      identityAliases: strongAliases.map((alias) => `${alias.alias_type}:${alias.alias_value}`).sort(),
      documentCount: entry.documents.length,
      pdfCount: entry.documents.length,
      officialTitle: entry.officialTitle,
      status: entry.status,
      registrationPeriod: entry.registrationPeriod,
      roleCount: entry.roleCount,
      selectedPdf: selected.canonicalUrl,
      relationship: relationshipFromTitle(selected.title),
    });
  }
  assert.equal(new Set(documents.map((document) => document.canonicalUrl)).size, documents.length, "canonical PDF URLs must be unique");
  assert.equal(new Set(documents.map((document) => document.contentHash)).size, documents.length, "selected PDFs must have unique content hashes");
  assert.equal(new Set(documents.map((document) => document.documentIdentity)).size, documents.length, "document identities must be unique");
  return { contests, documents };
}

async function main() {
  const first = await cycle();
  const second = await cycle();
  assert.deepEqual(second, first, "two consecutive read-only Cebraspe cycles must be idempotent");
  const factualSlots = first.contests.length * 4;
  const factualPresent = first.contests.reduce((sum, contest) => sum + Number(Boolean(contest.officialTitle)) + Number(Boolean(contest.status)) + Number(Boolean(contest.registrationPeriod)) + Number(contest.roleCount > 0), 0);
  console.log(JSON.stringify({
    source: {
      operator: "Cebraspe",
      baseUrl: "https://apis.cebraspe.org.br",
      listEndpoint: "/cebraspe/eventos/tipo/concursos/",
      detailEndpoint: "/cebraspe/eventos/{eventoURL}",
      method: "GET",
      pagination: "none",
      identityFields: ["eventoURL", "eventoNomeAbreviado", "official contest URL", "edital", "process number", "cargo/context"],
    },
    contests: first.contests,
    summary: {
      contestsDiscovered: first.contests.length,
      documentsDiscovered: first.contests.reduce((sum, contest) => sum + contest.documentCount, 0),
      selectedPdfs: first.documents.length,
      duplicateCanonicalUrls: 0,
      duplicateContentHashes: 0,
      duplicateDocumentIdentities: 0,
      secondCycleDifferences: 0,
      pdfParseCoverage: first.documents.filter((document) => document.parsedCharacters > 0).length / first.documents.length,
      sourceContractPrecision: 1,
      extractionPrecision: "NOT_MEASURABLE_WITHOUT_LABELLED_GROUND_TRUTH",
      factualApiCoverage: factualPresent / factualSlots,
      editalCoverage: first.documents.filter((document) => document.edital).length / first.documents.length,
      processCoverage: first.documents.filter((document) => document.process).length / first.documents.length,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

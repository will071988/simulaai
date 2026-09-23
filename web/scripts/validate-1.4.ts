import assert from "node:assert/strict";
import { extractIdentitySignals, scoreEntity, stableEntityKey } from "../src/lib/collector/entityResolution";
import { classifyDocumentRelationship } from "../src/lib/collector/documentRelationship";
import { aliasesFromIdentity, normalizeBaseEditalNumber } from "../src/lib/collector/identityAliases";
import { resolveField } from "../src/lib/collector/fieldResolver";

const original = extractIdentitySignals({ title: "Edital 01/2026 - Guarda Civil Municipal", url: "https://fgv.br/concursos/guarda2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
const retification = extractIdentitySignals({ title: "Retificação do Edital nº 01/2026 - Guarda Civil Municipal", url: "https://fgv.br/concursos/guarda2026-retificado", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
const candidateAliases = aliasesFromIdentity(original, "FGV", "https://fgv.br/concursos/guarda2026");

assert.equal(normalizeBaseEditalNumber("RETIFICAÇÃO DO EDITAL 01/2026"), "01/2026");
assert.equal(classifyDocumentRelationship({ title: "Retificação do Edital nº 01/2026", incoming: retification, candidate: original, candidateAliases }).relationship, "RETIFICATION");
assert.equal(classifyDocumentRelationship({ title: "Republicação do Edital 01/2026", incoming: retification, candidate: original, candidateAliases }).relationship, "REPUBLICATION");
assert.equal(classifyDocumentRelationship({ title: "Reabertura das inscrições do Edital 01/2026", incoming: retification, candidate: original, candidateAliases }).relationship, "REOPENING");
assert.equal(classifyDocumentRelationship({ title: "Atualização do concurso", incoming: retification, candidate: original }).relationship, "POSSIBLE_SAME_CONTEST");

const newContest = extractIdentitySignals({ title: "Edital 04/2026 - Guarda Civil Municipal", url: "https://fgv.br/concursos/guarda04-2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
assert.equal(classifyDocumentRelationship({ title: "Edital 04/2026 - Guarda Civil Municipal", incoming: newContest, candidate: original }).relationship, "NEW_CONTEST");
const originalProcess = extractIdentitySignals({ title: "Edital 01/2026 - Processo 111/2026", url: "https://gov.br/concurso/original", sourceName: "DOU", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
const migratedProcess = extractIdentitySignals({ title: "Edital 01/2026 - Processo 222/2026 substitui o Processo 111/2026", url: "https://gov.br/concurso/atualizado", sourceName: "DOU", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
assert.equal(classifyDocumentRelationship({ title: "Edital 01/2026 - Processo 222/2026 substitui o Processo 111/2026", incoming: migratedProcess, candidate: originalProcess, candidateAliases: aliasesFromIdentity(originalProcess, "DOU") }).relationship, "SAME_CONTEST_UPDATE");
assert.equal(scoreEntity(original, extractIdentitySignals({ title: "Edital 01/2026 - Guarda", url: "https://fgv.br/concursos/guarda2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] })).decision, "AUTO_MATCH");
const pms = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026", url: "https://conhecimento.fgv.br/concursos/pms2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", escolaridade: ["SUPERIOR"] });
const guarda = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026 - Guarda Municipal", url: "https://conhecimento.fgv.br/concursos/pmsguarda2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
assert.notEqual(stableEntityKey(pms), stableEntityKey(guarda));
assert.equal(scoreEntity(pms, guarda).decision, "NEW_ENTITY");

const oldEvidence = [{ value_json: 100, source_tier: 1, observed_at: "2026-01-01T00:00:00Z", source_url: "https://gov.br" }];
const amendment = resolveField(100, 120, { tier: 1, observedAt: "2026-02-01T00:00:00Z", isAmendment: true }, oldEvidence);
assert.equal(amendment.resolvedValue, 120);
assert.equal(amendment.decision, "ACCEPT_NEW");
assert.equal(resolveField(100, 120, { tier: 2, observedAt: "2026-02-01T00:00:00Z", isAmendment: true }, oldEvidence).resolvedValue, 100);
console.log("1.4 validation passed");

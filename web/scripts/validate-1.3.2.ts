import assert from "node:assert/strict";
import { extractIdentitySignals, scoreEntity, stableEntityKey } from "../src/lib/collector/entityResolution";

const pms = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026", url: "https://conhecimento.fgv.br/concursos/pms2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", escolaridade: ["SUPERIOR"] });
const guarda = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026 - Guarda Municipal", url: "https://conhecimento.fgv.br/concursos/pmsguarda2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
assert.equal(pms.orgao, guarda.orgao); assert.equal(pms.ano, guarda.ano); assert.equal(pms.banca, guarda.banca); assert.notEqual(stableEntityKey(pms), stableEntityKey(guarda)); assert.equal(scoreEntity(pms, guarda).decision, "NEW_ENTITY");
const sameOfficial = extractIdentitySignals({ title: "IBAMA Edital 01/2026 Analista Ambiental", url: "https://cebraspe.org.br/concursos/ibama2026", sourceName: "Cebraspe", orgao: "IBAMA", banca: "Cebraspe", cargos: ["Analista Ambiental"] });
const sameDou = extractIdentitySignals({ title: "Instituto Brasileiro do Meio Ambiente publica Edital 01/2026 para Analista Ambiental", url: "https://in.gov.br/ibama", sourceName: "DOU", orgao: "Instituto Brasileiro do Meio Ambiente", banca: null, cargos: ["Analista Ambiental"] });
assert.equal(scoreEntity(sameOfficial, sameDou).decision, "AUTO_MATCH");
assert.equal(scoreEntity(extractIdentitySignals({ title: "IBAMA Edital 02/2026 Analista", url: "https://cebraspe.org.br/concursos/ibama02", sourceName: "Cebraspe", orgao: "IBAMA", banca: "Cebraspe", cargos: ["Analista"] }), sameOfficial).decision, "NEW_ENTITY");
const contextOnly = extractIdentitySignals({ title: "IBAMA Concurso Público 2026", url: "https://x/documento", orgao: "IBAMA", banca: "Cebraspe" });
assert.equal(stableEntityKey(contextOnly), null); assert.notEqual(scoreEntity(contextOnly, contextOnly).decision, "AUTO_MATCH");
assert.equal(scoreEntity(sameOfficial, { ...sameOfficial, officialSlug: "ibama-guarda2026", cargoKey: "GUARDA_CIVIL_MUNICIPAL" }).decision, "NEW_ENTITY");
console.log("1.3.2 validation passed");

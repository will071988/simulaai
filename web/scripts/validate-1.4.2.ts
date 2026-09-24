import assert from "node:assert/strict";
import { resolveCanonicalId, resolveCanonicalIds } from "../src/lib/collector/canonicalContest";
import { extractIdentitySignals, scoreEntity, stableEntityKey } from "../src/lib/collector/entityResolution";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";

assert.equal(resolveCanonicalId(B, [{ id: B, merged_into_id: A }]), A);
assert.deepEqual(resolveCanonicalIds([A, B], [{ id: B, merged_into_id: A }]), [A]);
assert.equal(resolveCanonicalId(C, [{ id: C, merged_into_id: B }, { id: B, merged_into_id: A }]), A);
assert.deepEqual(resolveCanonicalIds([A, B], []), [A, B]);
assert.throws(() => resolveCanonicalId(A, [{ id: A, merged_into_id: B }, { id: B, merged_into_id: A }]), /cycle/);

const pms = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026", url: "https://conhecimento.fgv.br/concursos/pms2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", escolaridade: ["SUPERIOR"] });
const guarda = extractIdentitySignals({ title: "Concurso Público para a Prefeitura Municipal do Salvador 2026 - Guarda Municipal", url: "https://conhecimento.fgv.br/concursos/pmsguarda2026", sourceName: "FGV", orgao: "Prefeitura Municipal do Salvador", banca: "FGV", cargos: ["Guarda Civil Municipal"] });
assert.notEqual(stableEntityKey(pms), stableEntityKey(guarda));
assert.equal(scoreEntity(pms, guarda).decision, "NEW_ENTITY");

const orgA = extractIdentitySignals({ title: "Edital 01/2026", url: "https://a.example/concursos/a", sourceName: "A", orgao: "Orgao A", banca: "FGV" });
const orgB = extractIdentitySignals({ title: "Edital 01/2026", url: "https://b.example/concursos/b", sourceName: "B", orgao: "Orgao B", banca: "FGV" });
assert.notEqual(orgA.orgao, orgB.orgao);
assert.notEqual(scoreEntity(orgA, orgB).decision, "AUTO_MATCH");
console.log("1.4.2 validation passed");

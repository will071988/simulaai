import assert from "node:assert/strict";
import type { ConcursoDetailData } from "../src/lib/collector/contestDetail";

const base = { id: "A", titulo: "Contest", orgao: "Org", banca: null, vagas: null, salario: null, inscricao_inicio: null, inscricao_fim: null, prova_data: null, cargos: [], escolaridade: [], status: null, scope: null, state_code: null, city: null, latitude: null, longitude: null, location_label: null, hot_score: null, hot_reasons: [], quality_status: "PARTIAL", logical_key: null, edital_number: null, process_number: null, official_slug: null, official_source: null, cargo_key: null, cargo_group_key: null, edital_url: null, simulado_slug: null, canonical_id: "A", merged_into_id: null, is_merged: false, merged_from: [], evidence: [], identity_aliases: [], documents: [] } satisfies Omit<ConcursoDetailData, "requested_id">;
const canonical: ConcursoDetailData = { ...base, requested_id: "A" };
const merged: ConcursoDetailData = { ...base, requested_id: "B", merged_into_id: "A", is_merged: true };
const comparable = (data: ConcursoDetailData) => Object.fromEntries(Object.entries(data).filter(([key]) => !new Set(["requested_id", "merged_into_id", "is_merged", "merged_from"]).has(key)));

assert.equal(canonical.id, "A");
assert.equal(canonical.requested_id, "A");
assert.equal(canonical.canonical_id, "A");
assert.equal(canonical.merged_into_id, null);
assert.equal(canonical.is_merged, false);
assert.equal(merged.id, "A");
assert.equal(merged.requested_id, "B");
assert.equal(merged.canonical_id, "A");
assert.equal(merged.merged_into_id, "A");
assert.equal(merged.is_merged, true);
assert.deepEqual(Object.keys(canonical).sort(), Object.keys(merged).sort());
assert.deepEqual(comparable(canonical), comparable(merged));
console.log("api canonical/merged contract validation passed");

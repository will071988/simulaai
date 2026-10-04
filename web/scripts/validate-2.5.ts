import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterCurrentContestEvidence, hasOfficialFieldEvidence, isContestId, isPublicSourceUrl } from "../src/lib/contest-evidence";
import { presentContest } from "../src/lib/contest-presentation";
import { enrichDocument } from "../src/lib/collector/enrichment";
import { isSchoolingCategory } from "../src/lib/contest-role";

const page = readFileSync("src/app/concursos/[id]/page.tsx", "utf8");
const data = readFileSync("src/lib/contest-page.ts", "utf8");
const actions = readFileSync("src/components/ContestActions.tsx", "utf8");
const map = readFileSync("src/components/ContestLocationMap.tsx", "utf8");
const list = readFileSync("src/app/concursos/page.tsx", "utf8");
const detailApi = readFileSync("src/app/api/concursos/[id]/route.ts", "utf8");

for (const label of ["Órgão", "Banca", "Status", "Vagas", "Salário", "Níveis", "Cargos", "Inscrições", "Prova", "Edital e documentos", "Retificações", "Localidade", "Última atualização", "Fontes e evidências"]) assert.match(page, new RegExp(label));
assert.match(page, /CONFIRMADO/); assert.match(page, /PREVISTO/);
assert.match(page, /presentContest\(contest\)/, "page and metadata must use the tested factual policy");
assert.match(page, /Nenhuma previsão é apresentada como fato confirmado/, "forecast and confirmed data must never be blended");
assert.match(page, /generateMetadata/); assert.match(page, /application\/ld\+json/); assert.match(page, /alternates: \{ canonical \}/);
for (const cta of ["Fazer simulado", "Favoritar", "Acompanhar concurso"]) assert.match(actions, new RegExp(cta));
assert.match(actions, /concursoId=/, "detail CTA must fetch only its own follow state");
assert.match(map, /OpenStreetMap/); assert.match(page, /latitude != null && contest\.longitude != null && coordinatesConfirmed/);
assert.match(data, /is_publishable/); assert.match(data, /resolveRequestedContest/); assert.match(data, /concurso_field_evidence/); assert.match(data, /concurso_documents/);
assert.match(list, /\/concursos\/\$\{contest\.id\}/, "search results must link to the professional page");
assert.match(detailApi, /updated_at/, "public detail API must expose last update");
const current = { titulo: "Concurso Salvador", orgao: "Prefeitura de Salvador", banca: "FGV", cargos: ["Analista"], escolaridade: ["SUPERIOR"], edital_url: "https://oficial.test/salvador" };
const evidence = [
  { field_name: "titulo", value_json: "Concurso Salvador", source_url: "https://oficial.test/salvador", source_tier: 1, evidence_text: "Concurso Salvador" },
  { field_name: "titulo", value_json: "Título antigo", source_url: "https://oficial.test/salvador", source_tier: 1, evidence_text: "Título antigo" },
  { field_name: "escolaridade", value_json: "TECNICO", source_url: "https://oficial.test/salvador", source_tier: 1, evidence_text: "Nosso website coleta informações e utiliza cookies para melhorar o funcionamento técnico" },
  { field_name: "banca", value_json: "FGV", source_url: "https://outro-concurso.test", source_tier: 1, evidence_text: "Outro concurso FGV" },
  { field_name: "cargos", value_json: "Analista", source_url: "https://oficial.test/salvador", source_tier: 1, evidence_text: "cargo de Analista" },
];
const filtered = filterCurrentContestEvidence(current, evidence, [{ source_url: "https://oficial.test/salvador" }]);
assert.deepEqual(filtered.map((item) => item.field_name), ["titulo", "cargos"], "only current values from linked documents may be public evidence");
const twoCargos = { ...current, cargos: ["Analista", "Técnico"] };
assert.equal(hasOfficialFieldEvidence(twoCargos, filtered, "cargos"), false, "one evidenced cargo cannot confirm two cargos");
const completeEvidence = [...filtered, { ...evidence[4], value_json: "Técnico" }];
assert.equal(hasOfficialFieldEvidence(twoCargos, completeEvidence, "cargos"), true, "separate official evidence can cover all members");
assert.equal(hasOfficialFieldEvidence(twoCargos, completeEvidence.map((item) => ({ ...item, source_tier: 2 })), "cargos"), false);
assert.equal(isContestId("not-a-uuid"), false);
assert.equal(isContestId("b195e9cd-aa71-4c94-99e0-641ab244a608"), true);
assert.equal(isPublicSourceUrl("javascript:alert(1)"), false);
assert.equal(isPublicSourceUrl("https://user:secret@example.com"), false);
const base = { ...current, id: "b195e9cd-aa71-4c94-99e0-641ab244a608", updated_at: "2026-10-04T12:00:00Z", status: null,
  vagas: 999, city: "Cidade sem evidência", state_code: "XX", scope: "nacional", latitude: -12, longitude: -38,
  evidence: [...filtered, { ...evidence[0], field_name: "scope", value_json: "nacional" }], documents: [{ source_url: current.edital_url }], quality_status: "VERIFIED" };
const view = presentContest(base);
assert.equal(view.badge, "STATUS NÃO CONFIRMADO", "quality status cannot establish contest status");
assert.equal(view.location, "nacional", "scope evidence must not confirm unrelated city/state");
assert.equal(view.coordinatesConfirmed, false, "location evidence is not coordinate evidence");
assert.doesNotMatch(view.description, /999|FGV/, "SEO must not assert unsupported facts");
assert.equal(view.jsonLd["@type"], "WebPage", "a multi-role contest/forecast is not a single job posting");
assert.equal("datePosted" in view.jsonLd, false, "last update is not the original posting date");
assert.equal(presentContest({ ...base, status: "previsto" }).badge, "PREVISÃO NÃO CONFIRMADA");
assert.equal(presentContest({ ...base, status: "previsto", evidence: [...base.evidence, { ...evidence[0], field_name: "status", value_json: "previsto" }] }).badge, "PREVISTO");
assert.deepEqual(filterCurrentContestEvidence({ ...current, escolaridade: ["TECNICO"] }, [{ ...evidence[2], evidence_text: "Nosso website coleta informações\ne usa cookies\npara funcionamento técnico" }], base.documents), [], "multiline cookie banners must be rejected even when their extracted value matches");
console.log("Sprint 2.5 professional contest page, provenance separation, CTAs, map and structured SEO tests passed");
const roles = enrichDocument("Concurso público", "para cargos de Nível Superior, conforme disposto no Edital.\nCargo: Analista Administrativo\nCargo: Técnico em Informática");
assert.deepEqual(roles.cargos, ["Analista Administrativo", "Técnico em Informática"]);
assert.ok(roles.escolaridade.includes("SUPERIOR"), "rejecting a fake role must preserve schooling extraction");
assert.equal(isSchoolingCategory("Técnico em Informática"), false, "real technical roles must survive");
assert.equal(isSchoolingCategory("Nível médio"), true);
assert.ok(roles.evidence.some((item) => item.field === "cargos" && JSON.stringify(item.value) === JSON.stringify(roles.cargos)), "multi-role changes require exact-array evidence for atomic persistence");
for (const item of roles.evidence.filter((item) => item.field === "cargos")) {
  assert.ok(item.evidence.includes(String((item.value as string[])[0])), "each role needs its own matching excerpt");
  assert.doesNotMatch(item.evidence, /Nível Superior/);
}
const fakeRole = { ...evidence[4], value_json: ["Nível Superior"] };
assert.deepEqual(filterCurrentContestEvidence({ ...current, cargos: ["Nível Superior"] }, [fakeRole], base.documents), [], "legacy schooling claims cannot confirm a role");
console.log("Sprint 2.5 schooling/role separation and per-role evidence regression passed");

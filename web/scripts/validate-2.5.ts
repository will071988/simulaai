import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/concursos/[id]/page.tsx", "utf8");
const data = readFileSync("src/lib/contest-page.ts", "utf8");
const actions = readFileSync("src/components/ContestActions.tsx", "utf8");
const map = readFileSync("src/components/ContestLocationMap.tsx", "utf8");
const list = readFileSync("src/app/concursos/page.tsx", "utf8");
const detailApi = readFileSync("src/app/api/concursos/[id]/route.ts", "utf8");

for (const label of ["Órgão", "Banca", "Status", "Vagas", "Salário", "Níveis", "Cargos", "Inscrições", "Prova", "Edital e documentos", "Retificações", "Localidade", "Última atualização", "Fontes e evidências"]) assert.match(page, new RegExp(label));
assert.match(page, /CONFIRMADO/); assert.match(page, /PREVISTO/);
assert.match(page, /source_tier === 1/, "confirmed facts must require official evidence");
assert.match(page, /Nenhuma previsão é apresentada como fato confirmado/, "forecast and confirmed data must never be blended");
assert.match(page, /generateMetadata/); assert.match(page, /application\/ld\+json/); assert.match(page, /schema\.org/); assert.match(page, /alternates: \{ canonical \}/);
for (const cta of ["Fazer simulado", "Favoritar", "Acompanhar concurso"]) assert.match(actions, new RegExp(cta));
assert.match(actions, /concursoId=/, "detail CTA must fetch only its own follow state");
assert.match(map, /OpenStreetMap/); assert.match(page, /latitude != null && contest\.longitude != null && locationConfirmed/);
assert.match(data, /is_publishable/); assert.match(data, /resolveRequestedContest/); assert.match(data, /concurso_field_evidence/); assert.match(data, /concurso_documents/);
assert.match(list, /\/concursos\/\$\{contest\.id\}/, "search results must link to the professional page");
assert.match(detailApi, /updated_at/, "public detail API must expose last update");
console.log("Sprint 2.5 professional contest page, provenance separation, CTAs, map and structured SEO tests passed");

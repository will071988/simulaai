import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contestSearchInput } from "../src/lib/contest-search";

const route = readFileSync("src/app/api/concursos/route.ts", "utf8");
const page = readFileSync("src/app/concursos/page.tsx", "utf8");
const rpc = readFileSync("../supabase/migrations/20261001111000_public_contest_search_rpc.sql", "utf8");
const valid = contestSearchInput("https://example.test/api/concursos?estado=sp&nivel=SUPERIOR&salarioMin=3000&salarioMax=9000&sort=HOT&page=2&perPage=24");
assert.equal(valid.success, true); if (valid.success) { assert.equal(valid.data.estado, "SP"); assert.equal(valid.data.page, 2); assert.equal(valid.data.perPage, 24); }
assert.equal(contestSearchInput("https://example.test/api/concursos?page=0").success, false);
assert.equal(contestSearchInput("https://example.test/api/concursos?perPage=500").success, false, "clients cannot request the whole database");
assert.equal(contestSearchInput("https://example.test/api/concursos?salarioMin=9000&salarioMax=1000").success, false);
for (const filter of ["orgao", "cargo", "banca", "cidade", "estado", "nivel", "salarioMin", "status", "abrangencia", "inscricao"]) assert.match(route + page, new RegExp(filter));
for (const sort of ["RECENTES", "ENCERRANDO", "SALARIO", "VAGAS", "HOT"]) assert.match(rpc, new RegExp(sort));
assert.match(route, /search_public_contests/, "route must delegate filtering and pagination to the database");
assert.match(rpc, /limit least\(greatest\(p_per_page, 1\), 50\)/, "database query must enforce bounded pagination");
assert.match(rpc, /jsonb_array_elements_text[\s\S]+ilike/, "cargo search must support partial, case-insensitive matches");
assert.match(rpc, /p_abrangencia = 'FEDERAL'[\s\S]+scope = 'NACIONAL'/, "federal scope must be derived without conflating every national contest");
assert.doesNotMatch(route + rpc, /limit\(1000\)/i, "search must not load the full database");
console.log("Sprint 2.4 validated filters, bounded server pagination, sorting and national-search contract tests passed");

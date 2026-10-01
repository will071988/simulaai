import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contestSearchInput } from "../src/lib/contest-search";

const route = readFileSync("src/app/api/concursos/route.ts", "utf8");
const page = readFileSync("src/app/concursos/page.tsx", "utf8");
const valid = contestSearchInput("https://example.test/api/concursos?estado=sp&nivel=SUPERIOR&salarioMin=3000&salarioMax=9000&sort=HOT&page=2&perPage=24");
assert.equal(valid.success, true); if (valid.success) { assert.equal(valid.data.estado, "SP"); assert.equal(valid.data.page, 2); assert.equal(valid.data.perPage, 24); }
assert.equal(contestSearchInput("https://example.test/api/concursos?page=0").success, false);
assert.equal(contestSearchInput("https://example.test/api/concursos?perPage=500").success, false, "clients cannot request the whole database");
assert.equal(contestSearchInput("https://example.test/api/concursos?salarioMin=9000&salarioMax=1000").success, false);
for (const filter of ["orgao", "cargo", "banca", "cidade", "estado", "nivel", "salarioMin", "status", "abrangencia", "inscricao"]) assert.match(route + page, new RegExp(filter));
for (const sort of ["RECENTES", "ENCERRANDO", "SALARIO", "VAGAS", "HOT"]) assert.match(route, new RegExp(sort));
assert.match(route, /\.range\(from, from \+ input\.perPage - 1\)/, "database query must be paginated");
assert.doesNotMatch(route, /limit\(1000\)/, "search must not load the full database");
console.log("Sprint 2.4 validated filters, bounded server pagination, sorting and national-search contract tests passed");

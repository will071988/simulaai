import assert from "node:assert/strict";
import { adapters, isOfficialSourceUrl, parseSourceLinks } from "../src/lib/collector/adapters";

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
console.log("adapter contracts validation passed");

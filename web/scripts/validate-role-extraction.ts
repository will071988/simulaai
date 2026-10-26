import assert from "node:assert/strict";
import { enrichDocument } from "../src/lib/collector/enrichment";
import { buildGroundedExtraction, validateStoredExtraction } from "../src/lib/collector/extractionGrounding";
import { extractionSemanticIssues } from "../src/lib/collector/extractionSemantics";

const title = "Instituto Exemplo";
for (const text of [
  "O concurso para os cargos de que trata este edital compreenderá as seguintes fases.",
  "O candidato concorrerá ao cargo ao qual se inscreveu.",
  "Os cargos e as vagas serão distribuídos nas unidades.",
  "O cargo público será preenchido conforme este edital.",
  "O cargo: que trata este edital compreenderá as seguintes fases.",
]) assert.deepEqual(enrichDocument(title, text).cargos, [], `procedural prose must not become a role: ${text}`);

assert.deepEqual(enrichDocument(title, "Cargo: Analista Administrativo. Cargo: Técnico Legislativo.").cargos, ["Analista Administrativo", "Técnico Legislativo"]);
assert.deepEqual(enrichDocument(title, "Concurso para o cargo de Professor C – Matemática.").cargos, ["Professor C – Matemática"]);
const table = "Cargo Qualificação Vagas imediatas Cadastro de reserva\nCargo 1: Oficial de\nEstado-Maior – 16 2 4 22\nCargo 2: Soldado QPBM/1 78 6 21 105\nQPBM/2 33 3 9 45";
assert.deepEqual(enrichDocument(title, table).cargos, ["Oficial de Estado-Maior", "Soldado"], "a qualification column is not part of the role name; wrapped role labels remain complete");
const source = `${title}. Cebraspe. ${table}`;
const grounded = buildGroundedExtraction(title, source, "Cebraspe");
const proven = grounded.decode({ orgao: title, banca: "Cebraspe", cargos: ["Oficial de Estado-Maior", "Soldado"], evidence: {} });
assert.deepEqual(extractionSemanticIssues(proven, title, source, "Cebraspe"), []);
assert.throws(() => grounded.decode({ orgao: title, banca: "Cebraspe", cargos: ["Soldado QPBM/2"], evidence: {} }), /INVALID_EVIDENCE_REFERENCE/, "table joins remain rejected; a failed role must not be silently removed");
const prose = "que trata este edital compreenderá as seguintes fases";
const stored = { orgao: title, banca: "Cebraspe", vagas: null, status: null, cargos: [prose], evidence: { cargos: `cargos de ${prose}` } };
assert.equal(validateStoredExtraction(stored, title, `${title}. Cebraspe. cargos de ${prose}`, "Cebraspe").success, false, "old literal-but-procedural cached roles cannot bypass the corrected semantics");
const many = Array.from({ length: 9 }, (_, i) => `Analista Especialidade ${String.fromCharCode(65 + i)}`);
assert.deepEqual(enrichDocument(title, many.map(role => `Cargo: ${role}.`).join(" ")).cargos, many, "do not silently truncate a ninth role");
assert.deepEqual(enrichDocument(title, "Cargo: Ensino Superior.").cargos, []);
console.log("Role extraction passed: explicit labels, wrapped table rows, distinct qualifications, no procedural prose and complete multi-role lists.");

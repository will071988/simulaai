import assert from "node:assert/strict";
import { resolveField } from "../src/lib/collector/fieldResolver";
import { scoreEntity, stableEntityKey } from "../src/lib/collector/entityResolution";
import { validateContestPage } from "../src/lib/collector/contestPageValidator";

const old = { value_json: 100, source_tier: 1, observed_at: "2026-01-01T00:00:00Z", source_url: "https://gov.br" };
assert.deepEqual(resolveField(100, 120, { tier: 2, observedAt: "2026-02-01T00:00:00Z" }, [old]).resolvedValue, 100);
assert.equal(resolveField(100, 120, { tier: 2, observedAt: "2026-02-01T00:00:00Z" }, [old]).conflict, true);
assert.equal(resolveField(100, 120, { tier: 1, observedAt: "2026-02-01T00:00:00Z", isAmendment: true }, [old]).resolvedValue, 120);
assert.equal(resolveField(100, 120, { tier: 1, observedAt: "2026-02-01T00:00:00Z" }, [old]).decision, "CONFLICT");
const official = { orgao: "Instituto Brasileiro do Meio Ambiente", banca: "Cebraspe", titulo: "IBAMA Concurso Publico 2026" };
const dou = { orgao: "IBAMA", banca: "Cebraspe", titulo: "Instituto Brasileiro do Meio Ambiente publica edital 2026" };
assert.ok(scoreEntity(official, dou).score >= 80);
assert.equal(stableEntityKey(official.orgao, official.banca, official.titulo), stableEntityKey(dou.orgao, dou.banca, dou.titulo));
assert.equal(scoreEntity(official, { ...dou, orgao: "Outra Agencia", titulo: "Edital 2026" }).score, 60);
assert.equal(validateContestPage("FGV", "https://x/concursos", "Quem somos contatos avaliacoes").decision, "REJECT");
assert.equal(validateContestPage("Processo Seletivo Agencia Nacional XYZ 2027", "https://x/concursos/xyz", "Edital inscricoes vagas cargo cronograma").decision, "ACCEPT");
assert.equal(validateContestPage("AOCP", "https://x/concursos/status", "Concursos em andamento").decision, "REJECT");
console.log("1.3.1 validation passed");

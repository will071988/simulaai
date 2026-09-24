import assert from "node:assert/strict";
import { findAliasCandidates, persistIdentityAliases, type IdentityAlias } from "../src/lib/collector/identityAliases";
import { resolveIncomingFields } from "../src/lib/collector/syncConcurso";

const evidence = (value: unknown, tier = 1) => [{ value_json: value, source_tier: tier, observed_at: "2026-01-01T00:00:00Z", source_url: "https://fgv.br/original" }];

async function main() {

const amendment = resolveIncomingFields({ vagas: 100 }, { vagas: 120 }, { vagas: evidence(100) }, 1, "RETIFICATION");
assert.equal(amendment.resolved.vagas, 120);
assert.equal(amendment.conflicted, false);
assert.equal(amendment.fieldDecisions.vagas.decision, "ACCEPT_NEW");

const realConflict = resolveIncomingFields({ vagas: 100 }, { vagas: 120 }, { vagas: evidence(100) }, 1, "POSSIBLE_SAME_CONTEST");
assert.equal(realConflict.resolved.vagas, 100);
assert.equal(realConflict.conflicted, true);
assert.equal(realConflict.fieldDecisions.vagas.decision, "CONFLICT");

const lowerTierAmendment = resolveIncomingFields({ vagas: 100 }, { vagas: 120 }, { vagas: evidence(100) }, 2, "RETIFICATION");
assert.equal(lowerTierAmendment.resolved.vagas, 100);
assert.equal(lowerTierAmendment.fieldDecisions.vagas.decision, "KEEP_CURRENT");

const reopening = resolveIncomingFields({ inscricao_inicio: "2026-02-01", inscricao_fim: "2026-02-10" }, { inscricao_inicio: "2026-02-15", inscricao_fim: "2026-02-20" }, { inscricao_inicio: evidence("2026-02-01"), inscricao_fim: evidence("2026-02-10") }, 1, "REOPENING");
assert.equal(reopening.resolved.inscricao_inicio, "2026-02-15");
assert.equal(reopening.resolved.inscricao_fim, "2026-02-20");
assert.equal(reopening.conflicted, false);

const calls: string[][] = [];
const rows = [{ concurso_id: "edital-id", alias_type: "EDITAL", alias_value: "ABC" }];
const fakeSvc = {
  from: () => ({
    select: () => {
      const query = (field: string, value: string) => {
        calls.push([field, value]);
        return {
          eq: (nextField: string, nextValue: string) => {
            calls.push([nextField, nextValue]);
            return {
              eq: (lastField: string, lastValue: string) => {
                calls.push([lastField, lastValue]);
                return Promise.resolve({ data: lastValue === "ABC" && nextValue === "EDITAL" ? rows : [], error: null });
              },
            };
          },
        };
      };
      return { eq: query };
    },
  }),
} as never;
const aliases = await findAliasCandidates(fakeSvc, [{ alias_type: "EDITAL", alias_value: "ABC" }, { alias_type: "PROCESS", alias_value: "ABC" }]);
assert.deepEqual(aliases, rows);
assert.ok(calls.some((call) => call[0] === "alias_type" && call[1] === "EDITAL"));

let aliasError = false;
const failingSvc = { from: () => ({ upsert: async () => ({ error: { message: "permission denied" } }) }) } as never;
try { await persistIdentityAliases(failingSvc, "contest-id", [{ alias_type: "EDITAL", alias_value: "ABC" } as IdentityAlias]); } catch (error) { aliasError = error instanceof Error && error.message === "persist identity alias: permission denied"; }
assert.equal(aliasError, true);
  console.log("1.4.1 validation passed");
}

main();

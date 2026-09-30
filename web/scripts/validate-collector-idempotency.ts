import assert from "node:assert/strict";
import { resolveField } from "../src/lib/collector/fieldResolver";
import { valueHash } from "../src/lib/collector/enrichment";

const old = { value_json: 100, source_tier: 1, observed_at: "2026-01-01T00:00:00Z", source_url: "https://example.org/original" };
const amendment = { tier: 1, observedAt: "2026-02-01T00:00:00Z", isAmendment: true };
const first = resolveField(100, 120, amendment, [old]);
assert.equal(first.resolvedValue, 120);
const current = { ...old, value_json: 120, observed_at: amendment.observedAt };
const second = resolveField(120, 120, amendment, [old, current]);
assert.equal(second.resolvedValue, 120);
assert.equal(second.decision, "KEEP_CURRENT");
assert.equal(resolveField(120, 100, { tier: 1, observedAt: old.observed_at }, [old, current]).resolvedValue, 120);
assert.equal(resolveField(["Analista"], [], amendment, []).decision, "KEEP_CURRENT");
assert.equal(valueHash({ vagas: first.resolvedValue }), valueHash({ vagas: second.resolvedValue }));
console.log("collector field idempotency validation passed (live/database validation still required)");

import assert from "node:assert/strict";
import { createCollectorMetrics, deriveCollectorRunStatus } from "../src/lib/collector/observability";
import { deriveCollectorHealth } from "../src/lib/collector/health";
import { getAIRetryDecision } from "../src/lib/collector/retryPolicy";

const now = Date.parse("2026-09-27T12:00:00Z");
const healthy = { now, lastRun: { status: "SUCCESS", finished_at: new Date(now).toISOString() }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 };
assert.equal(deriveCollectorHealth(healthy), "HEALTHY");
assert.equal(deriveCollectorHealth({ ...healthy, sourcesFailed: 1 }), "DEGRADED");
assert.equal(deriveCollectorHealth({ ...healthy, sourcesHealthy: 0, sourcesFailed: 2 }), "FAILED");
assert.equal(deriveCollectorHealth({ ...healthy, pendingAI: 21 }), "DEGRADED");
assert.equal(deriveCollectorHealth({ ...healthy, now: now + 27 * 3600000 }), "DEGRADED");
const metrics = createCollectorMetrics();
metrics.sources_checked = 2;
assert.equal(deriveCollectorRunStatus(metrics), "SUCCESS");
metrics.errors_count = 1;
assert.notEqual(deriveCollectorRunStatus(metrics), "SUCCESS");
metrics.sources_failed = 2;
assert.equal(deriveCollectorRunStatus(metrics), "FAILED");
for (const code of ["BUDGET_EXCEEDED", "429", "PROVIDER_DOWN", "PAID_MODEL_BLOCKED", "CONCURRENCY_RETRY"]) {
  const decision = getAIRetryDecision(code, 2, new Date(now));
  assert.equal(decision.nextStatus, "AI_PENDING");
  assert.equal(decision.incrementRetry, false);
  assert.ok(decision.delaySeconds > 0);
}
assert.equal(getAIRetryDecision("INVALID_SCHEMA", 2).nextStatus, "FAILED");
console.log("collector observability validation passed");

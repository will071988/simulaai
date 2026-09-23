import assert from "node:assert/strict";
import { deriveCollectorHealth } from "../src/lib/collector/health";

assert.equal(deriveCollectorHealth({ lastRun: { status: "SUCCESS" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 }), "HEALTHY");
assert.equal(deriveCollectorHealth({ lastRun: { status: "DEGRADED_NO_AI" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 1 }), "DEGRADED");
assert.equal(deriveCollectorHealth({ lastRun: { status: "FAILED" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 }), "FAILED");
console.log("post-audit validation passed");

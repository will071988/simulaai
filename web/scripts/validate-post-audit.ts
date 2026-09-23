import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveCollectorHealth } from "../src/lib/collector/health";

assert.equal(deriveCollectorHealth({ lastRun: { status: "SUCCESS" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 }), "HEALTHY");
assert.equal(deriveCollectorHealth({ lastRun: { status: "DEGRADED_NO_AI" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 1 }), "DEGRADED");
assert.equal(deriveCollectorHealth({ lastRun: { status: "FAILED" }, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 }), "FAILED");
assert.equal(deriveCollectorHealth({ lastRun: null, sourcesHealthy: 2, sourcesDegraded: 0, pendingAI: 0 }), "DEGRADED");

const root = resolve(import.meta.dirname, "..");
const pending = readFileSync(resolve(root, "src/app/api/collector/pending/route.ts"), "utf8");
const home = readFileSync(resolve(root, "src/app/page.tsx"), "utf8");
assert.match(pending, /ai_retry_count/);
assert.match(pending, /documentId: d\.id/);
assert.doesNotMatch(pending, /as never/);
assert.doesNotMatch(home, /Comprar avulso|Assinar por Pix|\+2\.400|4\.8\/5|327 avaliações|12k\+/);
console.log("post-audit validation passed");

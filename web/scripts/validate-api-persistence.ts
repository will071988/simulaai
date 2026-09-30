import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pending = readFileSync("src/app/api/collector/pending/route.ts", "utf8");
for (const contract of ["PENDING_CLAIM_FAILED", "PENDING_MAX_RETRIES_WRITE_FAILED", "PENDING_RETRY_WRITE_FAILED", "PENDING_PERSISTENCE_FAILED"]) assert.match(pending, new RegExp(contract));
assert.match(pending, /claim_ai_pending_documents/);
assert.match(pending, /await syncConcursoFromDocument/);
assert.match(pending, /if \(syncErr\)[\s\S]*?continue;[\s\S]*?processed\+\+/);
assert.doesNotMatch(pending, /update\(\{\s*status:\s*"PROCESSED"/);
assert.match(pending, /\.eq\("ai_claim_token", d.ai_claim_token\)/);
const detail = readFileSync("src/app/api/concursos/[id]/route.ts", "utf8");
for (const contract of ["DETAIL_EVIDENCE_QUERY_FAILED", "DETAIL_ALIASES_QUERY_FAILED", "DETAIL_DOCUMENTS_QUERY_FAILED", "DETAIL_MERGED_FROM_QUERY_FAILED"]) assert.match(detail, new RegExp(contract));
console.log("api persistence validation passed");

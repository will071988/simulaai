import assert from "node:assert/strict";
import { evaluatePublicationState } from "../src/lib/collector/publicationPolicy";

const base = { orgao: "Órgão A", titulo: "Edital 01/2026", edital_url: "https://official.example/edital", edital_number: "01/2026", officialEvidenceCount: 1 };
for (const quality_status of ["VERIFIED", "PARTIAL"]) assert.equal(evaluatePublicationState({ ...base, quality_status }).publishable, true);
for (const quality_status of ["CONFLICTED", "AI_PENDING", "FAILED", "UNVERIFIED"]) assert.equal(evaluatePublicationState({ ...base, quality_status }).publishable, false);
assert.equal(evaluatePublicationState({ ...base, quality_status: "PARTIAL", officialEvidenceCount: 0 }).publishable, false);
assert.equal(evaluatePublicationState({ ...base, quality_status: "VERIFIED", merged_into_id: "canonical" }).publishable, false);
assert.equal(evaluatePublicationState({ ...base, quality_status: "CONFLICTED" }).blockedByConflict, true);
assert.ok(evaluatePublicationState({ quality_status: "PARTIAL" }).missingRequiredFields.includes("orgao"));
console.log("publication policy validation passed");

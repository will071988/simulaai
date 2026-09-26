import assert from "node:assert/strict";
import { findSensitivePaths } from "../src/lib/api/exposure";

const base = process.env.CANONICAL_SMOKE_BASE_URL || "https://simulaai-kappa.vercel.app";
const canonicalId = "bad5e7ad-763f-4e5f-9bfe-5c487892af39";
const mergedId = "4071f541-df6c-4068-be7a-084c2d127b49";
const ignore = new Set(["requested_id", "merged_into_id", "is_merged"]);
const comparable = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !ignore.has(key)));

async function main() {
  const [canonicalResponse, mergedResponse] = await Promise.all([fetch(`${base}/api/concursos/${canonicalId}`), fetch(`${base}/api/concursos/${mergedId}`)]);
  assert.equal(canonicalResponse.status, 200);
  assert.equal(mergedResponse.status, 200);
  const canonical = (await canonicalResponse.json()).data;
  const merged = (await mergedResponse.json()).data;
  assert.deepEqual(Object.keys(canonical).sort(), Object.keys(merged).sort());
  assert.deepEqual(comparable(canonical), comparable(merged));
  assert.deepEqual(findSensitivePaths(canonical), []);
  assert.deepEqual(findSensitivePaths(merged), []);
  console.log("canonical production smoke passed");
}
main();

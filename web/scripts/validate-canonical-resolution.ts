import assert from "node:assert/strict";
import { resolveCanonicalContestId, resolveCanonicalId, resolveCanonicalIds, type CanonicalLink } from "../src/lib/collector/canonicalContest";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const client = (links: CanonicalLink[]) => ({ from: () => ({ select: () => ({ eq: (_field: string, id: string) => ({ maybeSingle: async () => ({ data: links.find((link) => link.id === id) || null, error: null }) }) }) }) }) as never;

async function main() {
  assert.equal(resolveCanonicalId(A, [{ id: A, merged_into_id: null }]), A);
  assert.equal(resolveCanonicalId(B, [{ id: A, merged_into_id: null }, { id: B, merged_into_id: A }]), A);
  assert.equal(resolveCanonicalId(C, [{ id: A, merged_into_id: null }, { id: B, merged_into_id: A }, { id: C, merged_into_id: B }]), A);
  assert.deepEqual(resolveCanonicalIds([A, B], [{ id: A, merged_into_id: null }, { id: B, merged_into_id: A }]), [A]);
  assert.throws(() => resolveCanonicalId(A, [{ id: A, merged_into_id: B }, { id: B, merged_into_id: A }]), /cycle/);
  await assert.rejects(resolveCanonicalContestId(client([]), A), /not found/);
  console.log("canonical resolution validation passed");
}
main();

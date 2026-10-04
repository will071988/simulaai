import assert from "node:assert/strict";
import { resolveContestPreselection } from "../src/lib/simulados/contest-preselection";

async function main() {
  const requested = "b195e9cd-aa71-4c94-99e0-641ab244a608";
  const canonical = "bad5e7ad-763f-4e5f-9bfe-5c487892af39";
  const options = [{ id: canonical, questionCount: 3 }];
  let calls = 0;
  const request: typeof fetch = async (url) => { calls++; assert.equal(url, `/api/concursos/${requested}`); return Response.json({ data: { canonical_id: canonical } }); };
  assert.equal((await resolveContestPreselection(undefined, options, request)).concursoId, "");
  assert.equal((await resolveContestPreselection("invalid", options, request)).concursoId, "");
  assert.equal(calls, 0, "invalid/absent IDs must not request the database");
  assert.equal((await resolveContestPreselection(requested, options, request)).concursoId, canonical, "legacy ID selects the canonical option");
  const empty = await resolveContestPreselection(requested, [], request);
  assert.equal(empty.concursoId, ""); assert.match(empty.message, /ainda não possui questões/);
  assert.equal((await resolveContestPreselection(requested, [{ id: canonical, questionCount: 0 }], request)).concursoId, "");
  const missing = await resolveContestPreselection(requested, options, async () => new Response(null, { status: 404 }));
  assert.equal(missing.concursoId, ""); assert.match(missing.message, /não está disponível/);
  await assert.rejects(resolveContestPreselection(requested, options, async () => new Response(null, { status: 500 })), /PRESELECTION_FAILED/);
  await assert.rejects(resolveContestPreselection(requested, options, async () => Response.json({ data: { canonical_id: "bad" } })), /INVALID_CONTEST_RESPONSE/);
  await assert.rejects(resolveContestPreselection(requested, options, async () => { throw new Error("offline"); }), /offline/);
  console.log("Sprint 2.5 contest preselection: canonical, unavailable, empty, invalid and network cases passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

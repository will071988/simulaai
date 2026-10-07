import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesAllowedOrigin } from "../src/lib/collector/http";
import { resolveContestPreselection } from "../src/lib/simulados/contest-preselection";
import { extractIdentitySignals, scoreEntity } from "../src/lib/collector/entityResolution";
import { classifyDocumentRelationship } from "../src/lib/collector/documentRelationship";

async function main() {
  const canonical = "bad5e7ad-763f-4e5f-9bfe-5c487892af39";
  let requests = 0;
  const direct = await resolveContestPreselection(canonical, [{ id: canonical, questionCount: 3 }], async () => {
    requests++;
    throw new Error("UNEXPECTED_REQUEST");
  });
  assert.equal(direct.concursoId, canonical);
  assert.equal(requests, 0, "canonical public options must not repeat the contest detail request");

  assert.equal(matchesAllowedOrigin("https://cdn.cebraspe.org.br/file.pdf", ["https://www.cebraspe.org.br", "https://cdn.cebraspe.org.br"]), true);
  assert.equal(matchesAllowedOrigin("https://evil.example/file.pdf", ["https://www.cebraspe.org.br", "https://cdn.cebraspe.org.br"]), false);

  const firstIdentity = extractIdentitySignals({ title: "Tribunal Estadual Analista Edital 01/2026", url: "https://www.cebraspe.org.br/concursos/tribunal_a_26", sourceName: "Cebraspe", orgao: "Tribunal Estadual A", banca: "Cebraspe", cargos: ["Analista"] });
  const distinctIdentity = extractIdentitySignals({ title: "Tribunal Estadual Analista Edital 02/2026", url: "https://www.cebraspe.org.br/concursos/tribunal_b_26", sourceName: "Cebraspe", orgao: "Tribunal Estadual B", banca: "Cebraspe", cargos: ["Analista"] });
  assert.equal(scoreEntity(firstIdentity, distinctIdentity).decision, "NEW_ENTITY", "textually similar contests with conflicting official identity must not merge");
  assert.equal(classifyDocumentRelationship({ title: "Edital 02/2026", incoming: distinctIdentity, candidate: firstIdentity }).relationship, "NEW_CONTEST");
  assert.equal(classifyDocumentRelationship({ title: "Retificação do Edital 01/2026", incoming: firstIdentity, candidate: firstIdentity }).relationship, "RETIFICATION");
  assert.equal(classifyDocumentRelationship({ title: "Republicação do Edital 01/2026", incoming: firstIdentity, candidate: firstIdentity }).relationship, "REPUBLICATION");
  assert.equal(classifyDocumentRelationship({ title: "Comunicado do Edital 01/2026", incoming: firstIdentity, candidate: firstIdentity }).relationship, "COMMUNICATION");

  for (const path of ["src/app/api/concursos/hot/route.ts", "src/app/api/concursos/[id]/route.ts", "src/lib/contest-page.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /limit\(1, \{ referencedTable: "simulados" \}\)/, `${path} must bound embedded simulations`);
    assert.match(source, /not\("simulados\.slug", "is", null\)/, `${path} must ignore generated null-slug simulations`);
  }

  const detail = readFileSync("src/app/api/concursos/[id]/route.ts", "utf8");
  assert.match(detail, /Promise\.all\(/, "independent detail reads must run in parallel");
  assert.match(detail, /"Cache-Control": "no-store"/, "detail data must not gain an unproven stale cache window");
  assert.doesNotMatch(detail, /stale-while-revalidate/);

  const deferredMap = readFileSync("src/components/DeferredHotConcursosMap.tsx", "utf8");
  assert.match(deferredMap, /IntersectionObserver/);
  assert.match(deferredMap, /if \(!active\) return/);
  assert.match(deferredMap, /dynamic\(\(\) => import\("@\/components\/HotConcursosMap"\)/);
  assert.doesNotMatch(readFileSync("src/app/globals.css", "utf8"), /leaflet\/dist\/leaflet\.css/);

  const generator = readFileSync("src/components/SimuladoGenerator.tsx", "utf8");
  assert.doesNotMatch(generator, /^import \{ supabase \}/m);
  assert.match(generator, /await import\("@\/lib\/supabase"\)/);

  const generateRoute = readFileSync("src/app/api/simulados/generate/route.ts", "utf8");
  assert.match(generateRoute, /publicContestIds\.has\(question\.concurso_id\)/, "questions from unpublished or merged contests must not be selectable");

  const nextConfig = readFileSync("next.config.ts", "utf8");
  assert.match(nextConfig, /serverExternalPackages:\s*\["pdf-parse", "@napi-rs\/canvas"\]/, "PDF parsing dependencies must retain their Node runtime files in serverless deployments");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string> };
  assert.ok(packageJson.dependencies?.["@napi-rs/canvas"], "pdfjs DOM primitives must be installed in the serverless runtime");
  assert.match(readFileSync("src/lib/collector/http.ts", "utf8"), /await import\("@napi-rs\/canvas"\)/, "the native canvas runtime must be included in the collector function trace");

  console.log("Sprint 2.8 bounded payloads, parallel reads, strict cache policy and deferred client work passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

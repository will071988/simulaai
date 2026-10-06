import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");
const progressRoute = readFileSync("src/app/api/progress/route.ts", "utf8");
const generateRoute = readFileSync("src/app/api/simulados/generate/route.ts", "utf8");

for (const metric of ["averageScore", "averageTimeSeconds", "questionsAnswered", "correctAnswers", "errors", "strongDisciplines", "weakDisciplines", "recentAttempts", "evolution"]) {
  assert.match(dashboard, new RegExp(metric), `dashboard must render ${metric}`);
}
assert.match(progressRoute, /authenticatedUser\(request\)/, "progress must require an authenticated user");
assert.match(progressRoute, /private, no-store/, "personal progress must be explicitly private and never cached");
assert.match(generateRoute, /p_user_id:\s*user\?\.id\s*\|\|\s*null/, "signed-in attempts must be linked to their owner");
assert.doesNotMatch(dashboard, /mockData|exampleMetrics|sampleScore/i, "dashboard must not contain fabricated metrics");

console.log("Sprint 2.1 authenticated progress route and real dashboard contract tests passed");

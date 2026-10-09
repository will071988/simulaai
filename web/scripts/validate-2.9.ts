import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const layout = read("src/app/layout.tsx");
const home = read("src/app/page.tsx");
const sitemap = read("src/app/sitemap.ts");
const robots = read("src/app/robots.ts");
const contestLayout = read("src/app/concursos/layout.tsx");
const contestPage = read("src/app/concursos/[id]/page.tsx");
const dashboardLayout = read("src/app/dashboard/layout.tsx");
const accountLayout = read("src/app/conta/layout.tsx");
const adminLayout = read("src/app/admin/layout.tsx");

assert.match(layout, /metadataBase:/);
assert.match(home, /alternates:\s*\{\s*canonical:\s*"\/"\s*\}/);
assert.match(sitemap, /is_publishable/);
assert.match(sitemap, /\/concursos\/\$\{contest\.id\}/);
assert.match(robots, /\/sitemap\.xml/);
assert.match(robots, /\/api\//);
assert.match(contestLayout, /canonical:\s*"\/concursos"/);
assert.match(contestPage, /generateMetadata/);
assert.match(contestPage, /application\/ld\+json/);
for (const privateLayout of [dashboardLayout, accountLayout, adminLayout]) {
  assert.match(privateLayout, /index:\s*false/);
  assert.match(privateLayout, /follow:\s*false/);
}
console.log("Sprint 2.9 SEO metadata, sitemap, robots, structured data and private noindex checks passed");

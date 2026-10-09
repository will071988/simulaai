import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const manifest = read("src/app/manifest.ts");
const sw = read("public/sw.js");
const register = read("src/components/ServiceWorkerRegistration.tsx");
const layout = read("src/app/layout.tsx");

assert.match(manifest, /display:\s*"standalone"/);
assert.match(manifest, /start_url:\s*"\/"|start_url:\s*"\/"?/);
assert.match(manifest, /purpose:\s*"maskable"/);
assert.match(sw, /\/api\//);
assert.match(sw, /\/admin/);
assert.match(sw, /\/dashboard/);
assert.match(sw, /\/conta/);
assert.match(sw, /OFFLINE_URL/);
assert.match(register, /navigator\.serviceWorker\.register\("\/sw\.js"/);
assert.match(layout, /ServiceWorkerRegistration/);
assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
console.log("Sprint 3.0 PWA/mobile installability and safe offline shell checks passed");

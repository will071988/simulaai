import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const listRoute = readFileSync("src/app/api/concursos/route.ts", "utf8");
const hotRoute = readFileSync("src/app/api/concursos/hot/route.ts", "utf8");
const map = readFileSync("src/components/HotConcursosMap.tsx", "utf8");
const config = readFileSync("next.config.ts", "utf8");
assert.match(listRoute, /\.is\("merged_into_id", null\)/);
assert.match(hotRoute, /\.is\("merged_into_id", null\)/);
assert.match(map, /tile\.openstreetmap\.org/);
assert.match(config, /tile\.openstreetmap\.org/);
assert.match(config, /frame-ancestors 'none'/);
console.log("frontend contract validation passed");

import assert from "node:assert/strict";
import { findSensitivePaths } from "../src/lib/api/exposure";

const safe = { data: { evidence: [{ value_json: 1 }], documents: [{ source_url: "https://example.com" }], identity_aliases: [] } };
assert.deepEqual(findSensitivePaths(safe), []);
for (const payload of [
  { raw_text: "secret" },
  { nested: { SUPABASE_SERVICE_ROLE_KEY: "secret" } },
  { list: [{ CRON_SECRET: "secret" }] },
  { metadata: { connection_string: "secret" } },
  { env: { TOKEN: "secret" } },
]) assert.ok(findSensitivePaths(payload).length > 0);
console.log("api exposure validation passed");

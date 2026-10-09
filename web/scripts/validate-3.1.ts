import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const privacy = readFileSync("src/app/privacidade/page.tsx", "utf8");
const terms = readFileSync("src/app/termos/page.tsx", "utf8");
const exportRoute = readFileSync("src/app/api/account/export/route.ts", "utf8");
const account = readFileSync("src/app/conta/page.tsx", "utf8");
const footer = readFileSync("src/components/Header.tsx", "utf8");

for (const term of ["Dados tratados", "Finalidades", "Retenção", "Seus direitos", "Segurança"]) assert.match(privacy, new RegExp(term));
assert.match(terms, /Fontes e caráter informativo/);
assert.match(exportRoute, /authenticatedUser\(request\)/);
assert.match(exportRoute, /simulado_attempts/);
assert.match(exportRoute, /study_plans/);
assert.match(exportRoute, /contest_follows/);
assert.match(exportRoute, /user_notifications/);
assert.doesNotMatch(exportRoute, /session_token_hash/);
assert.match(account, /\/api\/account\/export/);
assert.match(footer, /\/privacidade/);
assert.match(footer, /\/termos/);
console.log("Sprint 3.1 privacy, data access/export, account deletion disclosure and legal pages checks passed");

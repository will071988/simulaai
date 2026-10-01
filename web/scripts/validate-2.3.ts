import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("../supabase/migrations/20261001100000_contest_follows_and_notifications.sql", "utf8");
const page = readFileSync("src/app/acompanhamento/page.tsx", "utf8");
for (const type of ["NOVO_EDITAL", "RETIFICACAO", "INSCRICAO_ABERTA", "INSCRICAO_ENCERRANDO", "PROVA_MARCADA", "MUDANCA_RELEVANTE"]) assert.match(migration, new RegExp(type));
assert.match(migration, /where concurso_id = new\.concurso_id and is_following/, "events must fan out only to followers");
assert.match(migration, /on conflict do nothing/, "fanout must be idempotent and avoid duplicate notifications");
assert.doesNotMatch(migration + page, /send.*email|resend|smtp/i, "Sprint 2.3 must remain in-app without unconfigured email delivery");
assert.match(page, /Favoritar/); assert.match(page, /Seguir/); assert.match(page, /Marcar como lida/);
console.log("Sprint 2.3 relevant event taxonomy, idempotent in-app fanout and notification-center contract tests passed");

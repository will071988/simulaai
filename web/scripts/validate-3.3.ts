import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backup = readFileSync("../ops/backup-supabase.sh", "utf8");
const restore = readFileSync("../ops/verify-backup-restore.sh", "utf8");
const runbook = readFileSync("../docs/backup-recovery.md", "utf8");
const gitignore = readFileSync("../.gitignore", "utf8");

for (const command of ["--role-only", "schema.sql", "--data-only", "openssl enc", "sha256sum"]) {
  assert.ok(backup.includes(command), `backup flow must contain ${command}`);
}
assert.match(backup, /SUPABASE_DB_URL/);
assert.match(backup, /BACKUP_ENCRYPTION_KEY/);
assert.doesNotMatch(backup, /postgresql:\/\/[^"'$\s]+:[^"'$\s]+@/);

assert.match(restore, /ALLOW_RESTORE_TEST/);
assert.match(restore, /ukwulespvvthyjqgrjfo/);
assert.match(restore, /production database target detected/);
assert.match(restore, /ON_ERROR_STOP/);
assert.match(runbook, /RPO alvo/);
assert.match(runbook, /RTO alvo/);
assert.match(runbook, /Storage não são restaurados/);
assert.match(gitignore, /backups\//);
console.log("Sprint 3.3 encrypted backup, production restore guard and DR runbook checks passed");

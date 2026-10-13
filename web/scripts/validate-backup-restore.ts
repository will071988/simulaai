import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const work = mkdtempSync(join(tmpdir(), "simulaai-restore-guard-"));
const backup = join(work, "backup.enc").replaceAll("\\", "/");
const script = resolve("../ops/verify-backup-restore.sh").replaceAll("\\", "/");

function refused(database: string) {
  // A sentinel function ensures these negative tests never invoke a real psql.
  const result = spawnSync(bash, ["-c", 'psql() { echo DATABASE_CONNECTION_ATTEMPTED >&2; return 99; }; export -f psql; bash "$1"', "--", script], {
    env: {
      ...process.env,
      BACKUP_FILE: backup,
      BACKUP_ENCRYPTION_KEY: "isolated-test-only",
      RESTORE_DB_URL: database,
      ALLOW_RESTORE_TEST: "true",
    },
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, "unsafe restore must fail closed");
  assert.doesNotMatch(result.stderr, /DATABASE_CONNECTION_ATTEMPTED/);
  return result.stderr;
}

try {
  assert.match(refused("postgresql://db.ukwulespvvthyjqgrjfo.invalid/test"), /production database target detected/);
  assert.match(refused("postgresql://isolated.invalid/test"), /checksum file is required/);
  writeFileSync(`${backup}.sha256`, "");
  assert.match(refused("postgresql://isolated.invalid/test"), /checksum file is required/);
  writeFileSync(backup, "corrupted encrypted backup");
  writeFileSync(`${backup}.sha256`, `${"0".repeat(64)}  ${backup}\n`);
  assert.match(refused("postgresql://isolated.invalid/test"), /checksum did NOT match|FAILED/);
  console.log("Restore guard execution passed: production, missing/empty checksum and corruption rejected before database access");
} finally {
  rmSync(work, { recursive: true, force: true });
}

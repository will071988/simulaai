#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${RESTORE_DB_URL:?RESTORE_DB_URL is required}"
: "${ALLOW_RESTORE_TEST:?Set ALLOW_RESTORE_TEST=true for an isolated restore target}"

if [[ "$ALLOW_RESTORE_TEST" != "true" ]]; then
  echo "Restore drill refused: ALLOW_RESTORE_TEST must be true." >&2
  exit 1
fi

PRODUCTION_REF="ukwulespvvthyjqgrjfo"
if [[ "$RESTORE_DB_URL" == *"$PRODUCTION_REF"* ]]; then
  echo "Restore drill refused: production database target detected." >&2
  exit 1
fi

for cmd in openssl tar psql sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

if [[ -f "$BACKUP_FILE.sha256" ]]; then
  sha256sum -c "$BACKUP_FILE.sha256"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$BACKUP_FILE"   | tar -C "$WORK" -xzf -

for required in roles.sql schema.sql data.sql manifest.txt; do
  [[ -s "$WORK/$required" ]] || { echo "Backup is missing $required" >&2; exit 1; }
done

psql "$RESTORE_DB_URL" --set ON_ERROR_STOP=1 --file "$WORK/roles.sql"
psql "$RESTORE_DB_URL" --set ON_ERROR_STOP=1 --file "$WORK/schema.sql"
psql "$RESTORE_DB_URL" --set ON_ERROR_STOP=1 --file "$WORK/data.sql"

psql "$RESTORE_DB_URL" --set ON_ERROR_STOP=1 --tuples-only --command   "select 'concursos=' || count(*) from public.concursos;"

echo "Restore drill completed on isolated target."

#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

for cmd in supabase openssl tar sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

DUMP_MODE="${BACKUP_DUMP_MODE:-docker}"
case "$DUMP_MODE" in
  docker) ;;
  native)
    for cmd in pg_dump pg_dumpall bash sed uniq; do
      command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
    done
    ;;
  *) echo "BACKUP_DUMP_MODE must be docker or native." >&2; exit 1 ;;
esac

dump_to() {
  local output="$1"
  shift
  if [[ "$DUMP_MODE" == "native" ]]; then
    # Execute the installed CLI's own dump recipe with local PostgreSQL tools.
    # Its stdout contains connection credentials: pipe directly, never log it.
    # Windows PostgreSQL requires the full option spelling (Linux accepts the
    # CLI recipe's abbreviated --quote-all-identifier).
    supabase db dump --db-url "$SUPABASE_DB_URL" --dry-run "$@" \
      | sed -E 's/^([[:space:]]*)--quote-all-identifier([[:space:]])/\1--quote-all-identifiers\2/' \
      | bash > "$output"
  else
    supabase db dump --db-url "$SUPABASE_DB_URL" -f "$output" "$@"
  fi
}

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="${BACKUP_OUTPUT_DIR:-./backups}"
WORK="$(mktemp -d)"
ARCHIVE="$ROOT/simulaai-db-$STAMP.tar.gz.enc"
CHECKSUM="$ARCHIVE.sha256"
mkdir -p "$ROOT"
trap 'rm -rf "$WORK"' EXIT

umask 077

dump_to "$WORK/roles.sql" --role-only
dump_to "$WORK/schema.sql"
dump_to "$WORK/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

cat > "$WORK/manifest.txt" <<EOF
created_at_utc=$STAMP
format=simulaai-logical-backup-v1
contains=roles.sql,schema.sql,data.sql
encrypted=aes-256-cbc-pbkdf2
EOF

tar -C "$WORK" -czf - roles.sql schema.sql data.sql manifest.txt   | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -out "$ARCHIVE"

sha256sum "$ARCHIVE" > "$CHECKSUM"
echo "Encrypted backup created: $ARCHIVE"
echo "Checksum created: $CHECKSUM"

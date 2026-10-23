#!/usr/bin/env bash
# Fixture-only PostgreSQL backup/restore. No production credentials are used.
set -euo pipefail
umask 077
: "${BACKUP_SMOKE_ROOT:?Set BACKUP_SMOKE_ROOT to an existing local evidence directory}"
[[ -d "$BACKUP_SMOKE_ROOT" ]] || { echo "Evidence directory does not exist." >&2; exit 1; }
REPO="${BASH_SOURCE[0]%/*}/.."
WORK="$(mktemp -d "$BACKUP_SMOKE_ROOT/backup-smoke-XXXXXXXX")"
export PGHOST=127.0.0.1 PGPORT=55439 PGUSER=postgres PGCONNECT_TIMEOUT=10 PGCLIENTENCODING=UTF8 PGSSLMODE=disable
export PGPASSWORD="$(openssl rand -hex 32)"
export BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
PWFILE="$(mktemp)"
printf '%s' "$PGPASSWORD" > "$PWFILE"
STARTED=false
cleanup() {
  if [[ "$STARTED" == true ]]; then pg_ctl -D "$WORK/cluster" -m fast -w stop; fi
  rm -f "$PWFILE"
}
trap cleanup EXIT
initdb -D "$WORK/cluster" -U postgres --pwfile="$PWFILE" --auth=scram-sha-256 --encoding=UTF8 --locale=C > "$WORK/initdb.log" 2>&1
pg_ctl -D "$WORK/cluster" -l "$WORK/server.log" -o "-h 127.0.0.1 -p $PGPORT" -w start
STARTED=true
createdb backup_fixture
createdb restore_fixture
# stdin preserves UTF-8; Windows argv can convert accented SQL to a code page.
printf '%s\n' "CREATE TABLE public.concursos (id integer PRIMARY KEY, nome text NOT NULL); INSERT INTO public.concursos VALUES (1, 'Concurso sintético — ação'), (2, 'Somente fixture local');" | psql -X --no-password -d backup_fixture -v ON_ERROR_STOP=1 > "$WORK/fixture.log"
export SUPABASE_DB_URL="postgresql://postgres:$PGPASSWORD@127.0.0.1:$PGPORT/backup_fixture"
export BACKUP_OUTPUT_DIR="$WORK/encrypted"
export BACKUP_DUMP_MODE=native
bash "$REPO/ops/backup-supabase.sh"
files=("$BACKUP_OUTPUT_DIR/"*.tar.gz.enc)
[[ ${#files[@]} == 1 && -s "${files[0]}" ]]
export BACKUP_FILE="${files[0]}"
export RESTORE_DB_URL="postgresql://postgres:$PGPASSWORD@127.0.0.1:$PGPORT/restore_fixture"
export ALLOW_RESTORE_TEST=true
bash "$REPO/ops/verify-backup-restore.sh" > "$WORK/restore.log" 2>&1 || { cat "$WORK/restore.log"; exit 1; }
count="$(psql -X --no-password -d restore_fixture -At -c 'select count(*) from public.concursos;')"
[[ "$count" == 2 ]]
diff <(psql -X --no-password -d backup_fixture -At -c 'select id, nome from public.concursos order by id;') <(psql -X --no-password -d restore_fixture -At -c 'select id, nome from public.concursos order by id;')
printf 'Native backup/encrypt/checksum/decrypt/restore passed: %s rows; UTF-8 values identical.\n' "$count"
printf 'Fixture-only evidence directory: %s\n' "$WORK"
printf 'No production data was backed up or restored. Fixture secrets expire with this process.\n'

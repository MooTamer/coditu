#!/usr/bin/env bash
set -euo pipefail

# Decrypt a backup with Mohamed's local key, restore it into an already-running
# throwaway Supabase database, and compare every public/auth/storage table count
# with the source snapshot. Optional Storage S3 variables also round-trip every
# object through the throwaway Storage service.

umask 077

fail() {
  printf 'verify-backup-restore: %s\n' "$*" >&2
  exit 1
}

need_value() {
  restore_name=$1
  restore_present=${!restore_name:-}
  [ -n "$restore_present" ] || fail "$restore_name is required"
}

[ "$#" -eq 2 ] || fail "usage: verify-backup-restore.sh <archive.tar.gz.age> <private.agekey>"
restore_archive=$1
restore_private_key=$2
[ -f "$restore_archive" ] || fail "archive does not exist"
[ -f "$restore_private_key" ] || fail "private key does not exist"
need_value RESTORE_DB_URL

restore_temp_root=$(mktemp -d "${TMPDIR:-/tmp}/coditu-restore.XXXXXX")
restore_payload=$restore_temp_root/payload
restore_tar=$restore_temp_root/backup.tar.gz
mkdir -p "$restore_payload"
trap 'rm -rf "$restore_temp_root"' EXIT INT TERM

age --decrypt --identity "$restore_private_key" -o "$restore_tar" "$restore_archive"
tar -xzf "$restore_tar" -C "$restore_payload"
rm -f "$restore_tar"

for restore_required_file in roles.sql schema.sql data.sql row-counts.tsv manifest.json checksums.sha256; do
  [ -f "$restore_payload/$restore_required_file" ] || \
    fail "archive is missing $restore_required_file"
done

(
  cd "$restore_payload"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c checksums.sha256
  else
    shasum -a 256 -c checksums.sha256
  fi
) >/dev/null

restore_superuser=$(psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 \
  -c "select rolsuper from pg_roles where rolname = current_user")
[ "$restore_superuser" = t ] || fail "RESTORE_DB_URL must use the throwaway platform restore owner"

psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/roles.sql"
psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/schema.sql"
psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/data.sql"

restore_counts=$restore_temp_root/restored-row-counts.tsv
: > "$restore_counts"
for restore_schema in public auth storage; do
  psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 <<SQL >> "$restore_counts"
select format('select %L || E''\\t'' || count(*)::text from %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
from pg_tables
where schemaname = '$restore_schema'
  and tablename not in ('schema_migrations', 'migrations')
order by tablename;
\gexec
SQL
done
diff -u "$restore_payload/row-counts.tsv" "$restore_counts" >/dev/null || \
  fail "throwaway row counts do not match the source snapshot"

restore_expected_objects=$(jq -er '.storageObjects' "$restore_payload/manifest.json")
restore_archive_objects=$(find "$restore_payload/storage" -type f | wc -l | tr -d ' ')
[ "$restore_archive_objects" = "$restore_expected_objects" ] || \
  fail "archive contains $restore_archive_objects Storage files, expected $restore_expected_objects"

restore_storage_values=0
for restore_storage_name in RESTORE_STORAGE_S3_URL RESTORE_STORAGE_ACCESS_KEY_ID RESTORE_STORAGE_SECRET_ACCESS_KEY RESTORE_STORAGE_REGION; do
  restore_storage_value=${!restore_storage_name:-}
  [ -n "$restore_storage_value" ] && restore_storage_values=$((restore_storage_values + 1))
done
if [ "$restore_storage_values" -ne 0 ] && [ "$restore_storage_values" -ne 4 ]; then
  fail "set all four RESTORE_STORAGE_* variables or none"
fi

if [ "$restore_storage_values" -eq 4 ]; then
  restore_download=$restore_temp_root/storage-download
  mkdir -p "$restore_download"
  for restore_bucket_path in "$restore_payload"/storage/*; do
    [ -d "$restore_bucket_path" ] || continue
    restore_bucket=$(basename "$restore_bucket_path")
    AWS_ACCESS_KEY_ID=$RESTORE_STORAGE_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$RESTORE_STORAGE_SECRET_ACCESS_KEY \
    AWS_DEFAULT_REGION=$RESTORE_STORAGE_REGION \
      aws --endpoint-url "$RESTORE_STORAGE_S3_URL" s3 cp \
        "$restore_bucket_path" "s3://$restore_bucket" \
        --recursive --no-progress --only-show-errors
    mkdir -p "$restore_download/$restore_bucket"
    AWS_ACCESS_KEY_ID=$RESTORE_STORAGE_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$RESTORE_STORAGE_SECRET_ACCESS_KEY \
    AWS_DEFAULT_REGION=$RESTORE_STORAGE_REGION \
      aws --endpoint-url "$RESTORE_STORAGE_S3_URL" s3 sync \
        "s3://$restore_bucket" "$restore_download/$restore_bucket" --no-progress --only-show-errors
    diff -qr "$restore_bucket_path" "$restore_download/$restore_bucket" >/dev/null || \
      fail "Storage bytes differ after restoring bucket $restore_bucket"
  done
fi

printf 'restore_verified=true\n'
printf 'database_tables=%s\n' "$(wc -l < "$restore_counts" | tr -d ' ')"
printf 'database_rows=%s\n' "$(awk -F '\t' '{sum += $2} END {print sum + 0}' "$restore_counts")"
printf 'storage_objects=%s\n' "$restore_archive_objects"

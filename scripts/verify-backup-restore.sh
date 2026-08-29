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

# Managed tables are not in schema.sql — `auth.users`, `storage.buckets` and the
# rest are created by the platform's own services, and the restore target brings
# whatever shape its service version has. If that version is older than the
# source's, the data restore dies partway through on a column that does not
# exist, having already written everything before it.
#
# The 2026-08-29 drill hit this: hosted `storage.buckets` carries
# `versioning_status` and a `storage-api:v1.62.5` image does not, so the restore
# failed 1,729 lines into data.sql with `column "versioning_status" ... does not
# exist` and no statement about what to do. Say it before writing a row.
restore_preflight=$restore_temp_root/managed-columns.txt
# `COPY "auth"."users" ("id", "email", ...) FROM stdin;` — the identifiers are
# quoted, and the first version of this preflight assumed they were not. It
# matched nothing, and under `pipefail` a grep that matches nothing exits 1, so
# the whole verifier died with no message at all. Anchor on the quotes.
grep -oE '^COPY "[a-z_]+"\."[a-z_]+" \([^)]*\)' "$restore_payload/data.sql" |
  sed -E 's/^COPY "([a-z_]+)"\."([a-z_]+)" \((.*)\)$/\1|\2|\3/' |
  tr -d '"' |
  awk -F '|' '{gsub(/ /, "", $3); printf "%s\t%s\t%s\n", $1, $2, $3}' > "$restore_preflight"
[ -s "$restore_preflight" ] || fail "data.sql carries no COPY statements; this is not a recovery set"

restore_missing=$(
  while IFS=$'\t' read -r restore_ns restore_rel restore_cols; do
    [ -n "$restore_rel" ] || continue
    psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 <<SQL
select '$restore_ns.$restore_rel: ' || string_agg(c, ', ')
from unnest(string_to_array('$restore_cols', ',')) as c
where to_regclass('$restore_ns.$restore_rel') is not null
  and not exists (
    select 1 from information_schema.columns
    where table_schema = '$restore_ns' and table_name = '$restore_rel' and column_name = c
  )
having count(*) > 0;
SQL
  done < "$restore_preflight"
)
[ -z "$restore_missing" ] || fail "the restore target is missing columns this backup carries, which means its Supabase service versions are older than the source's. Restore into a project at least as new as the one backed up. Missing: $restore_missing"


psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/roles.sql"
psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/schema.sql"

psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/data.sql"

restore_counts=$restore_temp_root/restored-row-counts.tsv
restore_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 \
  -f "$restore_script_dir/sql/row-counts.sql" > "$restore_counts"

# Compare the tables the BACKUP describes, one by one. Requiring the two table
# lists to be identical is the wrong assertion and it failed the 2026-08-29
# drill for the right-looking wrong reason: the local Storage image has
# `storage.iceberg_namespaces` and `storage.iceberg_tables`, the hosted project
# does not, and both were empty. A restore target will always carry some
# platform scaffolding the source did not.
#
# So: every table in the backup must exist in the target with exactly its
# count, and any table the target has that the backup does not describe must be
# EMPTY. That still catches a missing table, a short table, and a target that
# was not clean — which is everything the identical-list check caught, minus the
# false alarm.
restore_mismatch=$(
  awk -F '\t' 'NR == FNR { restored[$1] = $2; seen[$1] = 1; next }
    { if (!($1 in restored)) print "missing from the target: " $1;
      else if (restored[$1] != $2) print $1 " has " restored[$1] " rows, the backup recorded " $2;
      described[$1] = 1 }
    END { for (t in seen) if (!(t in described) && restored[t] + 0 > 0)
            print "the target already held " restored[t] " rows in " t ", which this backup does not describe" }' \
    "$restore_counts" "$restore_payload/row-counts.tsv"
)
[ -z "$restore_mismatch" ] || \
  fail "throwaway row counts do not match the source snapshot: $restore_mismatch"

restore_extra=$(awk -F '\t' 'NR == FNR { described[$1] = 1; next }
  { if (!($1 in described)) print $1 }' "$restore_payload/row-counts.tsv" "$restore_counts" | paste -sd, -)

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
printf 'database_tables=%s\n' "$(grep -c . "$restore_payload/row-counts.tsv" | tr -d ' ')"
printf 'target_only_empty_tables=%s\n' "${restore_extra:-none}"
printf 'database_rows=%s\n' "$(awk -F '\t' '{sum += $2} END {print sum + 0}' "$restore_payload/row-counts.tsv")"
printf 'storage_objects=%s\n' "$restore_archive_objects"

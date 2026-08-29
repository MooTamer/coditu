#!/usr/bin/env bash
set -euo pipefail

# Build one encrypted recovery set from a dedicated read-only Postgres login
# and the Supabase Storage S3 endpoint. The only durable plaintext this script
# writes is the non-sensitive metadata sidecar. Database rows and Storage bytes
# exist on disk only inside a mode-0700 temporary directory and are removed by
# the exit trap.

umask 077

backup_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_repo_root=$(CDPATH= cd -- "$backup_script_dir/.." && pwd)
backup_recipient_file=${BACKUP_RECIPIENT_FILE:-$backup_repo_root/ops/backup-recipient.txt}
backup_postgres_image=${BACKUP_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.143}
backup_pg_runtime=${BACKUP_PG_RUNTIME:-docker}
backup_upload=${BACKUP_UPLOAD:-0}
backup_storage_mode=${SOURCE_STORAGE_MODE:-s3}

fail() {
  printf 'backup: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

need_value() {
  value_name=$1
  value_present=${!value_name:-}
  [ -n "$value_present" ] || fail "$value_name is required"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_bytes() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

for backup_command in age docker jq psql sed supabase tar; do
  need_command "$backup_command"
done
need_value BACKUP_DB_URL
need_value BACKUP_LOCAL_DIR

# Storage bytes are not in any database dump, so they are copied separately.
# There are two ways in, and which one is available is a credential question,
# not a preference:
#
#   s3   — the S3-compatible endpoint with an access key pair. Least coupled to
#          the app, but the key pair can only be minted in the dashboard by a
#          human; the Management API has no endpoint for it.
#   rest — the Storage REST API with the service-role key, listing objects from
#          `storage.objects` rather than from the bucket. Available wherever the
#          project's own server credentials are, which is what made the first
#          hosted recovery set possible at all.
#
# The honest trade: the REST leg holds a credential that can also WRITE, where
# the database leg deliberately cannot. It is not least privilege. It is the
# only card-free path to a Storage copy today, and a Storage copy that exists
# beats a least-privilege one that does not.
case "$backup_storage_mode" in
  s3)
    need_command aws
    need_value SOURCE_STORAGE_S3_URL
    need_value SOURCE_STORAGE_ACCESS_KEY_ID
    need_value SOURCE_STORAGE_SECRET_ACCESS_KEY
    need_value SOURCE_STORAGE_REGION
    ;;
  rest)
    need_command curl
    need_value SOURCE_STORAGE_REST_URL
    need_value SOURCE_STORAGE_SERVICE_KEY
    ;;
  *) fail "SOURCE_STORAGE_MODE must be s3 or rest" ;;
esac

[ -f "$backup_recipient_file" ] || fail "public age recipient not found: $backup_recipient_file"
backup_recipient=$(tr -d '[:space:]' < "$backup_recipient_file")
case "$backup_recipient" in
  age1*) ;;
  *) fail "the recipient file does not contain an age public key" ;;
esac

case "$BACKUP_LOCAL_DIR" in
  ""|/) fail "BACKUP_LOCAL_DIR must be a dedicated directory" ;;
esac
mkdir -p "$BACKUP_LOCAL_DIR"
chmod 700 "$BACKUP_LOCAL_DIR"

backup_id=${BACKUP_ID:-$(date -u +%Y-%m-%dT%H%M%SZ)}
backup_created_at=${BACKUP_CREATED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
printf '%s\n' "$backup_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
  fail "BACKUP_ID must look like 2026-08-28T031500Z"

backup_temp_base=${BACKUP_TMP_DIR:-}
if [ -z "$backup_temp_base" ]; then
  if [ -d /private/tmp ]; then
    backup_temp_base=/private/tmp
  else
    backup_temp_base=/tmp
  fi
fi
backup_temp_root=$(mktemp -d "$backup_temp_base/coditu-backup.XXXXXX")
backup_payload_dir=$backup_temp_root/payload
backup_tool_dir=$backup_temp_root/tooling
backup_archive=$BACKUP_LOCAL_DIR/$backup_id.tar.gz.age
backup_metadata=$BACKUP_LOCAL_DIR/$backup_id.metadata.json
backup_archive_tmp=$BACKUP_LOCAL_DIR/.$backup_id.tar.gz.age.tmp
backup_metadata_tmp=$BACKUP_LOCAL_DIR/.$backup_id.metadata.json.tmp
mkdir -p "$backup_payload_dir/storage" "$backup_tool_dir"

cleanup_backup() {
  rm -rf "$backup_temp_root"
  rm -f "$backup_archive_tmp" "$backup_metadata_tmp"
}
trap cleanup_backup EXIT INT TERM

# A successful connection is not enough: without BYPASSRLS, pg_dump writes an
# apparently healthy file whose protected tables are empty. Assert both sides
# of the role contract before a byte is backed up.
backup_role_state=$(psql -X -qAt "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -c \
  "select current_user || '|' || rolbypassrls || '|' || has_table_privilege(current_user, 'public.work_items', 'select') || '|' || has_table_privilege(current_user, 'public.work_items', 'insert') from pg_roles where rolname = current_user")
[ "$backup_role_state" = 'coditu_backup|true|true|false' ] || \
  fail "BACKUP_DB_URL is not the read-only coditu_backup role"

# Supabase CLI 2.109.1 generates the platform-aware exclusions and sed filters
# we need, but it also hard-codes `--role postgres`. That makes a genuinely
# least-privilege connection fail at `SET ROLE postgres`. Generate the command
# with a placeholder credential, assert the one escalation line is present,
# remove only that line, and execute the rest unchanged with the real URL held
# in an environment variable. If the CLI changes shape, this fails closed.
render_dump() {
  dump_kind=$1
  dump_output=$2
  dump_raw=$backup_tool_dir/$dump_kind.raw.sh
  dump_run=$backup_tool_dir/$dump_kind.run.sh
  dump_placeholder='postgresql://coditu_backup:placeholder@127.0.0.1:5432/postgres'

  case "$dump_kind" in
    roles)
      supabase db dump --db-url "$dump_placeholder" --role-only --dry-run > "$dump_raw"
      ;;
    schema)
      supabase db dump --db-url "$dump_placeholder" --dry-run > "$dump_raw"
      ;;
    data)
      supabase db dump --db-url "$dump_placeholder" --data-only --use-copy --dry-run > "$dump_raw"
      ;;
    *) fail "unknown dump kind: $dump_kind" ;;
  esac

  forced_role_count=$(grep -c -- '--role "postgres"' "$dump_raw" || true)
  [ "$forced_role_count" -eq 1 ] || \
    fail "Supabase CLI dump shape changed: expected one forced postgres role in $dump_kind"

  sed -E \
    -e '/^export PG(HOST|PORT|USER|PASSWORD|DATABASE)=/d' \
    -e '/^[[:space:]]*--role "postgres" \\$/d' \
    -e 's/^(pg_dump(all)?) \\$/\1 --dbname "$BACKUP_DB_URL" \\/' \
    "$dump_raw" > "$dump_run"

  grep -q -- '--dbname "$BACKUP_DB_URL"' "$dump_run" || \
    fail "sanitised $dump_kind script has no connection URL"
  if grep -q -- '--role "postgres"' "$dump_run"; then
    fail "sanitised $dump_kind script still escalates to postgres"
  fi
  chmod 700 "$dump_run"

  if [ "$backup_pg_runtime" = docker ]; then
    need_value BACKUP_DB_URL_CONTAINER
    BACKUP_DB_URL=$BACKUP_DB_URL_CONTAINER docker run --rm -i \
      --add-host host.docker.internal:host-gateway \
      -e BACKUP_DB_URL \
      --entrypoint bash \
      "$backup_postgres_image" \
      -s < "$dump_run" > "$dump_output"
  elif [ "$backup_pg_runtime" = host ]; then
    BACKUP_DB_URL=$BACKUP_DB_URL bash "$dump_run" > "$dump_output"
  else
    fail "BACKUP_PG_RUNTIME must be docker or host"
  fi

  [ -s "$dump_output" ] || fail "$dump_kind dump is empty"
}

render_dump roles "$backup_payload_dir/roles.sql"
render_dump schema "$backup_payload_dir/schema.sql"
render_dump data "$backup_payload_dir/data.sql"

# Counts are recovery evidence, not a guess from file size. They travel inside
# the encrypted archive and are compared table-by-table during the restore.
: > "$backup_payload_dir/row-counts.tsv"
for backup_schema in public auth storage; do
  psql -X -qAt "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 <<SQL >> "$backup_payload_dir/row-counts.tsv"
select format('select %L || E''\\t'' || count(*)::text from %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
from pg_tables
where schemaname = '$backup_schema'
  and tablename not in ('schema_migrations', 'migrations')
order by tablename;
\gexec
SQL
done

backup_table_count=$(wc -l < "$backup_payload_dir/row-counts.tsv" | tr -d ' ')
backup_row_count=$(awk -F '\t' '{sum += $2} END {print sum + 0}' "$backup_payload_dir/row-counts.tsv")
[ "$backup_table_count" -gt 0 ] || fail "the row-count manifest contains no tables"

backup_bucket_list=$backup_tool_dir/buckets.txt
backup_included_buckets=$backup_tool_dir/included-buckets.txt
psql -X -qAt "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 \
  -c "select id from storage.buckets order by id" > "$backup_bucket_list"
: > "$backup_included_buckets"

while IFS= read -r backup_bucket; do
  [ -n "$backup_bucket" ] || continue
  case "$backup_bucket" in
    *[!A-Za-z0-9._-]*) fail "unsafe Storage bucket name: $backup_bucket" ;;
  esac
  case ",${SOURCE_STORAGE_EXCLUDE_BUCKETS:-}," in
    *",$backup_bucket,"*) continue ;;
  esac
  printf '%s\n' "$backup_bucket" >> "$backup_included_buckets"
done < "$backup_bucket_list"

count_storage_rows() {
  storage_total=0
  while IFS= read -r storage_bucket; do
    [ -n "$storage_bucket" ] || continue
    storage_count=$(psql -X -qAt "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 \
      -c "select count(*) from storage.objects where bucket_id = '$storage_bucket'")
    storage_total=$((storage_total + storage_count))
  done < "$backup_included_buckets"
  printf '%s\n' "$storage_total"
}

backup_storage_before=$(count_storage_rows)

# Percent-encode everything outside the unreserved set, but leave `/` alone:
# object names carry their folder structure and the path separator must survive.
url_encode_object_path() {
  printf '%s' "$1" | jq -sRr '@uri' | sed 's/%2F/\//g'
}

# One curl per bucket rather than one per object, for two reasons that both
# turned out to matter on the first hosted run: the TLS handshake to Storage
# costs several seconds and is worth paying once, and a per-object invocation
# puts the service-role key in this machine's process list 135 times over. The
# key is written once into a mode-0600 file inside the mode-0700 temp tree that
# the exit trap removes, and curl reads it from there.
#
# Every request is bounded. The first attempt at this leg ran without a timeout
# and sat on a single object for six minutes with nothing on stdout to say so;
# an unbounded backup is a backup that can hang the schedule it runs on.
copy_bucket_over_rest() {
  rest_bucket=$1
  rest_listing=$backup_tool_dir/objects-$rest_bucket.txt
  rest_config=$backup_tool_dir/curl-$rest_bucket.conf
  psql -X -qAt "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 \
    -c "select name from storage.objects where bucket_id = '$rest_bucket' order by name" \
    > "$rest_listing"

  : > "$rest_config"
  chmod 600 "$rest_config"
  printf 'header = "Authorization: Bearer %s"\n' "$SOURCE_STORAGE_SERVICE_KEY" >> "$rest_config"
  printf 'silent\nshow-error\nfail-early\ncreate-dirs\nretry = 3\nretry-delay = 2\nretry-all-errors\nconnect-timeout = 15\nmax-time = 300\n' >> "$rest_config"

  rest_objects=0
  while IFS= read -r rest_object; do
    [ -n "$rest_object" ] || continue
    # Fail closed on anything that could escape the payload directory or break
    # the config-file quoting, rather than encoding around it.
    case "$rest_object" in
      /*|*..*|*'"'*|*'\'*) fail "unsafe Storage object name in $rest_bucket: $rest_object" ;;
    esac
    printf 'url = "%s/storage/v1/object/%s/%s"\noutput = "%s"\n' \
      "${SOURCE_STORAGE_REST_URL%/}" "$rest_bucket" "$(url_encode_object_path "$rest_object")" \
      "$backup_payload_dir/storage/$rest_bucket/$rest_object" >> "$rest_config"
    rest_objects=$((rest_objects + 1))
  done < "$rest_listing"

  printf 'backup: copying %s object(s) from %s over REST\n' "$rest_objects" "$rest_bucket" >&2
  [ "$rest_objects" -gt 0 ] || return 0
  curl --config "$rest_config" || fail "Storage REST copy failed for bucket $rest_bucket"
}

while IFS= read -r backup_bucket; do
  mkdir -p "$backup_payload_dir/storage/$backup_bucket"
  if [ "$backup_storage_mode" = s3 ]; then
    AWS_ACCESS_KEY_ID=$SOURCE_STORAGE_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$SOURCE_STORAGE_SECRET_ACCESS_KEY \
    AWS_DEFAULT_REGION=$SOURCE_STORAGE_REGION \
      aws --endpoint-url "$SOURCE_STORAGE_S3_URL" s3 sync \
        "s3://$backup_bucket" "$backup_payload_dir/storage/$backup_bucket" \
        --no-progress --only-show-errors
  else
    copy_bucket_over_rest "$backup_bucket"
  fi
done < "$backup_included_buckets"

backup_storage_after=$(count_storage_rows)
[ "$backup_storage_before" = "$backup_storage_after" ] || \
  fail "Storage changed during the copy ($backup_storage_before before, $backup_storage_after after)"
backup_storage_files=$(find "$backup_payload_dir/storage" -type f | wc -l | tr -d ' ')
[ "$backup_storage_files" = "$backup_storage_after" ] || \
  fail "Storage copy has $backup_storage_files files for $backup_storage_after database objects"
backup_bucket_count=$(grep -c . "$backup_included_buckets" || true)

jq -n \
  --arg formatVersion '1' \
  --arg backupId "$backup_id" \
  --arg createdAt "$backup_created_at" \
  --argjson databaseTables "$backup_table_count" \
  --argjson databaseRows "$backup_row_count" \
  --argjson storageBuckets "$backup_bucket_count" \
  --argjson storageObjects "$backup_storage_files" \
  '{formatVersion: $formatVersion, backupId: $backupId, createdAt: $createdAt, databaseTables: $databaseTables, databaseRows: $databaseRows, storageBuckets: $storageBuckets, storageObjects: $storageObjects}' \
  > "$backup_payload_dir/manifest.json"

(
  cd "$backup_payload_dir"
  find . -type f ! -name checksums.sha256 -print0 | LC_ALL=C sort -z |
    while IFS= read -r -d '' backup_file; do
      backup_hash=$(sha256_file "$backup_file")
      printf '%s  %s\n' "$backup_hash" "${backup_file#./}"
    done
) > "$backup_payload_dir/checksums.sha256"

tar -C "$backup_payload_dir" -czf - . |
  age --encrypt --recipients-file "$backup_recipient_file" -o "$backup_archive_tmp"
[ -s "$backup_archive_tmp" ] || fail "age produced an empty archive"

backup_archive_sha=$(sha256_file "$backup_archive_tmp")
backup_archive_bytes=$(file_bytes "$backup_archive_tmp")
jq -n \
  --arg formatVersion '1' \
  --arg backupId "$backup_id" \
  --arg createdAt "$backup_created_at" \
  --arg archive "$backup_id.tar.gz.age" \
  --arg sha256 "$backup_archive_sha" \
  --argjson bytes "$backup_archive_bytes" \
  --argjson databaseTables "$backup_table_count" \
  --argjson databaseRows "$backup_row_count" \
  --argjson storageBuckets "$backup_bucket_count" \
  --argjson storageObjects "$backup_storage_files" \
  '{formatVersion: $formatVersion, backupId: $backupId, createdAt: $createdAt, archive: $archive, sha256: $sha256, bytes: $bytes, databaseTables: $databaseTables, databaseRows: $databaseRows, storageBuckets: $storageBuckets, storageObjects: $storageObjects}' \
  > "$backup_metadata_tmp"

mv "$backup_archive_tmp" "$backup_archive"
mv "$backup_metadata_tmp" "$backup_metadata"

if [ "$backup_upload" = 1 ]; then
  "$backup_script_dir/upload-backup.sh" "$backup_archive" "$backup_metadata"
elif [ "$backup_upload" != 0 ]; then
  fail "BACKUP_UPLOAD must be 0 or 1"
fi

printf 'backup_id=%s\n' "$backup_id"
printf 'archive=%s\n' "$backup_archive"
printf 'metadata=%s\n' "$backup_metadata"
printf 'database_tables=%s\n' "$backup_table_count"
printf 'database_rows=%s\n' "$backup_row_count"
printf 'storage_buckets=%s\n' "$backup_bucket_count"
printf 'storage_objects=%s\n' "$backup_storage_files"

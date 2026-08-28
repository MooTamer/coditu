#!/usr/bin/env bash
set -euo pipefail

# Read the off-site copy rather than trusting the writer's exit status. A
# successful invocation prints only non-secret evidence and is safe to use as
# the prerequisite for an external heartbeat.

fail() {
  printf 'check-backup-freshness: %s\n' "$*" >&2
  exit 1
}

need_value() {
  canary_name=$1
  canary_present=${!canary_name:-}
  [ -n "$canary_present" ] || fail "$canary_name is required"
}

file_bytes() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

for canary_required in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  need_value "$canary_required"
done

canary_prefix=${R2_PREFIX:-coditu}
canary_max_age=${BACKUP_MAX_AGE_SECONDS:-93600}
canary_future_skew=${BACKUP_MAX_FUTURE_SKEW_SECONDS:-300}

case "$canary_prefix" in
  ""|/*|*..*) fail "R2_PREFIX must be a narrow relative prefix" ;;
  *[!A-Za-z0-9._/-]*) fail "R2_PREFIX contains unsafe characters" ;;
esac
case "$R2_BUCKET" in
  ""|*/*) fail "R2_BUCKET must be one bucket name" ;;
esac
printf '%s\n' "$canary_max_age" | grep -Eq '^[1-9][0-9]*$' ||
  fail "BACKUP_MAX_AGE_SECONDS must be a positive integer"
printf '%s\n' "$canary_future_skew" | grep -Eq '^[0-9]+$' ||
  fail "BACKUP_MAX_FUTURE_SKEW_SECONDS must be a non-negative integer"

for canary_command in aws jq node; do
  command -v "$canary_command" >/dev/null 2>&1 || fail "missing required command: $canary_command"
done

r2_aws() {
  AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
  AWS_DEFAULT_REGION=${R2_REGION:-auto} \
    aws --endpoint-url "$R2_ENDPOINT" "$@"
}

canary_root=$canary_prefix/nightly
canary_listing=$(r2_aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "$canary_root/" \
  --output json) || fail "cannot list nightly recovery sets"
canary_latest=$(printf '%s' "$canary_listing" | jq -cr \
  --arg root "$canary_root/" \
  '[.Contents[]? | select(.Key | startswith($root)) | select(.Key | endswith(".tar.gz.age"))] | sort_by(.LastModified) | last // empty') ||
  fail "cannot parse the nightly recovery-set listing"
[ -n "$canary_latest" ] || fail "no nightly encrypted recovery set exists"

canary_key=$(printf '%s' "$canary_latest" | jq -er '.Key') ||
  fail "newest recovery set has no object key"
canary_relative=${canary_key#"$canary_root/"}
[ "$canary_relative" != "$canary_key" ] || fail "newest object is outside the nightly prefix"
canary_id=${canary_relative%%/*}
printf '%s\n' "$canary_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
  fail "newest object has an unexpected recovery-set id"
[ "$canary_key" = "$canary_root/$canary_id/$canary_id.tar.gz.age" ] ||
  fail "newest object has an unexpected recovery-set key"
canary_metadata_key=$canary_root/$canary_id/$canary_id.metadata.json

canary_head=$(r2_aws s3api head-object --bucket "$R2_BUCKET" --key "$canary_key") ||
  fail "cannot read newest encrypted archive metadata"
canary_metadata_head=$(r2_aws s3api head-object --bucket "$R2_BUCKET" --key "$canary_metadata_key") ||
  fail "newest recovery set has no metadata sidecar"
canary_bytes=$(printf '%s' "$canary_head" | jq -er '.ContentLength') ||
  fail "newest encrypted archive has no byte size"
canary_metadata_bytes=$(printf '%s' "$canary_metadata_head" | jq -er '.ContentLength') ||
  fail "newest metadata sidecar has no byte size"
canary_sha=$(printf '%s' "$canary_head" | jq -er '.Metadata.sha256') ||
  fail "newest encrypted archive has no SHA-256 metadata"
canary_head_id=$(printf '%s' "$canary_head" | jq -er '.Metadata["backup-id"]') ||
  fail "newest encrypted archive has no backup-id metadata"
canary_last_modified=$(printf '%s' "$canary_head" | jq -er '.LastModified') ||
  fail "newest encrypted archive has no LastModified timestamp"

printf '%s\n' "$canary_bytes" | grep -Eq '^[1-9][0-9]*$' ||
  fail "newest encrypted archive is empty"
printf '%s\n' "$canary_metadata_bytes" | grep -Eq '^[1-9][0-9]*$' ||
  fail "newest recovery set has no non-empty metadata sidecar"
printf '%s\n' "$canary_sha" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "newest encrypted archive has no SHA-256 metadata"
[ "$canary_head_id" = "$canary_id" ] ||
  fail "newest encrypted archive backup-id metadata does not match its key"

# The sidecar is small, non-secret evidence. Read it rather than treating its
# mere existence as proof that the writer finished recording the set.
canary_temp_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coditu-canary.XXXXXX")
canary_metadata=$canary_temp_root/$canary_id.metadata.json
trap 'rm -rf "$canary_temp_root"' EXIT INT TERM
r2_aws s3 cp "s3://$R2_BUCKET/$canary_metadata_key" "$canary_metadata" \
  --only-show-errors || fail "cannot download newest recovery-set sidecar"
[ "$(file_bytes "$canary_metadata")" = "$canary_metadata_bytes" ] ||
  fail "newest recovery-set sidecar size changed while it was read"

canary_sidecar_id=$(jq -er '.backupId' "$canary_metadata") || fail "sidecar has no backup id"
canary_sidecar_archive=$(jq -er '.archive' "$canary_metadata") || fail "sidecar has no archive name"
canary_sidecar_sha=$(jq -er '.sha256' "$canary_metadata") || fail "sidecar has no SHA-256"
canary_sidecar_bytes=$(jq -er '.bytes | select(type == "number" and . > 0 and floor == .)' "$canary_metadata") ||
  fail "sidecar has no encrypted byte size"
canary_format=$(jq -er '.formatVersion' "$canary_metadata") || fail "sidecar has no format version"
canary_database_tables=$(jq -er '.databaseTables | select(type == "number" and . > 0 and floor == .)' "$canary_metadata") ||
  fail "sidecar has no database table count"
canary_database_rows=$(jq -er '.databaseRows | select(type == "number" and . >= 0 and floor == .)' "$canary_metadata") ||
  fail "sidecar has no database row count"
canary_storage_buckets=$(jq -er '.storageBuckets | select(type == "number" and . >= 0 and floor == .)' "$canary_metadata") ||
  fail "sidecar has no Storage bucket count"
canary_storage_objects=$(jq -er '.storageObjects | select(type == "number" and . >= 0 and floor == .)' "$canary_metadata") ||
  fail "sidecar has no Storage object count"

[ "$canary_format" = 1 ] || fail "unsupported recovery-set format: $canary_format"
[ "$canary_sidecar_id" = "$canary_id" ] || fail "sidecar backup id does not match its key"
[ "$canary_sidecar_archive" = "$canary_id.tar.gz.age" ] || fail "sidecar archive name does not match its key"
[ "$canary_sidecar_sha" = "$canary_sha" ] || fail "sidecar SHA-256 does not match R2 metadata"
[ "$canary_sidecar_bytes" = "$canary_bytes" ] || fail "sidecar byte size does not match R2"

canary_age=$(CANARY_LAST_MODIFIED="$canary_last_modified" \
  CANARY_REFERENCE_TIME="${BACKUP_CANARY_NOW:-}" \
  node - <<'NODE'
const lastModified = Date.parse(process.env.CANARY_LAST_MODIFIED ?? "");
const reference = process.env.CANARY_REFERENCE_TIME
  ? Date.parse(process.env.CANARY_REFERENCE_TIME)
  : Date.now();

if (!Number.isFinite(lastModified) || !Number.isFinite(reference)) {
  process.exit(2);
}

process.stdout.write(String(Math.floor((reference - lastModified) / 1000)));
NODE
) || fail "newest archive has an invalid LastModified timestamp"

if [ "$canary_age" -lt "-$canary_future_skew" ]; then
  fail "newest encrypted archive is implausibly far in the future"
fi
if [ "$canary_age" -gt "$canary_max_age" ]; then
  fail "newest encrypted archive is ${canary_age}s old; limit is ${canary_max_age}s"
fi

printf 'backup_id=%s\n' "$canary_id"
printf 'age_seconds=%s\n' "$canary_age"
printf 'encrypted_bytes=%s\n' "$canary_bytes"
printf 'database_tables=%s\n' "$canary_database_tables"
printf 'database_rows=%s\n' "$canary_database_rows"
printf 'storage_buckets=%s\n' "$canary_storage_buckets"
printf 'storage_objects=%s\n' "$canary_storage_objects"

if [ -n "${BACKUP_CANARY_OUTPUT:-}" ]; then
  canary_output_parent=$(dirname -- "$BACKUP_CANARY_OUTPUT")
  [ -d "$canary_output_parent" ] || fail "BACKUP_CANARY_OUTPUT parent does not exist"
  canary_output_temp=$BACKUP_CANARY_OUTPUT.tmp.$$
  jq -n \
    --arg backupId "$canary_id" \
    --arg lastModifiedAt "$canary_last_modified" \
    --arg sha256 "$canary_sha" \
    --argjson encryptedBytes "$canary_bytes" \
    --argjson databaseTables "$canary_database_tables" \
    --argjson databaseRows "$canary_database_rows" \
    --argjson storageBuckets "$canary_storage_buckets" \
    --argjson storageObjects "$canary_storage_objects" \
    '{backupId: $backupId, lastModifiedAt: $lastModifiedAt, encryptedBytes: $encryptedBytes, sha256: $sha256, databaseTables: $databaseTables, databaseRows: $databaseRows, storageBuckets: $storageBuckets, storageObjects: $storageObjects}' \
    > "$canary_output_temp"
  chmod 600 "$canary_output_temp"
  mv "$canary_output_temp" "$BACKUP_CANARY_OUTPUT"
fi

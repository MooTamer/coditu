#!/usr/bin/env bash
set -euo pipefail

# Prove that the newest monthly ciphertext can be read back intact without
# giving the scheduled job Mohamed's decryption key. This is an integrity
# check, not a restore; the quarterly runbook performs the real restore.

umask 077

fail() {
  printf 'check-backup-integrity: %s\n' "$*" >&2
  exit 1
}

need_value() {
  integrity_name=$1
  integrity_present=${!integrity_name:-}
  [ -n "$integrity_present" ] || fail "$integrity_name is required"
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

for integrity_required in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  need_value "$integrity_required"
done
for integrity_command in aws jq; do
  command -v "$integrity_command" >/dev/null 2>&1 ||
    fail "missing required command: $integrity_command"
done

integrity_prefix=${R2_PREFIX:-coditu}
case "$integrity_prefix" in
  ""|/*|*..*) fail "R2_PREFIX must be a narrow relative prefix" ;;
  *[!A-Za-z0-9._/-]*) fail "R2_PREFIX contains unsafe characters" ;;
esac
case "$R2_BUCKET" in
  ""|*/*) fail "R2_BUCKET must be one bucket name" ;;
esac

r2_aws() {
  AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
  AWS_DEFAULT_REGION=${R2_REGION:-auto} \
    aws --endpoint-url "$R2_ENDPOINT" "$@"
}

integrity_root=$integrity_prefix/monthly
integrity_listing=$(r2_aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "$integrity_root/" \
  --output json) || fail "cannot list monthly recovery sets"
integrity_latest=$(printf '%s' "$integrity_listing" | jq -cr \
  --arg root "$integrity_root/" \
  '[.Contents[]? | select(.Key | startswith($root)) | select(.Key | endswith(".tar.gz.age"))] | sort_by(.LastModified) | last // empty') ||
  fail "cannot parse the monthly recovery-set listing"
[ -n "$integrity_latest" ] || fail "no monthly encrypted recovery set exists"

integrity_archive_key=$(printf '%s' "$integrity_latest" | jq -er '.Key') ||
  fail "newest monthly recovery set has no object key"
integrity_relative=${integrity_archive_key#"$integrity_root/"}
[ "$integrity_relative" != "$integrity_archive_key" ] ||
  fail "newest object is outside the monthly prefix"
integrity_id=${integrity_relative%%/*}
printf '%s\n' "$integrity_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-01T[0-9]{6}Z$' ||
  fail "monthly recovery-set id is not from day 01"
[ "$integrity_archive_key" = "$integrity_root/$integrity_id/$integrity_id.tar.gz.age" ] ||
  fail "newest monthly object has an unexpected key"
integrity_metadata_key=$integrity_root/$integrity_id/$integrity_id.metadata.json

integrity_set_listing=$(r2_aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "$integrity_root/$integrity_id/" \
  --output json) || fail "cannot list the newest monthly recovery set"
printf '%s' "$integrity_set_listing" | jq -e \
  --arg archive "$integrity_archive_key" \
  --arg metadata "$integrity_metadata_key" \
  '([.Contents[]?.Key] | sort) == ([$archive, $metadata] | sort)' >/dev/null ||
  fail "monthly recovery set does not contain exactly the ciphertext and sidecar"

integrity_archive_head=$(r2_aws s3api head-object \
  --bucket "$R2_BUCKET" --key "$integrity_archive_key") ||
  fail "cannot read monthly ciphertext metadata"
integrity_metadata_head=$(r2_aws s3api head-object \
  --bucket "$R2_BUCKET" --key "$integrity_metadata_key") ||
  fail "cannot read monthly sidecar metadata"

# Day-01 uploads write one immutable ciphertext to both tiers. Comparing the
# twin ensures the long-retention object did not silently diverge.
integrity_nightly_root=$integrity_prefix/nightly/$integrity_id
integrity_nightly_archive_key=$integrity_nightly_root/$integrity_id.tar.gz.age
integrity_nightly_metadata_key=$integrity_nightly_root/$integrity_id.metadata.json
integrity_nightly_archive_head=$(r2_aws s3api head-object \
  --bucket "$R2_BUCKET" --key "$integrity_nightly_archive_key") ||
  fail "matching day-01 nightly ciphertext is missing"
integrity_nightly_metadata_head=$(r2_aws s3api head-object \
  --bucket "$R2_BUCKET" --key "$integrity_nightly_metadata_key") ||
  fail "matching day-01 nightly sidecar is missing"

integrity_temp_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coditu-integrity.XXXXXX")
integrity_archive=$integrity_temp_root/$integrity_id.tar.gz.age
integrity_metadata=$integrity_temp_root/$integrity_id.metadata.json
trap 'rm -rf "$integrity_temp_root"' EXIT INT TERM

r2_aws s3 cp "s3://$R2_BUCKET/$integrity_archive_key" "$integrity_archive" \
  --only-show-errors || fail "cannot download monthly ciphertext"
r2_aws s3 cp "s3://$R2_BUCKET/$integrity_metadata_key" "$integrity_metadata" \
  --only-show-errors || fail "cannot download monthly sidecar"

integrity_expected_id=$(jq -er '.backupId' "$integrity_metadata") ||
  fail "sidecar has no backup id"
integrity_expected_archive=$(jq -er '.archive' "$integrity_metadata") ||
  fail "sidecar has no archive name"
integrity_expected_sha=$(jq -er '.sha256' "$integrity_metadata") ||
  fail "sidecar has no SHA-256"
integrity_expected_bytes=$(jq -er '.bytes | select(type == "number" and . > 0 and floor == .)' "$integrity_metadata") ||
  fail "sidecar has no encrypted byte size"
integrity_format=$(jq -er '.formatVersion' "$integrity_metadata") ||
  fail "sidecar has no format version"
integrity_created_at=$(jq -er '.createdAt' "$integrity_metadata") ||
  fail "sidecar has no creation timestamp"

[ "$integrity_format" = 1 ] || fail "unsupported recovery-set format: $integrity_format"
[ "$integrity_expected_id" = "$integrity_id" ] || fail "sidecar backup id does not match its key"
[ "$integrity_expected_archive" = "$integrity_id.tar.gz.age" ] ||
  fail "sidecar archive name does not match its key"
printf '%s\n' "$integrity_expected_sha" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "sidecar SHA-256 is malformed"
printf '%s\n' "$integrity_expected_bytes" | grep -Eq '^[1-9][0-9]*$' ||
  fail "sidecar encrypted byte size is invalid"
printf '%s\n' "$integrity_created_at" | grep -Eq \
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
  fail "sidecar creation timestamp is malformed"
[ "${integrity_created_at%%T*}" = "${integrity_id%%T*}" ] ||
  fail "sidecar creation date does not match its backup id"

integrity_head_bytes=$(printf '%s' "$integrity_archive_head" | jq -er '.ContentLength') ||
  fail "monthly ciphertext has no R2 byte size"
integrity_head_sha=$(printf '%s' "$integrity_archive_head" | jq -er '.Metadata.sha256') ||
  fail "monthly ciphertext has no R2 SHA-256 metadata"
integrity_metadata_head_bytes=$(printf '%s' "$integrity_metadata_head" | jq -er '.ContentLength') ||
  fail "monthly sidecar has no R2 byte size"
integrity_nightly_bytes=$(printf '%s' "$integrity_nightly_archive_head" | jq -er '.ContentLength') ||
  fail "matching nightly ciphertext has no R2 byte size"
integrity_nightly_sha=$(printf '%s' "$integrity_nightly_archive_head" | jq -er '.Metadata.sha256') ||
  fail "matching nightly ciphertext has no R2 SHA-256 metadata"
integrity_nightly_metadata_bytes=$(printf '%s' "$integrity_nightly_metadata_head" | jq -er '.ContentLength') ||
  fail "matching nightly sidecar has no R2 byte size"

[ "$integrity_head_bytes" = "$integrity_expected_bytes" ] ||
  fail "monthly R2 byte size differs from the sidecar"
[ "$integrity_head_sha" = "$integrity_expected_sha" ] ||
  fail "monthly R2 SHA-256 metadata differs from the sidecar"
[ "$(file_bytes "$integrity_archive")" = "$integrity_expected_bytes" ] ||
  fail "downloaded ciphertext byte size differs from the sidecar"
[ "$(sha256_file "$integrity_archive")" = "$integrity_expected_sha" ] ||
  fail "downloaded ciphertext SHA-256 differs from the sidecar"
[ "$(file_bytes "$integrity_metadata")" = "$integrity_metadata_head_bytes" ] ||
  fail "downloaded sidecar byte size differs from R2"
[ "$integrity_nightly_bytes" = "$integrity_head_bytes" ] ||
  fail "monthly and matching nightly ciphertext sizes differ"
[ "$integrity_nightly_sha" = "$integrity_head_sha" ] ||
  fail "monthly and matching nightly ciphertext checksums differ"
[ "$integrity_nightly_metadata_bytes" = "$integrity_metadata_head_bytes" ] ||
  fail "monthly and matching nightly sidecar sizes differ"

read_count() {
  integrity_count_name=$1
  integrity_count_value=$(jq -er --arg name "$integrity_count_name" \
    '.[$name] | select(type == "number" and . >= 0 and floor == .)' "$integrity_metadata") ||
    fail "sidecar has no $integrity_count_name count"
  printf '%s\n' "$integrity_count_value" | grep -Eq '^[0-9]+$' ||
    fail "sidecar $integrity_count_name count is invalid"
  printf '%s\n' "$integrity_count_value"
}

integrity_databaseTables=$(read_count databaseTables)
integrity_databaseRows=$(read_count databaseRows)
integrity_storageBuckets=$(read_count storageBuckets)
integrity_storageObjects=$(read_count storageObjects)
[ "$integrity_databaseTables" -gt 0 ] || fail "sidecar records no database tables"

printf 'integrity_verified=true\n'
printf 'backup_id=%s\n' "$integrity_id"
printf 'sha256=%s\n' "$integrity_expected_sha"
printf 'encrypted_bytes=%s\n' "$integrity_expected_bytes"
printf 'database_tables=%s\n' "$integrity_databaseTables"
printf 'database_rows=%s\n' "$integrity_databaseRows"
printf 'storage_buckets=%s\n' "$integrity_storageBuckets"
printf 'storage_objects=%s\n' "$integrity_storageObjects"

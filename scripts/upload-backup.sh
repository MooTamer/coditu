#!/usr/bin/env bash
set -euo pipefail

umask 077

upload_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

fail() {
  printf 'upload-backup: %s\n' "$*" >&2
  exit 1
}

need_value() {
  upload_name=$1
  upload_present=${!upload_name:-}
  [ -n "$upload_present" ] || fail "$upload_name is required"
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

[ "$#" -eq 2 ] || fail "usage: upload-backup.sh <archive.tar.gz.age> <metadata.json>"
upload_archive=$1
upload_metadata=$2
[ -f "$upload_archive" ] || fail "archive does not exist"
[ -f "$upload_metadata" ] || fail "metadata does not exist"

for upload_required in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  need_value "$upload_required"
done
upload_prefix=${R2_PREFIX:-coditu}
case "$upload_prefix" in
  ""|/*|*..*) fail "R2_PREFIX must be a narrow relative prefix" ;;
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

upload_id=$(jq -er '.backupId' "$upload_metadata")
upload_expected_sha=$(jq -er '.sha256' "$upload_metadata")
upload_expected_bytes=$(jq -er '.bytes' "$upload_metadata")
printf '%s\n' "$upload_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
  fail "metadata has an unsafe backup id"
[ "$(basename "$upload_archive")" = "$(jq -er '.archive' "$upload_metadata")" ] || \
  fail "archive name does not match metadata"
[ "$(sha256_file "$upload_archive")" = "$upload_expected_sha" ] || \
  fail "archive checksum does not match metadata"
[ "$(file_bytes "$upload_archive")" = "$upload_expected_bytes" ] || \
  fail "archive size does not match metadata"

upload_one_tier() {
  upload_tier=$1
  upload_root=$upload_prefix/$upload_tier/$upload_id
  upload_archive_key=$upload_root/$(basename "$upload_archive")
  upload_metadata_key=$upload_root/$(basename "$upload_metadata")

  r2_aws s3 cp "$upload_archive" "s3://$R2_BUCKET/$upload_archive_key" \
    --only-show-errors \
    --metadata "sha256=$upload_expected_sha,backup-id=$upload_id"
  r2_aws s3 cp "$upload_metadata" "s3://$R2_BUCKET/$upload_metadata_key" \
    --only-show-errors \
    --content-type application/json

  upload_head=$(r2_aws s3api head-object --bucket "$R2_BUCKET" --key "$upload_archive_key")
  [ "$(printf '%s' "$upload_head" | jq -r '.ContentLength')" = "$upload_expected_bytes" ] || \
    fail "$upload_tier object size changed after upload"
  [ "$(printf '%s' "$upload_head" | jq -r '.Metadata.sha256')" = "$upload_expected_sha" ] || \
    fail "$upload_tier object checksum metadata is missing"
  printf 'uploaded=%s\n' "$upload_archive_key"
}

upload_one_tier nightly
if [ "${upload_id:8:2}" = 01 ]; then
  upload_one_tier monthly
fi

"$upload_script_dir/prune-backups.sh"

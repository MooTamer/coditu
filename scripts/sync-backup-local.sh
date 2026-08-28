#!/usr/bin/env bash
set -euo pipefail

# Pull the already-encrypted R2 copy onto Mohamed's Mac. This script never
# needs the age private key; `aws configure --profile coditu-r2` keeps the R2
# credential outside the repository.

fail() {
  printf 'sync-backup-local: %s\n' "$*" >&2
  exit 1
}

for sync_name in R2_ENDPOINT R2_BUCKET LOCAL_BACKUP_DIR; do
  sync_value=${!sync_name:-}
  [ -n "$sync_value" ] || fail "$sync_name is required"
done
sync_prefix=${R2_PREFIX:-coditu}
sync_profile=${R2_PROFILE:-coditu-r2}
case "$LOCAL_BACKUP_DIR" in
  ""|/) fail "LOCAL_BACKUP_DIR must be a dedicated directory" ;;
esac
case "$sync_prefix" in
  ""|/*|*..*) fail "R2_PREFIX must be a narrow relative prefix" ;;
esac

mkdir -p "$LOCAL_BACKUP_DIR"
chmod 700 "$LOCAL_BACKUP_DIR"
if [ "$sync_profile" = env ]; then
  aws --endpoint-url "$R2_ENDPOINT" s3 sync \
    "s3://$R2_BUCKET/$sync_prefix/" "$LOCAL_BACKUP_DIR" \
    --no-progress --only-show-errors
else
  aws --profile "$sync_profile" --endpoint-url "$R2_ENDPOINT" s3 sync \
    "s3://$R2_BUCKET/$sync_prefix/" "$LOCAL_BACKUP_DIR" \
    --no-progress --only-show-errors
fi
printf 'local_copy=%s\n' "$LOCAL_BACKUP_DIR"

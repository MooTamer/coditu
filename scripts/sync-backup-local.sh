#!/usr/bin/env bash
set -euo pipefail

# Pull the already-encrypted recovery sets onto Mohamed's Mac. This script never
# needs the age private key; `gh auth login` keeps the GitHub credential outside
# the repository.
#
# It does not delete. An accidental deletion in the recovery repository must not
# propagate onto the Mac — that is most of the point of having a third copy.
# Every downloaded archive is checksummed against its own sidecar before it is
# allowed to count as a local copy.

umask 077

fail() {
  printf 'sync-backup-local: %s\n' "$*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

for sync_command in gh jq; do
  command -v "$sync_command" >/dev/null 2>&1 || fail "missing required command: $sync_command"
done
for sync_name in RECOVERY_REPO LOCAL_BACKUP_DIR; do
  sync_value=${!sync_name:-}
  [ -n "$sync_value" ] || fail "$sync_name is required"
done
case "$LOCAL_BACKUP_DIR" in
  ""|/) fail "LOCAL_BACKUP_DIR must be a dedicated directory" ;;
esac

mkdir -p "$LOCAL_BACKUP_DIR"
chmod 700 "$LOCAL_BACKUP_DIR"

sync_tags=$(gh release list --repo "$RECOVERY_REPO" --limit 400 --json tagName |
  jq -r '.[].tagName' | LC_ALL=C sort -r)
[ -n "$sync_tags" ] || fail "the recovery repository has no releases"

sync_pulled=0
sync_present=0
while IFS= read -r sync_tag; do
  [ -n "$sync_tag" ] || continue
  sync_id=${sync_tag#*-}
  printf '%s\n' "$sync_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
    fail "refusing an unexpected release tag: $sync_tag"
  sync_archive=$LOCAL_BACKUP_DIR/$sync_id.tar.gz.age
  sync_metadata=$LOCAL_BACKUP_DIR/$sync_id.metadata.json

  if [ -f "$sync_archive" ] && [ -f "$sync_metadata" ]; then
    sync_present=$((sync_present + 1))
    continue
  fi

  gh release download "$sync_tag" --repo "$RECOVERY_REPO" \
    --dir "$LOCAL_BACKUP_DIR" --clobber || fail "cannot download $sync_tag"
  [ -f "$sync_archive" ] && [ -f "$sync_metadata" ] || fail "$sync_tag is missing an asset"
  [ "$(sha256_file "$sync_archive")" = "$(jq -er '.sha256' "$sync_metadata")" ] ||
    fail "$sync_id does not match its own sidecar checksum after download"
  sync_pulled=$((sync_pulled + 1))
done <<TAGS
$sync_tags
TAGS

printf 'local_copy=%s\n' "$LOCAL_BACKUP_DIR"
printf 'downloaded=%s\n' "$sync_pulled"
printf 'already_present=%s\n' "$sync_present"
printf 'sets_on_disk=%s\n' "$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name '*.tar.gz.age' | wc -l | tr -d ' ')"

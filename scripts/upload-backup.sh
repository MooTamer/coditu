#!/usr/bin/env bash
set -euo pipefail

# Publish one encrypted recovery set to the dedicated private recovery
# repository as a GitHub **release**, not as committed files.
#
# ## Why releases and not a commit
#
# The obvious shape — commit `nightly/<id>/<id>.tar.gz.age`, `git rm` the ones
# past retention — does not work, and fails in the direction that matters. Git
# objects are permanent: deleting a 19 MB blob from the tip reclaims nothing,
# so a "30 nightly + 12 monthly" policy would grow without bound and take the
# clone time with it. Release assets are stored outside the object database,
# they delete for real, and they do not count against repository size.
#
# ## Why a separate repository at all
#
# So that the workflow that writes backups needs no credential for the
# application repository, and the workflow's own `GITHUB_TOKEN` — scoped to one
# repository, minted per run, expiring with it — is the only write credential
# in the system. There is no personal access token anywhere in this path. That
# is also why the recovery repository carries its own copy of this tooling: if
# `MooTamer/coditu` is what was lost, the restore path must not begin by
# checking it out.

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

for upload_command in gh jq; do
  command -v "$upload_command" >/dev/null 2>&1 || fail "missing required command: $upload_command"
done
need_value RECOVERY_REPO
case "$RECOVERY_REPO" in
  */*/*|*/) fail "RECOVERY_REPO must be owner/name" ;;
  */*) ;;
  *) fail "RECOVERY_REPO must be owner/name" ;;
esac

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

# The release notes carry the same two numbers the sidecar carries, written by
# a different step from a different source. The freshness canary compares them
# and refuses to agree with itself: a sidecar that has been swapped no longer
# matches the notes, and notes that have been edited no longer match the asset.
upload_one_tier() {
  upload_tier=$1
  upload_tag=$upload_tier-$upload_id

  if gh release view "$upload_tag" --repo "$RECOVERY_REPO" >/dev/null 2>&1; then
    fail "release $upload_tag already exists; refusing to overwrite a recovery set"
  fi

  gh release create "$upload_tag" \
    --repo "$RECOVERY_REPO" \
    --title "$upload_tier $upload_id" \
    --notes "$(printf 'backup-id=%s\nsha256=%s\nbytes=%s\ntier=%s\n' \
      "$upload_id" "$upload_expected_sha" "$upload_expected_bytes" "$upload_tier")" \
    "$upload_archive" "$upload_metadata" >/dev/null

  upload_view=$(gh release view "$upload_tag" --repo "$RECOVERY_REPO" \
    --json assets,tagName) || fail "$upload_tier release is not readable after upload"
  upload_asset_bytes=$(printf '%s' "$upload_view" | jq -er \
    --arg name "$(basename "$upload_archive")" \
    '.assets[] | select(.name == $name) | .size') ||
    fail "$upload_tier release has no encrypted archive asset"
  [ "$upload_asset_bytes" = "$upload_expected_bytes" ] || \
    fail "$upload_tier asset size is $upload_asset_bytes, expected $upload_expected_bytes"
  printf '%s' "$upload_view" | jq -er \
    --arg name "$(basename "$upload_metadata")" \
    '.assets[] | select(.name == $name) | .size' >/dev/null ||
    fail "$upload_tier release has no metadata sidecar asset"

  printf 'uploaded=%s/%s\n' "$upload_tag" "$(basename "$upload_archive")"
}

upload_one_tier nightly
if [ "${upload_id:8:2}" = 01 ]; then
  upload_one_tier monthly
fi

"$upload_script_dir/prune-backups.sh"

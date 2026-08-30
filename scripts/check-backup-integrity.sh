#!/usr/bin/env bash
set -euo pipefail

# Monthly: prove the day-01 ciphertext is still byte-for-byte what was written,
# and that the monthly and nightly copies of it have not diverged.
#
# This job has read access to the recovery repository and **no age private
# key**. It therefore proves that the encrypted set remains readable and
# unchanged. It cannot prove the plaintext restores, and nothing here may be
# reported as a restore. That is the quarterly drill, with the private key, in
# `docs/12-RECOVERY-RUNBOOK.md` §6.

fail() {
  printf 'check-backup-integrity: %s\n' "$*" >&2
  exit 1
}

need_value() {
  integrity_name=$1
  integrity_present=${!integrity_name:-}
  [ -n "$integrity_present" ] || fail "$integrity_name is required"
}

file_bytes() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

notes_field() {
  printf '%s' "$1" | jq -r '.body' | sed -n "s/^$2=//p" | head -1
}

for integrity_command in gh jq; do
  command -v "$integrity_command" >/dev/null 2>&1 || fail "missing required command: $integrity_command"
done
need_value RECOVERY_REPO

integrity_releases=$(gh release list --repo "$RECOVERY_REPO" --limit 400 --json tagName) ||
  fail "cannot list recovery sets"
integrity_id=$(printf '%s' "$integrity_releases" | jq -r \
  '.[].tagName | select(startswith("monthly-")) | ltrimstr("monthly-")' |
  LC_ALL=C sort -r | head -1)
[ -n "$integrity_id" ] || fail "no monthly recovery set exists"
printf '%s\n' "$integrity_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
  fail "newest monthly release has an unexpected recovery-set id"
[ "${integrity_id:8:2}" = 01 ] || fail "a monthly recovery set must be a day-01 set"

integrity_archive_name=$integrity_id.tar.gz.age
integrity_metadata_name=$integrity_id.metadata.json

integrity_monthly=$(gh release view "monthly-$integrity_id" --repo "$RECOVERY_REPO" \
  --json assets,body) || fail "cannot read the monthly recovery set"
integrity_nightly=$(gh release view "nightly-$integrity_id" --repo "$RECOVERY_REPO" \
  --json assets,body) || fail "the monthly set has no matching nightly set"

# Exactly the archive and its sidecar. A third asset in a recovery release is
# either a mistake or somebody else writing into the store; either way it is
# not something to shrug at during the one job that checks the archive.
for integrity_release in monthly nightly; do
  case "$integrity_release" in
    monthly) integrity_view=$integrity_monthly ;;
    nightly) integrity_view=$integrity_nightly ;;
  esac
  integrity_names=$(printf '%s' "$integrity_view" | jq -r '[.assets[].name] | sort | join(",")')
  integrity_expected=$(printf '%s\n%s\n' "$integrity_archive_name" "$integrity_metadata_name" |
    LC_ALL=C sort | paste -sd, -)
  [ "$integrity_names" = "$integrity_expected" ] ||
    fail "$integrity_release-$integrity_id holds [$integrity_names], expected [$integrity_expected]"
done

integrity_monthly_bytes=$(printf '%s' "$integrity_monthly" | jq -er \
  --arg n "$integrity_archive_name" '.assets[] | select(.name == $n) | .size')
integrity_nightly_bytes=$(printf '%s' "$integrity_nightly" | jq -er \
  --arg n "$integrity_archive_name" '.assets[] | select(.name == $n) | .size')
integrity_monthly_sha=$(notes_field "$integrity_monthly" sha256)
integrity_nightly_sha=$(notes_field "$integrity_nightly" sha256)
printf '%s\n' "$integrity_monthly_sha" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "the monthly release notes carry no SHA-256"
[ "$integrity_monthly_sha" = "$integrity_nightly_sha" ] ||
  fail "the monthly and nightly copies of $integrity_id have different checksums"
[ "$integrity_monthly_bytes" = "$integrity_nightly_bytes" ] ||
  fail "the monthly and nightly copies of $integrity_id have different sizes"

integrity_temp_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coditu-integrity.XXXXXX")
trap 'rm -rf "$integrity_temp_root"' EXIT INT TERM
gh release download "monthly-$integrity_id" --repo "$RECOVERY_REPO" \
  --dir "$integrity_temp_root" || fail "cannot download the monthly recovery set"

integrity_archive=$integrity_temp_root/$integrity_archive_name
integrity_metadata=$integrity_temp_root/$integrity_metadata_name
[ -f "$integrity_archive" ] || fail "the downloaded monthly set has no encrypted archive"
[ -f "$integrity_metadata" ] || fail "the downloaded monthly set has no sidecar"

integrity_downloaded_sha=$(sha256_file "$integrity_archive")
integrity_downloaded_bytes=$(file_bytes "$integrity_archive")
[ "$integrity_downloaded_sha" = "$integrity_monthly_sha" ] ||
  fail "the downloaded ciphertext does not match the checksum recorded for it"
[ "$integrity_downloaded_bytes" = "$integrity_monthly_bytes" ] ||
  fail "the downloaded ciphertext is $integrity_downloaded_bytes bytes, the store says $integrity_monthly_bytes"

integrity_sidecar_sha=$(jq -er '.sha256' "$integrity_metadata")
integrity_sidecar_bytes=$(jq -er '.bytes | select(type == "number" and . > 0 and floor == .)' "$integrity_metadata")
[ "$integrity_sidecar_sha" = "$integrity_downloaded_sha" ] ||
  fail "the sidecar checksum does not match the ciphertext beside it"
[ "$integrity_sidecar_bytes" = "$integrity_downloaded_bytes" ] ||
  fail "the sidecar byte size does not match the ciphertext beside it"
[ "$(jq -er '.formatVersion' "$integrity_metadata")" = 1 ] || fail "unsupported recovery-set format"
[ "$(jq -er '.backupId' "$integrity_metadata")" = "$integrity_id" ] || fail "sidecar names a different set"
[ "$(jq -er '.archive' "$integrity_metadata")" = "$integrity_archive_name" ] || fail "sidecar names a different archive"

# ── What the ciphertext itself can be made to say, without the key ──────────
#
# Everything above compares one record of this set against another: the release
# notes, the sidecar, the downloaded bytes. All three can agree perfectly about
# a file that is not an age archive at all. A plaintext dump published by
# mistake, an `age` invocation that silently produced nothing useful, or a
# header truncated by a partial upload would checksum consistently and pass
# every assertion in this script as written.
#
# The age v1 header is plaintext and needs no private key to read: one version
# line, one recipient stanza per recipient, then a `--- ` MAC line. So this
# asserts the shape — that it IS encrypted, that it is encrypted to EXACTLY ONE
# recipient, and that the header is complete.
#
# It cannot assert WHICH recipient: an X25519 stanza carries an ephemeral share,
# not the public key, by design. Nothing without the private half can. That is
# the honest limit of an automated drill, and it is why `this_is_not_a_restore`
# is printed below.
#
# `awk` stops at the terminator so nothing downstream ever sees the binary
# payload — `grep` reports "binary file matches" instead of a count when it
# does, which would make these assertions read as empty rather than as numbers.
# `|| true` on the capture is for the SIGPIPE that early exit sends back up the
# pipe; `pipefail` would otherwise end the script here.
integrity_header=$(LC_ALL=C head -c 4096 "$integrity_archive" |
  LC_ALL=C awk '{print} /^--- /{exit}' || true)
printf '%s\n' "$integrity_header" | LC_ALL=C head -1 |
  LC_ALL=C grep -qx 'age-encryption.org/v1' ||
  fail "the monthly archive is not an age v1 file"
integrity_recipients=$(printf '%s\n' "$integrity_header" | LC_ALL=C grep -c '^-> ' || true)
[ "$integrity_recipients" = 1 ] ||
  fail "the monthly archive names ${integrity_recipients:-no} age recipients; expected exactly 1"
printf '%s\n' "$integrity_header" | LC_ALL=C grep -q '^--- ' ||
  fail "the monthly archive has no age header terminator; it is truncated"

integrity_tables=$(jq -er '.databaseTables | select(type == "number" and . > 0 and floor == .)' "$integrity_metadata")
integrity_rows=$(jq -er '.databaseRows | select(type == "number" and . >= 0 and floor == .)' "$integrity_metadata")
integrity_buckets=$(jq -er '.storageBuckets | select(type == "number" and . >= 0 and floor == .)' "$integrity_metadata")
integrity_objects=$(jq -er '.storageObjects | select(type == "number" and . >= 0 and floor == .)' "$integrity_metadata")

printf 'backup_id=%s\n' "$integrity_id"
printf 'encrypted_bytes=%s\n' "$integrity_downloaded_bytes"
printf 'sha256_verified=%s\n' "$integrity_downloaded_sha"
printf 'database_tables=%s\n' "$integrity_tables"
printf 'database_rows=%s\n' "$integrity_rows"
printf 'storage_buckets=%s\n' "$integrity_buckets"
printf 'storage_objects=%s\n' "$integrity_objects"
printf 'age_recipients=%s\n' "$integrity_recipients"
# Said in the output, not only in a comment. This job verifies that the stored
# ciphertext is intact, complete and encrypted to one recipient. It does NOT
# decrypt it and it does NOT restore it — the private key is deliberately not on
# GitHub, so no scheduled job can. The restore drill is
# `verify-backup-restore.sh`, it needs the key, and it runs where the key is.
printf 'this_is_not_a_restore=true\n'

#!/usr/bin/env bash
set -euo pipefail

# Read the off-site copy rather than trusting the writer's exit status. A
# successful invocation prints only non-secret evidence and is safe to use as
# the prerequisite for an external heartbeat.
#
# There are three records of the same recovery set and this script refuses to
# let any one of them speak for the others: the release **asset** (its real
# size, and when GitHub received it), the release **notes** (written by the
# uploader), and the **sidecar** (written by the backup itself, downloaded and
# read here). A set is fresh only when all three agree.

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

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# ── Which store is being read back ─────────────────────────────────────────
#
# `local` — the PRIMARY, a directory on the Mac. This is the default as of ADR
# 2026-08-31: the recovery sets live on hardware Mohamed owns, and the off-site
# copies are replaceable by design.
#
# `github-release` — kept, working, and depended upon by nothing.
#
# **The three-records rule survives the move, in a stronger form.** Against
# releases the three independent records were the asset, the release notes and
# the sidecar — three claims *about* one file, two of them written by the
# uploader. Locally they become the bytes themselves (hashed here, now), the
# sidecar written by the backup, and the off-site copies read back through
# their own mounts by `offsite-copy.sh`. Two of those are no longer anybody's
# claim about the file; they are the file.
canary_store=${BACKUP_STORE:-local}
case "$canary_store" in
  local) need_value BACKUP_LOCAL_DIR ;;
  github-release) need_value RECOVERY_REPO ;;
  *) fail "unknown BACKUP_STORE: $canary_store" ;;
esac
canary_max_age=${BACKUP_MAX_AGE_SECONDS:-93600}
case "$canary_store" in
  local) canary_third_record="the archive's own bytes" ;;
  *) canary_third_record="the release notes" ;;
esac
canary_future_skew=${BACKUP_MAX_FUTURE_SKEW_SECONDS:-300}
# An EMPTY recovery set used to pass this check. The sidecar assertions below
# accepted `databaseRows >= 0` and `storageObjects >= 0`, so a dump that
# connected, found nothing and wrote a valid, correctly-checksummed archive of
# no rows was fresh, complete and green. "The backup ran" is not "the backup
# contains the workspace", and this canary's title claims the second.
#
# Floors rather than a comparison against the previous set: a fixed expected
# count would break the first time somebody legitimately deletes a project, and
# the failure being guarded against is collapse to nothing, not drift. A
# workspace with zero rows or zero buckets is a broken dump, never a valid
# state. Override for a genuinely empty environment.
canary_min_rows=${BACKUP_MIN_DATABASE_ROWS:-1}
canary_min_buckets=${BACKUP_MIN_STORAGE_BUCKETS:-1}
printf '%s\n' "$canary_max_age" | grep -Eq '^[1-9][0-9]*$' ||
  fail "BACKUP_MAX_AGE_SECONDS must be a positive integer"
printf '%s\n' "$canary_future_skew" | grep -Eq '^[0-9]+$' ||
  fail "BACKUP_MAX_FUTURE_SKEW_SECONDS must be a non-negative integer"
printf '%s\n' "$canary_min_rows" | grep -Eq '^[0-9]+$' ||
  fail "BACKUP_MIN_DATABASE_ROWS must be a non-negative integer"
printf '%s\n' "$canary_min_buckets" | grep -Eq '^[0-9]+$' ||
  fail "BACKUP_MIN_STORAGE_BUCKETS must be a non-negative integer"

canary_tools="jq node"
[ "$canary_store" = local ] || canary_tools="gh $canary_tools"
for canary_command in $canary_tools; do
  command -v "$canary_command" >/dev/null 2>&1 || fail "missing required command: $canary_command"
done

if [ "$canary_store" = local ]; then
  # ── The local store, read back from the disk it is on ────────────────────
  #
  # No network is touched from here down, deliberately: this is the check that
  # must still work in the situation the backups exist for. It was run with the
  # wifi off on 2026-08-31 and that is recorded in `docs/06-PROGRESS.md`.
  [ -d "$BACKUP_LOCAL_DIR" ] || fail "BACKUP_LOCAL_DIR does not exist: $BACKUP_LOCAL_DIR"
  canary_id=$(find "$BACKUP_LOCAL_DIR" -maxdepth 1 -name '*.tar.gz.age' \
    -exec basename {} .tar.gz.age \; | LC_ALL=C sort -r | head -1)
  [ -n "$canary_id" ] || fail "no encrypted recovery set in $BACKUP_LOCAL_DIR"
  printf '%s\n' "$canary_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
    fail "newest local set has an unexpected recovery-set id"

  canary_archive_name=$canary_id.tar.gz.age
  canary_metadata_name=$canary_id.metadata.json
  canary_archive_path=$BACKUP_LOCAL_DIR/$canary_archive_name
  canary_metadata=$BACKUP_LOCAL_DIR/$canary_metadata_name
  [ -f "$canary_archive_path" ] || fail "newest set has no encrypted archive"
  [ -f "$canary_metadata" ] || fail "newest set has no metadata sidecar"

  canary_bytes=$(file_bytes "$canary_archive_path")
  canary_metadata_bytes=$(file_bytes "$canary_metadata")

  # The independent record, locally, is the FILE. Hashing the whole archive
  # rather than reading a number somebody wrote about it is what makes this
  # stronger than the release-notes comparison it replaces — and it is what
  # catches a cloud placeholder, which has every byte count right and no bytes.
  canary_notes_sha=$(sha256_file "$canary_archive_path")
  canary_notes_bytes=$canary_bytes
  canary_notes_id=$canary_id

  # `date -r` on BSD, `date -r` on GNU means something else — so ask `stat`.
  canary_mtime=$(stat -f '%m' "$canary_archive_path" 2>/dev/null || stat -c '%Y' "$canary_archive_path")
  canary_uploaded_at=$(CANARY_EPOCH="$canary_mtime" node -e \
    'process.stdout.write(new Date(Number(process.env.CANARY_EPOCH) * 1000).toISOString())')
else
canary_releases=$(gh release list --repo "$RECOVERY_REPO" --limit 400 --json tagName) ||
  fail "cannot list nightly recovery sets"
canary_id=$(printf '%s' "$canary_releases" | jq -r \
  '.[].tagName | select(startswith("nightly-")) | ltrimstr("nightly-")' |
  LC_ALL=C sort -r | head -1)
[ -n "$canary_id" ] || fail "no nightly encrypted recovery set exists"
printf '%s\n' "$canary_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
  fail "newest release has an unexpected recovery-set id"

canary_view=$(gh release view "nightly-$canary_id" --repo "$RECOVERY_REPO" \
  --json assets,body,tagName) || fail "cannot read the newest recovery set"

canary_archive_name=$canary_id.tar.gz.age
canary_metadata_name=$canary_id.metadata.json
canary_asset=$(printf '%s' "$canary_view" | jq -c --arg n "$canary_archive_name" \
  '.assets[] | select(.name == $n)') || fail "cannot parse the release assets"
[ -n "$canary_asset" ] || fail "newest recovery set has no encrypted archive asset"
canary_bytes=$(printf '%s' "$canary_asset" | jq -er '.size') ||
  fail "newest encrypted archive has no byte size"
canary_uploaded_at=$(printf '%s' "$canary_asset" | jq -er '.createdAt') ||
  fail "newest encrypted archive has no upload timestamp"
canary_metadata_bytes=$(printf '%s' "$canary_view" | jq -er --arg n "$canary_metadata_name" \
  '.assets[] | select(.name == $n) | .size') ||
  fail "newest recovery set has no metadata sidecar"

printf '%s\n' "$canary_bytes" | grep -Eq '^[1-9][0-9]*$' ||
  fail "newest encrypted archive is empty"
printf '%s\n' "$canary_metadata_bytes" | grep -Eq '^[1-9][0-9]*$' ||
  fail "newest recovery set has no non-empty metadata sidecar"

# The release notes, parsed as the independent record they are meant to be.
canary_notes_id=$(printf '%s' "$canary_view" | jq -r '.body' | sed -n 's/^backup-id=//p' | head -1)
canary_notes_sha=$(printf '%s' "$canary_view" | jq -r '.body' | sed -n 's/^sha256=//p' | head -1)
canary_notes_bytes=$(printf '%s' "$canary_view" | jq -r '.body' | sed -n 's/^bytes=//p' | head -1)
printf '%s\n' "$canary_notes_sha" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "$canary_third_record carry no SHA-256"
[ "$canary_notes_id" = "$canary_id" ] || fail "$canary_third_record name a different backup id"
[ "$canary_notes_bytes" = "$canary_bytes" ] || fail "$canary_third_record disagree with the recorded size"

canary_temp_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coditu-canary.XXXXXX")
trap 'rm -rf "$canary_temp_root"' EXIT INT TERM
gh release download "nightly-$canary_id" --repo "$RECOVERY_REPO" \
  --pattern "$canary_metadata_name" --dir "$canary_temp_root" ||
  fail "cannot download newest recovery-set sidecar"
canary_metadata=$canary_temp_root/$canary_metadata_name
[ "$(file_bytes "$canary_metadata")" = "$canary_metadata_bytes" ] ||
  fail "newest recovery-set sidecar size changed while it was read"

fi

# ── From here down, both stores are asserted identically ───────────────────
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
[ "$canary_sidecar_id" = "$canary_id" ] || fail "sidecar backup id does not match its release"
[ "$canary_sidecar_archive" = "$canary_archive_name" ] || fail "sidecar archive name does not match its release"
[ "$canary_sidecar_sha" = "$canary_notes_sha" ] || fail "the sidecar SHA-256 does not match $canary_third_record"
[ "$canary_sidecar_bytes" = "$canary_bytes" ] || fail "sidecar byte size does not match the asset"

[ "$canary_database_rows" -ge "$canary_min_rows" ] ||
  fail "newest recovery set holds $canary_database_rows database rows; the floor is $canary_min_rows"
[ "$canary_storage_buckets" -ge "$canary_min_buckets" ] ||
  fail "newest recovery set holds $canary_storage_buckets Storage buckets; the floor is $canary_min_buckets"

canary_age=$(CANARY_LAST_MODIFIED="$canary_uploaded_at" \
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
) || fail "newest archive has an invalid upload timestamp"

if [ "$canary_age" -lt "-$canary_future_skew" ]; then
  fail "newest encrypted archive is implausibly far in the future"
fi
if [ "$canary_age" -gt "$canary_max_age" ]; then
  fail "newest encrypted archive is ${canary_age}s old; limit is ${canary_max_age}s"
fi

printf 'store=%s\n' "$canary_store"
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
    --arg lastModifiedAt "$canary_uploaded_at" \
    --arg sha256 "$canary_sidecar_sha" \
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

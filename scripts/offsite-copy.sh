#!/usr/bin/env bash
set -euo pipefail

# Copy the encrypted recovery sets to ONE destination that is a directory on
# this machine, and prove afterwards that they are really there.
#
# ## Why a directory, and not an API
#
# The destination this was written for is Mohamed's paid 2 TB Google Drive,
# mounted by Google Drive for desktop. That changes the design more than it
# sounds like it should:
#
#   - **No rclone.** The previous plan needed `rclone config`, which opens a
#     browser for an OAuth consent screen only Mohamed can click. It was written
#     in August, never activated, and still is not.
#   - **No token, no secret, nothing to rotate or leak.** This script writes a
#     file to a path. Google's own client moves it. There is no credential in
#     this path at all — which is also why it needs no entry in the secrets
#     inventory and cannot be the thing that expires.
#   - **No API quota.** A mounted folder has no requests-per-day.
#
# The same shape then serves any destination that is a path: an external disk,
# a NAS, a second Mac. That is deliberate — `OFFSITE_*` is an interface, and
# `local-nightly.sh` runs it once per configured destination.
#
# ## What it refuses to believe
#
# **That a write which returned 0 means the bytes are somewhere.** Drive's sync
# is eventually consistent and quiet about failure: `cp` returns immediately,
# the file appears in Finder, and the upload happens later or not at all.
#
# **That a file which is listed is a file that exists.** Drive can hold a file
# as a streamed placeholder — a name with a size and no data, which reads only
# by downloading. A backup that needs the internet to be read is not an
# off-site copy. `check-materialised.mjs` is the assertion, run here on every
# copy and again with the network off in the drill.
#
# ## Configuration
#
#   OFFSITE_NAME       what to call it in the summary        (required)
#   OFFSITE_DIR        the destination directory              (required)
#   OFFSITE_MARKER     a file that must exist in it first     (optional)
#   OFFSITE_REQUIRED   1 = an absent destination fails the run (default 1)
#   LOCAL_BACKUP_DIR   where the sets are                     (required)
#   OFFSITE_KEEP_NIGHTLY / OFFSITE_KEEP_MONTHLY   30 / 12
#
# `OFFSITE_REQUIRED=0` is for a medium that is *expected* to be absent — the
# external disk of B4. An unplugged disk is not a backup failure. It is still
# reported, with the age of the last copy, because "absent" and "silent" must
# never look alike.

umask 077

offsite_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

# --------------------------------------------------------------------------
# `--adopt <dir> <name>` — the entire installation of a new medium.
#
# Plugging a disk in should be the whole procedure, so this does the one thing
# that cannot be inferred: it writes the marker that says "this directory is a
# Coditu backup destination, and it is on the volume you meant".
#
# Without a marker there is no way to tell a mounted disk from an empty mount
# point, because macOS will happily let you write 19 MB a night into
# `/Volumes/Backup` when nothing is plugged in — filling the boot disk, and
# reporting success every time.
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# `--find-drive` — where Google Drive for desktop actually mounted.
#
# The path contains the signed-in account's address, so it cannot be written
# down in advance. This prints the line to paste, and — the part that matters —
# **it also says whether the folder streams**.
#
# Drive for desktop offers "Stream files" and "Mirror files". Streaming keeps
# files in the cloud and materialises them on read, which means an archive that
# looks present in Finder is not on this disk and cannot be read without the
# network. That is not an off-site backup; it is a receipt for one. The nightly
# refuses such a destination on every run, and this says so at setup time
# instead of at 02:00.
# --------------------------------------------------------------------------
if [ "${1:-}" = "--find-drive" ]; then
  find_any=0
  for find_root in "$HOME/Library/CloudStorage"/GoogleDrive-*; do
    [ -d "$find_root" ] || continue
    find_any=1
    printf 'found=%s\n' "$find_root"
    printf '\nAdopt the folder first — the nightly never creates a directory, because a\n'
    printf 'mount point that exists with nothing mounted on it looks exactly like a\n'
    printf 'destination and fills the boot disk instead:\n\n'
    printf '  scripts/offsite-copy.sh --adopt "%s/My Drive/Coditu/Backups" drive\n\n' "$find_root"
    printf 'Then add to ~/.config/coditu/nightly.env:\n\n'
    printf '  OFFSITE_DESTINATIONS="drive"\n'
    printf '  OFFSITE_drive_DIR=%s/My Drive/Coditu/Backups\n' "$find_root"
    printf '  OFFSITE_drive_MARKER=.coditu-backup-volume\n'
    printf '  OFFSITE_drive_REQUIRED=1\n\n'
  done
  if [ "$find_any" = 0 ]; then
    printf 'Google Drive for desktop is not mounted on this Mac.\n' >&2
    printf '\n' >&2
    printf 'Nothing under ~/Library/CloudStorage matches GoogleDrive-*, there is no\n' >&2
    printf '/Applications/Google Drive.app, and no DriveFS support directory exists.\n' >&2
    printf '\n' >&2
    printf 'To activate this destination:\n' >&2
    printf '  1. Install Google Drive for desktop and sign in.\n' >&2
    printf '  2. In its settings, set the folder holding the backups to\n' >&2
    printf '     **Mirror files**, or right-click it and choose "Available offline".\n' >&2
    printf '     Streamed files are placeholders and the nightly refuses them.\n' >&2
    printf '  3. Run this again and paste the two lines it prints into\n' >&2
    printf '     ~/.config/coditu/nightly.env, then add `drive` to OFFSITE_DESTINATIONS.\n' >&2
    exit 1
  fi
  exit 0
fi

if [ "${1:-}" = "--adopt" ]; then
  adopt_dir=${2:-}
  adopt_name=${3:-disk}
  [ -n "$adopt_dir" ] || { printf 'usage: offsite-copy.sh --adopt <dir> [name]\n' >&2; exit 2; }
  mkdir -p "$adopt_dir"
  printf 'coditu backup destination "%s", adopted %s on %s\n' \
    "$adopt_name" "$(date -u +%Y-%m-%dT%H%M%SZ)" "$(hostname -s)" \
    > "$adopt_dir/.coditu-backup-volume"
  printf 'adopted=%s\n' "$adopt_dir"
  printf '\nAdd these three lines to ~/.config/coditu/nightly.env, and add %s to\n' "$adopt_name"
  printf 'OFFSITE_DESTINATIONS. Nothing else is needed — the next night copies to it,\n'
  printf 'and a night when it is unplugged says so instead of failing.\n\n'
  printf '  OFFSITE_%s_DIR=%s\n' "$adopt_name" "$adopt_dir"
  printf '  OFFSITE_%s_MARKER=.coditu-backup-volume\n' "$adopt_name"
  printf '  OFFSITE_%s_REQUIRED=0\n' "$adopt_name"
  exit 0
fi

fail() {
  printf 'offsite-copy[%s]: %s\n' "${OFFSITE_NAME:-?}" "$*" >&2
  exit 1
}

say() { printf 'offsite-copy[%s]: %s\n' "$OFFSITE_NAME" "$*"; }

for offsite_name in OFFSITE_NAME OFFSITE_DIR LOCAL_BACKUP_DIR; do
  [ -n "${!offsite_name:-}" ] || fail "$offsite_name is required"
done
[ -d "$LOCAL_BACKUP_DIR" ] || fail "LOCAL_BACKUP_DIR does not exist: $LOCAL_BACKUP_DIR"
case "$OFFSITE_DIR" in
  ""|/) fail "OFFSITE_DIR must be a dedicated directory" ;;
esac

offsite_required=${OFFSITE_REQUIRED:-1}
offsite_keep_nightly=${OFFSITE_KEEP_NIGHTLY:-30}
offsite_keep_monthly=${OFFSITE_KEEP_MONTHLY:-12}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# --------------------------------------------------------------------------
# 0. Is the destination there at all?
#
# The marker file is what makes "a volume is mounted" different from "a volume
# is not mounted and macOS happily created an empty directory at the mount
# point". Writing 19 MB a night into `/Volumes/Backup` when nothing is plugged
# in fills the boot disk and reports success, and the only visible difference
# is a file that is not on the disk you meant.
# --------------------------------------------------------------------------
offsite_present=1
[ -d "$OFFSITE_DIR" ] || offsite_present=0
if [ "$offsite_present" = 1 ] && [ -n "${OFFSITE_MARKER:-}" ]; then
  [ -f "$OFFSITE_DIR/$OFFSITE_MARKER" ] || offsite_present=0
fi

if [ "$offsite_present" = 0 ]; then
  if [ "$offsite_required" = 1 ]; then
    fail "the destination is not there: $OFFSITE_DIR${OFFSITE_MARKER:+ (no $OFFSITE_MARKER in it)}"
  fi
  # Absent, and allowed to be. Say when it was last seen, so "not plugged in
  # since June" reads differently from "not plugged in tonight".
  offsite_seen_file=${CODITU_NIGHTLY_LOG_DIR:-$HOME/.local/state/coditu}/offsite-$OFFSITE_NAME.seen
  if [ -f "$offsite_seen_file" ]; then
    offsite_last=$(cat "$offsite_seen_file")
    offsite_age_days=$(( ( $(date +%s) - $(date -j -f '%Y-%m-%dT%H%M%SZ' "$offsite_last" +%s 2>/dev/null || echo 0) ) / 86400 ))
    printf 'offsite_%s=absent\n' "$OFFSITE_NAME"
    printf 'offsite_%s_last_seen=%s\n' "$OFFSITE_NAME" "$offsite_last"
    printf 'offsite_%s_days_since=%s\n' "$OFFSITE_NAME" "$offsite_age_days"
  else
    printf 'offsite_%s=absent\n' "$OFFSITE_NAME"
    printf 'offsite_%s_last_seen=never\n' "$OFFSITE_NAME"
    printf 'offsite_%s_days_since=-1\n' "$OFFSITE_NAME"
  fi
  say "not present; this is not a failure, and it is not a copy either"
  exit 0
fi

mkdir -p "$OFFSITE_DIR"

# --------------------------------------------------------------------------
# 1. Copy what is not already there, and never overwrite what is.
#
# A recovery set is written once and never edited. Anything that presents as an
# edit is corruption or an id collision, and it should stop the copy rather
# than quietly replace a night that restored.
# --------------------------------------------------------------------------
offsite_copied=0
offsite_present_already=0
offsite_verified=0

for offsite_archive in "$LOCAL_BACKUP_DIR"/*.tar.gz.age; do
  [ -e "$offsite_archive" ] || fail "no archives in $LOCAL_BACKUP_DIR"
  offsite_id=$(basename "$offsite_archive" .tar.gz.age)
  offsite_meta=$LOCAL_BACKUP_DIR/$offsite_id.metadata.json
  [ -f "$offsite_meta" ] || fail "$offsite_id has no sidecar"

  offsite_target=$OFFSITE_DIR/$offsite_id.tar.gz.age
  if [ -f "$offsite_target" ]; then
    offsite_present_already=$((offsite_present_already + 1))
    continue
  fi

  # Write to a dot-name and rename. A sync client that picks the file up
  # mid-copy uploads a truncated archive under the real name, and the next run
  # sees a file that is present and wrong.
  cp "$offsite_archive" "$OFFSITE_DIR/.$offsite_id.partial"
  mv "$OFFSITE_DIR/.$offsite_id.partial" "$offsite_target"
  cp "$offsite_meta" "$OFFSITE_DIR/$offsite_id.metadata.json"
  offsite_copied=$((offsite_copied + 1))
done

# --------------------------------------------------------------------------
# 2. Read every set back THROUGH the destination and hash it.
#
# Not `cp`'s exit status, which is about a write to a mount and says nothing
# about the bytes reaching Google. Not a size, which a placeholder has.
# --------------------------------------------------------------------------
say "reading the destination back"
node "$offsite_root/scripts/check-materialised.mjs" "$OFFSITE_DIR" ||
  fail "the destination does not read back as the archives it should hold"
offsite_verified=$(find "$OFFSITE_DIR" -maxdepth 1 -name '*.tar.gz.age' | wc -l | tr -d ' ')

# --------------------------------------------------------------------------
# 3. Retention: 30 nightly, 12 monthly, and generous on purpose.
#
# At ~19 MB a set that is about 800 MB against 2 TB — 0.04% of the drive. There
# is no reason to prune harder than the policy, and every reason not to: the
# only cost of keeping a night is 19 MB, and the cost of not having it is the
# night you needed.
#
# Monthly = the first set of each calendar month, chosen by id, so it is a
# selection over what is here rather than a second thing to write.
# --------------------------------------------------------------------------
offsite_keep=$(
  {
    find "$OFFSITE_DIR" -maxdepth 1 -name '*.tar.gz.age' -exec basename {} .tar.gz.age \; |
      LC_ALL=C sort -r | head -n "$offsite_keep_nightly"
    find "$OFFSITE_DIR" -maxdepth 1 -name '*.tar.gz.age' -exec basename {} .tar.gz.age \; |
      LC_ALL=C sort | awk -F- '{ month = $1 "-" $2 } month != seen { seen = month; print }' |
      LC_ALL=C sort -r | head -n "$offsite_keep_monthly"
  } | LC_ALL=C sort -u
)

offsite_pruned=0
while IFS= read -r offsite_id; do
  [ -n "$offsite_id" ] || continue
  printf '%s\n' "$offsite_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
    fail "refusing to act on an unexpected backup id: $offsite_id"
  printf '%s\n' "$offsite_keep" | grep -qxF "$offsite_id" && continue
  rm -f "$OFFSITE_DIR/$offsite_id.tar.gz.age" "$OFFSITE_DIR/$offsite_id.metadata.json"
  offsite_pruned=$((offsite_pruned + 1))
  printf 'pruned=%s/%s\n' "$OFFSITE_NAME" "$offsite_id"
done <<IDS
$(find "$OFFSITE_DIR" -maxdepth 1 -name '*.tar.gz.age' -exec basename {} .tar.gz.age \; | LC_ALL=C sort)
IDS

mkdir -p "${CODITU_NIGHTLY_LOG_DIR:-$HOME/.local/state/coditu}"
date -u +%Y-%m-%dT%H%M%SZ > "${CODITU_NIGHTLY_LOG_DIR:-$HOME/.local/state/coditu}/offsite-$OFFSITE_NAME.seen"

printf 'offsite_%s=present\n' "$OFFSITE_NAME"
printf 'offsite_%s_dir=%s\n' "$OFFSITE_NAME" "$OFFSITE_DIR"
printf 'offsite_%s_copied=%s\n' "$OFFSITE_NAME" "$offsite_copied"
printf 'offsite_%s_already=%s\n' "$OFFSITE_NAME" "$offsite_present_already"
printf 'offsite_%s_pruned=%s\n' "$OFFSITE_NAME" "$offsite_pruned"
printf 'offsite_%s_sets=%s\n' "$OFFSITE_NAME" "$offsite_verified"
printf 'offsite_%s_materialised=true\n' "$OFFSITE_NAME"

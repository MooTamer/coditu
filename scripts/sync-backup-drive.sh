#!/usr/bin/env bash
set -euo pipefail

# The off-provider leg: copy the local recovery sets to Google Drive with
# rclone. GitHub holds the primary off-site copy, and a copy that lives only at
# the provider that runs the job is not an off-site copy at all — a suspended
# account takes the backups with it.
#
# ## Why this cannot be activated by an automated pass
#
# rclone's Google Drive backend is OAuth. `rclone config` opens a browser, and
# the consent screen is Mohamed's to click. There is no token here and none can
# be minted without him. Everything else — the remote name, the folder, the
# copy semantics, the verification — is settled, so activation is one command:
#
#     brew install rclone && rclone config     # n) new remote, name: coditu-drive, type: drive
#
# Then this script runs unchanged, and the runbook stops carrying a caveat.
#
# ## Why `copy` and not `sync`
#
# `sync` makes the destination match the source, deletions included. The Mac's
# copy is pruned; Drive's should not be pruned by the Mac. `copy` only ever
# adds, so Drive keeps sets the Mac has already let go.

fail() {
  printf 'sync-backup-drive: %s\n' "$*" >&2
  exit 1
}

command -v rclone >/dev/null 2>&1 || fail "rclone is not installed; see the header"

drive_remote=${DRIVE_REMOTE:-coditu-drive}
drive_path=${DRIVE_PATH:-Coditu/Backups}
drive_local=${LOCAL_BACKUP_DIR:-}
[ -n "$drive_local" ] || fail "LOCAL_BACKUP_DIR is required"
[ -d "$drive_local" ] || fail "LOCAL_BACKUP_DIR does not exist: $drive_local"

rclone listremotes | grep -qx "$drive_remote:" ||
  fail "rclone has no remote named '$drive_remote'; run 'rclone config' once — see the header"

# --immutable makes rclone refuse to overwrite a file whose content changed.
# A recovery set is written once and never edited; anything that presents as an
# edit is corruption or a collision, and should stop the copy rather than
# quietly replace last month's ciphertext.
rclone copy "$drive_local" "$drive_remote:$drive_path" \
  --immutable --checksum --stats-one-line --stats 30s

drive_local_count=$(find "$drive_local" -maxdepth 1 -name '*.tar.gz.age' | wc -l | tr -d ' ')
drive_remote_count=$(rclone lsf "$drive_remote:$drive_path" --include '*.tar.gz.age' | wc -l | tr -d ' ')
[ "$drive_remote_count" -ge "$drive_local_count" ] ||
  fail "Drive holds $drive_remote_count archives for $drive_local_count on disk"

printf 'drive_remote=%s:%s\n' "$drive_remote" "$drive_path"
printf 'local_archives=%s\n' "$drive_local_count"
printf 'drive_archives=%s\n' "$drive_remote_count"

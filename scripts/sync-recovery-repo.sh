#!/usr/bin/env bash
set -euo pipefail

# Build the dedicated recovery repository's whole tree from this one and push
# it, then record what was pushed in `ops/recovery-repo.json` so drift is one
# command away from being visible.
#
# ## Why the recovery repository is self-contained
#
# Two reasons, and the second is the one that matters.
#
# 1. Its workflows write to their own repository's releases, so the only write
#    credential in the backup path is that run's own `GITHUB_TOKEN`. Keeping the
#    workflows in `MooTamer/coditu` instead would need a personal access token
#    with write access to a second repository, stored as a secret, readable by
#    every workflow in the application repository. That is a much larger blast
#    radius than a backup writer should have.
# 2. **The application repository may be the thing that was lost.** A restore
#    path whose first step is "check out the repository you are recovering" is
#    not a restore path. Everything needed to decrypt and restore is in the
#    recovery repository beside the ciphertext.
#
# The cost is a copy that can drift. `--check` compares digests and says so.
#
# Usage:
#   scripts/sync-recovery-repo.sh            # push, then record
#   scripts/sync-recovery-repo.sh --check    # compare only, write nothing

umask 077

sync_repo=${RECOVERY_REPO:-MooTamer/coditu-recovery}
sync_mode=push
[ "${1:-}" != "--check" ] || sync_mode=check

fail() {
  printf 'sync-recovery-repo: %s\n' "$*" >&2
  exit 1
}

cd "$(dirname "${BASH_SOURCE[0]}")/.."
sync_root=$PWD

for sync_command in gh git jq; do
  command -v "$sync_command" >/dev/null 2>&1 || fail "missing required command: $sync_command"
done

# The exact tree the recovery repository carries. Anything not on this list is
# not there, deliberately: no application code, no migrations, no seed.
sync_scripts=(
  backup.sh
  upload-backup.sh
  prune-backups.sh
  check-backup-freshness.sh
  check-backup-integrity.sh
  verify-backup-restore.sh
)

sync_stage=$(mktemp -d "${TMPDIR:-/tmp}/coditu-recovery-repo.XXXXXX")
trap 'rm -rf "$sync_stage"' EXIT INT TERM
mkdir -p "$sync_stage/tree/scripts/sql" "$sync_stage/tree/ops" "$sync_stage/tree/.github/workflows"

for sync_script in "${sync_scripts[@]}"; do
  [ -f "scripts/$sync_script" ] || fail "scripts/$sync_script does not exist"
  cp "scripts/$sync_script" "$sync_stage/tree/scripts/$sync_script"
  chmod 755 "$sync_stage/tree/scripts/$sync_script"
done
cp scripts/sql/row-counts.sql "$sync_stage/tree/scripts/sql/row-counts.sql"
cp ops/backup-recipient.txt "$sync_stage/tree/ops/backup-recipient.txt"
cp ops/recovery-repo/workflows/*.yml "$sync_stage/tree/.github/workflows/"
cp ops/recovery-repo/README.md "$sync_stage/tree/README.md"

sync_digest=$( (cd "$sync_stage/tree" && find . -type f | LC_ALL=C sort |
  while IFS= read -r sync_file; do
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$sync_file"
    else
      shasum -a 256 "$sync_file"
    fi
  done) | (command -v sha256sum >/dev/null 2>&1 && sha256sum || shasum -a 256) | awk '{print $1}')

if [ "$sync_mode" = check ]; then
  sync_recorded=$(jq -er '.treeDigest' ops/recovery-repo.json 2>/dev/null) ||
    fail "ops/recovery-repo.json has no recorded digest; run without --check"
  if [ "$sync_digest" = "$sync_recorded" ]; then
    printf 'recovery_repo_tree=in_sync\ndigest=%s\n' "$sync_digest"
    exit 0
  fi
  fail "the recovery repository tree has drifted: staged $sync_digest, recorded $sync_recorded"
fi

git clone --quiet "https://github.com/$sync_repo.git" "$sync_stage/clone" 2>/dev/null ||
  fail "cannot clone $sync_repo"
cd "$sync_stage/clone"
git symbolic-ref HEAD refs/heads/main
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$sync_stage/tree/." .
git add -A
if git diff --cached --quiet; then
  printf 'recovery_repo=unchanged\n'
else
  git -c user.name="$(git -C "$sync_root" config user.name)" \
      -c user.email="$(git -C "$sync_root" config user.email)" \
      commit -q -m "Update the recovery tooling"
  git push -q origin HEAD:main
fi
sync_head=$(git rev-parse HEAD)
cd "$sync_root"

jq -n \
  --arg repo "$sync_repo" \
  --arg treeDigest "$sync_digest" \
  --arg head "$sync_head" \
  '{repo: $repo, treeDigest: $treeDigest, head: $head}' > ops/recovery-repo.json
chmod 644 ops/recovery-repo.json

printf 'recovery_repo=%s\n' "$sync_repo"
printf 'head=%s\n' "$sync_head"
printf 'digest=%s\n' "$sync_digest"

#!/usr/bin/env bash
set -euo pipefail

# Grandfather-father-son over releases: keep 30 nightly and 12 monthly, delete
# the rest, and validate every tag before asking GitHub to remove anything.
#
# Deleting a release deletes its assets for real, which is the whole reason the
# recovery sets are releases rather than commits. `--cleanup-tag` removes the
# git tag with it so a pruned set leaves nothing behind that looks like it is
# still there.

fail() {
  printf 'prune-backups: %s\n' "$*" >&2
  exit 1
}

need_value() {
  prune_name=$1
  prune_present=${!prune_name:-}
  [ -n "$prune_present" ] || fail "$prune_name is required"
}

# ── Two stores, one policy ─────────────────────────────────────────────────
#
# `local` is the PRIMARY: a directory on the Mac Mohamed owns. It is the
# default because as of ADR 2026-08-31 nothing depends on the GitHub release
# store any more.
#
# `github-release` is kept, works, and is load-bearing for nothing. It is one
# `BACKUP_STORE=github-release` away if a release store is ever wanted again —
# the point of removing a dependency is not to burn the road to it.
prune_store=${BACKUP_STORE:-local}

if [ "$prune_store" = local ]; then
  need_value BACKUP_LOCAL_DIR
  case "$BACKUP_LOCAL_DIR" in
    ""|/) fail "BACKUP_LOCAL_DIR must be a dedicated directory" ;;
  esac
  [ -d "$BACKUP_LOCAL_DIR" ] || fail "BACKUP_LOCAL_DIR does not exist: $BACKUP_LOCAL_DIR"

  # 30 nightly + 12 monthly, the same policy the release store used. Monthly is
  # a SELECTION over what is here — the first set of each calendar month — not a
  # second thing to write, so a monthly copy is never a set that was not also a
  # nightly one and cannot rot separately.
  prune_local_ids=$(find "$BACKUP_LOCAL_DIR" -maxdepth 1 -name '*.tar.gz.age' \
    -exec basename {} .tar.gz.age \; | LC_ALL=C sort)
  prune_local_keep=$(
    {
      printf '%s\n' "$prune_local_ids" | LC_ALL=C sort -r | head -n "${BACKUP_KEEP_NIGHTLY:-30}"
      printf '%s\n' "$prune_local_ids" |
        awk -F- '{ month = $1 "-" $2 } month != seen { seen = month; print }' |
        LC_ALL=C sort -r | head -n "${BACKUP_KEEP_MONTHLY:-12}"
    } | LC_ALL=C sort -u
  )

  prune_local_removed=0
  while IFS= read -r prune_local_id; do
    [ -n "$prune_local_id" ] || continue
    printf '%s\n' "$prune_local_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
      fail "refusing to act on an unexpected backup id: $prune_local_id"
    printf '%s\n' "$prune_local_keep" | grep -qxF "$prune_local_id" && continue
    rm -f "$BACKUP_LOCAL_DIR/$prune_local_id.tar.gz.age" \
          "$BACKUP_LOCAL_DIR/$prune_local_id.metadata.json"
    prune_local_removed=$((prune_local_removed + 1))
    printf 'pruned=local/%s\n' "$prune_local_id"
  done <<LOCAL_IDS
$prune_local_ids
LOCAL_IDS

  printf 'store=local\n'
  printf 'local_retained=%s\n' "$(find "$BACKUP_LOCAL_DIR" -maxdepth 1 -name '*.tar.gz.age' | wc -l | tr -d ' ')"
  printf 'local_pruned=%s\n' "$prune_local_removed"
  exit 0
fi

[ "$prune_store" = github-release ] || fail "unknown BACKUP_STORE: $prune_store"

for prune_command in gh jq; do
  command -v "$prune_command" >/dev/null 2>&1 || fail "missing required command: $prune_command"
done
need_value RECOVERY_REPO

# One listing for both tiers. `gh release list` paginates; ask for more than any
# sane retention could need and fail closed if the answer is suspiciously large,
# because a runaway list is how a prune turns into a deletion spree.
prune_all=$(gh release list --repo "$RECOVERY_REPO" --limit 400 --json tagName) ||
  fail "cannot list releases"
prune_count=$(printf '%s' "$prune_all" | jq 'length')
[ "$prune_count" -lt 400 ] || fail "release listing hit its limit; refusing to prune a truncated list"

prune_tier() {
  prune_tier_name=$1
  prune_keep=$2

  prune_ids=$(printf '%s' "$prune_all" | jq -r --arg tier "$prune_tier_name-" \
    '.[].tagName | select(startswith($tier)) | ltrimstr($tier)' | LC_ALL=C sort -ru)
  prune_total=$(printf '%s\n' "$prune_ids" | grep -c . || true)
  printf '%s_retained=%s\n' "$prune_tier_name" "$prune_total"
  [ "$prune_total" -gt "$prune_keep" ] || return 0

  printf '%s\n' "$prune_ids" | tail -n "+$((prune_keep + 1))" |
    while IFS= read -r prune_id; do
      [ -n "$prune_id" ] || continue
      printf '%s\n' "$prune_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
        fail "refusing unexpected backup id: $prune_id"
      gh release delete "$prune_tier_name-$prune_id" \
        --repo "$RECOVERY_REPO" --cleanup-tag --yes ||
        fail "cannot delete $prune_tier_name-$prune_id"
      printf 'pruned=%s/%s\n' "$prune_tier_name" "$prune_id"
    done
}

printf 'store=github-release\n'
prune_tier nightly 30
prune_tier monthly 12

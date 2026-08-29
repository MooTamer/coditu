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

prune_tier nightly 30
prune_tier monthly 12

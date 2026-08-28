#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'prune-backups: %s\n' "$*" >&2
  exit 1
}

need_value() {
  prune_name=$1
  prune_present=${!prune_name:-}
  [ -n "$prune_present" ] || fail "$prune_name is required"
}

for prune_required in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  need_value "$prune_required"
done
prune_prefix=${R2_PREFIX:-coditu}
case "$prune_prefix" in
  ""|/*|*..*) fail "R2_PREFIX must be a narrow relative prefix" ;;
esac
case "$R2_BUCKET" in
  ""|*/*) fail "R2_BUCKET must be one bucket name" ;;
esac

r2_aws() {
  AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
  AWS_DEFAULT_REGION=${R2_REGION:-auto} \
    aws --endpoint-url "$R2_ENDPOINT" "$@"
}

prune_tier() {
  prune_tier_name=$1
  prune_keep=$2
  prune_root=$prune_prefix/$prune_tier_name
  prune_ids=$(r2_aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prune_root/" |
    jq -r --arg root "$prune_root/" '.Contents[]?.Key | ltrimstr($root) | split("/")[0]' |
    LC_ALL=C sort -ru)
  prune_total=$(printf '%s\n' "$prune_ids" | grep -c . || true)
  [ "$prune_total" -gt "$prune_keep" ] || {
    printf '%s_retained=%s\n' "$prune_tier_name" "$prune_total"
    return
  }

  printf '%s\n' "$prune_ids" | tail -n "+$((prune_keep + 1))" |
    while IFS= read -r prune_id; do
      [ -n "$prune_id" ] || continue
      printf '%s\n' "$prune_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$' ||
        fail "refusing unexpected backup id: $prune_id"
      r2_aws s3 rm "s3://$R2_BUCKET/$prune_root/$prune_id/" \
        --recursive --only-show-errors
      printf 'pruned=%s/%s\n' "$prune_tier_name" "$prune_id"
    done
}

prune_tier nightly 30
prune_tier monthly 12

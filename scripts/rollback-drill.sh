#!/usr/bin/env bash
set -euo pipefail

# Move production to the previous release and back, proving each move from the
# PUBLIC origin rather than from the provider's own answer.
#
# The distinction matters and it is the whole reason this reads
# `/build-health.json` over the internet instead of trusting `vercel rollback`'s
# exit code: on 2026-08-29 a provider check taken too soon reported `count: 0`
# for a deployment that already existed. What the API says and what a browser
# gets are two different questions.
#
# Restoring is attempted on EVERY exit path. A drill that can leave production
# on the old release is worse than no drill.

drill_restore_needed=0
drill_original_id=
drill_original_commit=
drill_previous_id=

fail() { printf 'rollback-drill: %s\n' "$*" >&2; exit 1; }

for drill_required in VERCEL_TOKEN PRODUCTION_BASE_URL; do
  [ -n "${!drill_required:-}" ] || fail "$drill_required is required"
done
printf '%s\n' "$PRODUCTION_BASE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+$' ||
  fail "PRODUCTION_BASE_URL must be one HTTPS origin without a path"

vercel_cli() { vercel "$@" --token "$VERCEL_TOKEN"; }

# What the public origin is actually serving, right now.
public_commit() {
  curl --silent --show-error --fail --location \
    --connect-timeout 10 --max-time 30 --retry 4 --retry-delay 2 --retry-all-errors \
    "$PRODUCTION_BASE_URL/build-health.json" | jq -er '.commit'
}

public_routes_ok() {
  for drill_path in / /login /app/settings/recovery; do
    curl --silent --show-error --fail --location \
      --connect-timeout 10 --max-time 30 --retry 4 --retry-delay 2 --retry-all-errors \
      --output /dev/null "$PRODUCTION_BASE_URL$drill_path" || return 1
  done
}

# The domains move, then propagate. Poll to a deadline rather than sleeping a
# guessed number of seconds — the same rule the 29 August deploy check broke.
await_commit() {
  drill_want=$1
  drill_deadline=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$drill_deadline" ]; do
    if [ "$(public_commit 2>/dev/null || true)" = "$drill_want" ]; then return 0; fi
    sleep 5
  done
  return 1
}

restore() {
  drill_status=$?
  trap - EXIT INT TERM
  if [ "$drill_restore_needed" -eq 1 ]; then
    printf '\n== restoring %s ==\n' "$drill_original_id"
    set +e
    vercel_cli rollback "$drill_original_id" --yes --timeout 3m
    if await_commit "$drill_original_commit" && public_routes_ok; then
      printf 'restored=true commit=%s\n' "$drill_original_commit"
    else
      printf 'restored=false\n'
      printf '::error title=Production was NOT restored::it is serving something other than %s; roll it forward by hand\n' \
        "$drill_original_commit"
      drill_status=1
    fi
  fi
  exit "$drill_status"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '== before ==\n'
drill_original_json=$(vercel_cli inspect "$PRODUCTION_BASE_URL" --json) ||
  fail "cannot resolve the current production deployment"
drill_original_id=$(printf '%s' "$drill_original_json" | jq -er '.id // .uid')
drill_original_commit=$(public_commit) || fail "the public origin is not healthy; not a moment to drill"
public_routes_ok || fail "the public routes are not healthy; not a moment to drill"
printf 'production_id=%s\nproduction_commit=%s\n' "$drill_original_id" "$drill_original_commit"

# The previous READY production deployment that is not the one live now. Read
# from the API rather than from the CLI's table, because a table is a format
# that changes and this has to be exact.
drill_previous_id=$(
  curl --silent --show-error --fail \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID&target=production&state=READY&limit=10" |
  jq -er --arg live "$drill_original_id" \
    '[.deployments[] | select(.uid != $live)] | first | .uid'
) || fail "there is no earlier READY production deployment to roll back to"
printf 'rollback_target=%s\n' "$drill_previous_id"

printf '\n== rolling BACK ==\n'
drill_restore_needed=1
vercel_cli rollback "$drill_previous_id" --yes --timeout 3m

drill_rolled_commit=$(public_commit) || fail "the public origin did not answer after the rollback"
[ "$drill_rolled_commit" != "$drill_original_commit" ] ||
  fail "the public origin still serves $drill_original_commit; the rollback did not take effect"
public_routes_ok || fail "the rolled-back release does not serve its public routes"
printf 'rollback_verified=true served_commit=%s\n' "$drill_rolled_commit"

printf '\n== rolling FORWARD ==\n'
vercel_cli rollback "$drill_original_id" --yes --timeout 3m
await_commit "$drill_original_commit" ||
  fail "production did not come back to $drill_original_commit"
public_routes_ok || fail "the restored release does not serve its public routes"
drill_restore_needed=0
printf 'roll_forward_verified=true served_commit=%s\n' "$drill_original_commit"

printf '\ndrill_passed=true\n'
printf 'production_moved_to=%s then back to=%s\n' "$drill_rolled_commit" "$drill_original_commit"

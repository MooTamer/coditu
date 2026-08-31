#!/usr/bin/env bash
set -euo pipefail

# Prove `vercel rollback` moves real production, and move it back.
#
# ## Why this is shaped the way it is
#
# The obvious drill — roll production back one release and forward again —
# cannot be written as "roll back to the previous release". Measured on
# 2026-08-31, the first time this ran:
#
#     Error: To rollback further than the previous production deployment,
#            upgrade to pro. (402)
#
# On the Hobby plan `vercel rollback` reaches exactly ONE step: the deployment
# that was promoted immediately before the live one. Anything else is refused.
# That is a real constraint on this project's recovery design and it is good
# news for it — `deploy-production.sh`'s trap rolls back to exactly that
# deployment, so the recovery path is inside the free allowance. It also means
# there is no second undo, and nothing said so until this ran.
#
# So the drill steps AWAY with `promote` and comes BACK with `rollback`, which
# is the direction that matters and the one step the plan allows. It verifies
# by DEPLOYMENT ID rather than by commit, because the two deployments can carry
# the same code — and in the safest case they do.
#
# Restoring is attempted on every exit path. A drill that can leave production
# on the wrong release is worse than no drill.

drill_restore_needed=0
drill_live_id=
drill_live_url=
drill_live_commit=
drill_step_id=

fail() { printf 'rollback-drill: %s\n' "$*" >&2; exit 1; }

for drill_required in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID PRODUCTION_BASE_URL; do
  [ -n "${!drill_required:-}" ] || fail "$drill_required is required"
done
export VERCEL_TOKEN
printf '%s\n' "$PRODUCTION_BASE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+$' ||
  fail "PRODUCTION_BASE_URL must be one HTTPS origin without a path"

vercel_cli() { vercel "$@" --token "$VERCEL_TOKEN"; }

# Which deployment the production domain points at, right now, per the provider.
domain_deployment_id() {
  vercel_cli inspect "$PRODUCTION_BASE_URL" --json 2>/dev/null | jq -er '.id // .uid'
}

public_routes_ok() {
  for drill_path in / /login; do
    curl --silent --show-error --fail --location \
      --connect-timeout 10 --max-time 30 --retry 4 --retry-delay 2 --retry-all-errors \
      --output /dev/null "$PRODUCTION_BASE_URL$drill_path" || return 1
  done
}

# Poll to a deadline. A provider answer taken too soon proved nothing on
# 2026-08-29 and it would prove nothing here either.
await_domain() {
  drill_want=$1
  drill_deadline=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$drill_deadline" ]; do
    [ "$(domain_deployment_id || true)" = "$drill_want" ] && return 0
    sleep 5
  done
  return 1
}

restore() {
  drill_status=$?
  trap - EXIT INT TERM
  if [ "$drill_restore_needed" -eq 1 ]; then
    printf '\n== restoring %s ==\n' "$drill_live_id"
    set +e
    # `rollback` is the one step the plan allows and the step this drill exists
    # to prove. `promote` is the fallback, not the primary: if rollback cannot
    # bring production home, that is the finding, and the fallback is what stops
    # the finding from also being an incident.
    vercel_cli rollback "$drill_live_id" --yes --timeout 3m
    if ! await_domain "$drill_live_id"; then
      printf '::warning title=rollback did not restore; promoting instead::%s\n' "$drill_live_id"
      vercel_cli promote "$drill_live_url" --yes --timeout 3m
    fi
    if await_domain "$drill_live_id" && public_routes_ok; then
      printf 'restored=true deployment=%s\n' "$drill_live_id"
    else
      printf 'restored=false\n'
      printf '::error title=Production was NOT restored::it is not serving %s; put it back by hand\n' \
        "$drill_live_id"
      drill_status=1
    fi
  fi
  exit "$drill_status"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '== before ==\n'
drill_live_json=$(vercel_cli inspect "$PRODUCTION_BASE_URL" --json) ||
  fail "cannot resolve the current production deployment"
drill_live_id=$(printf '%s' "$drill_live_json" | jq -er '.id // .uid')
drill_live_url=$(printf '%s' "$drill_live_json" | jq -er '.url')
case "$drill_live_url" in http://*|https://*) ;; *) drill_live_url=https://$drill_live_url ;; esac
drill_live_commit=$(printf '%s' "$drill_live_json" | jq -r '.meta.githubCommitSha // "unknown"')
public_routes_ok || fail "the public routes are not healthy; not a moment to drill"
printf 'live_deployment=%s\nlive_url=%s\nlive_commit=%s\n' \
  "$drill_live_id" "$drill_live_url" "$drill_live_commit"

# The deployment to step away to: READY, built for production, and not the live
# one. Newest first, so this is the smallest possible step.
drill_step_json=$(
  curl --silent --show-error --fail \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID&target=production&state=READY&limit=10" |
  jq -er --arg live "$drill_live_id" '[.deployments[] | select(.uid != $live)] | first'
) || fail "there is no other READY production deployment to step away to"
drill_step_id=$(printf '%s' "$drill_step_json" | jq -er '.uid')
drill_step_url=https://$(printf '%s' "$drill_step_json" | jq -er '.url')
printf 'step_deployment=%s\nstep_url=%s\nstep_commit=%s\n' \
  "$drill_step_id" "$drill_step_url" \
  "$(printf '%s' "$drill_step_json" | jq -r '.meta.githubCommitSha // "unknown"')"

# Do not promote something that is not serving. The drill must not be the thing
# that breaks production.
vercel curl /login --deployment "$drill_step_url" -- \
  --silent --show-error --fail --location --output /dev/null ||
  fail "the deployment to step away to does not serve /login; refusing to promote it"

printf '\n== stepping AWAY with promote ==\n'
drill_restore_needed=1
vercel_cli promote "$drill_step_url" --yes --timeout 3m
await_domain "$drill_step_id" || fail "the domain did not move to $drill_step_id"
public_routes_ok || fail "the stepped-away release does not serve its public routes"
printf 'stepped_away=true domain_now=%s\n' "$drill_step_id"

printf '\n== coming BACK with rollback — the step this drill exists to prove ==\n'
vercel_cli rollback "$drill_live_id" --yes --timeout 3m
await_domain "$drill_live_id" || fail "rollback did not bring the domain back to $drill_live_id"
public_routes_ok || fail "the restored release does not serve its public routes"
drill_restore_needed=0
printf 'rollback_verified=true domain_now=%s\n' "$drill_live_id"

printf '\ndrill_passed=true\n'
printf 'production_moved_to=%s then rolled back to=%s\n' "$drill_step_id" "$drill_live_id"

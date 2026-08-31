#!/usr/bin/env bash
set -euo pipefail

# Promote only a staged production build that passes protected-deployment
# smoke checks. Once domains move, any failed public smoke restores the exact
# deployment that owned them before this script started.

release_promoted=0
release_complete=0
release_previous_id=
release_previous_url=

fail() {
  printf 'deploy-production: %s\n' "$*" >&2
  exit 1
}

need_value() {
  release_name=$1
  release_present=${!release_name:-}
  [ -n "$release_present" ] || fail "$release_name is required"
}

for release_required in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID PRODUCTION_BASE_URL GITHUB_SHA; do
  need_value "$release_required"
done
for release_command in curl jq node vercel; do
  command -v "$release_command" >/dev/null 2>&1 || fail "missing required command: $release_command"
done

printf '%s\n' "$GITHUB_SHA" | grep -Eq '^[0-9a-f]{40}$' ||
  fail "GITHUB_SHA must be a full lowercase commit SHA"
printf '%s\n' "$PRODUCTION_BASE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' ||
  fail "PRODUCTION_BASE_URL must be one HTTPS origin without a path"

release_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_repo_root=$(CDPATH= cd -- "$release_script_dir/.." && pwd)
release_health_file=$release_repo_root/public/build-health.json
[ -f "$release_health_file" ] || fail "public/build-health.json was not written before the deploy"
[ "$(jq -er '.status' "$release_health_file")" = ok ] || fail "local build-health status is not ok"
[ "$(jq -er '.commit' "$release_health_file")" = "$GITHUB_SHA" ] ||
  fail "local build-health commit does not match GITHUB_SHA"

vercel_cli() {
  vercel "$@" --token "$VERCEL_TOKEN"
}

smoke_staged() {
  release_target=$1
  release_body=$(vercel curl /build-health.json --deployment "$release_target" \
    --token "$VERCEL_TOKEN" -- \
    --silent --show-error --fail --location) || return 1
  [ "$(printf '%s' "$release_body" | jq -er '.status')" = ok ] || return 1
  [ "$(printf '%s' "$release_body" | jq -er '.commit')" = "$GITHUB_SHA" ] || return 1

  for release_path in / /login /app/settings/recovery; do
    vercel curl "$release_path" --deployment "$release_target" \
      --token "$VERCEL_TOKEN" -- \
      --silent --show-error --fail --location --output /dev/null || return 1
  done
}

public_request() {
  release_path=$1
  shift
  curl --silent --show-error --fail --location \
    --connect-timeout 10 --max-time 30 \
    --retry 4 --retry-delay 2 --retry-all-errors \
    "$@" "$PRODUCTION_BASE_URL$release_path"
}

smoke_public_routes() {
  for release_path in / /login /app/settings/recovery; do
    release_effective=$(public_request "$release_path" --output /dev/null --write-out '%{url_effective}') ||
      return 1
    case "$release_effective" in
      "$PRODUCTION_BASE_URL"|"$PRODUCTION_BASE_URL"/*) ;;
      *) return 1 ;;
    esac
  done
}

smoke_public_new_release() {
  release_body=$(public_request /build-health.json) || return 1
  [ "$(printf '%s' "$release_body" | jq -er '.status')" = ok ] || return 1
  [ "$(printf '%s' "$release_body" | jq -er '.commit')" = "$GITHUB_SHA" ] || return 1
  smoke_public_routes
}

rollback_on_failure() {
  release_status=$?
  trap - EXIT INT TERM
  if [ "$release_promoted" -eq 1 ] && [ "$release_complete" -eq 0 ]; then
    set +e
    printf 'rollback_started=%s\n' "$release_previous_url" >&2
    vercel_cli rollback "$release_previous_id" --yes --timeout 3m
    release_rollback_status=$?
    if [ "$release_rollback_status" -eq 0 ]; then
      smoke_public_routes
      release_recovery_status=$?
    else
      release_recovery_status=1
    fi
    if [ "$release_rollback_status" -eq 0 ] && [ "$release_recovery_status" -eq 0 ]; then
      printf 'rollback_verified=true\n' >&2
    else
      printf 'rollback_verified=false\n' >&2
    fi
  fi
  exit "$release_status"
}
trap rollback_on_failure EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

release_previous_json=$(vercel_cli inspect "$PRODUCTION_BASE_URL" --json) ||
  fail "cannot resolve the current production deployment"
release_previous_id=$(printf '%s' "$release_previous_json" | jq -er '.id // .uid') ||
  fail "current production has no deployment id"
release_previous_url=$(printf '%s' "$release_previous_json" | jq -er '.url') ||
  fail "current production has no immutable URL"
case "$release_previous_url" in
  http://*|https://*) ;;
  *) release_previous_url=https://$release_previous_url ;;
esac

# Source, not `--prebuilt`, and this is the one line that matters most here.
#
# CI used to run `vercel pull` and `vercel build` and ship the result. That
# cannot work on this project: four of its production environment variables are
# marked **Sensitive**, which by design means write-only — `vercel pull` writes
# `[SENSITIVE]` in their place and no token can read them back. The first real
# run of this path died in `next build`, on the application's own check that its
# Supabase configuration is present. See ADR 2026-08-31.
#
# So the build happens on Vercel, where those variables resolve, exactly as it
# has for every production deploy this project has ever had. Nothing about the
# GATE moves: this job still runs only after the blocking checks and the hosted
# schema preflight, on a commit that is already on `main` through a green pull
# request, and the stage → smoke → promote → roll-back-on-failure sequence below
# is untouched. `public/build-health.json` still names the commit CI verified.
release_deploy_output=$(vercel_cli deploy --prod --skip-domain --yes)
release_staged_url=$(printf '%s\n' "$release_deploy_output" |
  grep -E '^https://[A-Za-z0-9.-]+\.vercel\.app/?$' | tail -n 1)
[ -n "$release_staged_url" ] || fail "Vercel did not return a staged deployment URL"

smoke_staged "$release_staged_url" || fail "staged production smoke failed; domains were not changed"

release_promoted=1
vercel_cli promote "$release_staged_url" --yes --timeout 3m
smoke_public_new_release || fail "public production smoke failed after promotion"

release_complete=1
printf 'deployment_url=%s\n' "$release_staged_url"
printf 'previous_deployment_url=%s\n' "$release_previous_url"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'url=%s\n' "$release_staged_url" >> "$GITHUB_OUTPUT"
fi

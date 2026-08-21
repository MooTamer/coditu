#!/usr/bin/env bash
# Builds, starts `next start` on a genuinely free port, and runs a command
# against it with `E2E_PROD_URL` set.
#
# The free-port search is not fussiness. Hard-coding a port is how you end up
# measuring somebody else's application and believing the result — it has
# already happened once on this project, and the reading looked entirely
# plausible.
#
#   ./scripts/with-prod-server.sh node scripts/check-budgets.mjs
#   SKIP_BUILD=1 ./scripts/with-prod-server.sh npx playwright test
set -euo pipefail
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# This harness runs `next build` + `next start`, which means NODE_ENV=production,
# which means Next loads `.env.production.local` — the REAL Supabase project.
# The e2e suite inserts and deletes work items. Pointing it at production would
# be a very bad day, so the local values from `.env.local` are exported here:
# a variable already in the environment wins over any `.env` file in Next.
#
# The assertion below is the actual guard. The export is what makes it pass.
# ---------------------------------------------------------------------------
# An explicitly-set variable always wins — silently overriding one the caller
# passed in is how a deliberate staging run turns into a confusing local one.
if [ -f .env.local ]; then
  while IFS= read -r line; do
    case "$line" in
      NEXT_PUBLIC_SUPABASE_URL=*|NEXT_PUBLIC_SUPABASE_ANON_KEY=*|SUPABASE_SERVICE_ROLE_KEY=*|REPORT_TOKEN_SECRET=*)
        name="${line%%=*}"
        [ -n "$(eval "printf '%s' \"\${$name:-}\"")" ] || export "${line?}"
        ;;
    esac
  done < .env.local
fi

case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local." >&2
    echo "  resolved to: ${NEXT_PUBLIC_SUPABASE_URL:-<unset>}" >&2
    echo "  this harness runs a suite that DELETES rows. Point it at the local stack." >&2
    exit 1 ;;
esac

[ "${SKIP_BUILD:-}" = "1" ] || npm run build

PORT=""
for candidate in $(seq 3210 3260); do
  if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN -t >/dev/null 2>&1; then
    PORT="$candidate"
    break
  fi
done
[ -n "$PORT" ] || { echo "no free port in 3210-3260" >&2; exit 1; }
echo "production server on :$PORT"

# GNU mktemp requires the trailing X's; BSD does not care. Without them
# this fails on Linux only — which is to say, on CI and nowhere else.
LOG=$(mktemp -t coditu-prod.XXXXXX)
npx next start -p "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "http://localhost:$PORT/login" 2>/dev/null && break
  sleep 0.5
done

if ! curl -fsS -o /dev/null "http://localhost:$PORT/login"; then
  echo "production server never became ready:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi

E2E_PROD_URL="http://localhost:$PORT" "$@"

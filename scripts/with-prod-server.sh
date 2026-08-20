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

LOG=$(mktemp -t coditu-prod)
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

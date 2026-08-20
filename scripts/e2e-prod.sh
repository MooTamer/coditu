#!/usr/bin/env bash
# Runs the e2e suite against a PRODUCTION build.
#
# Some assertions are only meaningful here — code splitting in particular. The
# dev server eagerly loads dynamic chunks so HMR can patch them, so measuring
# "is TipTap shipped to a reader" against `next dev` reports a failure that does
# not exist in what actually ships.
#
# Usage: npm run e2e:prod
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

# Find a port nobody is on. Hard-coding one is how you end up measuring somebody
# else's application and believing the result.
PORT=""
for candidate in $(seq 3210 3260); do
  if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN -t >/dev/null 2>&1; then
    PORT="$candidate"
    break
  fi
done
[ -n "$PORT" ] && echo "production server on :$PORT" || { echo "no free port in 3210-3260" >&2; exit 1; }

npx next start -p "$PORT" > /tmp/coditu-e2e-prod.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/login" 2>/dev/null; then break; fi
  sleep 0.5
done

if ! curl -fsS -o /dev/null "http://localhost:$PORT/login"; then
  echo "production server never became ready:" >&2
  tail -20 /tmp/coditu-e2e-prod.log >&2
  exit 1
fi

E2E_PROD_URL="http://localhost:$PORT" npx playwright test "$@"

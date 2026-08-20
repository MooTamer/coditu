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
exec "$(dirname "$0")/with-prod-server.sh" npx playwright test "$@"

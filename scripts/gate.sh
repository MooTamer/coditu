#!/usr/bin/env bash
# The routine gate, as one command.
#
# ## Why this file exists
#
# The gate was a checklist in `docs/06-PROGRESS.md` and a memory of having run
# it. That is enough right up until something falls off the list, and something
# did: `e2e/comments.spec.ts`'s *"the editor bundle is not shipped to a reader
# who never composes"* skips itself without `E2E_PROD_URL`, `npm run e2e:prod`
# was in no gate, and the assertion went quiet for weeks. It was failing the
# whole time — a reader of a story page was downloading 329 KB of ProseMirror.
#
# A check that only runs when somebody remembers is not a check. So the list is
# executable, and the two production-only assertions are in it.
#
#   npm run gate              everything
#   npm run gate -- --fast    skip the two long browser passes
#
# `npm run e2e` is the slow one (~19 minutes, three Playwright projects). The
# production pass is fast: one build, then the two specs that are only
# meaningful against what ships.
set -euo pipefail
cd "$(dirname "$0")/.."

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

step "git diff --check"; git diff --check
step "lint";             npm run lint
step "typecheck";        npm run typecheck
step "test";             npm run test
step "db:test";          npm run db:test

step "db:types (no diff)"
npm run db:types
if ! git diff --quiet -- lib/supabase/database.types.ts; then
  echo "lib/supabase/database.types.ts is out of date — commit the regenerated file." >&2
  exit 1
fi

step "components:check"; npm run components:check

# PF-4's second half, and it is on the list for the reason the header gives.
# 54 Server Action call sites were awaited, had their result inspected, and had
# nothing catching a rejected fetch — so a lost connection skipped the `!ok`
# branch, skipped the rollback beside it, and let `useOptimistic` revert in
# silence. That is invariant 4's failure exactly, it had been true for months,
# and no command in this repository would have said so.
step "resilience";       npm run resilience
step "degraded";         npm run degraded

# One build, three consumers. `SKIP_BUILD=1` on the second and third so the
# gate does not build the application three times to ask it three questions.
step "budgets + production-only assertions"
./scripts/with-prod-server.sh node scripts/check-budgets.mjs
SKIP_BUILD=1 ./scripts/with-prod-server.sh npx playwright test --project=chromium --grep @prod

if [ "$FAST" = "1" ]; then
  printf '\n\033[1mgate: OK (--fast — `npm run e2e` and `npm run lighthouse` were not run)\033[0m\n'
  exit 0
fi

step "e2e";        npm run e2e
step "lighthouse"; npm run lighthouse

printf '\n\033[1mgate: OK\033[0m\n'

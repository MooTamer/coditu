#!/usr/bin/env bash
# PF-2's specification, run on its own — and the check that it is still unbuilt.
#
# ## Why this is not just a line in `npm run test`
#
# `tests/notion-roundtrip.test.ts` is deliberately red: it is the round trip's
# spec made executable, and it stays red until the return direction exists. For
# a day that was fine. Then `npm run test` read `480 passed, 1 failed` every
# time, and a command that is always red cannot answer the only question it is
# asked — *did I break something?* The repository has already paid for that
# lesson once: `scripts/gate.sh`'s header records a production-only assertion
# that failed quietly for weeks because nothing ran it.
#
# So the suite is green, and this is where the red lives. It is not a skip and
# not a deletion: the test runs, it fails, and its failure message still names
# every field that drifted with the section of `docs/11-NOTION-ROUNDTRIP.md`
# that explains it. That output is PF-2's build checklist.
#
# ## The check
#
#   the test FAILS  →  PF-2 is outstanding, as recorded. exit 0.
#   the test PASSES →  the round trip now holds. exit 1, loudly, because the
#                      exclusion in `vitest.config.mts` has to come out and
#                      PF-2 has to close.
#
# That inversion is what makes this a check rather than a note. `npm run gate`
# runs it.
set -uo pipefail
cd "$(dirname "$0")/.."

# Its own config, because `vitest.config.mts` excludes this file by name and a
# CLI `--exclude` is APPENDED to that list rather than replacing it — vitest
# then matched nothing, printed "No test files found" and exited 1, which is
# indistinguishable from the test failing and reported a green PF-2. That is
# what the guard below is for, and it fired on the first version of this script.
OUT=$(npx vitest run --config vitest.roundtrip.config.mts 2>&1)
STATUS=$?

echo "$OUT"

case "$OUT" in
  *"No test files found"*)
    printf '\n\033[1;31mroundtrip: the spec did not run at all.\033[0m\n'
    echo "tests/notion-roundtrip.test.ts was not matched. A check that cannot find"
    echo "its subject is not a check — fix the filter before trusting this again."
    exit 1 ;;
esac

if [ "$STATUS" -ne 0 ]; then
  printf '\n\033[1mroundtrip: PF-2 is still unbuilt — expected, and the drift above is the checklist.\033[0m\n'
  exit 0
fi

printf '\n\033[1;31mroundtrip: the Notion round trip PASSES.\033[0m\n'
echo "PF-2 is done. Take tests/notion-roundtrip.test.ts out of the exclude list in"
echo "vitest.config.mts so it joins the suite, mark PF-2 done in"
echo "docs/10-PRODUCT-FEEDBACK.md, and delete this script."
exit 1

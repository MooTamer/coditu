#!/usr/bin/env bash
#
# Coditu — apply the outstanding migrations and seeds to the hosted database.
#
# ## Why this exists as a script
#
# `docs/06-PROGRESS.md` carries this as an eleven-item ordered list with two
# footguns in it, and `docs/07-FIELD-NOTES.md` records what happened the one
# time the list was not followed: `sprints.notes_written_at` shipped ahead of
# its migration and every production sprint page threw `42703`. A checklist a
# human reads at the end of a long day is exactly the wrong shape for that. This
# is the same list, in the same order, that refuses to continue when a step does
# not do what it said.
#
# Nothing here is clever. It runs `supabase db push`, then three seed files, and
# spends most of its length on the numbers to look at before and after.
#
# ## The two footguns
#
#  1. **`20260825091000_project_keys_and_slugs.sql` rebalances every project's
#     key prefix and counter from the keys that already exist** — and the hosted
#     `COD-` range is not the local one (`COD-152…COD-255` there, `COD-140…243`
#     here). The migration derives both from the data rather than from a
#     constant, so it should be right on both; this script records the highest
#     existing key BEFORE and asserts the counter landed above it AFTER, because
#     "should be right" is not a verification.
#
#  2. **`20260825093000_stable_image_refs.sql` rewrites data** and reports what
#     it touched in a `notice`, which is the one piece of output that may not
#     survive the CLI. Once it has run the number is gone — a second run
#     correctly finds nothing. So the count is taken independently BEFORE, with
#     the same shape test the migration uses, and cross-checked against the
#     notice afterwards.
#
# ## What this deliberately does NOT do
#
# It never runs `supabase/seed.sql`, and it never passes `--include-seed` to
# `db push` (which would). That file creates accounts with `crypt('coditu', …)`
# and it has already reached the hosted project once — `07-FIELD-NOTES.md`,
# "The seed password reached production". The three files under `supabase/seeds/`
# are a different thing entirely: each is idempotent, each only ever adds or
# fills a NULL, and each is safe against a database that already has the rows.
#
# ## Usage
#
#   scripts/push-to-hosted.sh --db-url 'postgresql://postgres:PASSWORD@db.hayfsvsepgfescojesbd.supabase.co:5432/postgres'
#   scripts/push-to-hosted.sh --db-url '…' --verify-only    # checks only, writes nothing
#
# Take the connection string from the dashboard: Project Settings → Database →
# Connection string → **URI**, and use the direct connection or the *session*
# pooler, not the transaction pooler on 6543 — migrations are DDL in explicit
# transactions and the transaction pooler will not carry them. A password with
# anything outside `[A-Za-z0-9._~-]` must be percent-encoded; the CLI says so
# too, and says it after it has already failed.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB_URL=""
VERIFY_ONLY=0
ALLOW_LOCAL=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)      DB_URL="${2:-}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --allow-local) ALLOW_LOCAL=1; shift ;;   # for the rehearsal against a local cluster
    --yes|-y)      ASSUME_YES=1; shift ;;
    -h|--help)     sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$DB_URL" ]] || { echo "error: --db-url is required. See --help." >&2; exit 2; }
command -v psql     >/dev/null || { echo "error: psql is not on PATH." >&2; exit 2; }
command -v supabase >/dev/null || { echo "error: the supabase CLI is not on PATH." >&2; exit 2; }

# A local URL is almost certainly a mistake here — `npm run db:migrate` is the
# local path — but the rehearsal needs exactly that, so it is a flag rather than
# a refusal.
if [[ "$DB_URL" == *"127.0.0.1"* || "$DB_URL" == *"localhost"* ]] && [[ $ALLOW_LOCAL -eq 0 ]]; then
  echo "error: that connection string is local. This script is for the hosted database;" >&2
  echo "       use 'npm run db:migrate' locally, or pass --allow-local to rehearse." >&2
  exit 2
fi

LOG_DIR="${TMPDIR:-/tmp}/coditu-push-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$LOG_DIR"

# `-X` so a developer's ~/.psqlrc cannot change the output this script parses.
psql_q() { psql -X -v ON_ERROR_STOP=1 -qAt -d "$DB_URL" -c "$1"; }
psql_show() { psql -X -v ON_ERROR_STOP=1 -d "$DB_URL" -c "$1"; }

rule() { printf '\n\033[1m%s\033[0m\n' "── $* ────────────────────────────────────────────" ; }
fail() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Reachability, and which database this actually is.
# ---------------------------------------------------------------------------
rule "Connection"
psql_q "select 'connected to ' || current_database() || ' on ' || inet_server_addr()::text || ' as ' || current_user" \
  || fail "could not connect. Check the connection string, and that the password is percent-encoded."

# ---------------------------------------------------------------------------
# Pre-flight. Everything below is read-only.
# ---------------------------------------------------------------------------
rule "Before — what the database has now"

# The shape test is the migration's own, kept in one place so the two cannot
# drift: `/comment-images/<profile-uuid>/<file-uuid>.<ext>`, with or without a
# signing token after the `?`.
#
# `$.**.src` reaches an image nested at any depth — a picture inside a
# blockquote inside a list is still a picture — which is what the migration's
# recursion over `content` does, without needing the function that migration
# has not created yet.
#
# Substituted with `${VAR//@COL@/…}` and not with `printf`. printf would read
# the `\.` and `\d` in that regex as escape sequences, and what it does with an
# unrecognised one is explicitly undefined; a predicate that quietly stops
# matching would turn every check below into a pass.
#
# Read with `read -d ''` rather than `IMAGE_PREDICATE=$(cat <<'SQL' … )`. A
# heredoc inside a command substitution is a bash 4 parser feature, and macOS
# ships bash 3.2 — so the form this started life with made the ONE script in
# this repository that writes to production fail to parse on the delivery Mac,
# with `unexpected EOF while looking for matching ')'` and no clue which
# construct it meant. It was written that way in the commit that added the
# script and never ran here; the rehearsal it claims happened on a Linux
# runner. `read` returns non-zero at EOF, hence the `|| true` under `set -e`.
read -r -d '' IMAGE_PREDICATE <<'SQL' || true
exists (
  select 1
  from jsonb_path_query(@COL@, '$.**.src') as node
  where node #>> '{}' like '%/comment-images/%'
    and substring(split_part(node #>> '{}', '?', 1) from '/comment-images/(.+)$')
        ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(png|jpg|webp|gif|avif)$'
)
SQL
image_predicate() { echo "${IMAGE_PREDICATE//@COL@/$1}"; }

# `to_regclass` rather than an assumption: this script may be run against a
# database that is one migration behind, or seven.
HAS_CRITERIA=$(psql_q "select case when to_regclass('public.acceptance_criteria') is null then 0 else 1 end")

IMG_COMMENTS=$(psql_q "select count(*) from public.comments c where $(image_predicate 'c.body_json')")
if [[ "$HAS_CRITERIA" == "1" ]] && psql_q "select 1 from information_schema.columns where table_schema='public' and table_name='acceptance_criteria' and column_name='body_json'" | grep -q 1; then
  IMG_CRITERIA=$(psql_q "select count(*) from public.acceptance_criteria a where a.body_json is not null and $(image_predicate 'a.body_json')")
else
  # `body_json` arrives with 20260824170000_rich_criteria.sql. If it is not
  # there yet then no criterion can hold an image, and the answer is 0 — not
  # unknown.
  IMG_CRITERIA=0
fi

MAX_COD=$(psql_q "select coalesce(max(substring(key from '\d+\$')::int), 0) from public.work_items where key like 'COD-%'")

echo "  comments holding a rewritable image src : $IMG_COMMENTS"
echo "  criteria holding a rewritable image src : $IMG_CRITERIA"
echo "  highest existing COD- key number        : $MAX_COD"
echo
echo "  migrations the remote already has, last five:"
psql_q "select '    ' || version from supabase_migrations.schema_migrations order by version desc limit 5" \
  || echo "    (no supabase_migrations.schema_migrations — this database has never been pushed to)"

{
  echo "pre-flight $(date -u +%FT%TZ)"
  echo "img_comments=$IMG_COMMENTS"
  echo "img_criteria=$IMG_CRITERIA"
  echo "max_cod=$MAX_COD"
} > "$LOG_DIR/before.txt"

if [[ $VERIFY_ONLY -eq 0 ]]; then
  rule "What would be applied"
  supabase db push --db-url "$DB_URL" --dry-run 2>&1 | tee "$LOG_DIR/dry-run.log"

  # `db push` refuses a file that sorts earlier than what the remote already
  # holds, which is how two parallel sessions writing the same migration number
  # is finally noticed. If the dry run says nothing is pending, there is nothing
  # to do and the seeds below are still worth running.
  rule "Confirm"
  echo "  Migrations run BEFORE the code that reads them — an added column is invisible"
  echo "  to the running deployment; code selecting a column that is not there is a 500."
  echo
  if [[ $ASSUME_YES -eq 0 ]]; then
    read -r -p "  Apply the above to $(psql_q "select current_database()") ? [type: apply] " answer
    [[ "$answer" == "apply" ]] || { echo "  nothing was applied."; exit 1; }
  fi

  # -------------------------------------------------------------------------
  # The push.
  # -------------------------------------------------------------------------
  rule "Applying migrations"
  # Never --include-seed. See the header.
  supabase db push --db-url "$DB_URL" --yes 2>&1 | tee "$LOG_DIR/push.log"

  # -------------------------------------------------------------------------
  # The seeds, in the ledger's order, after every migration rather than
  # interleaved with them.
  #
  # `06-PROGRESS.md` lists components.sql and item-components.sql between two
  # migrations because that is the order they were written in, not because
  # anything depends on it: `20260824170000_rich_criteria.sql` and everything
  # after it touch `acceptance_criteria`, `app_settings`, `projects`, `comments`
  # and `sprint_payouts`, and none of them reads a component or a
  # `component_id`. `db push` applies its whole set in one call, so the choice
  # is this or splitting the push in two for no reason.
  #
  # The one ordering that IS load-bearing: developers.sql sets
  # `profiles.is_developer`, which arrives with 20260825095000_earnings.sql, so
  # it must come after the push and not before it.
  # -------------------------------------------------------------------------
  rule "Seeding"
  for seed in components item-components developers; do
    echo "  supabase/seeds/$seed.sql"
    psql -X -v ON_ERROR_STOP=1 -q -d "$DB_URL" -f "supabase/seeds/$seed.sql" \
      || fail "supabase/seeds/$seed.sql did not apply. The migrations above ARE applied; re-run with --verify-only to see where this stopped."
  done
fi

# ---------------------------------------------------------------------------
# After. Every one of these is an assertion, not a report.
# ---------------------------------------------------------------------------
rule "After — verifying"

check() { # check <description> <sql returning t/f>
  local got
  got=$(psql_q "select case when ($2) then 'ok' else 'NO' end")
  if [[ "$got" == "ok" ]]; then printf '  \033[32mok\033[0m   %s\n' "$1"
  else printf '  \033[31mNO\033[0m   %s\n' "$1"; FAILURES=$((FAILURES + 1)); fi
}
FAILURES=0

check "app_settings holds exactly one row, id 1" \
      "(select count(*) = 1 from public.app_settings where id = 1)"
check "every project has a key prefix" \
      "(select count(*) = 0 from public.projects where key_prefix is null or key_prefix = '')"
check "no two projects share a prefix" \
      "(select count(*) = count(distinct key_prefix) from public.projects)"
check "MEINEvim kept COD — existing keys are immutable" \
      "(select key_prefix = 'COD' from public.projects where slug = 'meinevim')"
check "MEINEvim's counter is above the highest COD- key that exists ($MAX_COD)" \
      "(select next_key_number > $MAX_COD from public.projects where slug = 'meinevim')"
check "no work item lost its key" \
      "(select count(*) = 0 from public.work_items where key is null or key = '')"
check "work_items.deleted_at exists, and nothing is deleted yet" \
      "(select count(*) = 0 from public.work_items where deleted_at is not null)"
check "no rewritable image src is left in a comment" \
      "(select count(*) = 0 from public.comments c where $(image_predicate 'c.body_json'))"
check "no rewritable image src is left in a criterion" \
      "(select count(*) = 0 from public.acceptance_criteria a where a.body_json is not null and $(image_predicate 'a.body_json'))"
check "reorder_criteria is security invoker — it must not outrank its caller" \
      "(select not p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reorder_criteria')"
check "sprint_payouts has RLS on" \
      "(select relrowsecurity from pg_class where oid = 'public.sprint_payouts'::regclass)"
check "sprint_payout_shares has RLS on" \
      "(select relrowsecurity from pg_class where oid = 'public.sprint_payout_shares'::regclass)"
check "the component registry landed" \
      "(select count(*) >= 30 from public.components)"
check "the imported work is attributed to it" \
      "(select count(*) > 0 from public.work_items where component_id is not null)"
# Was `count(*) = 3`, and it went red against hosted on 2026-08-31 for a reason
# that is not a fault: `is_developer` is a decision an admin makes in the
# interface — `supabase/seeds/developers.sql` says so in as many words, and says
# the seed is not consulted again afterwards. So a constant here asserts that
# nobody has ever exercised the control, and goes red the first time somebody
# does. Same defect as the column guards: a hand-maintained expectation about
# something designed to change.
#
# What is left is the failure this can actually detect — the seed never having
# run at all, leaving a pot with nobody to share it. The roster itself is
# printed under "Numbers to read", where a human reads it and decides.
check "somebody takes a share of a sprint's pot" \
      "(select count(*) > 0 from public.profiles where is_developer)"
check "Adam Nafie is not one of them — his hours count, his share does not" \
      "(select coalesce(bool_and(not is_developer), true) from public.profiles where full_name = 'Adam Nafie')"

rule "Numbers to read"
psql_show "select slug, key_prefix, next_key_number from public.projects order by slug"
psql_show "select count(*) as components, count(*) filter (where icon is not null) as with_icon from public.components"
psql_show "select full_name, is_developer from public.profiles order by full_name"

# The notice, if the CLI let it through. The pre-flight count is the answer
# either way; this is the cross-check.
if [[ -f "$LOG_DIR/push.log" ]] && grep -q 'stable image refs' "$LOG_DIR/push.log"; then
  echo
  grep 'stable image refs' "$LOG_DIR/push.log" | sed 's/^/  /'
  echo "  (counted before the run: $IMG_COMMENTS comments, $IMG_CRITERIA criteria)"
fi

rule "For docs/06-PROGRESS.md"
cat <<LEDGER
  Applied to hayfsvsepgfescojesbd on $(date -u +%F). Stable image refs:
  ${IMG_COMMENTS} comments, ${IMG_CRITERIA} criteria rewritten. MEINEvim kept COD
  with its counter at $(psql_q "select next_key_number from public.projects where slug = 'meinevim'")
  (highest existing key COD-${MAX_COD}).
  Logs: $LOG_DIR
LEDGER

if [[ $FAILURES -gt 0 ]]; then
  fail "$FAILURES check(s) did not pass. The schema is applied; something above is not what it should be."
fi
printf '\n\033[32mAll checks passed.\033[0m\n'

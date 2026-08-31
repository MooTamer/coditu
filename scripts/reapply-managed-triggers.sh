#!/usr/bin/env bash
set -euo pipefail

# Put back the one thing a dump of this project cannot carry: the triggers it
# attaches to MANAGED schemas.
#
# ## Why this exists, and why `supabase db push` is not it
#
# `docs/12-RECOVERY-RUNBOOK.md` step 5a said *"re-apply the migrations over the
# restored database — `supabase db push`"*. **Measured on 2026-08-31, that does
# not work**, and automating the drill is what found it:
#
#     restore_migrations_reapplied=running
#     Applying migration 20260820120000_enums.sql...
#     LegacyMigrationApplyError … At statement: 0
#       create type app_role as enum ('admin','lead','engineer')
#
# The archive carries **no `supabase_migrations` schema at all** — `supabase db
# dump` writes `public`, and the migration history is not in it — so a restored
# database has a full schema and an empty history. The CLI therefore replays all
# forty migrations from the beginning, and dies on the first `create type`,
# because the type is already there. Step 5a as written stops one statement in.
#
# The goal of 5a was never "run the migrations". It was **get the two
# `auth.users` triggers back**, because without them a recovered system has no
# profile creation and no sign-up allowlist. Everything else those migrations
# would create is in `schema.sql` and has already been restored. This script
# does that and nothing else.
#
# ## Derived, not listed
#
# The statements are extracted from `supabase/migrations/*.sql` by the same
# slurping regex `verify-backup-restore.sh` uses to decide which triggers must
# exist — so the two halves cannot disagree, and a trigger somebody attaches to
# `auth.*` or `storage.*` next month is picked up without anybody remembering to
# add it here. A hand-kept list would be silent about exactly that.
#
# The functions these triggers call live in `public` and ARE in the dump, so
# they are already restored; only the `create trigger` statements are missing.
#
# Each statement is prefixed with `drop trigger if exists`, because the two in
# this repository are written as plain `create trigger` and migration history is
# append-only — they are not going to be rewritten as `create or replace` to
# suit a script that runs years later. The drop makes the replay idempotent
# without editing anything that has already been applied.
#
# Usage:
#   scripts/reapply-managed-triggers.sh <db-url>

umask 077

fail() {
  printf 'reapply-managed-triggers: %s\n' "$*" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail "usage: reapply-managed-triggers.sh <db-url>"
triggers_db_url=$1

triggers_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
command -v psql >/dev/null 2>&1 || fail "missing required command: psql"
command -v perl >/dev/null 2>&1 || fail "missing required command: perl"

# Whole statements, `create trigger` through the terminating semicolon. Slurped
# rather than read line by line: `create trigger x` and `on auth.users` are
# never on the same line in this repository, and the line-based version of this
# scan found NOTHING and reported success.
triggers_sql=$(
  perl -0777 -ne '
    while (/(create\s+(?:or\s+replace\s+)?trigger\s+(\w+)\s+(?:before|after|instead\s+of)\b[^;]*?\bon\s+((?:auth|storage)\.\w+)[^;]*;)/gis) {
      my ($stmt, $name, $table) = ($1, $2, $3);
      # Replayable. These are written as plain `create trigger` in the
      # migrations — history is append-only here, so they are not rewritten to
      # `create or replace`; the drop is prepended instead, which is idempotent
      # and touches nothing that has already been applied anywhere.
      print "drop trigger if exists $name on $table;\n$stmt\n";
    }' "$triggers_root"/supabase/migrations/*.sql
)

[ -n "$triggers_sql" ] || fail "no triggers on auth.* or storage.* found in the migrations; this scan has gone blind"

printf '%s\n' "$triggers_sql" | psql -X -q "$triggers_db_url" -v ON_ERROR_STOP=1

printf 'managed_triggers_reapplied=%s\n' \
  "$(printf '%s\n' "$triggers_sql" | grep -ci '^drop trigger if exists')"

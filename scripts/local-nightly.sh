#!/usr/bin/env bash
set -euo pipefail

# The nightly recovery copy AND the restore drill, on the Mac.
#
# ## Why this is not a GitHub Actions workflow
#
# Three reasons, and they arrived in this order.
#
# 1. **The drill cannot run in the cloud at all.** `verify-backup-restore.sh`
#    needs the age *private* key. The key is deliberately not on GitHub and age
#    has no decrypt-only identity, so no scheduled cloud job can ever run the
#    real restore. The 2026-08-28 decision "the drill is automated monthly" was
#    withdrawn on 2026-08-30 as unimplementable, and this is its replacement.
# 2. **The backup and the test suite were drawing on one budget.** GitHub
#    Actions minutes belong to the account, not the repository, so CI and the
#    nightly compete. On 2026-08-31 the allowance ran out — 3,000 minutes of a
#    GitHub Pro plan, crossed at 08:20Z — every job in both repositories started
#    returning zero steps, and the nightly stopped. The backup was 47 of those
#    minutes. **1.4% of the burn, and the first thing to die.**
# 3. **The canary that should have said so could not.** It is also Actions.
#
# So the backup moves to the one machine that already holds the key, and GitHub
# Actions keeps CI only.
#
# ## Its own failure mode, and why that is an improvement
#
# This job's weakness is obvious: the Mac can be asleep, closed, or on a plane.
# That is *better* than what it replaces, because it is **visible**. A run that
# does not happen is a missed heartbeat at healthchecks.io and an email; a
# GitHub Actions run that does not happen is nothing at all. The whole design
# here is to convert silence into a signal:
#
#     HEARTBEAT_URL/start  ->  the window opens
#     HEARTBEAT_URL        ->  a complete, verified, restored set
#     HEARTBEAT_URL/fail   ->  something broke, and this is which step
#
# **Only step 4 pings success.** A copy that was written and never restored is
# not a backup, it is a file — so the ping is downstream of the restore, not of
# the upload.
#
# ## Fail closed
#
# `HEARTBEAT_URL` unset does not mean "run without alerting". It means refuse,
# loudly, on the screen of the machine that is meant to be doing this. An
# unconfigured alarm is the fail-open shape `docs/07-FIELD-NOTES.md` names, and
# a backup job is the last place it belongs.
#
# ## Configuration
#
#   ~/.config/coditu/nightly.env      mode 0600, never in the repository
#
#     BACKUP_DB_URL=postgresql://coditu_backup.<ref>:<pw>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
#     SOURCE_STORAGE_REST_URL=https://<ref>.supabase.co
#     SOURCE_STORAGE_SERVICE_KEY=<service role key>
#     HEARTBEAT_URL=https://hc-ping.com/<uuid>
#     BACKUP_AGE_KEY=/Users/<you>/.config/coditu/backup.agekey
#     RECOVERY_REPO=MooTamer/coditu-recovery
#
# Install the schedule with `scripts/install-nightly-agent.sh`.
#
# Usage:
#   scripts/local-nightly.sh               the whole thing
#   scripts/local-nightly.sh --dry-run     check the configuration and the tools, write nothing
#   scripts/local-nightly.sh --drill-only  restore the newest LOCAL archive and stop
#
# `--drill-only` publishes nothing, prunes nothing and **sends no heartbeat**.
# A partial run must not be able to make the night look complete — the ping is
# the statement "a set was written and it restores", and this mode only ever
# proves the second half.

umask 077

nightly_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
nightly_config=${CODITU_NIGHTLY_ENV:-$HOME/.config/coditu/nightly.env}
nightly_log_dir=${CODITU_NIGHTLY_LOG_DIR:-$HOME/.local/state/coditu}
nightly_dry_run=0
nightly_drill_only=0
case "${1:-}" in
  --dry-run) nightly_dry_run=1 ;;
  --drill-only) nightly_drill_only=1 ;;
  "") ;;
  *) printf 'local-nightly: unknown option %s\n' "$1" >&2; exit 2 ;;
esac

nightly_step=starting
nightly_started=$(date -u +%Y-%m-%dT%H%M%SZ)

say() { printf '[%s] local-nightly: %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }

# Loud on the machine that is supposed to be doing this. `osascript` is part of
# macOS, so this adds no dependency; it is skipped rather than fatal elsewhere,
# because a notifier that can itself fail the job would be a new failure mode
# in the middle of a backup.
notify() {
  command -v osascript >/dev/null 2>&1 || return 0
  osascript -e "display notification \"$1\" with title \"Coditu backup\" sound name \"Basso\"" \
    >/dev/null 2>&1 || true
}

fail() {
  printf 'local-nightly: %s\n' "$*" >&2
  notify "$nightly_step failed — $1"
  ping_heartbeat "/fail" "$nightly_step: $*"
  exit 1
}

# healthchecks.io. `--retry` because a backup that succeeded and could not say
# so is an unnecessary alarm at 02:00, and `--max-time` because a hanging ping
# must not hold the job open.
ping_heartbeat() {
  [ "$nightly_drill_only" = 0 ] || return 0
  [ -n "${HEARTBEAT_URL:-}" ] || return 0
  curl --silent --show-error --max-time 20 --retry 3 --retry-delay 5 \
    --fail --output /dev/null --data-raw "${2:-}" "${HEARTBEAT_URL}${1}" || \
    say "warning: could not reach the heartbeat (${1:-/})"
}

# --------------------------------------------------------------------------
# 0. Configuration and tools, before anything is written.
# --------------------------------------------------------------------------
nightly_step="configuration"

[ -f "$nightly_config" ] || {
  printf 'local-nightly: %s does not exist. See the header of this script.\n' "$nightly_config" >&2
  notify "no configuration at $nightly_config"
  exit 1
}

# Mode 0600. The file holds a database password and a service-role key.
nightly_mode=$(stat -f '%OLp' "$nightly_config" 2>/dev/null || stat -c '%a' "$nightly_config")
[ "$nightly_mode" = "600" ] || {
  printf 'local-nightly: %s is mode %s; it must be 600 (chmod 600 it)\n' "$nightly_config" "$nightly_mode" >&2
  notify "configuration is mode $nightly_mode, must be 600"
  exit 1
}

set -a
# shellcheck disable=SC1090
. "$nightly_config"
set +a

RECOVERY_REPO=${RECOVERY_REPO:-MooTamer/coditu-recovery}
BACKUP_AGE_KEY=${BACKUP_AGE_KEY:-$HOME/.config/coditu/backup.agekey}

# Every one of these is required, and the list is checked in full so a misconfigured
# machine reports everything that is wrong rather than one thing per night.
nightly_missing=""
nightly_required="BACKUP_DB_URL SOURCE_STORAGE_REST_URL SOURCE_STORAGE_SERVICE_KEY HEARTBEAT_URL"
# The drill neither publishes nor reports, so it needs neither the source nor
# the alarm — only the key and an archive.
[ "$nightly_drill_only" = 0 ] || nightly_required=""
for nightly_name in $nightly_required; do
  [ -n "${!nightly_name:-}" ] || nightly_missing="$nightly_missing $nightly_name"
done
[ -z "$nightly_missing" ] || {
  printf 'local-nightly: missing in %s:%s\n' "$nightly_config" "$nightly_missing" >&2
  printf 'local-nightly: HEARTBEAT_URL is the one that matters most. Without it this job is\n' >&2
  printf '  the only thing that knows whether the backup ran, and it runs at 02:00.\n' >&2
  notify "not configured:$nightly_missing"
  exit 1
}

[ -f "$BACKUP_AGE_KEY" ] || fail "the age private key is not at $BACKUP_AGE_KEY; the restore drill cannot run without it"

for nightly_command in age curl docker gh jq psql supabase tar; do
  command -v "$nightly_command" >/dev/null 2>&1 || fail "missing required command: $nightly_command"
done

docker info >/dev/null 2>&1 || fail "Docker is not running; both the dump and the restore need it"

mkdir -p "$nightly_log_dir"
BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-$HOME/Library/Application Support/coditu-backups}
mkdir -p "$BACKUP_LOCAL_DIR"
export BACKUP_LOCAL_DIR RECOVERY_REPO

if [ "$nightly_dry_run" = 1 ]; then
  say "configuration ok · repo=$RECOVERY_REPO · archives=$BACKUP_LOCAL_DIR · key=$BACKUP_AGE_KEY"
  say "dry run: nothing was written and no heartbeat was sent"
  exit 0
fi

nightly_stack=""
cleanup() {
  [ -z "$nightly_stack" ] || {
    say "tearing the throwaway stack down"
    ( cd "$nightly_stack" && supabase stop --no-backup >/dev/null 2>&1 ) || true
    rm -rf "$nightly_stack"
  }
}
trap cleanup EXIT INT TERM

# --------------------------------------------------------------------------
# 1. Open the window.
# --------------------------------------------------------------------------
ping_heartbeat "/start" "local-nightly $nightly_started on $(hostname -s)"

# --------------------------------------------------------------------------
# 2. Build and publish the encrypted set.
# --------------------------------------------------------------------------
nightly_step="backup"
if [ "$nightly_drill_only" = 1 ]; then
  say "drill only: skipping the backup, the freshness check, the prune and the heartbeat"
else
say "building the recovery set"
# `BACKUP_UPLOAD=0`: the set is written to this Mac and nowhere else by this
# step. **The Mac is the primary copy now**, not a staging area on the way to
# GitHub — see ADR 2026-08-31 "custody". The off-site copies happen in step 3a
# and none of them is allowed to be load-bearing.
BACKUP_UPLOAD=0 \
BACKUP_DB_URL_CONTAINER="$BACKUP_DB_URL" \
SOURCE_STORAGE_MODE=rest \
  "$nightly_root/scripts/backup.sh" || fail "backup.sh did not complete"

# --------------------------------------------------------------------------
# 3. Read the store back. Do not trust the writer's exit status.
#
# The same assertion the Actions job made, and for the same reason:
# `BACKUP_UPLOAD` defaults to 0, so one dropped line turns this into a script
# that writes the whole workspace to a local directory, prints every count and
# exits 0. A one-hour window means it can only pass on the set this run just
# published.
# --------------------------------------------------------------------------
nightly_step="freshness"
say "checking the set this run wrote is really on this disk"
BACKUP_STORE=local BACKUP_MAX_AGE_SECONDS=3600 \
  "$nightly_root/scripts/check-backup-freshness.sh" || \
  fail "the set this run wrote is not readable back from $BACKUP_LOCAL_DIR"

# --------------------------------------------------------------------------
# 3a. The off-site copies.
#
# ## Why a missing destination does not fail this job, and a broken one does
#
# The rest of this repository fails CLOSED, and that is right for an alarm: an
# unconfigured dead-man's switch is worse than none. It is wrong here, and the
# difference is worth stating rather than looking like an exception somebody
# forgot to fix.
#
# The primary copy is on this Mac and it has already been written and read back
# above. An off-site copy is by design **replaceable** — that is rule 2 of
# `docs/14-DEPENDENCY-LEDGER.md`. Failing the night because a replaceable copy
# is unconfigured would take down the copy that is not replaceable, to protest
# about one that is. So:
#
#   unconfigured   -> loud in the summary, a macOS notification, run continues
#   configured, and absent-but-allowed (an unplugged disk) -> reported with
#                     how long since it was last seen; run continues
#   configured and BROKEN -> fail
#
# The third is the one that must be red. A destination that was working and
# silently stopped is exactly the failure this project keeps finding, and it is
# the only one of the three that is a surprise.
# --------------------------------------------------------------------------
nightly_step="off-site"
nightly_offsite_ok=0
nightly_offsite_lines=""
if [ -z "${OFFSITE_DESTINATIONS:-}" ]; then
  say "WARNING: no off-site destination is configured. The only copy of tonight's"
  say "         set is on this Mac. See docs/14-DEPENDENCY-LEDGER.md."
  notify "no off-site destination configured; tonight's set exists only on this Mac"
  nightly_offsite_lines="offsite=none-configured"
else
  for nightly_dest in $OFFSITE_DESTINATIONS; do
    nightly_dir_name=OFFSITE_${nightly_dest}_DIR
    nightly_marker_name=OFFSITE_${nightly_dest}_MARKER
    nightly_required_name=OFFSITE_${nightly_dest}_REQUIRED
    [ -n "${!nightly_dir_name:-}" ] || fail "$OFFSITE_DESTINATIONS names '$nightly_dest' and $nightly_dir_name is not set"

    say "off-site: $nightly_dest"
    nightly_offsite_out=$(
      OFFSITE_NAME="$nightly_dest" \
      OFFSITE_DIR="${!nightly_dir_name}" \
      OFFSITE_MARKER="${!nightly_marker_name:-}" \
      OFFSITE_REQUIRED="${!nightly_required_name:-1}" \
      LOCAL_BACKUP_DIR="$BACKUP_LOCAL_DIR" \
      "$nightly_root/scripts/offsite-copy.sh"
    ) || fail "the '$nightly_dest' off-site copy is configured and did not work"
    printf '%s\n' "$nightly_offsite_out" | sed 's/^/  /'
    nightly_offsite_lines=$nightly_offsite_lines$(printf '%s\n' "$nightly_offsite_out" | grep -E '^offsite_' | tr '\n' ' ')
    # An `if`, not `grep … && count++`. Under `set -e` a failing grep as the
    # last command of a loop body takes the whole script down, and the case
    # where it fails is the absent external disk — the one thing this design
    # explicitly refuses to treat as a backup failure.
    if printf '%s\n' "$nightly_offsite_out" | grep -q "^offsite_${nightly_dest}=present$"; then
      nightly_offsite_ok=$((nightly_offsite_ok + 1))
    else
      say "  $nightly_dest was not there tonight; that is allowed and it is not a copy"
    fi
  done
  say "off-site destinations reachable tonight: $nightly_offsite_ok"
fi
fi

# --------------------------------------------------------------------------
# 4. THE DRILL. Decrypt it, restore it, count every table.
#
# This is the half that could never run in the cloud, and it is the half that
# makes the difference between a backup and a file. It restores the set this
# run just wrote — not last month's — into a throwaway stack on ports that
# cannot collide with the shared development one.
# --------------------------------------------------------------------------
nightly_step="restore drill"

nightly_archive=$(ls -1 "$BACKUP_LOCAL_DIR"/*.tar.gz.age 2>/dev/null | sort | tail -1 || true)
[ -n "$nightly_archive" ] || fail "no local archive to restore; backup.sh wrote nothing to $BACKUP_LOCAL_DIR"
say "restoring $(basename "$nightly_archive")"

# A copy of `supabase/` OUTSIDE the checkout, on ports disjoint from both the
# shared stack (544xx) and the isolated e2e one (545xx). Nested worktrees cannot
# run their own stack — see docs/07-FIELD-NOTES.md — so this lives in TMPDIR.
nightly_stack=$(mktemp -d "${TMPDIR:-/tmp}/coditu-restore-drill.XXXXXX")
mkdir -p "$nightly_stack/supabase/migrations"
cp "$nightly_root/supabase/config.toml" "$nightly_stack/supabase/config.toml"
# `realtime` stays ENABLED. Disabling it removes `supabase_realtime_admin`, and
# `roles.sql` grants to that role and stops on its first line.
sed -i '' \
  -e 's/^project_id = .*/project_id = "coditurestore"/' \
  -e 's/^port = 54421$/port = 54621/' \
  -e 's/^port = 54422$/port = 54622/' \
  -e 's/^shadow_port = 54320$/shadow_port = 54620/' \
  -e 's/^port = 54429$/port = 54629/' \
  -e 's/^port = 54423$/port = 54623/' \
  -e 's/^port = 54424$/port = 54624/' \
  -e 's/^port = 54427$/port = 54627/' \
  "$nightly_stack/supabase/config.toml"
# No migrations, no seed. A target that already carries this application's
# schema is not a restore target: `roles.sql` stops on `role "coditu_backup"
# already exists` and nothing after it runs. Measured 2026-08-31 — the first
# version of this script copied the whole `supabase/` directory and got exactly
# that, one line into a drill that looked like it was about to work.
awk '
  /^\[/ { toml_section = $0 }
  toml_section == "[db.seed]" && /^enabled[[:space:]]*=/ { print "enabled = false"; next }
  { print }
' "$nightly_stack/supabase/config.toml" > "$nightly_stack/config.patched" &&
  mv "$nightly_stack/config.patched" "$nightly_stack/supabase/config.toml"

( cd "$nightly_stack" && supabase start >/dev/null ) || fail "the throwaway stack did not start"

# `supabase_admin`, not `postgres`: on current local images `postgres` is no
# longer a superuser and `verify-backup-restore.sh` refuses it by design.
# The CLI's pinned service images trail what hosted runs, so a local target is
# routinely older than the set it is asked to restore — four `storage` columns
# on 2026-08-31. The verifier refuses that by default and is left refusing it;
# this harness owns a disposable target, so it opts in to having those columns
# added as `text` and the widening printed. See the block in the verifier.
# And then the half no dump carries: the two triggers on `auth.users`.
# `on_auth_user_created` and `enforce_email_allowlist` — without them a restored
# database has no profile creation and **no sign-up gate**, and the verifier
# refuses to call it restored.
#
# NOT `supabase db push`, which is what runbook step 5a said and what this
# harness tried first. Measured 2026-08-31: the archive carries no
# `supabase_migrations` schema, so a restored database has a full schema and an
# empty history, and the CLI replays all forty migrations from the start and
# dies on `create type app_role` one statement in. Step 5a stopped one statement
# into a procedure nobody had run. `reapply-managed-triggers.sh` does the part
# 5a actually needed to do, derived from the same migrations.
RESTORE_WIDEN_MANAGED_COLUMNS=1 \
RESTORE_MIGRATE_CMD="'$nightly_root/scripts/reapply-managed-triggers.sh' 'postgresql://supabase_admin:postgres@127.0.0.1:54622/postgres'" \
RESTORE_DB_URL="postgresql://supabase_admin:postgres@127.0.0.1:54622/postgres" \
  "$nightly_root/scripts/verify-backup-restore.sh" "$nightly_archive" "$BACKUP_AGE_KEY" \
  | tee "$nightly_log_dir/last-restore.txt" \
  || fail "the restore drill did not verify"

grep -q '^restore_verified=true$' "$nightly_log_dir/last-restore.txt" || \
  fail "the drill exited 0 without printing restore_verified=true"

nightly_tables=$(grep -E '^database_tables=' "$nightly_log_dir/last-restore.txt" | cut -d= -f2)
nightly_rows=$(grep -E '^database_rows=' "$nightly_log_dir/last-restore.txt" | cut -d= -f2)
nightly_objects=$(grep -E '^storage_objects=' "$nightly_log_dir/last-restore.txt" | cut -d= -f2 || echo 0)
nightly_widened=$(grep -E '^restore_target_widened=' "$nightly_log_dir/last-restore.txt" | cut -d= -f2- || true)
say "restored: ${nightly_tables} tables · ${nightly_rows} rows · ${nightly_objects} objects"
[ -z "$nightly_widened" ] || say "target widened to accept: $nightly_widened"

cleanup
nightly_stack=""

# --------------------------------------------------------------------------
# 5. Prune, and only then say the night went well.
# --------------------------------------------------------------------------
if [ "$nightly_drill_only" = 1 ]; then
  say "drill verified. Nothing was published and no heartbeat was sent."
  exit 0
fi

nightly_step="prune"
# The primary. Each off-site destination prunes its own copy, to its own policy,
# inside `offsite-copy.sh` — a destination must never be pruned by a decision
# taken somewhere else, which is the same reason `sync-backup-local.sh` never
# deletes.
BACKUP_STORE=local "$nightly_root/scripts/prune-backups.sh" ||
  fail "pruning the local store failed; the set is written and verified, the store is over-full"

nightly_step="done"
ping_heartbeat "" "restored ${nightly_tables} tables / ${nightly_rows} rows / ${nightly_objects} objects from $(basename "$nightly_archive") · ${nightly_offsite_lines:-offsite=none-configured}"
say "verified and reported"

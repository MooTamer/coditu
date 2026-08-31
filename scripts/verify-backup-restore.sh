#!/usr/bin/env bash
set -euo pipefail

# Decrypt a backup with Mohamed's local key, restore it into an already-running
# throwaway Supabase database, and compare every public/auth/storage table count
# with the source snapshot. Optional Storage S3 variables also round-trip every
# object through the throwaway Storage service.

umask 077

fail() {
  printf 'verify-backup-restore: %s\n' "$*" >&2
  exit 1
}

need_value() {
  restore_name=$1
  restore_present=${!restore_name:-}
  [ -n "$restore_present" ] || fail "$restore_name is required"
}

[ "$#" -eq 2 ] || fail "usage: verify-backup-restore.sh <archive.tar.gz.age> <private.agekey>"
restore_archive=$1
restore_private_key=$2
[ -f "$restore_archive" ] || fail "archive does not exist"
[ -f "$restore_private_key" ] || fail "private key does not exist"
need_value RESTORE_DB_URL

restore_temp_root=$(mktemp -d "${TMPDIR:-/tmp}/coditu-restore.XXXXXX")
restore_payload=$restore_temp_root/payload
restore_tar=$restore_temp_root/backup.tar.gz
mkdir -p "$restore_payload"
trap 'rm -rf "$restore_temp_root"' EXIT INT TERM

age --decrypt --identity "$restore_private_key" -o "$restore_tar" "$restore_archive"
tar -xzf "$restore_tar" -C "$restore_payload"
rm -f "$restore_tar"

for restore_required_file in roles.sql schema.sql data.sql row-counts.tsv manifest.json checksums.sha256; do
  [ -f "$restore_payload/$restore_required_file" ] || \
    fail "archive is missing $restore_required_file"
done

(
  cd "$restore_payload"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c checksums.sha256
  else
    shasum -a 256 -c checksums.sha256
  fi
) >/dev/null

restore_superuser=$(psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 \
  -c "select rolsuper from pg_roles where rolname = current_user")
[ "$restore_superuser" = t ] || fail "RESTORE_DB_URL must use the throwaway platform restore owner"

# Managed tables are not in schema.sql — `auth.users`, `storage.buckets` and the
# rest are created by the platform's own services, and the restore target brings
# whatever shape its service version has. If that version is older than the
# source's, the data restore dies partway through on a column that does not
# exist, having already written everything before it.
#
# The 2026-08-29 drill hit this: hosted `storage.buckets` carries
# `versioning_status` and a `storage-api:v1.62.5` image does not, so the restore
# failed 1,729 lines into data.sql with `column "versioning_status" ... does not
# exist` and no statement about what to do. Say it before writing a row.
restore_preflight=$restore_temp_root/managed-columns.txt
# `COPY "auth"."users" ("id", "email", ...) FROM stdin;` — the identifiers are
# quoted, and the first version of this preflight assumed they were not. It
# matched nothing, and under `pipefail` a grep that matches nothing exits 1, so
# the whole verifier died with no message at all. Anchor on the quotes.
grep -oE '^COPY "[a-z_]+"\."[a-z_]+" \([^)]*\)' "$restore_payload/data.sql" |
  sed -E 's/^COPY "([a-z_]+)"\."([a-z_]+)" \((.*)\)$/\1|\2|\3/' |
  tr -d '"' |
  awk -F '|' '{gsub(/ /, "", $3); printf "%s\t%s\t%s\n", $1, $2, $3}' > "$restore_preflight"
[ -s "$restore_preflight" ] || fail "data.sql carries no COPY statements; this is not a recovery set"

restore_missing=$(
  while IFS=$'\t' read -r restore_ns restore_rel restore_cols; do
    [ -n "$restore_rel" ] || continue
    psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 <<SQL
select '$restore_ns.$restore_rel: ' || string_agg(c, ', ')
from unnest(string_to_array('$restore_cols', ',')) as c
where to_regclass('$restore_ns.$restore_rel') is not null
  and not exists (
    select 1 from information_schema.columns
    where table_schema = '$restore_ns' and table_name = '$restore_rel' and column_name = c
  )
having count(*) > 0;
SQL
  done < "$restore_preflight"
)
# Bringing a throwaway target forward, and why it is opt-in.
#
# The refusal above is correct and stays the default: a target older than the
# source loses rows silently partway through `data.sql`, and the 2026-08-29
# drill found it the expensive way. But it also makes an AUTOMATED local drill
# impossible, because the Supabase CLI's pinned images are routinely behind what
# a hosted project runs — measured 2026-08-31, `storage-api` on this Mac has
# none of `storage.buckets.versioning_status`, `storage.objects.archived_at`,
# `is_delete_marker` or `is_versioned`, and hosted has all four. Mohamed added
# them by hand that day. A drill that needs four hand-written statements is a
# drill somebody has to remember, which is the thing being replaced.
#
# `RESTORE_WIDEN_MANAGED_COLUMNS=1` adds the missing MANAGED columns to the
# throwaway target as nullable `text` and prints exactly which ones. `COPY`
# parses per column type and `text` accepts every representation in the dump, so
# every row still arrives and every count still matches — what is not proved is
# that the column's TYPE round-trips, and the output says so rather than
# implying otherwise.
#
# Off by default. An absent variable makes this script HARDER to satisfy, not
# easier; turning it on is a deliberate act by a harness that owns a disposable
# target, never something a recovery does. `docs/12-RECOVERY-RUNBOOK.md` step 4
# is a real restore and must not set it.
if [ -n "$restore_missing" ] && [ "${RESTORE_WIDEN_MANAGED_COLUMNS:-0}" = "1" ]; then
  restore_widened=""
  while IFS=$'\t' read -r restore_ns restore_rel restore_cols; do
    [ -n "$restore_rel" ] || continue
    for restore_col in ${restore_cols//,/ }; do
      restore_has=$(psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -c \
        "select 1 from information_schema.columns where table_schema='$restore_ns' and table_name='$restore_rel' and column_name='$restore_col'")
      [ -z "$restore_has" ] || continue
      [ -n "$(psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -c "select 1 where to_regclass('$restore_ns.$restore_rel') is not null")" ] || continue
      psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -c \
        "alter table $restore_ns.$restore_rel add column if not exists \"$restore_col\" text"
      restore_widened="$restore_widened${restore_widened:+,}$restore_ns.$restore_rel.$restore_col"
    done
  done < "$restore_preflight"
  [ -z "$restore_widened" ] || printf 'restore_target_widened=%s\n' "$restore_widened"
  restore_missing=""
fi

[ -z "$restore_missing" ] || fail "the restore target is missing columns this backup carries, which means its Supabase service versions are older than the source's. Restore into a project at least as new as the one backed up. Missing: $restore_missing"


psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/roles.sql"
psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/schema.sql"

psql -X -q "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$restore_payload/data.sql"

restore_counts=$restore_temp_root/restored-row-counts.tsv
restore_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 \
  -f "$restore_script_dir/sql/row-counts.sql" > "$restore_counts"

# Compare the tables the BACKUP describes, one by one. Requiring the two table
# lists to be identical is the wrong assertion and it failed the 2026-08-29
# drill for the right-looking wrong reason: the local Storage image has
# `storage.iceberg_namespaces` and `storage.iceberg_tables`, the hosted project
# does not, and both were empty. A restore target will always carry some
# platform scaffolding the source did not.
#
# So: every table in the backup must exist in the target with exactly its
# count, and any table the target has that the backup does not describe must be
# EMPTY. That still catches a missing table, a short table, and a target that
# was not clean — which is everything the identical-list check caught, minus the
# false alarm.
restore_mismatch=$(
  awk -F '\t' 'NR == FNR { restored[$1] = $2; seen[$1] = 1; next }
    { if (!($1 in restored)) print "missing from the target: " $1;
      else if (restored[$1] != $2) print $1 " has " restored[$1] " rows, the backup recorded " $2;
      described[$1] = 1 }
    END { for (t in seen) if (!(t in described) && restored[t] + 0 > 0)
            print "the target already held " restored[t] " rows in " t ", which this backup does not describe" }' \
    "$restore_counts" "$restore_payload/row-counts.tsv"
)
[ -z "$restore_mismatch" ] || \
  fail "throwaway row counts do not match the source snapshot: $restore_mismatch"

restore_extra=$(awk -F '\t' 'NR == FNR { described[$1] = 1; next }
  { if (!($1 in described)) print $1 }' "$restore_payload/row-counts.tsv" "$restore_counts" | paste -sd, -)

restore_expected_objects=$(jq -er '.storageObjects' "$restore_payload/manifest.json")
restore_archive_objects=$(find "$restore_payload/storage" -type f | wc -l | tr -d ' ')
[ "$restore_archive_objects" = "$restore_expected_objects" ] || \
  fail "archive contains $restore_archive_objects Storage files, expected $restore_expected_objects"

restore_storage_values=0
for restore_storage_name in RESTORE_STORAGE_S3_URL RESTORE_STORAGE_ACCESS_KEY_ID RESTORE_STORAGE_SECRET_ACCESS_KEY RESTORE_STORAGE_REGION; do
  restore_storage_value=${!restore_storage_name:-}
  [ -n "$restore_storage_value" ] && restore_storage_values=$((restore_storage_values + 1))
done
if [ "$restore_storage_values" -ne 0 ] && [ "$restore_storage_values" -ne 4 ]; then
  fail "set all four RESTORE_STORAGE_* variables or none"
fi

if [ "$restore_storage_values" -eq 4 ]; then
  restore_download=$restore_temp_root/storage-download
  mkdir -p "$restore_download"
  for restore_bucket_path in "$restore_payload"/storage/*; do
    [ -d "$restore_bucket_path" ] || continue
    restore_bucket=$(basename "$restore_bucket_path")
    AWS_ACCESS_KEY_ID=$RESTORE_STORAGE_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$RESTORE_STORAGE_SECRET_ACCESS_KEY \
    AWS_DEFAULT_REGION=$RESTORE_STORAGE_REGION \
      aws --endpoint-url "$RESTORE_STORAGE_S3_URL" s3 cp \
        "$restore_bucket_path" "s3://$restore_bucket" \
        --recursive --no-progress --only-show-errors
    mkdir -p "$restore_download/$restore_bucket"
    AWS_ACCESS_KEY_ID=$RESTORE_STORAGE_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$RESTORE_STORAGE_SECRET_ACCESS_KEY \
    AWS_DEFAULT_REGION=$RESTORE_STORAGE_REGION \
      aws --endpoint-url "$RESTORE_STORAGE_S3_URL" s3 sync \
        "s3://$restore_bucket" "$restore_download/$restore_bucket" --no-progress --only-show-errors
    diff -qr "$restore_bucket_path" "$restore_download/$restore_bucket" >/dev/null || \
      fail "Storage bytes differ after restoring bucket $restore_bucket"
  done
fi

restore_repo_root=$(CDPATH= cd -- "$restore_script_dir/.." && pwd)

# Step 5a of the runbook, as a seam rather than as a sentence somebody reads.
#
# A restore is not a recovery until the migrations have been re-applied over it
# — the two `auth.users` triggers below are the proof, and the assertion after
# this block is what refuses to call an un-migrated database restored. That
# assertion has always been correct and has always left the fixing to a person,
# which is fine for a 3am recovery and useless for an unattended drill: the
# drill would stop, every night, at the step the runbook says to take next.
#
# `RESTORE_MIGRATE_CMD` is that step. Unset — the default, and what a real
# recovery uses — nothing runs here and the refusal below stands. Set, it runs
# AFTER the row counts have been compared against the archive and BEFORE the
# trigger check, so the counts are still measured against the pure restore and
# only the triggers see the migrated database.
#
# It is deliberately a command rather than a path to migrations: this file also
# lives in `MooTamer/coditu-recovery`, which carries no migrations on purpose —
# a recovery whose first step is "check out the repository you are recovering"
# is not a recovery path.
if [ -n "${RESTORE_MIGRATE_CMD:-}" ]; then
  printf 'restore_migrations_reapplied=running\n'
  ( eval "$RESTORE_MIGRATE_CMD" ) >&2 || \
    fail "RESTORE_MIGRATE_CMD failed; the data is restored and the database is not yet a recovery"
  printf 'restore_migrations_reapplied=true\n'
fi

# ── The half a `pg_dump` of this project CANNOT carry ────────────────────────
#
# `supabase db dump` writes the `public` schema. Triggers this repository
# attaches to MANAGED tables are not in it — measured on the 2026-08-31 drill:
# `schema.sql` holds 48 `CREATE OR REPLACE TRIGGER` statements and every single
# one targets `public.*`. Zero target `auth.*` or `storage.*`.
#
# Two of ours live on `auth.users`, both from `20260820120100_identity.sql`, and
# a restore silently arrives without them:
#
#   `on_auth_user_created`     -> a new sign-up gets an auth row and NO profile.
#   `enforce_email_allowlist`  -> the no-public-sign-up gate is OFF. Anybody who
#                                 reaches the endpoint gets an account.
#
# The archive is not at fault and the row counts above are all true. The
# PROCEDURE was incomplete, and the drill was green about a database that had
# lost its sign-up gate — a restore is not a recovery until the migrations have
# been re-applied over it.
#
# The expected list is DERIVED from the migrations rather than written here. A
# hand-kept list would be silent about the trigger somebody adds next, which is
# the defect this repository has now found in a guard, a test and three CI
# controls.
# Extracted with a slurping regex, not `grep`. These statements span lines —
# `create trigger x` and `on auth.users` are never on the same one — so the
# line-based version of this found NOTHING and reported "none missing", which
# is the third time in two days a scan has been green because it read nothing.
restore_trigger_scan() {
  perl -0777 -ne 'while (/create\s+trigger\s+(\w+)\s+(?:before|after|instead\s+of)\b[^;]*?\bon\s+('"$1"')\.(\w+)/gis) { print "$1 $2.$3\n" }' \
    "$restore_repo_root"/supabase/migrations/*.sql | sort -u
}

restore_managed_triggers=$(restore_trigger_scan 'auth|storage|realtime')

# The floor. If the scan cannot see the public triggers either, then it read
# nothing and an empty managed list means nothing. 48 in the migrations today,
# which is exactly the count the dump carries.
restore_public_seen=$(restore_trigger_scan 'public' | grep -c . | tr -d ' ')
[ "$restore_public_seen" -ge 40 ] || fail \
  "the trigger scan found only $restore_public_seen public triggers in the migrations; it is not reading them, so it cannot be trusted about the managed ones"

restore_missing_triggers=""
while read -r restore_trigger restore_table; do
  [ -n "$restore_trigger" ] || continue
  restore_present=$(psql -X -qAt "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_trigger
      where tgname = '$restore_trigger'
        and tgrelid = to_regclass('$restore_table')
        and not tgisinternal")
  [ "$restore_present" = 1 ] || \
    restore_missing_triggers="$restore_missing_triggers $restore_trigger on $restore_table;"
done <<TRIGGERS
$restore_managed_triggers
TRIGGERS

[ -z "$restore_missing_triggers" ] || fail \
  "the data restored but the database is NOT usable: no dump of this project carries triggers on managed schemas, and these are absent:${restore_missing_triggers} Re-apply the migrations over the restored database (supabase db push) and run this again. See docs/12-RECOVERY-RUNBOOK.md."

printf 'restore_verified=true\n'
printf 'database_tables=%s\n' "$(grep -c . "$restore_payload/row-counts.tsv" | tr -d ' ')"
printf 'target_only_empty_tables=%s\n' "${restore_extra:-none}"
printf 'database_rows=%s\n' "$(awk -F '\t' '{sum += $2} END {print sum + 0}' "$restore_payload/row-counts.tsv")"
printf 'storage_objects=%s\n' "$restore_archive_objects"

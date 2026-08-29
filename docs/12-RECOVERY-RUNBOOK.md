# 12 — Infrastructure recovery runbook

This runbook describes the recovery path implemented on 2026-08-28. It does not upgrade a
provider statement into a fact. The current boundary is in `docs/09-BACKUP-PROPOSAL.md` §7.

## 0. What exists right now — read this before the rest

**One encrypted recovery set of the hosted project exists, on Mohamed's Mac only.**
`2026-08-29T165142Z.tar.gz.age` and its sidecar, under
`/Users/motamer/Library/Application Support/Coditu/Backups/`. 126 tables, 1,391 rows, 135 Storage
objects, 19,450,696 bytes. It decrypts, its 140 payload files pass their checksums, and its row
counts match the hosted database. **Nothing is off-site and nothing is scheduled.** Everything in
§1 below still describes an activation that has not happened, except the two steps this set
required, which are now true:

- `coditu_backup` exists on the hosted project, with LOGIN, BYPASSRLS and a password. The
  password lives in `/Users/motamer/.config/coditu/backup-db.env` (mode 0600) and nowhere else.
- The Storage copy does not need S3 keys any more. `scripts/backup.sh` has a `rest` mode that
  lists objects from `storage.objects` and downloads them with the service-role key. See the ADR
  in `docs/05-DECISIONS.md`, 2026-08-29, including what it costs in privilege.

**Connect through the session pooler, not the direct host.** Every connection string written
below and in §1 names `db.hayfsvsepgfescojesbd.supabase.co:5432`. That host has **no A record**,
and a machine without an IPv6 route cannot resolve it at all. Use:

```
postgresql://<role>.hayfsvsepgfescojesbd@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Port **5432** on the pooler is session mode. Port 6543 — which the Management API advertises as
the connection string — is transaction mode and will not carry migration DDL.

**To take another set today**, from the repository root:

```bash
. /Users/motamer/.config/coditu/backup-db.env
set -a; . ../Strukture-Digital/.env.production.local; set +a
BACKUP_DB_URL="postgresql://coditu_backup.hayfsvsepgfescojesbd:${CODITU_BACKUP_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require" \
BACKUP_DB_URL_CONTAINER="$BACKUP_DB_URL" \
SOURCE_STORAGE_MODE=rest \
SOURCE_STORAGE_REST_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SOURCE_STORAGE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
BACKUP_LOCAL_DIR="/Users/motamer/Library/Application Support/Coditu/Backups" \
BACKUP_UPLOAD=0 ./scripts/backup.sh
```

It took **225 seconds** end to end on 2026-08-29 for this data size.

## 1. One-time activation

1. Apply `20260828120000_invited_is_not_accepted.sql`,
   `20260828140000_a_role_that_can_only_read.sql` and
   `20260828220000_backup_health_from_canary.sql` to the hosted database through the normal
   reviewed migration path. The hosted release preflight requires every local migration, not
   only the two directly used by recovery.
2. In Supabase SQL Editor, generate a unique 32+ character password and set it with
   `alter role coditu_backup with password '<generated value>';`. Do not put the password
   in a shell history, document, issue, workflow, screenshot, or log.
3. Create S3 access keys for the Supabase Storage project. They are separate from the
   database login because database backups do not contain Storage bytes.
4. Activate an R2 Standard bucket and create object read/write/delete keys scoped to that
   bucket. Stop if Cloudflare asks for a payment method: Mohamed explicitly refused a card.
5. Add the secret names listed in `09-BACKUP-PROPOSAL.md` §8 to `MooTamer/coditu`.
   Generate `BACKUP_CANARY_REPORT_SECRET` once, store the same value in GitHub's and
   Vercel's Production environments, and never print it.
6. Deploy the report endpoint and migrated Recovery Centre through the gated release in
   `13-DEPLOYMENT-RUNBOOK.md`. It must still render `not verified by this app`; code is not
   a backup record. Dispatch `Nightly recovery copy` once.
7. Verify the workflow output names one uploaded key, `nightly_retained=1`, and no secret.
   Independently `HEAD` the object and compare its byte size and `sha256` metadata to the
   adjacent JSON sidecar.
8. Dispatch `Recovery copy freshness`. It must print the same backup id, an age below
   93,600 seconds, a non-zero encrypted size, and the database/Storage counts read from the
   downloaded sidecar. It must also receive HTTP 204 from `/api/backup-health`; only then
   may the Recovery Centre show the measured values and 24-hour objective.
9. Create a free UptimeRobot heartbeat named `Coditu backup freshness`, set it to expect an
   hourly check-in with enough grace for normal GitHub queue delay, and send its email alert
   to Mohamed. Store its unique URL only as `BACKUP_CANARY_HEARTBEAT_URL`; never paste it in
   a log, issue or document. Run the canary again and wait for UptimeRobot to record the
   check-in before enabling notifications. This order avoids a false incident during setup.
10. Configure a local `coditu-r2` AWS profile outside Git and run:

   ```bash
   R2_ENDPOINT='<account endpoint>' R2_BUCKET='<bucket>' \
   LOCAL_BACKUP_DIR='/Users/motamer/Library/Application Support/Coditu/Backups' \
   ./scripts/sync-backup-local.sh
   ```

   Schedule that command daily on Mohamed's Mac only after the first pull succeeds.

## 2. What a nightly recovery set contains

- `roles.sql` — user-created roles and memberships, with passwords excluded;
- `schema.sql` — platform-aware schema dump;
- `data.sql` — data from `public`, `auth`, `storage` and the other non-excluded schemas;
- `storage/<bucket>/<object>` — the bytes absent from every database backup;
- `row-counts.tsv`, `manifest.json`, `checksums.sha256` — the evidence used by a restore.

The set is encrypted to `ops/backup-recipient.txt` before upload. GitHub can write it and
cannot read it. The only private key is
`/Users/motamer/.config/coditu/backup.agekey`, plus the offline copy Mohamed must make
before activation.

## 3. Full recovery after losing the project

1. Stop writes to the old application and record the newest R2 backup id. Do not let two
   recoveries write to the same target.
2. Create a fresh Supabase project in the same region and note its Postgres major version.
3. Download the encrypted archive and metadata to Mohamed's local backup directory.
4. Verify the archive's SHA-256 and byte size against the metadata sidecar before decrypting.
5. Use the platform restore owner, not the backup role, and run
   `scripts/verify-backup-restore.sh <archive> <private.agekey>` against the fresh project.
   The restore order is roles → schema → data. The command fails if any of the 130 current
   table counts differs.
6. Force-upload Storage with recursive copy. Do **not** use `aws s3 sync` after restoring
   `storage.objects`: the metadata rows make sync believe absent bytes already exist.
7. Re-run the object download and byte comparison, the SQL tests, and the hosted schema
   preflight. Only then point Vercel environment variables at the recovered project.
8. Smoke marketing, sign-in, Home, one project, one image, Recovery Centre and a write with
   rollback. Re-open writes only after all pass.

The local drill on 2026-08-28 took under one minute for 5,245 rows and 115 objects after the
throwaway stack was healthy. That is evidence for this data size on this laptop, not an RTO:
creating a hosted project, DNS/environment changes, decision time and provider queues were not
measured. RTO therefore remains unset until the first hosted drill.

## 4. Normal retention and local-copy checks

Every nightly upload goes under `coditu/nightly/<backup-id>/`. A run on day 01 also writes
the same encrypted set under `coditu/monthly/<backup-id>/`. `prune-backups.sh` sorts the
timestamp ids and keeps exactly 30 and 12. It validates every deletion prefix before asking
S3 to remove it.

The local pull does not use `--delete`: an accidental R2 deletion is not propagated onto the
Mac. Check local disk use monthly and remove only copies already represented by a newer
verified set and the 30 + 12 policy.

## 5. Freshness alert

`Recovery copy freshness` runs at minute 47 of every hour. It lists R2 itself, selects the
newest nightly encrypted archive, and fails if there is no archive, its key is malformed,
the adjacent metadata sidecar is absent or empty, its recorded SHA-256 is absent, or its
R2 `LastModified` age exceeds 93,600 seconds (26 hours). A timestamp more than five minutes
in the future also fails instead of disguising clock or metadata corruption.

Only a complete, fresh check pings `BACKUP_CANARY_HEARTBEAT_URL`. UptimeRobot therefore
alerts Mohamed both when the R2 copy becomes stale and when GitHub stops dispatching the
canary itself. The monitor is a separate control plane; GitHub's own workflow status is not
treated as the only alarm for GitHub scheduling.

## 6. Monthly integrity and quarterly restore drills

`Monthly recovery-copy integrity` runs at 03:23 UTC on day 02. It downloads the newest
day-01 ciphertext and sidecar, requires exactly those two R2 objects, and compares:

- the downloaded ciphertext SHA-256 with the sidecar and R2 object metadata;
- downloaded, sidecar, monthly R2 and matching nightly R2 byte sizes;
- the monthly and matching nightly ciphertext SHA-256 values;
- the sidecar identity, format and recorded database/Storage counts.

The job has R2 read credentials and **no age private key**. It proves that the encrypted
set written on day 01 remains readable and unchanged; it cannot prove that the plaintext
restores. Never report this monthly control as a restore.

On the first Saturday of January, April, July and October, Mohamed performs the full drill:

1. Pull the newest monthly ciphertext and sidecar to the local copy directory.
2. Run `scripts/check-backup-integrity.sh` against R2 and compare its backup id and SHA-256
   with the local files.
3. Start a new isolated local Supabase stack on ports that do not overlap `_coditu`; never
   reset or reuse the shared development stack.
4. Point `RESTORE_DB_URL` and the four optional `RESTORE_STORAGE_*` values at only that
   throwaway stack, then run `scripts/verify-backup-restore.sh <archive> <private.agekey>`.
5. Record elapsed time, every table/row/object count and the result in `docs/06-PROGRESS.md`.
6. Stop the throwaway stack with `supabase stop --no-backup` and confirm only the shared
   `_coditu` containers remain.

The first local proof completed the data restore in under one minute after its isolated
stack was healthy. Keep recording the quarterly measurements; it is not an RTO because
hosted project creation, DNS/environment changes and incident decision time remain untested.

## 7. Free-plan project pausing

Supabase's current policy says a Free Plan project with low user database activity over a
seven-day window may be paused. It sends an owner warning roughly one week before pausing and
says a few user database requests per day are typically sufficient to avoid it. A paused project
is application downtime even when the release and Vercel deployment are healthy.

The planned `/login` Keyword monitor is not accepted as a keepalive proof. A signed-out render
calls Supabase Auth, but it does not issue the explicit public-table query the provider describes;
whether Supabase counts that request is not a repository fact.

Before calling the free-plan production setup unattended, add a narrow database-backed health
route and make the five-minute external monitor use it:

1. expose one `security invoker`, anon-executable RPC that performs only a fixed `select 1`-style
   database check and returns no row or project data;
2. call it from a dynamic, `no-store` `/api/health/database` route that returns one fixed keyword
   on success and 503 otherwise;
3. point UptimeRobot's Keyword monitor at that route, keep the owner email alert enabled, and
   verify the Supabase dashboard records user database activity over seven days;
4. treat any Supabase pause-warning email as an incident even when this check is green, because
   the provider alone decides whether activity is sufficient.

This is a **proposal, not implemented code or active monitoring**. Do not use
`/api/backup-health` as a synthetic keepalive: that endpoint is evidence about a real R2 object,
and reporting fabricated freshness to keep a database awake would corrupt the Recovery Centre.
The only no-code alternative that removes the pause class entirely is moving the organization to
a paid plan, which is outside Mohamed's no-card decision.

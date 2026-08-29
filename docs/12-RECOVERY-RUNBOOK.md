# 12 — Infrastructure recovery runbook

This runbook describes the recovery path implemented on 2026-08-28. It does not upgrade a
provider statement into a fact. The current boundary is in `docs/09-BACKUP-PROPOSAL.md` §7.

## 0. What exists right now — read this before the rest

**The nightly runs, off-site, and has been restored end to end.** As of 2026-08-29:

| | |
|---|---|
| Off-site store | GitHub releases in the private repository `MooTamer/coditu-recovery` |
| Tags | `nightly-<id>`, `monthly-<id>`; assets `<id>.tar.gz.age` and `<id>.metadata.json` |
| Newest proven set | `2026-08-29T181341Z` — 63 tables, 1,391 rows, 3 buckets, 135 Storage objects |
| Local copy | `/Users/motamer/Library/Application Support/Coditu/Backups/` — 3 sets |
| Private key | `/Users/motamer/.config/coditu/backup.agekey`, plus the offline copy Mohamed must make |
| Backup role password | `/Users/motamer/.config/coditu/backup-db.env`, mode 0600, and nowhere else |

**Not yet true, and none of it should be described as if it were:** no alerting (no heartbeat
URL), the Recovery Centre still shows `not verified by this app` (no report target, and the
endpoint is not deployed), the Google Drive leg is written but un-authorised, and the schedule
has been dispatched by hand twice rather than observed firing on its own.

### Connect through the session pooler, not the direct host

`db.hayfsvsepgfescojesbd.supabase.co` has **no A record**, and a machine without an IPv6 route
cannot resolve it at all. Use:

```
postgresql://<role>.hayfsvsepgfescojesbd@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Port **5432** on the pooler is session mode. Port 6543 — which the Management API advertises as
*the* connection string — is transaction mode and will not carry migration DDL.

### To take a set by hand, right now

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

225 seconds on 2026-08-29 for this data size. Or, off-site and scheduled:
`gh workflow run "Nightly recovery copy" --repo MooTamer/coditu-recovery`.

## 1. What is left to activate, and who has to do it

Everything below needs a human at a browser. Nothing else is outstanding.

1. **Alerting — healthchecks.io, not UptimeRobot.** Create a free **healthchecks.io** check named
   `Coditu backup freshness`, period **three** hours — the canary's cadence, see the ADR of
   2026-08-29 — with enough grace for normal GitHub queue delay, emailing Mohamed. Store its ping
   URL (`https://hc-ping.com/<uuid>`) **only** as the repository secret `HEARTBEAT_URL` in
   `MooTamer/coditu-recovery`; never paste it in a log, issue or document — possessing the path is
   enough to forge a check-in. Run `Recovery copy freshness` once and wait for healthchecks.io to
   record the check-in before enabling notifications, so setup does not raise a false incident.
   Until this exists the canary skips its heartbeat with a visible notice and **nothing alerts
   anybody**.

   **Why not UptimeRobot.** Its cron/heartbeat monitor type is a paid feature — its own type
   picker says *"Available only in Solo, Team and Scale"* — and the free plan covers HTTP,
   Keyword, Ping and Port only. An earlier pass in this repository read "50 monitors free" off the
   marketing page and did not check that it covered every type. healthchecks.io monitors 20 cron
   jobs free, no card, and is open-source (BSD) so it can be self-hosted later. UptimeRobot is
   still the right free tool for the **HTTPS** checks — the public site and the keepalive in §7 —
   which are exactly the types its free plan does cover.
2. **The Recovery Centre's numbers.** Generate `BACKUP_CANARY_REPORT_SECRET` once; store the same
   value as a repository secret in `MooTamer/coditu-recovery` and in Vercel's Production
   environment. Set the repository **variable** `PRODUCTION_BASE_URL` to the deployed origin.
   Both only work once the report endpoint is deployed — `docs/13-DEPLOYMENT-RUNBOOK.md`.
3. **The off-provider leg.** `brew install rclone && rclone config` — a new remote named
   `coditu-drive`, type `drive`. Then `LOCAL_BACKUP_DIR=… ./scripts/sync-backup-drive.sh`, and
   schedule it beside the local pull. The consent screen is the only step nobody else can take.
4. **An offline copy of the private key.** `/Users/motamer/.config/coditu/backup.agekey` is
   currently the only one. If that Mac is what is lost, every archive in the recovery repository
   is noise. This is the single largest remaining risk in the whole design.

The local pull, to run daily on the Mac:

```bash
RECOVERY_REPO=MooTamer/coditu-recovery \
LOCAL_BACKUP_DIR='/Users/motamer/Library/Application Support/Coditu/Backups' \
./scripts/sync-backup-local.sh
```

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

1. Stop writes to the old application and record the newest release tag in
   `MooTamer/coditu-recovery`. Do not let two recoveries write to the same target.
2. Create a fresh Supabase project in the same region. Note its Postgres major version **and
   that its Storage service is at least as new as the one backed up** — §6 says why.
3. `gh release download nightly-<id> --repo MooTamer/coditu-recovery --dir <local backup dir>`.
4. Verify the archive's SHA-256 and byte size against the metadata sidecar before decrypting.
5. Use the platform restore owner, not the backup role, and run
   `scripts/verify-backup-restore.sh <archive> <private.agekey>` against the fresh project.
   The restore order is roles → schema → data, and a **preflight runs before any of them**: it
   compares the `COPY` column lists in `data.sql` against the target and refuses to start if the
   target is older. The command then fails if any table the backup describes is missing or
   short, or if a table only the target has is non-empty.
6. Force-upload Storage with recursive copy. Do **not** use `aws s3 sync` after restoring
   `storage.objects`: the metadata rows make sync believe absent bytes already exist.
7. Re-run the object download and byte comparison, the SQL tests, and the hosted schema
   preflight. Only then point Vercel environment variables at the recovered project.
8. Smoke marketing, sign-in, Home, one project, one image, Recovery Centre and a write with
   rollback. Re-open writes only after all pass.

The 2026-08-29 drill restored 63 tables, 1,391 rows and 135 Storage objects in **6 seconds**
after the throwaway stack was healthy. That is evidence for this data size on this laptop, not
an RTO: creating a hosted project, DNS/environment changes, decision time and provider queues
were not measured. **RTO remains unset until the first hosted drill.**

## 4. Normal retention and local-copy checks

Every nightly publishes `nightly-<id>`. A run on day 01 also publishes the same encrypted set
as `monthly-<id>`. `prune-backups.sh` sorts the timestamp ids and keeps exactly 30 and 12,
deleting the release **and its tag** so a pruned set leaves nothing that looks like it is still
there. It validates every id against the timestamp shape before asking GitHub to remove
anything, and refuses to prune at all if the release listing came back truncated.

The local pull never deletes: an accidental deletion in the recovery repository is not
propagated onto the Mac. Every archive it downloads is checksummed against its own sidecar
before it counts as a local copy. Check local disk use monthly and remove only copies already
represented by a newer verified set and the 30 + 12 policy.

## 5. Freshness alert

`Recovery copy freshness` runs at minute 47 of every third hour. It picks the newest `nightly-*`
release and refuses to let any single record speak for the set. There are three, written by
different steps: the release **asset** (its real size, and when GitHub received it), the release
**notes** (written by the uploader), and the **sidecar** (written by the backup itself,
downloaded and read). It fails if there is no release, the tag is malformed, the sidecar asset
is absent or empty, the notes carry no SHA-256, the three disagree with each other, or the
asset is older than 93,600 seconds (26 hours). A timestamp more than five minutes in the future
also fails, instead of disguising clock or metadata corruption.

Only a complete, fresh check pings `HEARTBEAT_URL`, and the ping is the **last** step in the job
so nothing between the check and the ping can fail unreported. healthchecks.io therefore alerts
Mohamed both when the off-site copy becomes stale and when GitHub stops dispatching the canary
itself. The monitor is a separate control plane; GitHub's own workflow status is not treated as
the only alarm for GitHub scheduling. **That secret is not set yet**, so today the canary skips
the ping with a notice and nothing alerts anybody.

## 6. Monthly integrity and quarterly restore drills

`Monthly recovery-copy integrity` runs at 03:23 UTC on day 02. It reads the newest `monthly-*`
release and its matching `nightly-*`, requires each to hold **exactly** the archive and its
sidecar, downloads the monthly ciphertext, and compares:

- the downloaded ciphertext SHA-256 with the sidecar and with the release notes;
- downloaded, sidecar, monthly and matching nightly byte sizes;
- the monthly and matching nightly SHA-256 values;
- the sidecar identity, format and recorded database/Storage counts.

The job has read access to the recovery repository and **no age private key**. It proves the
encrypted set written on day 01 remains readable and unchanged; it cannot prove that the
plaintext restores. Never report this monthly control as a restore — it prints
`this_is_not_a_restore=true` for exactly that reason.

On the first Saturday of January, April, July and October, Mohamed performs the full drill:

1. Pull the newest monthly ciphertext and sidecar with `sync-backup-local.sh`.
2. Run `scripts/check-backup-integrity.sh` and compare its backup id and SHA-256 with the local
   files.
3. Start a new isolated local Supabase stack on ports that do not overlap `_coditu`; never reset
   or reuse the shared development stack. **Leave `realtime` enabled** — disabling it removes
   the `supabase_realtime_admin` role, and `roles.sql` grants to it and stops on the first line.
4. Point `RESTORE_DB_URL` at that stack's **`supabase_admin`** login (on current local images
   `postgres` is no longer a superuser and the verifier refuses it), set the four optional
   `RESTORE_STORAGE_*` values from `supabase start`'s S3 block, then run
   `scripts/verify-backup-restore.sh <archive> <private.agekey>`.
5. Record elapsed time, every table/row/object count and the result in `docs/06-PROGRESS.md`.
6. Stop the throwaway stack with `supabase stop --no-backup` and confirm only the shared
   `_coditu` containers **and no `*_coditurestore` volumes** remain.

**A local stack is an imperfect stand-in, and the 2026-08-29 drill proved it.** Supabase ships
newer Storage schemas to hosted projects than the CLI's pinned images carry: hosted
`storage.buckets` has `versioning_status`, hosted `storage.objects` has `archived_at`,
`is_delete_marker` and `is_versioned`, and `storage-api:v1.62.5` has none of the four. The drill
target had to be brought forward by hand with four `alter table` statements. A **fresh hosted
project needs none of this**, which is why the quarterly drill's honest form is against a hosted
project and why RTO stays unset until one has been done.

## 7. Free-plan project pausing

Supabase's current policy says a Free Plan project with low user database activity over a
seven-day window may be paused. It sends an owner warning roughly one week before pausing and
says a few user database requests per day are typically sufficient. A paused project is
application downtime even when the release and Vercel deployment are healthy.

**Implemented 2026-08-29, not yet active.**

- `public.database_heartbeat()` — one bounded read of `public.app_settings`, returning the fixed
  string `coditu-database-awake` and nothing else. `security definer`, no arguments, one literal
  `return`, and the migration asserts all of that plus that `anon` was **not** granted select on
  `app_settings`. See the ADR of 2026-08-29 for why definer is the safer of the two options here.
- `/api/health/database` — dynamic, `no-store`, no session, 5-second deadline. 200 with the
  keyword, or 503. Not on the middleware matcher. `e2e/keepalive.spec.ts` → **2 passed**: the
  keyword exactly, `no-store` present, and the whole body asserted so the probe cannot grow a
  payload.
- `Database keepalive` (`.github/workflows/keepalive.yml`) — every six hours, checking the
  **keyword** and not the status code, because a 200 from a CDN error page would keep it green
  while the database slept.

**What makes it active:** set the repository variable `PRODUCTION_BASE_URL` on `MooTamer/coditu`
once the app is deployed. Until then the workflow skips with a visible notice. Then add an
UptimeRobot **Keyword** monitor on the same route as a second control plane — Keyword is an HTTPS
check, which *is* on UptimeRobot's free plan, unlike the heartbeat type §1 needed — keep the owner
email alert on, and check the Supabase dashboard after seven days to confirm the provider records
the activity. Treat any Supabase pause-warning email as an incident **even when this check is green**,
because the provider alone decides whether activity is sufficient.

One more thing that can switch this off without anybody doing it: GitHub disables scheduled
workflows in a repository with no activity for 60 days. A quiet fortnight is fine; a quiet
quarter is not.

The `/login` Keyword monitor is still not accepted as keepalive proof: a signed-out render calls
Supabase Auth, and whether that counts as a user database request is not a repository fact. Do not
use `/api/backup-health` as a synthetic keepalive: that endpoint is evidence about a real off-site
archive, and reporting fabricated freshness to keep a database awake would corrupt the Recovery
Centre. The only no-code alternative that removes the pause class entirely is a paid plan, which
is outside Mohamed's no-card decision.

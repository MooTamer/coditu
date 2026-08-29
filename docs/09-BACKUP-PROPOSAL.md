# 09 — Infrastructure backup: a proposal, not a configuration

**Written 2026-08-27 during the reopened audit; §1 and the costings corrected the same
evening. Nothing here has been applied.**

> **Correction, 2026-08-27 evening.** This document originally described the Supabase Free
> plan as providing dependable daily provider-managed backups with seven-day retention. It
> does not, and the provider reports no recoverable backups for this project at all. §1
> carries the evidence and §2 carries a re-costed estimate. **The correction makes the
> situation worse, not better.** Nothing about the "proposed, not configured" status has
> changed.

This document exists because `app/app/settings/recovery/page.tsx` says three things are
`not set` — retention, RPO and RTO — and a screen that names a gap is only honest for as
long as somebody is going to close it. It proposes concrete numbers, states what each one
costs, and asks Mohamed to choose.

**No provider configuration has been changed.** Point-in-time recovery is still off. No
paid add-on has been enabled. No hosted data has been touched. Everything below is a
recommendation with a price attached, and the *"Decide"* section at the end is the list of
questions that need an answer before anything is turned on.

---

## 0. What the application already does, and what it cannot do

The Recovery Centre is careful about this split and this document keeps it.

**The application owns**, and proves on demand with `rehearse_recovery`:

| | |
|---|---|
| Version history | `document_revisions` is append-only. No `insert`, `update` or `delete` policy exists for anybody including an admin, and `supabase/tests/revisions.sql` asserts each refusal. A restore adds a version and never removes the ones in between. |
| The bin | Stories, comments and pages soft-delete. `purge_deleted` is admin-only, one id at a time, and only ever touches something already binned. |
| Access history | `access_events` is append-only and records every role, invitation and client-grant change. |
| Rehearsals | Four checks — documents, pages, trash, attachments — copied into a schema the function creates and drops, writing nothing back. |

**The application cannot do any of the following, and must never claim to:**

- Survive the loss of the Supabase project. Every guarantee above is a row *in that
  database*. A dropped project takes the revisions, the bin and the audit trail with it.
- Survive a `drop schema public cascade`, a bad migration, or a mistaken `delete` run in
  the SQL editor by somebody with the service-role key.
- Restore a Storage object. Avatars and work attachments are files in buckets; managed
  database backups do not contain them, which is why `attachments` is a separate rehearsal
  check and why it can only report *"no object at this path"* rather than fix it.

> **The in-database revision system is not a backup.** It protects against a person
> changing their mind. It protects against nothing that happens to the database itself.
> This sentence is the reason this document exists and it should survive every edit to it.

---

## 1. What is true today

Re-verified 2026-08-27 evening by querying the provider directly, read-only:

```
$ supabase backups list --project-ref hayfsvsepgfescojesbd
{"region":"eu-central-1","walg_enabled":true,"pitr_enabled":false,"backups":[]}
```

That single line is the evidence for the first three rows below. Nothing in this table is
inferred.

| | Today |
|---|---|
| Plan | Supabase **Free** |
| Point-in-time recovery | **Off.** `pitr_enabled: false`, straight from the provider |
| Recoverable backups the provider lists | **None.** `backups: []` — an empty array, not a short one |
| Automated database backups | **None that this project can rely on.** Supabase's current documentation says daily backups cover **Pro, Team and Enterprise** projects, and advises Free-plan projects to export their own data with `db dump` [1] |
| Storage backup | **None.** Storage objects are not in a database backup at all — see the row below and §0 |
| Off-site copy | **None.** Every copy that exists lives inside the same Supabase project |
| Integrity verification | **None.** No backup has ever been restored or read back |
| Failure alerting | **None.** Nobody would learn that a backup had not run |
| Retention policy | **Not decided** |
| RPO / RTO | **Not decided** |
| Restore drill | **Never performed** |

> **This table was wrong until 2026-08-27 and wrong in the dangerous direction.** It
> previously read *"Automated database backups — Daily, provider-managed, 7 days retention
> on the Free plan"*. That is not what the Free plan provides, and it is not what the
> provider reports for this project. The corrected exposure is worse than the one this
> document was originally written to describe, so the error is left visible here rather
> than silently overwritten.

**Storage objects are not in a database backup, on any plan.** Supabase's documentation is
explicit: *"Database backups do not include objects you store via the Storage API, as the
database only includes metadata about these objects"* [1]. Enabling PITR, or moving to Pro,
would change nothing about this. Every avatar and every work attachment is covered by
layer 2 of this proposal or by nothing — which is why `attachments` is a separate rehearsal
check, and why that check can only ever report *"no object at this path"* rather than fix it.

**The exposure, stated plainly.** There is no restore point. Not "we lose up to a day" — the
provider is holding nothing to restore *from*, and the WAL archiving that `walg_enabled: true`
refers to is not exposed as a recoverable backup without PITR on a paid plan. A destructive
mistake at any hour — a bad migration, a `drop schema public cascade`, a mistaken `delete`
in the SQL editor with the service-role key — is not recoverable from the provider today.
And because every copy that exists lives inside one Supabase project, a project-level loss
(a billing lapse, an account compromise, an accidental delete) takes all of it at once.

This is the sentence that should decide how urgently §4 gets answered.

---

## 2. The proposal

Four layers. Each is independent of the others, which is the point: layer 1 protects
against a mistake, layer 3 protects against losing the provider.

### Layer 1 — Database point-in-time recovery

**What.** Enable Supabase PITR on the hosted project.

**Why.** It turns "we lose up to a day" into "we lose up to two minutes", and it is the
single largest improvement available for the money. It also makes a bad migration
survivable: rewind to the instant before it ran.

**Cost — an estimate, and it has more moving parts than one number.** As listed on
Supabase's pricing page on 2026-08-27 [2], and per the PITR requirements in the backup
documentation [1]:

| Component | Listed | Note |
|---|---|---|
| Pro plan | **from $25**/month | "from" — it is a floor, not a total |
| PITR add-on | **$100**/month per 7 days of retention | longer retention costs more |
| Compute | PITR **requires at least a Small compute add-on** [1] | Small is listed at ~$15/month [3]; Pro includes $10/month of compute credits, which cover a Micro, so the incremental cost here is the difference, not the whole ticket |
| Off-site bucket (layers 2–3) | a few dollars/month at this data size | a separate provider, separate bill |

**Roughly $130/month at today's list prices, and deliberately not stated as a fixed
figure.** The total moves with the compute size chosen, how the $10 credit is already being
spent, the PITR retention picked, egress and disk overages, and any change Supabase makes to
its own pricing. **The earlier version of this document said a flat "$125/month". That was
wrong twice over: it was presented as fixed, and it omitted the compute requirement PITR
carries.** Confirm the real number in the billing dashboard before committing — it is the
only place that knows what this organisation is actually charged.

**Recommendation.** Enable Pro + 7-day PITR **if the budget allows**. If it does not, layer
3 below is the cheaper substitute and it is not as good — it recovers to the last nightly
dump rather than to the minute.

### Layer 2 — Storage objects

**What.** A nightly job that syncs both buckets — `work-attachments` and the avatar
bucket — to object storage outside Supabase.

**Why.** Managed database backups do not contain them. The `attachments` rehearsal check
already reports when a row points at a file that is not there; today the honest answer to
*"can we get that file back"* is no.

**How.** The S3-compatible endpoint is already available on the project
(`STORAGE_S3_URL`), so this is `rclone sync` or `aws s3 sync` on a schedule, not a piece of
software anybody has to write:

```
rclone sync coditu-supabase:work-attachments  offsite:coditu/attachments/  --backup-dir offsite:coditu/attachments-history/$(date +%F)
```

`--backup-dir` rather than a plain mirror, deliberately: a plain `sync` propagates a
deletion, so an accidental purge would be faithfully copied off-site within a day. Moving
replaced and deleted objects into a dated folder means the mirror cannot destroy history.

**Cost.** Storage is small — a few hundred megabytes today. Any of Backblaze B2, Cloudflare
R2 or Hetzner Storage Box is a few dollars a month at this size.

### Layer 3 — An off-site database dump

**What.** A nightly `pg_dump` of the hosted database, encrypted, written to the same
off-site bucket as layer 2, on the same schedule.

**Why.** This is the layer that survives losing the Supabase project itself, and it is the
only one that does. It is also the cheapest, which is why it should exist whether or not
layer 1 is bought.

**How.**

```bash
# Roles and data, custom format so it can be restored selectively.
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  | age --encrypt --recipient "$COD_BACKUP_PUBKEY" \
  > "coditu-$(date -u +%FT%H%M%SZ).dump.age"
```

- **`--format=custom`** so a single table can be restored without the rest.
- **Encrypted before it leaves the machine**, with `age` or `gpg`. The dump contains every
  profile, every comment and the hourly rate; an unencrypted copy in a third-party bucket
  is a worse problem than the one it solves. The private key does **not** go in the bucket.
- **The schema is already in git** — `supabase/migrations` — so the dump only has to carry
  data for a rebuild to be possible.

**Cost.** Effectively nothing beyond the bucket in layer 2.

### Layer 4 — Verification, alerting and drills

A backup nobody has restored is a hypothesis.

**Integrity, every night.** After each dump, `pg_restore --list` it back. A dump that
cannot be listed is corrupt, and this catches that in a second without restoring anything.
Record the byte size and a SHA-256 of the file beside it; a dump that is suddenly a tenth
of last night's is a failure that completed successfully.

**Alerting.** A dead-man's switch, not a success notification: the job pings a monitor
(healthchecks.io or equivalent, free at this scale) when it finishes, and the monitor
raises an alarm when the ping does not arrive. This is the only shape that catches *"the
job stopped running"*, which is the failure that actually happens.

**A restore drill, quarterly.** Restore the most recent dump into a scratch database,
run `supabase/tests/` against it, and check the row counts against the live workspace.
Record the date and the outcome in `docs/06-PROGRESS.md`. **A drill that is not written
down did not happen.**

**The application's own rehearsal, monthly.** `/app/settings/recovery` → Rehearse, all
four checks. That answers a different question — whether the *history* can reproduce the
*live rows* — and it is the half this repository owns.

---

## 3. Proposed objectives

Numbers to agree, not numbers that are true. Each is what the layer above delivers.

The **Today** column is not a proposal. It is the measured current position, and it is
there so that neither of the other two columns can be mistaken for the status quo.

| | **Today (nothing configured)** | With layers 1–4 | With layers 2–4 only (no PITR) |
|---|---|---|---|
| **RPO** — how much work may be lost | **everything.** No restore point exists | **5 minutes** — the provider's stated worst case is 2 [1]; 5 is the objective, with margin | **24 hours** |
| **RTO** — how long to be working again | **undefined.** There is nothing to restore from | **4 hours** | **8 hours** |
| **Retention — database** | **none** | 7 days PITR + 30 nightly dumps | 30 nightly dumps |
| **Retention — Storage objects** | **none** | current mirror + 90 days of replaced/deleted | same |
| **Retention — the bin** | unbounded; nothing purges | 90 days, then a permitted purge | same |
| **Verification** | **none** | nightly `pg_restore --list` | same |
| **Drill** | **never performed** | quarterly, recorded | same |

Two notes on these figures.

**The RTO is a guess until a hosted drill has been run.** A local data restore measures
neither incident decision time, provider creation nor DNS/environment cutover. Only a full
hosted drill can replace the guess, and until then the Recovery Centre leaves RTO unset.

**The bin's 90 days is a product decision, not an infrastructure one.** The handoff's own
unresolved-decisions list flags it: *"Trash retention — described as workspace policy with
no number in the UI. A number will eventually need a home in Workspace settings."* Nothing
purges automatically today, which is safe and unbounded. If 90 days is agreed it belongs in
`app_settings` and on the Workspace settings screen, where a person can see it.

---

## 4. Decided by Mohamed, 2026-08-28

1. **No Pro and no PITR.** The infrastructure objective is a **24-hour RPO**. This accepts
   that work after the newest successful nightly copy can be lost; it does not pretend the
   Free plan has a provider restore point.
2. **Cloudflare R2 Standard plus an encrypted local copy, never Git.** R2's current
   allowance is 10 GB-month, 1 million Class A operations and 10 million Class B operations
   per month, with direct egress free. The allowance is not the same as an activated account:
   Cloudflare currently requires an R2 subscription checkout and a primary payment method.
   Mohamed's no-card rule therefore blocks activation; §8 names the exact boundary.
3. **GitHub Actions cron.** `.github/workflows/nightly-backup.yml` is the scheduled writer.
   Its database credential belongs to a dedicated `coditu_backup` role, not `postgres`.
4. **Email to Mohamed and a freshness canary.** A second schedule checks the newest R2
   object, and an external heartbeat catches the case where GitHub schedules stop running
   altogether. Neither is described as active before its endpoint and secrets exist.
5. **Thirty nightly and twelve monthly recovery sets.** Each set contains roles, schema,
   data and every Storage object. `scripts/prune-backups.sh` retains an exact count, not an
   approximate number of days. The application bin remains unbounded; infrastructure
   retention does not silently create a product deletion policy.
6. **The integrity drill is automated monthly.** It checks the encrypted object's recorded
   SHA-256, byte size and object count without holding the private key. Mohamed performs a
   full decrypt-and-restore quarterly with his own key; GitHub never receives that key.

These are objectives until the provider copy exists. §5 still wins: the Recovery Centre
does not state the 24-hour RPO or 30 + 12 retention while activation is card-blocked.

---

## 5. What must not happen

- **No number reaches `/app/settings/recovery` before it is true.** The screen's whole
  design is that it states what was measured and names the gap. A retention period written
  in before the job exists would be believed, and it would be believed on the worst day.
- **No credential in the repository.** Not the database password, not the S3 keys, not the
  age private key. `.env*` is gitignored and stays that way.
- **No plain `rclone sync` without `--backup-dir`.** A mirror that propagates deletions is
  an accident amplifier.
- **The in-database revision system is never described as a backup.** See §0.


---

## 6. Sources

Fetched and read 2026-08-27. Supabase changes both its documentation and its prices;
re-read these before acting on any figure above, and confirm the money in the billing
dashboard rather than here.

1. **Supabase — Database Backups.** <https://supabase.com/docs/guides/platform/backups>
   The source for four claims in this document: that daily backups cover *"all Pro, Team,
   and Enterprise Plan projects"* and not Free; that Free-plan projects are advised to
   *"regularly export their data using the Supabase CLI `db dump` command and maintain
   off-site backups"*; that PITR requires *"at least a Small compute add-on"* and backs up
   WAL at two-minute intervals for a worst-case two-minute RPO; and that *"Database backups
   do not include objects you store via the Storage API, as the database only includes
   metadata about these objects"*.
2. **Supabase — Pricing.** <https://supabase.com/pricing>
   Pro *"from $25/month"*; PITR *"$100 per month per 7 days retention"*; Pro includes
   *"$10/month in compute credits"*.
3. **Supabase — Compute and Disk.** <https://supabase.com/docs/guides/platform/compute-and-disk>
   Compute add-on sizes and prices, including Small at ~$15/month — the size PITR requires.
4. **The provider itself**, for this project rather than for the plan in general:
   `supabase backups list --project-ref hayfsvsepgfescojesbd`, read-only, returning
   `pitr_enabled: false` and `backups: []`. When source 1 and this disagree, **this wins** —
   it is the only one that knows what exists for `Coditu's Project`.
5. **Cloudflare — R2 pricing.** <https://developers.cloudflare.com/r2/pricing/>
   Re-read 2026-08-28: Standard includes 10 GB-month, 1 million Class A operations,
   10 million Class B operations and direct egress without charge. The free allowance does
   not apply to Infrequent Access.
6. **Cloudflare — Get started and billing profile.**
   <https://developers.cloudflare.com/r2/get-started/> and
   <https://developers.cloudflare.com/billing/get-started/create-billing-profile/>.
   R2 requires an activated subscription checkout, and Cloudflare says a primary payment
   method is required to purchase products and services. This is why a technically free
   allowance still crosses Mohamed's no-card boundary.
7. **UptimeRobot — Cron job monitoring and Free plan.**
   <https://uptimerobot.com/cron-job-monitoring/> and
   <https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan>.
   Re-read 2026-08-28: a heartbeat gets a unique URL, an absent check-in after its interval
   and grace period sends an alert, and the Free plan includes heartbeat monitoring, email
   alerts and no card requirement.
8. **Supabase — Free project pausing.**
   <https://supabase.com/docs/guides/platform/free-project-pausing>.
   Re-read 2026-08-28: a Free Plan project may pause after low user database activity over
   seven days; Supabase sends an owner warning roughly one week before the pause and says a few
   user database requests per day are typically enough to avoid it. The database-backed health
   route proposed in `12-RECOVERY-RUNBOOK.md` §7 is not implemented in this branch.

---

## 7. Status

### 2026-08-29 — the hosted project has a restore point for the first time

`2026-08-29T165142Z.tar.gz.age`, 19,450,696 bytes, at
`/Users/motamer/Library/Application Support/Coditu/Backups/` on Mohamed's Mac, encrypted to
the public recipient in `ops/backup-recipient.txt`. It holds **126 tables, 1,391 rows and 135
Storage objects across 3 buckets** — read from the **hosted** project, not from a local stack.
Everything before this line was a local rehearsal of a hosted capability that did not exist.

Verified rather than assumed, immediately after the run: the ciphertext's SHA-256 and byte
count match the sidecar; it decrypts with the private key at
`/Users/motamer/.config/coditu/backup.agekey`; all **140** payload files pass
`shasum -a 256 -c checksums.sha256`; the extracted tree really holds 135 Storage files; and the
row-count manifest agrees with the hosted database table by table — 107 work items, 79 time
entries, 4 profiles, 4 `auth.users`, 5 projects, 17 sprints, 14 comments. `schema.sql` carries
34 tables, 98 policies and 64 functions; `roles.sql` carries the custom roles and their grants.

**This is one copy, on one laptop.** It is not the nightly, not off-site, and not pruned. It is
the thing that had to exist before anything else in this pass was allowed to touch production.

### What the credentials actually are

Two hosted credentials were established for it, and neither is the `postgres` password — which
is not in this repository, not on this machine, and was never needed:

- **`coditu_backup`** was created on the hosted project with the body of
  `20260828140000_a_role_that_can_only_read.sql` — the migration is idempotent, so applying it
  later re-runs as an `alter` rather than a conflict — and given a 48-character alphanumeric
  password generated locally and held only in
  `/Users/motamer/.config/coditu/backup-db.env` (mode 0600, outside git). The role contract the
  script asserts holds against hosted: `coditu_backup|true|true|false` — it is the backup role,
  it has BYPASSRLS, it can SELECT `work_items`, it cannot INSERT.
- **The Storage leg used the service-role key**, not an S3 key pair, over a new `rest` mode in
  `scripts/backup.sh`. See the ADR: S3 access keys can only be minted by a human in the
  dashboard, and the Management API has no endpoint for them.

The connection is the **session pooler on port 5432**, not `db.<ref>.supabase.co`. The direct
host publishes only an AAAA record and this machine has no IPv6 route, so the direct connection
string in every runbook here is unusable from it. That is a property of the network, not of the
project, and any future reader hitting a silent connection failure should check it first.

### 2026-08-29 — the nightly is real, off R2, and proved end to end

The store is **GitHub releases in a dedicated private repository**,
`MooTamer/coditu-recovery`. R2 is gone: its allowance is free and its account is not, and
Mohamed refused a card.

| | |
|---|---|
| Where | `nightly-<id>` and `monthly-<id>` releases; assets are `<id>.tar.gz.age` and `<id>.metadata.json` |
| Written by | `Nightly recovery copy`, **in the recovery repository**, with that run's own `GITHUB_TOKEN` |
| Credentials in the path | **No personal access token anywhere.** Three repository secrets: `BACKUP_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Retention | 30 nightly, 12 monthly, by deleting the release and its tag |
| Off-provider leg | Mohamed's Mac (working). Google Drive via rclone (written, **not activated** — OAuth needs him) |

**Why releases and not committed files.** Git objects are permanent. A `git rm` of a 19 MB
archive reclaims nothing, so "keep 30" expressed as deletions would grow the repository
forever and take clone time with it. Release assets delete for real.

**Why the workflows live in the recovery repository.** Keeping them in `MooTamer/coditu` would
need a personal access token with write access to a second repository, stored as a secret and
readable by every workflow in the application repository — a much larger blast radius than a
backup writer should have. And the application repository may be **the thing that was lost**: a
restore path that begins by checking it out is not a restore path. The recovery repository
therefore carries its own copy of the tooling, pushed by `scripts/sync-recovery-repo.sh`, whose
`--check` mode reports drift against `ops/recovery-repo.json`.

### The end-to-end proof, command by command

| Step | Evidence |
|---|---|
| Nightly, in Actions | run `33267669539`, **success**. `backup_id=2026-08-29T181341Z`, `database_tables=63`, `database_rows=1391`, `storage_buckets=3`, `storage_objects=135`, `nightly_retained=2` |
| Freshness canary, in Actions | run `33264940366`, **success**. `age_seconds=69`, and the asset size, the release notes and the downloaded sidecar all agreed |
| Pull to the Mac | `sync-backup-local.sh` → `downloaded=1 already_present=1 sets_on_disk=3`, each archive checksummed against its own sidecar after download |
| **Restore into a throwaway stack** | `verify-backup-restore.sh` → **exit 0 in 6 s**: `database_tables=63`, `database_rows=1391`, `storage_objects=135`, every one of the 63 tables matched count for count, and all 135 objects were pushed into the throwaway Storage service and byte-compared with `diff -qr` |

### Three things running it found

1. **`databaseTables` was double.** The row-count manifest was built with a `\gexec` loop, and
   psql prints the generated `select …` statements to the same stream as their results — two
   lines per table. Both of the first hosted sets claim **126 tables; there are 63**. The row
   total was never wrong, because the noise lines have no second field to sum, which is why
   nothing caught it. `scripts/sql/row-counts.sql` is one statement now.
2. **A restore target older than the source fails halfway through the data.** Hosted
   `storage.buckets` has `versioning_status` and `storage.objects` has `archived_at`,
   `is_delete_marker` and `is_versioned`; the local `storage-api:v1.62.5` image has none of
   them. The first drill died 1,729 lines into `data.sql` with a bare `column … does not exist`.
   `verify-backup-restore.sh` now compares the `COPY` column lists against the target **before
   writing anything** and says exactly which columns are missing and what it means.
3. **Requiring identical table lists was the wrong assertion.** The local Storage image has
   `storage.iceberg_namespaces` and `storage.iceberg_tables`; hosted does not. Both empty. The
   check now requires every table the backup describes to match exactly, and any table only the
   target has to be empty — and it prints those tables rather than hiding them.

### What is still not true


- **Nothing alerts anybody.** `BACKUP_CANARY_HEARTBEAT_URL` is unset, so the canary skips its
  heartbeat with a notice. Creating the UptimeRobot monitor is Mohamed's. Until it exists, a
  canary that stops being dispatched is silent.
- **The Recovery Centre still says `not verified by this app`.** `PRODUCTION_BASE_URL` and
  `BACKUP_CANARY_REPORT_SECRET` are unset, so the canary skips the report step with a notice.
  The endpoint is also not deployed yet — that is T1.5.
- **The Google Drive leg is written and inert.** `scripts/sync-backup-drive.sh` is finished;
  rclone's Drive backend is OAuth and the consent screen is Mohamed's to click. One
  `rclone config` and it runs.
- **The 24-hour RPO is not yet achieved.** Two dispatched runs are not a schedule that has been
  observed to fire. Say it after the cron has run unattended.
- **The quarterly private-key drill against a fresh HOSTED project has still never happened.**
  The drill above restores into a local stack whose Supabase service versions had to be brought
  forward by hand. RTO remains unset.

## 8. The implemented nightly set and its activation boundary

### What the job writes

`scripts/backup.sh` produces one age-encrypted `tar.gz.age` and one non-sensitive metadata
sidecar. Inside the ciphertext are three separate Supabase-CLI-generated SQL files —
`roles.sql`, `schema.sql`, `data.sql` — plus `row-counts.tsv`, an internal checksum manifest,
and every object from all Supabase Storage buckets. Plaintext exists only in a mode-0700
temporary directory and is removed on exit.

Supabase CLI 2.109.1 unconditionally generates `--role "postgres"`, even when the URL logs
in as `coditu_backup`; the result is `permission denied to set role "postgres"`. The script
uses the CLI as the source of its platform exclusions and normalisation, asserts exactly one
forced-role line exists, removes only that escalation, and executes the generated pipeline
as the dedicated role. A CLI shape change fails the job instead of quietly broadening access.

`20260828140000_a_role_that_can_only_read.sql` creates `coditu_backup` with LOGIN,
`pg_read_all_data` and BYPASSRLS, but no password and no write privilege. BYPASSRLS is needed
because an RLS-filtered dump can succeed while containing no rows; it does not grant a
write. The migration itself refuses to apply if the role can write or cannot read the
workspace.

### The encryption key

The one command used on Mohamed's Mac was:

```bash
install -d -m 700 /Users/motamer/.config/coditu && umask 077 && age-keygen -o /Users/motamer/.config/coditu/backup.agekey
```

The private half lives at `/Users/motamer/.config/coditu/backup.agekey`, mode `0600`. Only
its recipient, `ops/backup-recipient.txt`, is in Git. The private file must also get one
offline copy before activation; losing both the Mac and that key would turn every intact R2
object into unrecoverable ciphertext.

### What still needs an account, never a code change

After an R2 Standard bucket and narrowly scoped keys exist, add these GitHub repository
secrets without printing their values:

- `BACKUP_DB_URL` — the session/direct URL for `coditu_backup`, after setting that role's
  password out of band;
- `SUPABASE_STORAGE_S3_URL`, `SUPABASE_STORAGE_ACCESS_KEY_ID`,
  `SUPABASE_STORAGE_SECRET_ACCESS_KEY`, `SUPABASE_STORAGE_REGION`;
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- `BACKUP_CANARY_HEARTBEAT_URL` — the unique UptimeRobot heartbeat URL; treat the path as a
  credential because possessing it can forge successful check-ins.
- `BACKUP_CANARY_REPORT_SECRET` — one randomly generated 32+-character capability stored in
  both GitHub's and Vercel's Production environments. It can report one validated canary
  result through `/api/backup-health`; it is not a database or R2 credential.

Then dispatch `Nightly recovery copy` once, verify the encrypted object and sidecar by
`HEAD`, and only then let the schedule establish the first real recovery point. The local
copy is pulled with `scripts/sync-backup-local.sh` using a `coditu-r2` AWS profile stored
outside the repository. `docs/12-RECOVERY-RUNBOOK.md` carries the exact activation and
restore sequence.

The independent freshness control is also implemented locally. `Recovery copy freshness`
reads R2 hourly and accepts only a complete nightly set no older than 26 hours, then pings an
external heartbeat. UptimeRobot's Free plan currently includes heartbeat monitoring, email
alerts and needs no card. The monitor is deliberately **not created yet**: without an R2
object or pushed workflow it would report a manufactured outage. Activation follows the
ordered steps in `docs/12-RECOVERY-RUNBOOK.md` after the first upload succeeds.

`Monthly recovery-copy integrity` is implemented on the same boundary. On day 02 it reads
back the newest monthly ciphertext and sidecar, recomputes SHA-256 and byte size, compares
the day-01 monthly object with its nightly twin, and validates the recorded database and
Storage counts. It deliberately receives no age private key. That makes compromise of the
scheduled reader unable to expose the backup, but it also means this is an integrity drill,
not a restore. The first Saturday of January, April, July and October is the manual full
decrypt-and-restore drill in `docs/12-RECOVERY-RUNBOOK.md` §6.

The Recovery Centre hand-off is implemented on the same fail-closed rule. The freshness
check downloads the sidecar and requires its id, encrypted bytes, SHA-256 and four counts to
match the R2 object it just read. A scoped report endpoint writes those facts to a singleton
row, refuses stale/replayed payloads, and cannot move the row backwards to an older object.
The page renders no backup id, age, size, count or 24-hour claim while that row is absent;
after two hours without a new report, or once the newest object crosses 24 hours, the card
turns amber by elapsed time alone. There is currently no hosted row because R2 is still
card-blocked and the migration has not been applied.

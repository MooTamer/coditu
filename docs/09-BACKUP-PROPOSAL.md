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

**The RTO is a guess until a drill has been run.** Four hours is what a restore of a
database this size *should* take, including the time to notice and the time to decide. The
first drill replaces it with a measurement, and the measurement is what goes on the screen.

**The bin's 90 days is a product decision, not an infrastructure one.** The handoff's own
unresolved-decisions list flags it: *"Trash retention — described as workspace policy with
no number in the UI. A number will eventually need a home in Workspace settings."* Nothing
purges automatically today, which is safe and unbounded. If 90 days is agreed it belongs in
`app_settings` and on the Workspace settings screen, where a person can see it.

---

## 4. Decide

**These need Mohamed's decision. Nothing will be configured until they have one.**

1. **Pay for Pro + PITR?** An estimated **~$130/month** at today's list prices — Pro, the
   PITR add-on and the compute size PITR requires, itemised in §2 layer 1 — for a two-minute
   RPO instead of no restore point at all. Treat the figure as an estimate and confirm it in
   the billing dashboard. If the answer is no, layers 2–4 still go ahead, the RPO becomes 24
   hours, and that number should then be said on the Recovery Centre screen in those words.
   **Note that layers 2–4 are what move this project from "nothing" to "yesterday"; layer 1
   is what moves it from "yesterday" to "two minutes".** Doing nothing leaves it at nothing.
2. **Where do the off-site copies live?** Backblaze B2, Cloudflare R2, Hetzner, or an
   existing account. This decides who else holds a copy of every profile and comment in the
   workspace, so it is a data-protection decision as much as a cost one.
3. **Where does the nightly job run?** A GitHub Actions schedule is free and needs the
   database password in a repository secret. A small always-on host keeps the credential
   off GitHub. The credential's home is the real question.
4. **Who is alerted, and how?** Email is enough for four people, but somebody has to be
   the name on it.
5. **Retention: 30 nightly dumps, 90 days of Storage history, 90 days in the bin?** Or
   different numbers.
6. **Who runs the quarterly drill, and when is the first one?**

Once 1–6 are answered, the Recovery Centre's `Retention, RPO and RTO — not set` card can
state real figures, and it will be the first time anything on that screen is a number
somebody chose.

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

---

## 7. Status

**Unresolved and unapplied.** No plan has been upgraded, no add-on enabled, no job
scheduled, no bucket created, no credential issued. The six questions in §4 have not been
answered, and this document does not answer them — it exists so that they can be.

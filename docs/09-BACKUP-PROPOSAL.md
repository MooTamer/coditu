# 09 — Infrastructure backup: a proposal, not a configuration

**Written 2026-08-27, during the reopened audit. Nothing here has been applied.**

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

Read from the hosted project by hand on 2026-08-26 and re-checked 2026-08-27. Nothing in
this table is inferred.

| | Today |
|---|---|
| Plan | Supabase **Free** |
| Automated database backups | Daily, provider-managed, **7 days** retention on the Free plan |
| Point-in-time recovery | **Off** — it is a paid add-on and requires at least the Pro plan |
| Storage backup | **None.** Buckets are not in the managed database backup at all |
| Off-site copy | **None.** Every copy that exists lives inside the same Supabase project |
| Integrity verification | **None.** No backup has ever been restored or read back |
| Failure alerting | **None.** Nobody would learn that a backup had not run |
| Retention policy | **Not decided** |
| RPO / RTO | **Not decided** |
| Restore drill | **Never performed** |

**The exposure, stated plainly.** With PITR off, the recoverable position is the last daily
snapshot. A destructive mistake at 17:00 loses everything written since roughly 03:00 —
a day of four people's work, the sprint's time entries among it. And because every copy is
inside one Supabase project, a project-level loss — a billing lapse, an account
compromise, an accidental delete — loses all of it at once.

---

## 2. The proposal

Four layers. Each is independent of the others, which is the point: layer 1 protects
against a mistake, layer 3 protects against losing the provider.

### Layer 1 — Database point-in-time recovery

**What.** Enable Supabase PITR on the hosted project.

**Why.** It turns "we lose up to a day" into "we lose up to two minutes", and it is the
single largest improvement available for the money. It also makes a bad migration
survivable: rewind to the instant before it ran.

**Cost.** PITR requires the **Pro plan** (~$25/month for the organisation) plus the PITR
add-on (~$100/month for 7-day PITR at the time of writing). Supabase prices change; the
figures need confirming in the dashboard before anybody commits to them.

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

| | With layers 1–4 | With layers 2–4 only (no PITR) |
|---|---|---|
| **RPO** — how much work may be lost | **5 minutes** | **24 hours** |
| **RTO** — how long to be working again | **4 hours** | **8 hours** |
| **Retention — database** | 7 days PITR + 30 nightly dumps | 30 nightly dumps |
| **Retention — Storage objects** | current mirror + 90 days of replaced/deleted | same |
| **Retention — the bin** | 90 days, then a permitted purge | same |
| **Verification** | nightly `pg_restore --list` | same |
| **Drill** | quarterly, recorded | same |

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

1. **Pay for Pro + PITR?** ~$125/month for a 5-minute RPO instead of a 24-hour one. If no,
   layers 2–4 still go ahead and the RPO is 24 hours — which should then be said on the
   Recovery Centre screen, in those words.
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

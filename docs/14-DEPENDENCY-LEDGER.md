# 14 — The dependency ledger

**Written 2026-08-31.** Every provider this project stands on, what it holds, what its real ceiling
is, what breaks tonight if it disappears, and how long until we are running again.

## The question this document answers

Mohamed's instruction was *"I want to be able to use my data at any time"*, and nothing depending on
a limited resource. Taken literally that is unachievable: every provider has a ceiling and an owner,
including the paid ones, and a hard disk is a limited resource too. So the test is not the one that
sounds right —

> ~~Is this free? Does it have a quota?~~

— because a free tier that holds a replaceable copy is harmless, and a paid tier that holds the only
copy is not. The test that separates them is:

> **If this provider vanished tonight, what would I lose, and how long until I am running again?**

From which the three rules this design is built on:

1. **The PRIMARY copy lives on hardware Mohamed owns.** Not the fastest copy, not the most
   convenient — the one that is definitive.
2. **Off-site copies are replaceable. No single one is load-bearing.** If losing a particular
   off-site copy is a problem, it was not an off-site copy, it was the primary in disguise.
3. **The restore path must require none of them.** A recovery that begins "log in to X" has a
   dependency at exactly the moment dependencies are unavailable.

Everything below is measured or read off the provider. Where a number is an estimate it says so and
says what it is made of.

---

## The ledger

| Dependency | What it holds | Its real limit | If it vanished tonight | Recovery |
|---|---|---|---|---|
| **Supabase Free**<br>`hayfsvsepgfescojesbd`, eu-central-1 | **THE LIVE DATA.** The production Postgres at **41** migrations — every client, project, sprint, work item, time entry, comment and revision — plus Storage: avatars and attachments. | Free plan. **No point-in-time recovery** (`pitr_enabled: false`) and **no provider-listed backups** (`backups: []`), both read from the provider. 500 MB database, 1 GB storage, 5 GB egress. **Pauses after 7 days of inactivity.** | **The app is down.** This is the only row where disappearance means downtime rather than inconvenience: every authenticated page reads from it, and Free-plan data is not recoverable from the provider at all. | Restore last night's archive into a replacement. **See "the RTO, measured" below — it is not one number, and the honest part is which half is fast.** |
| **The Mac**<br>`Darwin 27.0`, arm64 | The **primary** archive copy (`~/Library/Application Support/coditu-backups`), the git clone, the CI runner, the nightly job — and **the age private key**. | One laptop. 740 GB disk, 128 GB free. Can be lost, stolen, dropped or stolen-with-the-bag. | The primary copy goes, and the off-site copies survive — **but see the next row, which is the one that matters.** | Any other machine can hold the primary: the design is a directory of files and a shell script. |
| **The age private key**<br>`~/.config/coditu/backup.agekey` | Nothing. It is what makes everything else readable. | **It exists in exactly one place on Earth.** Verified 2026-08-31: one file, mode 0600, and no second copy anywhere on this machine. | **Every off-site copy becomes permanently unreadable.** Three copies of a ciphertext nobody can decrypt is zero copies. This is the single load-bearing dependency in the whole design and it is not a provider. | **There is none.** age has no recovery, no escrow and no second identity. This is Mohamed's to fix and it is the highest-value thing on this page — see §Owed. |
| **GitHub** (repository) | The source, the history, the ruleset, the issues. Until this pass, also the backup store. | Free private repositories, unlimited. Suspendable like any account. | **Nothing is lost.** A git clone is a complete copy and this Mac has one; so does every machine that ever cloned it. | `git remote set-url` to any other host and push. Minutes. |
| **GitHub Actions** | Nothing. CI only, as of this pass. | **3,000 min/month**, account-wide across every repository. Measured burn **4.3× sustainable** (~234 runs × 33.7 min ≈ 7,900 min against a 3,000 ceiling). **Exhausted 2026-08-31 at 08:20Z**; re-verified still exhausted at 15:42Z with a live dispatch that ran zero steps. Resets on the 1st. | CI stops and `main` freezes, because the ruleset requires a check that cannot run. **No data is lost, and as of this pass no backup stops** — that coupling is what B5 removed. | Already done: a self-hosted runner on the Mac, which Actions does not meter. In a genuine emergency the owner can also drop the required check from the ruleset. |
| **Vercel Hobby** | The built application. **No data.** | Hobby: non-commercial terms, 100 GB bandwidth. **`vercel rollback` reaches exactly one step** — measured, `402 upgrade to pro` beyond it, and confirmed by the provider listing exactly two `isRollbackCandidate` deployments. | The site is down; nothing is lost. Whatever commit production is on is in the repository, and `build-health.json` names it. | `npm run build && npm start` on any Node host, with the environment values from §Secrets. The application is a stock Next.js build with no Vercel-only primitives. |
| **healthchecks.io** | Nothing. It is the thing that *notices*. | 20 checks free, no card. **Open-source (BSD) and self-hostable**, which is why it was chosen over UptimeRobot's paid heartbeat. | Backups keep running. **Nobody is told when they stop.** The loss is silent by construction, which is exactly the failure this project has already had once. | Self-host it, or point `HEARTBEAT_URL` at any equivalent. One line in `~/.config/coditu/nightly.env`. |
| **Google Drive** (paid, 2 TB) | The intended **primary off-site** copy of the archives. | Paid, 2 TB, no API quota in this design — a mounted folder is a path, not an API. Still suspendable: an account can be terminated, a card can fail. | **One off-site copy, and nothing else.** The Mac's primary is untouched and the restore path never reads Drive. | None needed. That is the whole point of rule 2 — it is designed to be lost. |
| **An external disk** (B4) | A second off-site copy, on a medium with no account attached to it. | A disk. It is unplugged most of the time, and that is its job. | Nothing. It is the copy that survives losing the *Google account*, so its absence only matters in combination. | None needed. |
| **Colima / Docker** | Nothing. It runs the throwaway Postgres the restore drill and CI use. | 6 GiB VM on this Mac. Three Supabase stacks fit; a fourth does not. **And it stops** — it did, mid-pass on 2026-08-31, and took the required check with it. | The **drill** cannot run, and CI goes red on a message that does not contain the remedy. A restore can still be done into any other Postgres. | `colima start` — which the CI action now prints into the job summary instead of leaving somebody to work out. |
| **npm registry** | Nothing at rest. Every build needs it. | Public, rate-limited, and it has had outages. | A **cold** build fails. `node_modules` and `~/.npm` on this Mac are already populated, so this Mac keeps building. | `npm ci --offline` against the existing cache. **Not exercised** — the offline pass never reached npm, because the restore path does not use it. |

---

## What the offline pass proved, and what it needed

**2026-08-31.** Wifi off — `networksetup -setairportpower en0 off`. Verified down before anything
was run: **no default route**, and `api.github.com`, `registry.npmjs.org` and `google.com` all
returned `curl exit=6` (could not resolve host).

| Step | Result |
|---|---|
| Read back all 8 archives on the primary (155 MB) and hash each against its sidecar | `materialised=true`, **under 1 s** |
| Read back the same 8 at an off-site destination, through its own path | `materialised=true` |
| Feed the same check a placeholder — right name, right size, no bytes | **refused**, exit 1, offline |
| Follow `docs/15-EMERGENCY-CARD.md` §4 literally | decrypt, extract, Postgres up, all three SQL files loaded — **4 s** |
| Row-for-row against `row-counts.tsv`, which travels inside the archive | `public` **35/35 tables, 1,184/1,184 rows** |
| Storage files | **135**, matching the sidecar's `storageObjects` |
| Wifi back on | GitHub API `200` |

### What it needed

`age`, `tar`, `psql`, `node`, `docker` — and **one Docker image that was already pulled**,
`public.ecr.aws/supabase/postgres:17.6.1.155`.

### What it did NOT need, having been asked

**Nothing reached for the network. Not once.** No package fetch, no CLI update check, no image
pull, no provider API, no GitHub, no Google. The restore path is `age | tar | psql` over a file on
a local disk, and that is the whole of it.

### The one dependency the offline pass DID surface

**A machine that has never pulled `supabase/postgres` needs a connection to get it (~1 GB).** That
is the single network reach anywhere in the recovery path, it is at the very start, and it is
avoidable: pull the image while things are calm. It is on the emergency card as exactly that.

It is also *why* the image is named: measured the same day, a plain `postgres:17` throws **545
errors** loading `schema.sql`, because the dump refers to `auth`, `storage` and `extensions`
schemas it does not have. The first draft of the card said "any machine with Docker and a plain
Postgres", and following the card literally is what proved it wrong.



## The RTO, measured — and the half of it that is not fast

"How long until I am running again" is two questions wearing one number, and only one of them has a
good answer.

| Stage | Time | How it was obtained |
|---|---|---|
| **Decrypt and restore the database into a working Postgres** | **4 seconds** | Measured, unattended, **with the network off** — §Offline pass |
| **Have the application serving again** | **30–60 min. Estimate.** | Not measured. The components are named rather than hidden in a single figure |

**Why the second is an estimate and should stay one until it is drilled.** The application does not
talk to Postgres. It talks to PostgREST, GoTrue and the Storage API, which is what a *Supabase
project* is. So "restore into a different Postgres" gets the rows back and does not get the app
back. The realistic paths, with what each is made of:

| Path | Estimate | What it is made of |
|---|---|---|
| A **new Supabase project** | 30–60 min | Create project (~5), restore the archive (measured below), reapply the two `auth.users` triggers no dump carries, set five environment values on Vercel, redeploy. |
| **Self-hosted Supabase** | half a day | The compose stack, then the same restore, then TLS and a hostname. |
| **Rows only, no app** | the measured restore time | Everything is queryable in `psql` immediately. If the question is *"can I get at my data"* rather than *"is the app up"*, this is the honest answer, and it is minutes. |

**The distinction matters more than the numbers.** Mohamed's instruction was *"use my data at any
time"*, and the row-level answer already satisfies it. The application being down is a different,
lesser problem — the data is not in the application, and it is not hostage to it.

---

## Where the design is genuinely exposed

Four things, in the order they would hurt.

1. **The age key exists once.** Everything else in this document is a copy of a copy. The key is
   not, and there is no ceremony, escrow or recovery for a lost age identity. Three off-site copies
   of a ciphertext nobody can decrypt is zero copies.
2. **`HEARTBEAT_URL` is not set, so the nightly refuses to run.** That is the designed behaviour —
   an unconfigured alarm must be loud — but the current *state* is that the automatic backup is not
   running at all. The newest set is `2026-08-31T070134Z`, written by hand.
3. **The Mac is one laptop, and CI now depends on it too.** A closed lid is a queued pull request
   and a missed night. Both are visible; neither is prevented.
4. **Colima can stop.** It did, mid-pass, and took the required check with it.

None of these is a provider. That is the finding: after this work, **the risks left are the ones we
own** — which is the whole objective, and is also why they are nobody else's job to fix.

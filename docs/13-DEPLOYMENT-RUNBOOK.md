# 13 — Deployment runbook

This runbook separates repository code from provider activation. The pipeline exists in the
`visual-conformance` branch; it does not control production until it reaches `main` and the
required deploy configuration exists in GitHub's `Production` environment.

## 1. Release contract

`vercel.json` sets `git.deploymentEnabled` to `false`, so the Vercel Git integration does
not create a deployment for a pushed commit. `.github/workflows/ci.yml` is the only planned
production writer:

1. `blocking release checks` starts a clean Supabase stack and runs lint, TypeScript, unit
   tests, 441 database/RLS assertions, the production build, built-token verification,
   generated-schema drift, JavaScript budgets, Server Action resilience and
   degraded-dependency behaviour.
2. Only a successful push to `main` unlocks `production deploy after blocking checks`.
3. The deploy job first proves the hosted Supabase schema can serve this commit. Only then
   does it pull the Vercel production environment, build with pinned CLI 59.9.1, and add an
   exact-commit health marker to the prebuilt output.
4. `scripts/deploy-production.sh` creates a Production-targeted deployment with
   `--skip-domain`, smokes its protected immutable URL, promotes it, then smokes the public
   production origin. A failed public check restores the exact deployment that owned the
   origin before the job began.
5. Production deploy jobs are serialized and never cancel one another. Missing configuration
   **skips** the deploy and says so; it is never interpreted as a successful no-op, and it is no
   longer a red trunk either.

> **Corrected 2026-08-30.** Point 5 used to read *"missing configuration is a red deploy"*, and it
> was. Since none of the four secrets below has ever been set, **every push to `main` painted CI
> red for a setup gap** — three of the last four runs. A permanently-red trunk teaches people to
> stop reading red, and then the one that matters goes unnoticed.
>
> The deploy is now gated on a `preflight` job whose output its `if:` reads, so an unconfigured
> deploy **skips**. Skipping is not silence: the preflight writes a warning annotation and a job
> summary naming every missing value.
>
> This is deliberately the opposite of what `backup-canary.yml` now does, and the distinction is the
> point: **a DEPLOY that is not configured should be skipped, because not deploying is safe. An
> ALARM that is not configured must be loud, because not alarming is not safe.** ADR 2026-08-30.

The required GitHub `Production` environment secrets are:

- `VERCEL_TOKEN` — a narrowly used Vercel token;
- `VERCEL_ORG_ID` — the team/account id for `mohamed-tamers-projects`;
- `VERCEL_PROJECT_ID` — the id for the existing `coditu` project;
- `HOSTED_SCHEMA_DB_URL` — a **session pooler** URL for `coditu_backup`, used read-only for the
  schema contract. It must identify project `hayfsvsepgfescojesbd` and negotiate SSL.

  It is written out here rather than described, because "a direct/session URL" left the one thing
  that actually blocks it unstated: **`db.hayfsvsepgfescojesbd.supabase.co` has no A record** and
  does not resolve from most machines, and the pooler's **6543** is transaction mode, which will not
  carry what this check does. Port **5432** on the pooler is session mode and is the one that works.

  ```
  postgresql://coditu_backup.hayfsvsepgfescojesbd:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
  ```

  **The `sslmode` in this string no longer decides anything, and that is deliberate.** As of
  2026-08-31 `check-hosted-schema.mjs` decomposes the URL and supplies TLS itself: the string says
  *where* to connect, the check says *how*. Any of `require`, `no-verify`, `disable` or nothing at
  all reaches the same verdict. `no-verify` is written above because it is also correct for `psql`
  if you paste this string there, not because the check needs it.

  **Why it was taken out of the string.** The first CI run with this secret set refused with
  `database connection is not encrypted` — the URL carried no usable `sslmode` and the connection
  was cleartext across the public internet. The assertion was right; depending on the query string
  was the mistake. A transport guarantee inside an opaque secret is one nobody can review: the
  person setting it cannot be shown to have got it right, and `sslmode` does not mean the same
  thing to every client. To `psql` (libpq) `require` means encrypt-and-do-not-verify. To this
  repository's `pg` 8.23.0 it means **`verify-full`**, and Supabase's chain ends at "Supabase Root
  2021 CA", which is in no public trust store — so the string that is correct in
  `docs/12-RECOVERY-RUNBOOK.md` used to fail outright here, with `SELF_SIGNED_CERT_IN_CHAIN`
  before a single table was read. One string, two clients, two meanings.

  Passing `ssl` beside `connectionString` was not enough — measured, not assumed: node-postgres
  lets a `sslmode` in the string win, so `require` still died and `disable` still connected in
  cleartext. The URL is therefore parsed and its query string dropped.


  The username carries the project ref after a dot — that is Supavisor's tenant routing, not a
  typo. The only unknown is `<password>`: set it on `coditu_backup` out of band, and it is the same
  value already inside the recovery repository's `BACKUP_DB_URL`. `scripts/check-hosted-schema.mjs`
  asserts the connection is `coditu_backup`, has `rolbypassrls`, can `select` on `public.work_items`
  and **cannot** `insert` — so a service-role or owner URL is refused rather than accepted as
  convenient. `docs/12-RECOVERY-RUNBOOK.md` §"Connect through the session pooler" has the same
  string for the backup leg.

  **The two ids beside it are not credentials.** `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are read
  from `.vercel/project.json` after `vercel link` on a clean checkout — which needs the token
  anyway. So of the four, exactly one has to be created: `VERCEL_TOKEN`.

The required GitHub `Production` environment variable is:

- `PRODUCTION_BASE_URL` — the stable, public HTTPS production origin without a trailing
  slash or path. It must be the origin users reach, not an immutable protected deployment.

The freshness canary needs `BACKUP_CANARY_REPORT_SECRET` — **in `MooTamer/coditu-recovery`,
not here.** Put the same randomly generated 32+-character value in Vercel's Production
environment. The canary sends it only to `/api/backup-health`; the application uses its
server-held copy to authorize that one singleton report. It is not an R2 or database
credential.

> **Corrected 2026-08-30.** This paragraph used to say the secret belongs in *this* repository's
> `Production` environment. It does not: no workflow in `MooTamer/coditu` references it, and
> `backup-canary.yml` — which is the only thing that reads it — lives in `MooTamer/coditu-recovery`.
> Put here, it would have had no effect and the canary would have kept refusing to report. §10 has
> the full split.

Get the two Vercel ids by linking a clean local checkout to the **existing** project and
reading `.vercel/project.json`; do not create a second project and do not commit `.vercel/`.
Add secrets through GitHub's encrypted secret UI or `gh secret set` from a non-recorded
source. Never paste or print them in an issue, transcript, screenshot or document.

## 2. Activation proof

Before merging the first gated release:

1. Add the four deploy secrets plus `BACKUP_CANARY_REPORT_SECRET` and confirm only their names with
   `gh secret list -R MooTamer/coditu --env Production`.
2. Add the same report secret to Vercel Production, then add `PRODUCTION_BASE_URL` through
   the GitHub `Production` environment variable UI and
   confirm it with
   `gh variable get PRODUCTION_BASE_URL -R MooTamer/coditu --env Production`. Before adding
   it, make sure it is the intended public origin and does not redirect to Vercel login.
3. Merge/push the pipeline to `main`. The Vercel Git integration should record no automatic
   deployment for that commit; the Actions deploy should create exactly one after the
   blocking job succeeds.
4. Match the JSON returned by `/build-health.json` to `git rev-parse origin/main` and verify
   the Vercel deployment is from the Actions job, not `vercel[bot]` racing it.
5. Confirm `/`, `/login`, `/app/settings/recovery` and `/build-health.json` return without a
   4xx/5xx, stay on the configured public origin after redirects, and that the health JSON
   names the checked commit.
6. Do not call the gate active until one deliberately failing blocking check produces zero
   production deployment and the next green commit produces one.
7. Dispatch `Recovery copy freshness` after the first off-site set exists. It must finish the
   freshness check, receive HTTP 204 from `/api/backup-health`, make the Recovery Centre show
   `off-site canary current`, and — last, on success only — ping the **healthchecks.io**
   heartbeat, before any backup figure is treated as live. Not UptimeRobot: its heartbeat type
   is paid. ADR 2026-08-29.
8. Create the free external uptime monitor only after step 5. Use a UptimeRobot **Keyword**
   monitor named `Coditu production`, URL `${PRODUCTION_BASE_URL}/login`, five-minute
   interval, and require the exact phrase `Coditu is an internal tool.`. Send alerts to
   Mohamed's owner email and complete UptimeRobot's emailed confirmation. A plain 200 monitor
   is insufficient because a Vercel login page can also return 200.

The monitor is not active until its dashboard shows a successful public check and Mohamed's
alert contact is confirmed. Do not announce production monitoring from a repository commit.

## 3. Automated smoke and rollback

The deploy script captures the current deployment id before uploading anything. The release
then moves through two boundaries:

1. `vercel deploy --prebuilt --prod --skip-domain` creates a Production-targeted candidate
   without moving any domain.
2. `vercel curl` smokes `/build-health.json`, `/`, `/login` and
   `/app/settings/recovery` on that protected candidate. The health response must contain
   the full `GITHUB_SHA`.
3. Only then does `vercel promote` move the production domains.
4. Ordinary unauthenticated `curl` repeats the public checks. It rejects every 4xx/5xx,
   requires the exact commit marker, and rejects redirects outside `PRODUCTION_BASE_URL`.
5. Any failure after promotion — including a 5xx, a timeout, a Vercel-login redirect, or an
   ambiguous non-zero promotion command — invokes `vercel rollback` with the captured prior
   deployment id and re-smokes the public routes.

If the workflow says `rollback_verified=false`, treat production as an active incident; the
script could not prove that the old release is serving. From an authenticated clean checkout:

```bash
npx --yes vercel@59.9.1 inspect "$PRODUCTION_BASE_URL" --json --token "$VERCEL_TOKEN"
npx --yes vercel@59.9.1 rollback '<known-good deployment id or URL>' \
  --yes --timeout 3m --token "$VERCEL_TOKEN"
curl --fail --location "$PRODUCTION_BASE_URL/login"
curl --fail --location "$PRODUCTION_BASE_URL/build-health.json"
```

Never choose the rollback target from memory. Use the deployment recorded as
`previous_deployment_url`/`rollback_started` in the failed run, then confirm the public
origin independently.

## 4. Temporary browser observation window

The two Playwright passes are a separate report-only job. It waits for the blocking job,
runs the development and production suites even if one fails, and keeps the red result and
seven-day trace/report artifact visible. It is not a dependency of `deploy` yet because the
known baseline is red.

Promotion rule: count only `main` runs using the same browser-job configuration as the
commit that introduces this runbook. After **10 consecutive green runs**, make `browser` a
hard dependency of `deploy` and remove `continue-on-error`. Any red run resets the count.

- Qualifying runs at implementation: **0 / 10** — this branch has not run remotely.
- Earliest calendar review: **2026-09-07**, or later if ten qualifying runs have not
  completed.
- Current history is not evidence: the last 20 `main` CI runs before this change contained
  no successes and used a different workflow; the newest stopped at database tests before
  reaching E2E.

## 5. Current provider references

- Vercel Git configuration: <https://vercel.com/docs/project-configuration/git-configuration>
  documents `git.deploymentEnabled: false` as the switch that stops Git deployments.
- Vercel's GitHub Actions guide:
  <https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel> documents the
  token/team/project secret boundary and the pull → build → prebuilt deploy sequence.
- Vercel's CLI deployment guide:
  <https://vercel.com/docs/cli/deploying-from-cli> documents `--skip-domain` followed by an
  explicit promotion.
- Vercel promotion and rollback:
  <https://vercel.com/docs/deployments/promoting-a-deployment> and
  <https://vercel.com/docs/cli/rollback> document the two production state changes.
- Vercel protected-deployment curl: <https://vercel.com/docs/cli/curl> documents its
  automatic protection bypass for candidate smoke checks.
- UptimeRobot Free-plan scope:
  <https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan>
  documents five-minute HTTP and keyword checks; <https://uptimerobot.com/pricing/>
  documents email alerts. **Scope limit, learned the hard way 2026-08-29:** neither page is a
  source for which monitor *types* the free plan carries. HTTP and Keyword — the two used
  here — are free. Cron/Heartbeat is **not**; it is Solo, Team and Scale only, which is why the
  backup heartbeat is healthchecks.io. ADR 2026-08-29.
- healthchecks.io: <https://healthchecks.io/> — "Monitor 20 cron jobs for free. No credit card
  required." The backup canary's dead-man's switch only.

These pages and the pinned CLI 59.9.1 command help were re-read on 2026-08-28. Re-check them
before changing the CLI or provider settings; a repository runbook is not evidence that a
provider contract stayed unchanged.

## 6. Hosted schema preflight

`scripts/check-hosted-schema.mjs` derives its expected contract from the committed
`lib/supabase/database.types.ts` and the migration filenames, then queries the hosted
catalog inside a read-only transaction. It fails before Vercel pulls or builds when any of
these differs:

- any local migration is absent from `supabase_migrations.schema_migrations`;
- any generated public table/view or one of its columns is absent or the wrong relation kind;
- any generated public function lacks the expected named inputs or table-return fields;
- any public enum has a different ordered label set;
- `avatars`, `comment-images` or `work-attachments` is absent or has the wrong visibility;
- the URL names another Supabase project, the connection is not encrypted, or the login is
  not the non-writing `coditu_backup` role.

The blocking local job regenerates database types and requires a zero diff first. That
closes the other half of the loop: migrations → generated contract → hosted contract →
application build.

As read on 2026-08-28, the hosted migration list ends at `20260827130000`. Local has 38
migrations and hosted has 35; `20260828120000_invited_is_not_accepted.sql`,
`20260828140000_a_role_that_can_only_read.sql` and
`20260828220000_backup_health_from_canary.sql` are not hosted. Therefore the production
preflight is expected to fail today. The activation order is:

1. use the hosted owner URL with `scripts/push-to-hosted.sh --db-url '<URI>' --verify-only`;
2. run `supabase db push --db-url '<URI>' --dry-run` and review the three pending files;
3. apply through `scripts/push-to-hosted.sh --db-url '<URI>' --yes`;
4. set a unique password on `coditu_backup` out of band and store its URL only in
   `HOSTED_SCHEMA_DB_URL` (and the backup secret where applicable);
5. run `node scripts/check-hosted-schema.mjs` in the CI deploy job;
6. allow the Vercel build only after it prints `hosted_schema_verified=true`.

No hosted migration was applied while writing this block.

## 7. Free-plan pause is a separate availability state

Supabase documents automatic pausing for Free Plan projects with low activity over seven days:
<https://supabase.com/docs/guides/platform/free-project-pausing>. This is independent of Git,
Vercel and the release rollback. A green deployment cannot recover a paused database.

The current `/login` monitor remains the first public-origin smoke, but it is not yet proof of a
database keepalive. Before the setup is called unattended, implement and monitor the narrow
database-backed health route specified in `12-RECOVERY-RUNBOOK.md` §7, then confirm a week of
recorded project activity and receipt routing for Supabase's owner warning email. That route is
proposed, not present in this branch; no monitor or provider setting was changed here.

## 8. The second deploy control, dashboard-side — Ignored Build Step

**Correction, 2026-08-30.** Earlier passes told Mohamed to set *Settings → Git → Production
Deployments → off*. **There is no such toggle.** Mohamed read the whole page and it is not there;
that instruction was wrong and has been removed from `06-PROGRESS.md` and `10-PRODUCT-FEEDBACK.md`.
It was never executed, so nothing was mis-configured — but a runbook step that cannot be followed is
worse than no step, because the reader concludes the control is on when it is not.

What *does* exist dashboard-side, and is the real second control, is the **Ignored Build Step**.

### What Mohamed pastes

**Project Settings → Build and Deployment → Ignored Build Step**, switch it from `Automatic` to
`Custom`, and paste exactly this one line:

```bash
bash -c 'if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] && [ "$ALLOW_MAIN_BUILD" != "1" ]; then exit 0; fi; exit 1'
```

**Exit 0 skips the build. Exit 1 proceeds with it.** That is Vercel's contract, stated in their own
words on the `vercel.json` reference page: *"Exiting with code 0 ignores the build, while code 1
continues it."* It reads backwards the first time — 0 is the success code everywhere else — so it is
worth re-reading before deciding the line is inverted.

What the line does, case by case:

| Branch | `ALLOW_MAIN_BUILD` | Exit | Result |
|---|---|---|---|
| `main` | unset | 0 | **build skipped** — a push to the trunk does not deploy itself |
| `main` | `1` | 1 | build proceeds — the deliberate escape hatch |
| `feat/*`, `fix/*` | anything | 1 | build proceeds — previews keep working, which T1.4 requires |

### Prerequisite: system environment variables must be exposed

`VERCEL_GIT_COMMIT_REF` is a Vercel **system** environment variable. It only reaches the build when
**Project Settings → Environment Variables → Automatically Expose System Environment Variables** is
on. Vercel's own reference makes the dependency explicit in the neighbouring case:
`VERCEL_GIT_PREVIOUS_SHA` is documented as *"only exposed when an Ignored Build Step is configured"*.

**This control fails OPEN, and that is the thing to understand about it.** If the toggle is off,
`$VERCEL_GIT_COMMIT_REF` expands to the empty string, `"" = "main"` is false, the guard falls
through to `exit 1`, and **the build proceeds** — on `main`, unguarded, silently. There is no error
and no log line saying the guard did not fire. So the toggle is not a detail of the setup; it is
half of the control.

Verify it rather than assuming it. After the setting is saved, push one no-op commit to a `feat/*`
branch and read the build log: a preview that builds proves the command ran and returned 1. Then the
`main` half is proved by §2 step 6 — one push to `main` that produces no deployment.

### Do not add `ignoreCommand` to `vercel.json`

`vercel.json` accepts an `ignoreCommand` key that **overrides the dashboard's Ignored Build Step**.
Adding one would collapse the two controls back into one file that anybody can edit — which is the
exact weakness this control exists to cover. `vercel.json` keeps `git.deploymentEnabled` and nothing
else about ignoring builds. If a future change adds `ignoreCommand`, the dashboard control is
silently dead and the tamper-evidence unit test will not notice, because it asserts about a
different key.

### Why there are two controls at all

`vercel.json`'s `git.deploymentEnabled` is repository state: it is load-bearing, and it is editable
by anybody with commit access — including by accident, in a merge. On 2026-08-29 it also **leaked
once**: `707d03f` deployed to production while carrying `"deploymentEnabled": false` in its blanket
form. That is recorded in `06-PROGRESS.md`, and it is why a second control that lives somewhere
other than the repository is required rather than tidy.

The Ignored Build Step is provider state. Editing the repo does not change it, and a merge cannot
touch it. The two fail independently, which is the entire point.

### What is NOT known, and must be tested

**Whether the Ignored Build Step also blocks `vercel deploy --prod` issued from CI is not
documented, and this runbook does not claim it either way.**

The plausible reading is that it does not — the Ignored Build Step is described throughout Vercel's
documentation in terms of Git-triggered builds, and `scripts/deploy-production.sh` deploys
`--prebuilt` output that CI has already built, so there may be no build for the step to ignore. The
equally plausible reading is that the setting is evaluated per deployment regardless of trigger, in
which case CI's own deploy would be skipped and the gate would appear to succeed while shipping
nothing. Both are guesses. Neither belongs in a runbook as fact.

**T1.5(d) must test it**, and the test is cheap: with the Ignored Build Step set, run the deploy
workflow once and check whether a deployment is actually created.

- If CI deploys normally → nothing more to do; the two controls compose.
- If CI is blocked → set `ALLOW_MAIN_BUILD=1` **in the Production environment only** so the CI path
  is the one exception, and re-run. The escape hatch is already in the command for this reason.

Record the observed answer here when T1.5(d) runs, and delete this subsection's speculation. Until
then, treat the CI deploy path as unproven under this setting.

## 9. The control upstream of both deploy controls

Sections 1 and 8 stop a commit on `main` from deploying. This one stops a commit reaching `main`.

Repository ruleset `21825959`, *"main moves only through a green pull request"*, is **active** on the
default branch with no bypass actors:

| Rule | Effect |
|---|---|
| `pull_request` (0 approvals) | direct pushes to `main` are refused |
| `required_status_checks` → `blocking release checks` | the PR cannot merge until CI's blocking job is green |
| `non_fast_forward` | force-push refused |
| `deletion` | branch deletion refused |

Inspect it with:

```bash
gh api repos/MooTamer/coditu/rulesets/21825959
```

**Why the required check is `blocking release checks` and nothing else.** It is the only CI job with
no `if:` condition, so it reports on every pull request. `browser baseline` and `lighthouse` are both
gated on `needs.scope.outputs.code == 'true'` and are skipped on a documentation-only change — and a
required check that never reports leaves the pull request pending forever. Adding either to this
ruleset would deadlock every ledger edit. `browser` becomes a hard dependency through §4's ten-run
promotion rule, inside the workflow, not here.

**What this buys the deploy story.** With this on, `main` only contains commits that passed the
blocking job. A production deploy from `main` is therefore a deploy of tested code by construction,
which is what §1 assumed and nothing previously guaranteed.

## 10. Parked on Mohamed — exactly what is missing, and in which repository

Read back from the providers on 2026-08-30, not from this document. Both `Production` environments
exist; **both are empty**. Nothing below was placed by an autonomous pass, because minting or
placing a credential is not something one should do.

### `MooTamer/coditu` — all five are set as of 2026-08-31

**Closed.** Read back with `gh secret list -R MooTamer/coditu` and `gh variable list` on
2026-08-31, at the **repository** level rather than the `Production` environment — both
environments are still empty, and that is fine: a job carrying `environment: Production` reads
repository secrets too, and an environment secret would only shadow one of the same name.

| Name | Kind | Value | Set by | When |
|---|---|---|---|---|
| `VERCEL_TOKEN` | secret | — | Mohamed | 2026-08-31 05:45Z |
| `HOSTED_SCHEMA_DB_URL` | secret | — | Mohamed | 2026-08-31 05:59Z |
| `VERCEL_ORG_ID` | secret | `team_vJjCIjOpMU8pPsB45cWNnoNr` | this pass | 2026-08-31 06:07Z |
| `VERCEL_PROJECT_ID` | secret | `prj_GOg3XIVdg7u6WPAzaHFJy2QnfBHu` | this pass | 2026-08-31 06:07Z |
| `PRODUCTION_BASE_URL` | **variable** | `https://coditu-phi.vercel.app` | Mohamed | 2026-08-29 |

The two ids were derived from the Vercel API for the `coditu` project linked to `MooTamer/coditu`,
and they match the values this document had already written out — which is the corroboration worth
having, since the earlier pass read them a different way. They are identifiers, not credentials, so
placing them is not the thing an autonomous pass should decline; the token and the database URL are
credentials and remain Mohamed's, unset by anyone else.

**`HOSTED_SCHEMA_DB_URL` names the `postgres` role, not `coditu_backup`** — see the ADR of
2026-08-31. Narrowing it is owed and is recorded as an open risk, not as done.

### `MooTamer/coditu-recovery` — blocks the backup alerting

Its three secrets exist (`BACKUP_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`); these two do
not, and `gh variable list -R MooTamer/coditu-recovery` is empty.

| Name | Kind | Why it is blocking |
|---|---|---|
| `HEARTBEAT_URL` | secret | `https://hc-ping.com/<uuid>` from healthchecks.io. **Without it there is no alerting at all.** Until 2026-08-30 the canary logged a notice and **exited 0**, so an unconfigured canary was green forever — precisely the failure a dead-man's switch exists to catch. It now **fails**: an alarm that is not configured is a failed alarm, and the red is true until this is set |
| `BACKUP_CANARY_REPORT_SECRET` | secret | The canary refuses to report freshness without it; the same value also goes in **Vercel's** Production environment so the application can authorize the report |
| `PRODUCTION_BASE_URL` | variable | `https://coditu-phi.vercel.app`. The canary needs it too, and it is set in neither repository |

### The order, once the values exist

1. Set the five in `coditu` → `Production`; confirm names only with
   `gh secret list -R MooTamer/coditu --env Production`.
2. Push to `main` through a pull request and watch whether `deploy` creates exactly one deployment —
   **and, in the same run, whether the §8 Ignored Build Step interferes with it.** That is the
   untested question, and this is the run that answers it.
3. Set the recovery repository's two secrets and its variable, then dispatch `Recovery copy
   freshness` and require HTTP 204 from `/api/backup-health` plus a ping recorded at healthchecks.io.
4. Only then is `/build-health.json` expected to exist on production. It does **not** today —
   verified 2026-08-30, the URL returns the application's HTML, because the job that writes it has
   never run.

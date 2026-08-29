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
   is a red deploy; it is never interpreted as a successful no-op.

The required GitHub `Production` environment secrets are:

- `VERCEL_TOKEN` — a narrowly used Vercel token;
- `VERCEL_ORG_ID` — the team/account id for `mohamed-tamers-projects`;
- `VERCEL_PROJECT_ID` — the id for the existing `coditu` project;
- `HOSTED_SCHEMA_DB_URL` — a direct/session URL for `coditu_backup`, used read-only for the
  schema contract. It must identify project `hayfsvsepgfescojesbd` and negotiate SSL.

The required GitHub `Production` environment variable is:

- `PRODUCTION_BASE_URL` — the stable, public HTTPS production origin without a trailing
  slash or path. It must be the origin users reach, not an immutable protected deployment.

The freshness canary additionally needs `BACKUP_CANARY_REPORT_SECRET` in GitHub's
`Production` environment. Put the same randomly generated 32+-character value in Vercel's
Production environment. GitHub sends it only to `/api/backup-health`; the application uses
its server-held copy to authorize that one singleton report. It is not an R2 or database
credential.

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

# 13 — Deployment runbook

This runbook separates repository code from provider activation. The pipeline exists in the
`visual-conformance` branch; it does not control production until it reaches `main` and the
required deploy secrets exist in GitHub's `Production` environment.

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
   does it pull the Vercel production environment, build with pinned CLI 59.9.1, and upload
   the prebuilt output to Production.
4. A missing token, team id or project id is a red deploy; it is never interpreted as a
   successful no-op.

The required GitHub `Production` environment secrets are:

- `VERCEL_TOKEN` — a narrowly used Vercel token;
- `VERCEL_ORG_ID` — the team/account id for `mohamed-tamers-projects`;
- `VERCEL_PROJECT_ID` — the id for the existing `coditu` project.
- `HOSTED_SCHEMA_DB_URL` — a direct/session URL for `coditu_backup`, used read-only for the
  schema contract. It must identify project `hayfsvsepgfescojesbd` and negotiate SSL.

Get the two ids by linking a clean local checkout to the **existing** project and reading
`.vercel/project.json`; do not create a second project and do not commit `.vercel/`. Add the
values through GitHub's encrypted secret UI or `gh secret set` from a non-recorded source.
Never paste or print them in an issue, transcript, screenshot or document.

## 2. Activation proof

Before merging the first gated release:

1. Add the three environment secrets and confirm only their names with
   `gh secret list -R MooTamer/coditu --env Production`.
2. Merge/push the pipeline to `main`. The Vercel Git integration should record no automatic
   deployment for that commit; the Actions deploy should create exactly one after the
   blocking job succeeds.
3. Match the GitHub deployment's SHA to `git rev-parse origin/main` and verify the Vercel
   deployment is from the Actions job, not `vercel[bot]` racing it.
4. Do not call the gate active until one deliberately failing blocking check produces zero
   production deployment and the next green commit produces one.

## 3. Temporary browser observation window

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

## 4. Current provider references

- Vercel Git configuration: <https://vercel.com/docs/project-configuration/git-configuration>
  documents `git.deploymentEnabled: false` as the switch that stops Git deployments.
- Vercel's GitHub Actions guide:
  <https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel> documents the
  token/team/project secret boundary and the pull → build → prebuilt deploy sequence.
- Vercel CLI global options: <https://vercel.com/docs/cli/global-options> documents
  `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as the non-interactive CI link.

These pages were re-read on 2026-08-28. Re-check them before changing the pinned CLI or
provider settings; a repository runbook is not evidence that a provider contract stayed
unchanged.

## 5. Hosted schema preflight

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

As read on 2026-08-28, the hosted migration list ends at `20260827130000`. Local has 37
migrations and hosted has 35; `20260828120000_invited_is_not_accepted.sql` and
`20260828140000_a_role_that_can_only_read.sql` are not hosted. Therefore the production
preflight is expected to fail today. The activation order is:

1. use the hosted owner URL with `scripts/push-to-hosted.sh --db-url '<URI>' --verify-only`;
2. run `supabase db push --db-url '<URI>' --dry-run` and review the two pending files;
3. apply through `scripts/push-to-hosted.sh --db-url '<URI>' --yes`;
4. set a unique password on `coditu_backup` out of band and store its URL only in
   `HOSTED_SCHEMA_DB_URL` (and the backup secret where applicable);
5. run `node scripts/check-hosted-schema.mjs` in the CI deploy job;
6. allow the Vercel build only after it prints `hosted_schema_verified=true`.

No hosted migration was applied while writing this block.

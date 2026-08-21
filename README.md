<p align="center">
  <img src="./public/brand/lockup-horizontal.svg" alt="Coditu" width="180" />
</p>

<p align="center">
  Coditu's whole software surface: the public site at <code>/</code> and the internal delivery app at <code>/app</code>.
  One Next.js project, one design system, one deployment.
</p>

---

## What this is

Two things that share a codebase because they share a brand and a token layer:

- **`/`** — the marketing site. Server-rendered sections, one scroll-linked
  client component for the signal trace, one for the work modal.
- **`/app`** — the authenticated app the team runs its own sprints in. Sprint
  table, item detail, comment thread, board, my work, people, Notion import,
  and the client-facing export.

Everything durable is written down in [`docs/`](./docs). Start with
[`docs/06-PROGRESS.md`](./docs/06-PROGRESS.md) — it is the ledger, and it is
accurate; then [`CLAUDE.md`](./CLAUDE.md) for the five invariants the app is
built around.

## Getting it running

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run db:start               # local Supabase (Docker)
npm run db:seed                # migrations + EVIM Week 17
npm run dev
```

Sign in with a seeded account — `mohamed@coditu.com` / `coditu`. Only addresses
in `allowed_emails` can create an account at all; see
[`docs/02-DATA-MODEL.md`](./docs/02-DATA-MODEL.md).

## Deploying

### Vercel

Import the repository, then set these project environment variables before the
first deploy — the build **fails loudly** without them, which is deliberate:
a site that builds and then cannot reach its database is worse than one that
refuses to build.

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key |
| `NEXT_PUBLIC_SITE_URL` | **Optional on Vercel** — leave it unset and `lib/site-url.ts` uses `VERCEL_PROJECT_PRODUCTION_URL`. Set it only once a custom domain actually resolves to the deployment; pointing it at a domain that serves nothing sends every canonical URL and OG image there |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role`. **Server only** — never prefix it with `NEXT_PUBLIC_` |
| `REPORT_TOKEN_SECRET` | Any long random string: `openssl rand -base64 48` |

No build command or output directory to configure; Vercel detects Next.js.

**One route does not work on serverless as-is.** `…/report/pdf` drives a headless
Chromium through `playwright-core`, and there is no Chromium in a Vercel
function. It fails *gracefully* — a 503 whose body explains the problem — and the
report itself still opens at `…/report` and prints from the browser, which is
the same document. To make the route work in production, swap the launcher for
`@sparticuz/chromium-min` and point `CHROMIUM_EXECUTABLE_PATH` at it; see
[`docs/04-EXPORT-SPEC.md`](./docs/04-EXPORT-SPEC.md).

### Local production config

The hosted Supabase project's values live in `.env.production.local`, which Next
loads only when `NODE_ENV=production`. `npm run dev` and every test keep talking
to the local stack, and `scripts/with-prod-server.sh` refuses to start when
`NEXT_PUBLIC_SUPABASE_URL` is not local — the e2e suite deletes rows, and it runs
a real production build.

Applying the schema to a hosted project:

```bash
supabase db push --db-url "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
```

Use the **session pooler** connection string. The direct `db.<ref>.supabase.co`
host is IPv6-only on current projects and will not resolve from most machines.

The seed sets every account's password to `coditu`, which is correct for a
throwaway local stack and unacceptable anywhere reachable. Substitute real
passwords before seeding a hosted project.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run test` | Vitest unit suite |
| `npm run db:test` | pgTAP — RLS and seed assertions, positive and negative |
| `npm run e2e` | Playwright, against the dev server and the local database |
| `npm run e2e:prod` | The subset that only means anything against a production build |
| `npm run brand:assets` | Re-renders every raster icon and social card from `public/brand/` |

## Layout

```
app/
  (marketing)/          the public site
  app/                  the delivery app, behind auth
  robots.ts sitemap.ts
components/
  site/                 marketing sections
  app/                  app screens and their client islands
  coditu/               the mark, the lockup, chips, mono
  motion/               reveal tiers and their observers
lib/
  actions/              server actions — every mutation lives here
  data/                 server-side reads
  export/               CSV, Markdown, and the export payload
  supabase/             server, client, admin, env
design/                 the approved design bundle, committed verbatim
docs/                   context, design system, data model, spec, decisions, ledger
supabase/               migrations, seed, pgTAP tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5 strict ·
Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Vitest · pgTAP ·
Playwright.

## Conventions

- Every mutation is a Server Action: zod-validate → re-check authorization
  server-side → write → revalidate. The browser never holds a privileged key.
- Time is stored as integer minutes. Hours are a presentation concern.
- A work item belongs to a sprint, which belongs to a project, which belongs to
  a client. Nothing is global, and every action re-derives the project from the
  item's own sprint rather than from anything the client sent.

The rest, including why each call was made, is in
[`docs/05-DECISIONS.md`](./docs/05-DECISIONS.md).

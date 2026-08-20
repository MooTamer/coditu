# 06 — Progress

**The ledger. Read this before doing anything else, every session. Trust it over your own recollection.**

A task is `done` only when its verification command passes. Update this file **in the same commit as
the work** — never in a separate "update docs" commit.

Status: `todo` · `wip` · `done`

**SHA convention.** A step's commit SHA cannot be written inside the commit that creates it. Mark the
step `done` with its verification in the work commit, leaving the Commit column as `pending`; the SHA is
backfilled by the next step's work commit. That is not a "separate docs commit" — it rides along with
real work, which is what the rule is protecting against.

---

| # | Step | Status | Commit | Verification |
|---|---|---|---|---|
| 1 | **Bootstrap** — `CLAUDE.md`, `docs/*`, `design/` committed, `._*` junk removed, `.gitignore` fixed | `done` | `5e7d53e` | `git status --porcelain` clean, no `error:` lines |
| 2 | **Import the design** — asset migration to `public/`, `docs/01-DESIGN-SYSTEM.md` filled from the bundle | `done` | `bb987e7` | `./scripts/verify-assets.sh` |
| 3 | **Tokens and primitives** — `globals.css`, Tailwind theme, fonts, `<Reveal>`, `<StatusChip>`, `<Mono>`, `<CoditusMark />` | `done` | pending | `npm run lint && npm run typecheck && npm run build && ./scripts/verify-tokens.sh`; `/dev/tokens` in both themes |
| 3b | **Legacy asset deletion** — `public/logo*.svg`, `logo-wordmark.*`, `design/project/assets/legacy/*`. Deferred by §1 to *after* the Coditu marks are wired in | `todo` | — | zero references to `logo.svg` / `logo-stripped.svg` / `logo-wordmark.*`; files gone |
| 4 | **Supabase** — migrations, enums, triggers, views, indexes, RLS, `allowed_emails`, auth, middleware | `todo` | — | `npm run db:test` green, positive **and** negative RLS cases |
| 5 | **Seed** — clients, projects, Week 17 with `COD-140`…`COD-151` exactly as in the bundle, plus a closed Week 16 | `todo` | — | test asserts the footer sum reads **16.0 / 46.0** |
| 6 | **App shell** — rail, topbar, project switcher, routing, theme, empty states | `todo` | — | `npm run build`; no-sprint empty state renders with Export disabled + tooltip |
| 7 | **Sprint table** — columns, chips, sticky, grouping, sum row, URL filters, mobile cards | `todo` | — | sum-equals-database test; container-query test at 320px |
| 8 | **Item detail** — intercepting route, properties, criteria ring, log time, activity | `todo` | — | `npm run test`; hard navigation renders the full page |
| 9 | **Comment thread** — composer, code, images, mentions, notifications, server-side JSON rendering | `todo` | — | XSS test: a comment whose JSON carries a hostile node renders inert |
| 10 | **Board, My work, People, Import** | `todo` | — | `npm run test`; importer flags the `"1a"` grouping case before committing |
| 11 | **Export** — CSV, Markdown, PDF, item selection, persistence | `todo` | — | golden-file tests for CSV and Markdown; scoping test proving cross-project leakage is impossible |
| 12 | **Marketing site** — sections, trace, work modal, metadata, brand assets | `todo` | — | `npm run build`; zero "Strukture" matches repo-wide |
| 13 | **Motion pass** — every tier applied, reduced-motion verified, no `will-change` left pinned | `todo` | — | reduced-motion e2e; no persistent `will-change` after animation completion |
| 14 | **Performance and a11y pass** — budgets asserted in CI, Lighthouse ≥ 95, axe clean | `todo` | — | Lighthouse CI ≥ 95 × 4; axe clean on table, detail, composer, export dialog |

---

## Definition of done (§14) — final gate

- [ ] `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run db:test` all pass clean
- [ ] TypeScript strict. Zero `any`. Zero unexplained suppressions
- [ ] Zero horizontal scroll at 320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560 — and at 200% zoom
- [ ] Full keyboard traversal of site and app, including drag reorder and the mention list
- [ ] `prefers-reduced-motion` fully functional, no transforms, no blur
- [ ] Contrast verified with a tool for every text/background pair in both themes; §3 figures do not regress
- [ ] Lighthouse ≥ 95 on all four categories for the marketing route; route JS within budget
- [ ] Every RLS policy has a passing positive **and** negative test
- [ ] The sprint footer sum equals the database in a test, including after an optimistic update rolls back
- [ ] Export scoping test proves one project's export can never contain another's items
- [ ] Comment rendering is proven inert against hostile stored JSON
- [ ] PDF renders with embedded fonts, running header and footer, no orphaned item headings, no internal-only fields
- [ ] The word "Strukture" appears nowhere — code, copy, metadata, README, or assets. Legacy assets deleted
- [ ] No fabricated testimonials, metrics, client counts, or logos
- [ ] `.env.example` complete; `SUPABASE_SERVICE_ROLE_KEY` referenced only from server-only modules; no secret in a client bundle
- [ ] `CLAUDE.md` and this file accurate as of the final commit; `docs/05-DECISIONS.md` records every judgement call

---

## Session log

Newest at the bottom. One line per session: what moved, and what the next session should pick up.

- **2026-08-20** — Steps 1 and 2 done. Repo housekeeping done (661 AppleDouble files and `.DS_Store`
  removed, `.gitignore` extended). Design bundle extracted to `design/` and verified byte-identical to
  a fresh handoff export and to the live project's file list. Durable docs written.
  Step 2: brand and client assets migrated to `public/brand/` and `public/clients/`; the bundle's work
  webps were already byte-identical to `public/work/` so that move was a verified no-op.
  `docs/01-DESIGN-SYSTEM.md` written in full from the bundle — two drifts between the bundle's brand
  README and its executable `palette()` are recorded there, and `palette()` wins. Legacy Strukture
  assets are still in place and still referenced by 4 files; §1 defers their deletion until the Coditu
  marks are wired in, so they are tracked as step 3b. 13 "Strukture" strings remain across
  `app/layout.tsx`, `components/landing/{navbar,footer}.tsx`, `lib/marketing-content.ts`, `README.md`.
  **Next: step 3 — tokens and primitives.**
- **2026-08-20** — Step 3 done. Satoshi self-hosted (four weights, ITF Free Font Licence, served by
  `next/font/local` from `lib/fonts/files/` rather than `public/` so they are not shipped twice);
  JetBrains Mono via `next/font/google`. `app/globals.css` carries the full token layer for both
  themes, mirrored into the Tailwind theme. Primitives: `<Reveal>`, `<RevealObserver>`, `useReveal`,
  `<StatusChip>`, `<ToneChip>`, `<Mono>`, `<CoditusMark>`, `<CoditusLockup>`, plus `lib/work-items.ts`
  for the status vocabulary and grouping hues. `/dev/tokens` renders everything in both themes.

  Three real defects found and fixed while verifying, all recorded in `05-DECISIONS.md`:
  the Framer-based `<Reveal>` server-rendered content at `opacity: 0`; Tailwind silently pruned the
  `[data-reveal]` rules and their keyframes out of the build; and shadcn's `accent` token collided with
  the brand action colour. `scripts/verify-tokens.sh` greps the **built** CSS so the pruning trap
  cannot come back unnoticed.

  Known interim state: `app/(marketing)/layout.tsx` pins the old landing sections to light, and they
  still prerender at `opacity: 0` via the legacy Framer reveal and leave `will-change` pinned. Both go
  away in step 12/13; `verify-tokens.sh` reports it as a WARN, not a failure.
  **Next: step 4 — Supabase schema, triggers, views, indexes, RLS, auth, middleware.**

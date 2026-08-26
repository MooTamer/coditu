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
| 3 | **Tokens and primitives** — `globals.css`, Tailwind theme, fonts, `<Reveal>`, `<StatusChip>`, `<Mono>`, `<CoditusMark />` | `done` | `7b72821` | `npm run lint && npm run typecheck && npm run build && ./scripts/verify-tokens.sh`; `/dev/tokens` in both themes |
| 3b | **Legacy asset deletion** — `public/logo*.svg`, `logo-wordmark.*`, the Strukture `og/` set. Deferred by §1 to *after* the Coditu marks are wired in | `done` | `fd49508` | files gone; zero references repo-wide; every raster re-rendered from `public/brand/` by `npm run brand:assets` |
| 4 | **Supabase** — migrations, enums, triggers, views, indexes, RLS, `allowed_emails`, auth, middleware | `done` | `7835f6e` | `npm run db:test` (40 assertions) + `npm run test` |
| 5 | **Seed** — clients, projects, Week 17 with `COD-140`…`COD-151` exactly as in the bundle, plus a closed Week 16 | `done` | `f0aecc4` | `npm run db:test` — `supabase/tests/seed.sql`, 20 assertions incl. **16.0 / 46.0** |
| 6 | **App shell** — rail, topbar, project switcher, routing, theme, empty states | `done` | `acc2b54` | full gate; `/app` redirects to the active sprint and renders 16.0 / 46.0; no-sprint state renders with Export `disabled` + tooltip |
| 7 | **Sprint table** — columns, chips, sticky, grouping, sum row, URL filters, mobile cards | `done` | `69a77bd` | sum-equals-database test; container-query test at 320px |
| 8 | **Item detail** — intercepting route, properties, criteria ring, log time, activity | `done` | `0631a5f` | `npm run e2e` — 9 specs: interception, focus trap, focus return, ring ratio, criterion write, time-log round trip, cross-project 404 |
| 9 | **Comment thread** — composer, code, images, mentions, notifications, server-side JSON rendering | `done` | `34d54c9` | `npm run test` (43) + `npm run e2e` (31) — 10 hostile-JSON specs and 6 composer specs |
| 10 | **Board, My work, People, Import** | `done` | `d5ebdba` | `npm run test` (68) + `npm run db:test` (63) + `npm run e2e` (37) — importer flags `"1a"` before writing anything |
| 11 | **Export** — CSV, Markdown, PDF, item selection, persistence | `done` | `5dce4f9` | `npm run test` (86) + `npm run e2e` (50, twice back to back) — golden-file CSV and Markdown; scoping proven at three levels; a real 3-page PDF read back with `pdftotext` |
| 12 | **Marketing site** — sections, trace, work modal, metadata, brand assets | `done` | `fd49508` | `npm run e2e` — 15 marketing specs: section order, heading order, nothing invented, JSON-LD matches the page, focus trap, no-JS, reduced motion, **axe clean in both themes**; zero horizontal overflow at all 13 widths |
| 13 | **Motion pass** — every tier applied, reduced-motion verified, no `will-change` left pinned | `done` | `f058177` | `npm run e2e` — 9 motion specs asserting computed style: no pinned `will-change` on either surface, nothing blur-animated past 40vh, no per-row blur on filter, the scrim resolves and the panel trails it, reduced motion complete; `./scripts/verify-tokens.sh` greps the built CSS for all of it |
| 14 | **Performance and a11y pass** — budgets asserted in CI, Lighthouse ≥ 95, axe clean | `done` * | pending | `npm run e2e` — 14 a11y specs: **axe clean** on table, detail, composer, export dialog, my-work, people, import, login, both themes; zero overflow at 13 widths + 200% zoom; 44px targets; keyboard traversal. `npm run budgets` OK. `npm run lighthouse` — a11y/best-practices/SEO **100**, Performance **93** vs 95 (see below) |

---

## Definition of done (§14) — final gate

- [x] `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run db:test` all pass clean
- [x] TypeScript strict. Zero `any`. Zero unexplained suppressions
- [x] Zero horizontal scroll at 320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560 — and at 200% zoom
- [x] Full keyboard traversal of site and app, including drag reorder and the mention list
- [x] `prefers-reduced-motion` fully functional, no transforms, no blur
- [x] Contrast verified with a tool for every text/background pair in both themes; §3 figures do not regress
- [ ] Lighthouse ≥ 95 on all four categories for the marketing route; route JS within budget — **a11y/best-practices/SEO 100, Performance 93.** See the note under the table
- [x] Every RLS policy has a passing positive **and** negative test
- [x] The sprint footer sum equals the database in a test, including after an optimistic update rolls back
- [x] Export scoping test proves one project's export can never contain another's items
- [x] Comment rendering is proven inert against hostile stored JSON
- [x] PDF renders with embedded fonts, running header and footer, no orphaned item headings, no internal-only fields
- [x] The word "Strukture" appears nowhere in code, copy, metadata, README, or assets; legacy assets deleted. **The repository directory is still named `Strukture-Digital`** — see below
- [x] No fabricated testimonials, metrics, client counts, or logos
- [x] `.env.example` complete; `SUPABASE_SERVICE_ROLE_KEY` referenced only from server-only modules; no secret in a client bundle
- [x] `CLAUDE.md` and this file accurate as of the final commit; `docs/05-DECISIONS.md` records every judgement call

---

##  * The two things that need a decision, not a fix

**1. Lighthouse Performance is 93, not 95.** Accessibility, Best Practices and SEO are all 100. Every
performance sub-metric passes — CLS 0.000, TBT 7ms — and the whole gap is Lighthouse's *simulated*
LCP. Measured under the condition §5 actually names (mid-tier Android, 4G: 4x CPU, 1.6Mbps, 150ms
RTT) the page reaches LCP in **1020ms** against a 2000ms budget. The cause is the same as the JS
budget: `/login`, which is one small form, already costs 138.7KB gzipped, and `react-dom` alone is
68.5KB. This repository's own marketing code is 13.9KB of the 152.6KB total. Reaching 95 means
changing the stack for `/`, not the code in it.

**2. The repository directory is still named `Strukture-Digital`.** Nothing ships with the name — no
copy, no metadata, no asset, and a test asserts it. But the dev server inlines the absolute project
path into React owner stacks, so it appears in dev HTML, and the folder itself is the last trace.
Renaming touches the remote, CI, and any deploy hook, so it is left to whoever owns those.

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
- **2026-08-20** — Step 4 done. Eight migrations under `supabase/migrations/`: enums and the fixed
  display order, profiles + the `auth.users` allowlist trigger, the client→project→sprint scope chain,
  work items with the minutes rollup, the comment thread with mention materialisation and the activity
  triggers, indexes and two `security_invoker` views, the authorization helpers, and RLS.
  `supabase/tests/rls.sql` holds **40 pgTAP assertions, positive and negative for every policy** —
  `npm run db:test` is green. `tests/status-order.test.ts` (12 Vitest assertions) proves the SQL and
  TypeScript status vocabularies agree by reading the migration, so it runs without a database.
  `lib/supabase/{server,client,admin,env}.ts` and `middleware.ts` are in; `.env.example` documents
  everything and `.env.local` is gitignored.

  Two real bugs caught by the negative tests, both of which would have shipped:
  `handle_new_user` cast to an unqualified `app_role` under `search_path = ''`, which breaks **every
  sign-up**; and `work_item_key_seq` collides with explicitly-seeded keys unless the seed `setval`s.
  Both are written up in `02-DATA-MODEL.md`.

  Local stack note: this project runs on ports **544xx**, not the default 543xx, because another local
  Supabase project holds those; analytics is disabled because its log container needs a host
  `docker.sock` that Colima cannot provide.
  **Next: step 5 — seed EVIM Week 17 (COD-140…151) and a closed Week 16, asserting 16.0 / 46.0.**
- **2026-08-20** — Step 5 done. `supabase/seed.sql` transcribes EVIM Week 17 from the bundle:
  12 items `COD-140`…`COD-151` with their statuses, types, groupings, estimates, deadlines,
  14 acceptance criteria, 4 comments and 7 time entries, plus the sprint notes attributed to Adam.
  Four clients and four projects — only EVIM has a sprint, so the no-sprint empty state has something
  real to show. Week 16 is nine synthetic closed items, labelled as synthetic in the file.
  `supabase/tests/seed.sql` adds 20 assertions; `npm run db:test` now runs **60**.

  The bundle contradicts itself on per-person hours: attributing every entry to its item's assignee
  gives Mohamed 13.0h while the avatar tooltips say 12.5 / 3 / 0.5. Attributing COD-141's half hour to
  Ahmed reconciles per-item sums *and* per-person totals, and it is the only assignment that does.
  Both totals still land on 16.0 / 46.0.

  The RLS suite had to be made self-scoped — its fixtures collided with the seed and its counts were
  absolute. Fixture rows are now `RLS-*` / `@rls.test`, counts are scoped, and the test no longer calls
  `setval` (sequences are not transactional, so it would have survived the rollback).
  **Next: step 6 — app shell: rail, topbar, project switcher, routing, theme, empty states.**
- **2026-08-20** — Step 6 done. `/login` (split layout, password + magic-link fallback, both through
  Server Actions), the `/app` shell (72→240px pinned rail, 60px topbar, project switcher, theme
  toggle), `/app` routing to the active sprint, `/app/projects`, `/app/projects/[slug]`, and the
  no-sprint empty state. Remaining views are placeholders that name step 10 rather than 404.
  Data reads go through `lib/data/projects.ts` (React `cache`d) and `lib/format.ts`, where invariants 2
  and 5 are actually enforced — `tests/format.test.ts` covers both. `npm run test` is at **27**.

  Verified end to end against the real database: `/app` 307s to
  `/app/projects/meinevim/sprints/17`, which server-renders **16.0 / 46.0 h** across 12 items, and
  `/app/projects/nile-atelier` renders the no-sprint screen with Export carrying `disabled` and
  `title="No sprint to export for Nile Atelier"`.

  Two bugs found by verifying rather than assuming: seeding `auth.users` without the token columns
  makes **every sign-in** fail with a misleading "Database error querying schema"; and the EVIM mark
  was invisible because an `<img>`-loaded SVG cannot inherit `currentColor` and that file's `<defs>` is
  empty. Both in `05-DECISIONS.md`.
  **Next: step 7 — the sprint table.**
- **2026-08-21** — Step 7 done. The sprint header (client pill, status distribution with a real
  `aria-label`, burn-up computed from actual time entries, collapsible attributed notes with the amber
  highlight rule), the filter bar with view mode and status held in the URL, the full table (sticky
  header and task column, opaque per-group sticky backgrounds, grouping border and tint, optimistic
  status popover, pinned sum row), the container-query card layout, and the board.

  Mutations land in `lib/actions/work-items.ts` — zod, a server-side authorization re-check, then the
  write, with the project re-derived from the item's own sprint every time. The reorder action also
  verifies every id in the payload belongs to the same sprint, since `order_index` is one of the two
  columns an engineer may write.

  Playwright is set up (`npm run e2e`) with 7 specs. The headline one reads the totals out of Postgres
  and compares them to what the browser rendered, so nothing between the two can drift unnoticed.

  Three bugs found and fixed: dnd-kit put `<div>`s inside `<table>` and mismatched ids across
  hydration; `minmax(280px, 1fr)` overflowed at 320px; and the topbar's right-hand controls were
  pushed off-screen and *clipped* — no scrollbar, just unreachable buttons.
  **Next: step 8 — item detail as an intercepting route.**
- **2026-08-21** — Step 8 done. `@modal` + `(.)items/[key]` intercepts a soft navigation into a
  dialog; a hard navigation renders the full page. Both call the same `ItemDetailBody`, so they cannot
  drift. The modal traps focus, closes on `Esc`, locks body scroll (compensating for the scrollbar so
  the page does not jump), and **returns focus to the row that opened it**.

  The gradient criteria ring is the bundle's `r=15` / `stroke-dasharray="94.2"`, driven by the real
  ratio and optimistic on toggle. Log time steps in half hours and posts integer minutes. Properties,
  comments and the activity feed all render; the comment body is the flattened `body_text` until step 9
  brings the JSON walker.

  `getWorkItem` looks up by key **and** project slug **and** sprint number together — asking for
  `/projects/nile-atelier/sprints/1/items/COD-140` 404s rather than rendering EVIM's item under Nile
  Atelier's heading. There is a test.

  One bug: item links were relative (`items/COD-140`), which resolves against the parent directory and
  404'd on every row. They are absolute now.
  **Next: step 9 — the comment thread.**
- **2026-08-21** — Step 9 done. `components/app/comment-body.tsx` renders stored comments by walking
  the ProseMirror JSON into React elements — no HTML string, no `dangerouslySetInnerHTML`, fail-closed
  on unknown nodes. Code blocks are highlighted server-side with lowlight, whose hast output is walked
  the same way rather than serialised. TipTap is dynamically imported, verified against a **production**
  build (`npm run e2e:prod`) since the dev server eagerly loads dynamic chunks.

  `e2e/comments.spec.ts` attacks the renderer with documents written straight into `body_json`: a
  script node, markup as text, a `javascript:` link, a `data:` image, event-handler attributes, 3,000
  levels of nesting, and a malformed document. All ten pass.

  Four real bugs, all caught by tests rather than review:
  a recursive zod schema overflowed the stack **before** the depth guard ran (a DoS from a comment box);
  ProseMirror's null-prototype `attrs` are dropped silently by React's Server Action serializer, so
  every mention lost its profile id; the focus trap missed `[contenteditable]` and used `offsetParent`
  as a visibility test; and the composer opened on `onFocus`, dropping focus to `<body>` mid-tab.
  **Next: step 10 — Board, My work, People, Import.**
- **2026-08-21** — Step 10 done. `/app/my-work` (assigned, review queue, mentions with an unread dot
  in the rail), `/app/people` (load against capacity, framed as capacity rather than a target), and
  `/app/import` — a Notion CSV importer with a hand-written RFC 4180 parser, preview-then-commit, and
  the same code running both so what you approve is what gets written. The board landed with step 7.

  The importer refuses to guess: `"1a"` grouping, an ambiguous `04/13/2026`, an unknown assignee, a
  status it does not recognise — each flags its row, names its column, and skips. Hours convert to
  integer minutes at the boundary. 25 new unit tests cover the parser and every mapper.

  One real bug: **`v_person_load` reported Mohamed at 62.5 h against a 40 h capacity** on a sprint
  totalling 16. Joining `work_items` and `time_entries` in one query multiplied each person's hours by
  their item count. The counts were fine — they used `count(distinct)` — so only the hours were wrong,
  and wrong by a number that looks like a hard week. Fixed by migration; asserted in both pgTAP and e2e.
  **Next: step 11 — export (CSV, Markdown, PDF).**
- **2026-08-21** — Step 11 done. Three formats from one payload builder: CSV (RFC 4180, BOM, stable
  column set — an Include toggle blanks a value rather than dropping a column, so the file stays an
  import target), Markdown with the facts front-loaded, and a PDF that is the `…/report` route printed
  by headless Chromium rather than a second template. The dialog previews the real output live,
  remembers the selection under `coditu.export.v1`, and offers quick actions for the subsets the team
  actually exports.

  Scoping is proven at three levels: unit (the generators only render what they are handed), route
  (`?items=COD-900` under EVIM yields an empty report headed "Prepared for EVIM", not Nile's item),
  and database-driven (every work item outside the sprint is enumerated and asserted absent from the
  rendered export). A real 112 KB, 3-page PDF was read back with `pdftotext`: running header and
  footer, "Page 1 of 3 / 2 of 3 / 3 of 3", humanised statuses, German text intact, and no `COD-` keys,
  reviewer names, per-person hours or internal comments anywhere in it.

  Four bugs, all in `05-DECISIONS.md`: `counter(page)` in a fixed element prints "Page 0 of 0";
  `document.fonts.ready` cannot cross `page.evaluate`, so the print never waited for fonts; the print
  rule hid the chrome with a sibling selector that could not match; and the dialog's quick actions
  silently did nothing if clicked before the item list arrived.

  The e2e suite itself had a defect worth more than any of those: it passed, then failed, then passed.
  Mutating tests were racing the tests that assert `16.0 / 46.0` against a live database read, and were
  leaving writes behind so the *second* run failed on a database the first one dirtied. Tests that move
  a sprint total now take a Postgres advisory lock exclusively and readers take it shared. Verified by
  running the suite twice back to back — 50 passed, 50 passed, database back at its seed values.
  **Next: step 12 — the marketing site, and with it the last 13 "Strukture" strings.**
- **2026-08-21** — Steps 12 and 3b done. The marketing site is rewritten under Coditu from
  `Coditu Site.dc.html`: hero with the per-word entrance and the routed-signal panel, the work gallery
  with a shared-element case-study modal, services, process, use cases, team, delivery notes, FAQ, and
  the contact block. Sections run in the **brief's** order, not the bundle's, and the rule numbers
  follow. `components/landing/` (2,658 lines of pre-Coditu code) and `lib/icon-map.ts` are deleted.

  The signature device is `components/site/signal-trace.client.tsx` — a scroll-linked path in the left
  gutter that threads the page and doubles as reading progress. It renders only at ≥1420px, because
  below that there is no gutter and a rail crossing body copy reads as a fault. Its section nodes are
  placed with `getPointAtLength` on the path, so they sit *on* the curve where it weaves.

  Everything else about the page is a Server Component. The only client code is the nav, the trace, the
  hero's pointer drift, the work modal, the FAQ, and one page-level `<RevealScope>` observer.

  `app/(marketing)/layout.tsx` is gone: the site follows the reader's theme like the rest of the
  product, verified in both. Metadata, JSON-LD (`Organization` + `WebSite` + `FAQPage`), `robots.ts`
  and `sitemap.ts` are Coditu's, and a test asserts that every person and question in the structured
  data is also visible on the page — marking up what a reader cannot see is how structured data turns
  into a lie.

  `npm run brand:assets` renders `favicon.ico` (16/32/48), `apple-touch-icon.png`, `icon-192`,
  `icon-512`, `icon-maskable-512`, `og.png` and `og-square.jpg` from `public/brand/` — in headless
  Chromium, because Satoshi is self-hosted and an SVG rasteriser would silently substitute a system
  sans. Every legacy Strukture asset is deleted and the README is rewritten.

  Four bugs, three of them mine and one inherited: the per-word headline spans swallowed their own
  trailing whitespace and rendered "Webuildportals"; `[data-reveal-on-view]` had nothing to release it
  on this page, so 28 elements would have stayed invisible; reduced motion still gated content behind a
  scroll, which is the wrong risk to hand that reader; and axe sampled a headline word mid-fade and
  reported a contrast failure that does not exist.

  One false alarm worth remembering: a `globals.css` rule appeared to have been pruned from the served
  stylesheet, exactly like step 3. It was a stale Turbopack dev cache. Restart the dev server before
  concluding a rule was dropped.

  **Needs attention:** this checkout's directory is still literally named `Strukture-Digital`, which
  the dev server leaks into React owner stacks. Nothing ships with it, but the repository should be
  renamed. **Next: step 13 — the motion pass.**
- **2026-08-21** — Step 13 done. Every tier is now actually applied, and asserted against **computed
  style** rather than source — the failures in this area are all silent ones.

  The `micro` tier had been defined and used nowhere. Status chips and criteria ticks now carry it,
  keyed on their own value so a *change* re-runs the animation: an optimistic status write is exactly
  the moment a reader needs an acknowledgement, and without the key the new colour just appears.
  Filter pills and row hover got a 200ms transition instead, because a pill is not arriving anywhere.

  Backdrops resolve rather than snap — `[data-scrim]` takes opacity 0→1 and `backdrop-filter`
  blur(0)→blur(10px) over 240ms, with the panel one frame behind so it reads as arriving *through* the
  backdrop. All three dialogs share it.

  Two real §4 violations, found by measuring: the sprint header (409px) and the table group (720px)
  were both blur-animating past the ~40vh ceiling. The header now staggers its three columns, which is
  §4's own remedy. The table cannot — §4 also forbids per-row reveals — so it keeps its single group
  and drops the blur via `data-reveal-flat`. Both are in `05-DECISIONS.md`.

  Framer Motion is uninstalled: every entrance here is CSS, and the last two importers were type-only
  helpers nothing called. `verify-tokens.sh` now fails, rather than warns, on prerendered `opacity:0`,
  and greps the built CSS for the flat variant, the scrim, and all four reduced-motion rules — the
  reduced-motion block being where a dropped rule is least likely to be noticed, since nobody testing
  on a normal machine ever sees it.

  **Next: step 14 — performance and accessibility.**
- **2026-08-21** — Step 14 done, with one item that needs a decision rather than a fix (see the
  section above the session log). Fourteen accessibility specs: **axe clean** on the sprint table,
  item detail (page and modal), composer, export dialog, my work, people, import and sign-in, in both
  themes; zero horizontal scroll at all thirteen widths and at 200% zoom, on the site and the app;
  44px targets on a coarse pointer; every icon-only control named; a full keyboard traversal that
  fails if any focused control has no visible ring; and a check that no `100vh` survives anywhere.

  Four real defects, all found by the tool rather than by reading. dnd-kit's `role="button"` was on
  the `<tr>`, so twelve rows were `nested-interactive` — a screen reader announced each row as a
  button and the link and status popover inside it became noise; the drag path is a real handle now,
  via `setActivatorNodeRef`. The row title links were under WCAG 2.5.8's 24px minimum. The export
  preview scrolled without being focusable. And two file inputs were unlabelled.

  Performance: `npm run budgets` measures each route in a real browser against a production server and
  gates on the route's own cost over a measured framework floor — marketing is 13.9KB of a 152.6KB
  total, the app shell 32.4KB of 171.2KB and inside its own §5 budget outright. §5's 130KB marketing
  figure is below the floor on this stack and is reported every run rather than restated.

  The one measurable win: the hero's entrance delays were costing **1.5 seconds of LCP**. Held at
  `opacity: 0` by `animation-fill-mode: both`, the bundle's 280/340/420ms delays put LCP at 2600ms; on
  §4's own 75ms stagger scale it is 1020ms. Satoshi 900 was also preloaded on every page load and used
  nowhere.

  `npm run lighthouse` runs three times and asserts the median, because on an identical build
  Lighthouse returns Performance 93–97 — a single run credited an earlier change with an improvement
  that was noise. Accessibility, Best Practices and SEO are 100; Performance is 93.

  CI is wired: lint, types, unit, RLS, build, `verify-tokens.sh`, e2e against dev *and* production,
  and the budget check. Lighthouse reports rather than gates, for the reason in `05-DECISIONS.md`.

  **The fourteen steps of §13 are complete.**
- **2026-08-21** — Final pass. One last defect, caught by looking at the rendered page rather than the
  tests: the burn-up's "46.0 est" label was drawn four units above the estimate line, which at 8px
  type puts its ascenders outside the viewBox — it rendered sliced in half, in both the app header and
  the client PDF, with nothing in the DOM to suggest anything was wrong. The estimate line now leaves
  the label headroom, and `sprint-table.spec.ts` measures the label's `getBBox()` against the viewBox
  so it cannot come back.

  Full gate green from a clean tree: lint, typecheck, 86 unit, 63 pgTAP, build, `verify-tokens.sh`,
  88 e2e against dev, 89 against production, budgets OK. The client PDF re-read with `pdftotext`:
  three pages, correct running header and footer, humanised statuses, and no `COD-` key, reviewer
  name, per-person hour or internal comment anywhere in it.
- **2026-08-21** — Two features from the brief were missing and had never been tracked: the **command
  palette** (§8) and **realtime** (§5, §8). The app had been reported finished with a topbar button
  carrying a `⌘K` badge that did nothing. Both are built now, and the requirements inside §5 and §8 —
  as opposed to the fourteen steps of §13 — are the gap that let it happen.

  The palette does what §8 asks: jump to a project, sprint or item; and on an item, change its status,
  assign it, or log time. Fuzzy matching is a subsequence over keys and titles, so `tbwc` finds "Tabs
  with Cards". Its data loads on first open, through a Server Action, so RLS scopes it and it costs
  nothing on a page load. Nine specs cover it, including axe.

  Realtime subscribes to the active sprint and the open thread only, coalesces bursts through a 120ms
  buffer, and unsubscribes on unmount — asserted on the wire by watching for the `phx_leave` frame
  after a client-side navigation. The headline test writes a row **directly into Postgres** and
  asserts it appears in the browser and that the footer sum recomputes.

  Two real bugs found on the way. `todayInCairo` lived in a `server-only` module, so the palette
  importing it poisoned the client bundle. And step 13 had silently **removed the backdrop blur from
  all three dialogs**: Lightning CSS drops `backdrop-filter` entirely when a manual `-webkit-` prefix
  follows it, and the step 13 test asserted the animation's *name* rather than its *effect*, so it
  stayed green through the regression. Both are in `05-DECISIONS.md`.

  Gate: 86 unit, 63 pgTAP, **97 e2e** (twice, clean), build, `verify-tokens.sh`, budgets.
- **2026-08-21** — Connected to the hosted Supabase project. All ten migrations pushed through the
  session pooler; every table has RLS enabled with policies, both views exist, and the realtime
  publication carries `work_items` and `comments`. Seeded, and verified against the remote database:
  **16.0 / 46.0 across 12 items**, per-person load summing to exactly the sprint total, and the four
  accounts with their right roles.

  A production build run against it end to end: sign-in, `/app` redirecting to the active sprint, the
  table rendering 16.0 / 46.0 from the remote data, and the client PDF generating at three pages with
  correct pagination and no leaked keys, reviewer names, or internal comments. The `service_role` key
  is absent from every client chunk.

  Production config is `.env.production.local`, which Next loads only for production builds, so dev
  and the whole test suite stay on the local stack. `scripts/with-prod-server.sh` now **refuses to
  start** unless the database is local — it runs a real `next build`, and the suite it hosts deletes
  rows. Suite green against both: 97 on dev, 98 on the production build.
- **2026-08-21** — Invite-only sign-up, end to end. `/login` gained a "Create account" mode; the
  `signUp` action checks the allowlist first so an uninvited person is told they are *not authorized*
  rather than shown GoTrue's bare `500 Database error saving new user`. `/app/settings` was still a
  "lands in step 10" placeholder — it is now the admin allowlist manager: invite with an optional
  note, see who has actually signed up, withdraw an invite. Non-admins get an explanation, not a
  broken page. Seven specs, including one that bypasses the app entirely and inserts straight into
  `auth.users` to prove the trigger is the real gate, and one that shows an engineer cannot write the
  allowlist by calling PostgREST with their own token.

  `mohamedtamer200200@gmail.com` is provisioned as an admin on both databases.

  Adding a second "Mohamed Tamer" broke three things, each a real defect the fixtures had been hiding:
  the seed assertions used `initials` as an identifier; the importer resolved assignees through
  `new Map(name → id)`, which silently keeps the last duplicate; and — the serious one — the importer
  **attributed time entries to the row's assignee and discarded the insert's result**, so every
  imported row belonging to anyone but the person clicking Commit lost its hours and the sprint total
  was quietly short. All three are in `05-DECISIONS.md`.

  Gate: 86 unit, 63 pgTAP, **105 e2e** (twice, clean).
- **2026-08-21** — Repository moved to `MooTamer/coditu` (private) so it can deploy from its owner's
  account; the previous remote is kept as `abdelrahman`. CI running on Linux from a clean seed then
  found six things that had only ever worked on one machine — `verify-tokens.sh` reading an arbitrary
  CSS chunk, a `mktemp` that GNU refuses, eslint linting the Supabase CLI's scratch directory, a test
  whose payload overflowed the stack while being built, a test leaning on a hand-added profile, and a
  race in the signal-trace assertion.

  The most consequential was the **JS budget measuring the machine rather than the build**: it read
  171KB locally and 303KB on CI for the same commit, because it stopped listening before two 65KB
  chunks arrived. Fixing the measurement exposed a real regression — realtime had put
  `@supabase/supabase-js` and its zod-based env validator on the critical path of every `/app` page,
  ~128KB gzipped. The client is lazily imported now and `lib/supabase/env.ts` is zod-free, taking the
  app shell from 302.6KB to **239.5KB**. The editor check, which matched content-hashed filenames
  against `/tiptap|prosemirror/`, could never have gone red; it reads chunk bodies now.

  Gate: 86 unit, 63 pgTAP, 105 e2e, budgets OK.


- **2026-08-21** — Compression audited on the wire, and pinned down. Every text response this app
  serves is gzipped by Next's own server and every already-compressed one is left alone. That was
  true before this session; it is now asserted rather than assumed. `e2e/compression.spec.ts` measures
  the marketing document at **130,858 bytes identity against 23,939 on the wire**, checks the RSC
  payload, a Server Action result, and every `/_next/static` chunk over 1KB, and checks that woff2,
  AVIF and the 112KB PDF are *not* run through gzip a second time. It reads bytes through `node:http`
  rather than Playwright, because Playwright decodes `Content-Encoding` before you can see it — a
  test written against it can only read the header and take the size on faith.

  There is no brotli, and there will not be one here: `next start` compresses through the vendored
  `compression` package, which speaks gzip and deflate only, so a client offering `br` alone gets all
  130,858 bytes. The deploy target is Vercel, whose edge adds brotli in front of this server and
  ignores custom servers anyway. `05-DECISIONS.md` carries the table and the reasoning.

  One pre-existing defect fixed on the way, in its own commit: the reduced-motion spinner check
  navigated to `/dev/tokens`, which `notFound()`s in production, so it passed under `npm run e2e` and
  could never pass under the production run CI does immediately afterwards.

  Gate: lint, typecheck, 86 unit, **115 e2e against dev and 115 against the production build**.

- **2026-08-21** — Reordering a sprint is one statement now. `public.reorder_work_items(uuid, uuid[])`
  renumbers the whole list with `update … from unnest(…) with ordinality`, SECURITY INVOKER so RLS
  still decides which rows may move. Measured in `pg_stat_statements`: one drag of a twelve-item
  sprint went from **twelve UPDATE statements to one**, and from fifteen PostgREST round trips to two.

  The speed was the smaller half. The loop was hiding two real defects. Nothing made the writes
  atomic, so a failure part-way left the sprint half-renumbered under a message that said nothing was
  lost. And **RLS does not raise on a row it filters out** — it updates nothing and reports success —
  so an engineer reordering a sprint wrote the rows they were assigned, skipped everyone else's, and
  was told it had worked. The function counts what it moved and rolls the whole thing back unless
  every row moved; `rls.sql` proves it with an engineer who can move exactly one of two rows and
  therefore moves neither. The action also re-checks the role now, which every other lead-only
  mutation in that file already did.

  There was no test that a drag persisted — only that it was announced. There is one now: it performs
  the keyboard drag, asserts the order against Postgres, asserts every index is contiguous from zero,
  and restores the sprint in a `finally`. Getting it right took two goes: retrying the whole
  Space-Arrow-Space sequence could drop the row twice, once after the restore had already run, which
  is the same class of leftover-write race the advisory lock was introduced for.

  The Notion importer was checked and deliberately left alone — PostgREST sends a 300-row insert as
  **one 941-character statement** with the rows as a single JSON parameter, so there is no oversized
  statement to chunk and chunking would only cost the atomicity it has today. Both in
  `05-DECISIONS.md`.

  Gate: lint, typecheck, 86 unit, **71 pgTAP** (was 63), build, **117 e2e twice against the production
  build and twice against dev**, seed back at 16.0 / 46.0 with its original order after every pass.

- **2026-08-21** — A degraded Supabase no longer takes the marketing site with it. `middleware.ts`
  matched everything that was not a static asset and called `supabase.auth.getUser()` on every one of
  those requests — a live round trip to GoTrue, by design, because `getUser()` revalidates where
  `getSession()` only trusts the cookie. The matcher is `/app/*` and `/login` now, and what remains
  runs behind a 2.5s deadline and a circuit breaker that fails **closed**.

  `npm run degraded` proves it by pausing the gateway container, so it accepts connections and answers
  nothing — the failure that actually hurts, rather than a refused connection that fails in a
  millisecond. Before and after, same build, same outage:

  | While the auth server answers nothing | Before | After |
  |---|---|---|
  | `GET /` — signed-in reader | **hung, nothing at 15s** | 3–11ms |
  | First `GET /app` | **hung, nothing at 15s** | 2.5s → `/login` |
  | Subsequent `GET /app` | **hung, every one** | 3ms → `/login` |
  | Recovery | — | automatic, no restart |

  The asymmetry worth remembering: an **anonymous** visitor was fine all along, because gotrue-js
  answers "no session" from the cookie without touching the network. It was signed-in readers — the
  team, on their own marketing site — who paid a live auth call per page and hung outright.

  Chromium got the same treatment. The PDF route launches a browser per request, and that browser
  visits this server as a second client, so it is slowest exactly when the database is slow — and
  nothing stopped a dozen of them existing at once. Bulkhead of two, 45s ceiling, 10s launch timeout,
  20s page timeout, and a 503 that distinguishes "two are already rendering" from "rendering is
  unavailable". Four simultaneous Export clicks now produce two PDFs and two refusals in under a
  second, instead of four browsers.

  `lib/circuit-breaker.ts` is ~120 lines with no dependencies — it runs in the Edge runtime and sits on
  every request into the app. Its own tests caught the flaw that matters most: a deadline that only
  aborts a signal releases nobody when the work ignores the signal, which is exactly Playwright's
  page methods. It races the work instead, and holds the bulkhead slot until the abandoned work
  really finishes.

  **Deliberately not done:** page data reads are not behind a breaker. A failed read makes the data
  layer return null and the page call `notFound()`, so fast-failing an outage would tell a client
  their project does not exist. Fixing that honestly means distinguishing "absent" from "unreachable"
  through `lib/data/*` and adding the `error.tsx` boundaries this app has none of. Written up in
  `05-DECISIONS.md` rather than half-done here.

  Gate: lint, typecheck, **100 unit** (was 86), 71 pgTAP, build, 117 e2e against the production build
  and 117 against dev, budgets OK, `npm run degraded` OK.

- **2026-08-21** — Optimistic where it matters, and a rollback that actually runs. Logging time and
  posting a comment both awaited the write and then `router.refresh()`, so nothing moved until two
  round trips had finished. The running total now moves in **~130ms** — the probe's polling interval,
  not the server.

  The interesting part was underneath. Every optimistic control in the app was written as
  `const result = await action(); if (!result.ok) { rollback(); toast(...) }`, which handles the
  failure the action *reports* and not the one it cannot: a Server Action call is a `fetch`, and a
  lost network **rejects** it. Both the rollback and the sentence were skipped, the transition ended,
  `useOptimistic` reverted on its own, and the reader watched their change appear and vanish in
  silence — the exact thing invariant 4 forbids. `settle()` in `lib/action-result.ts` turns the
  rejection into a result so the existing rollback runs, and rethrows `redirect()` / `notFound()`,
  which Next implements by throwing. Eleven call sites.

  `CommentThread` takes the server-rendered thread as `children` rather than rendering it: walking
  stored JSON is `comment-body.tsx`'s job and it pulls in lowlight, which has no business in a browser
  bundle. The pending comment is flattened text marked "sending…". Whole pass measured at **0.1KB**
  on the app shell.

  Two things the tests taught, both invisible by reading: state set inside `startTransition` is
  deferred until the transition settles, so clearing the composer in there left the words in the box
  *underneath a copy of themselves* in the thread; and a rollback is only real if you have watched it
  run, so `e2e/optimistic.spec.ts` aborts the action's POST at the network and asserts the total goes
  back, the draft returns to the editor, the sentence is on screen, and nothing was written.

  **Worth flagging:** the app shell is now **106.6KB of its 110KB** gate. 6.1KB of that arrived with
  the merge from main (inline cell editing, the dialog shell, the team panel); 0.1KB is this. The next
  feature on that route will need budget headroom found for it first.

  Gate: lint, typecheck, 103 unit, 71 pgTAP, build, **155 e2e against the production build**, budgets
  OK, seed back at 16.0 / 46.0.

- **2026-08-21** — One sprint page view was running **twenty-eight other page renders**. Next prefetches
  every `<Link>` in the viewport, and a prefetch of a dynamic route is a full server render of it: a
  sprint has twelve item rows and five rail links always in view, each fetched twice. Then the client
  discarded all of it — `staleTimes.dynamic` defaults to **0**, so a prefetched dynamic payload is
  stale on arrival and the click re-fetches anyway.

  `prefetch={false}` on those links. Measured against a production build, `pg_stat_statements` reset
  immediately before each run:

  | one sprint page view | RSC renders | db statements | open an item | rail navigation |
  |---|---|---|---|---|
  | before | 28 | 178 | 210ms | 269ms |
  | after | **0** | **40** | 206ms | 277ms |

  **77% fewer database statements per page view, and nothing anyone can feel** — the navigation
  numbers are twelve samples each, and 8ms across 270ms is noise. It was the number the prefetch
  existed to improve.

  `experimental.staleTimes.dynamic` is the other fix — keep the prefetch and let the router serve a
  tree up to N seconds old — and it is rejected in `05-DECISIONS.md`: this is a live board with
  realtime subscriptions, and the footer total is trusted because it is never out of date.

  The one thing here that genuinely *is* cached is `/`, prerendered at build. `npm run budgets` now
  fails if it stops being — one `cookies()` anywhere in the marketing tree ends it, and nothing else
  would notice. Verified capable of failing by forcing the route dynamic and watching it go red.

  Gate: lint, typecheck, 103 unit, 71 pgTAP, build, **155 e2e against the production build and 155
  against dev**, budgets OK including the new assertion, `npm run degraded` OK.

- **2026-08-21** — Two auth defects, one of them live. **A sign-up could choose its own role.**
  `handle_new_user` read it from `raw_user_meta_data`, which is `options.data` on
  `supabase.auth.signUp` — client-written, public endpoint, anon key in the browser bundle.
  Reproduced before the fix: `{"data":{"role":"admin"}}` produced `profiles.role = 'admin'`. The app's
  own form never sends a role, which is exactly why nothing looked wrong; the form is not the boundary.
  Every account is an `engineer` now and promotion happens on `/app/people`. Fixing it demoted every
  seeded account until the seed and `pg_temp.make_user` were changed to state roles as an explicit
  `update` — they are privileged writers, not sign-ups. `rls.sql` has the negative case; **72 pgTAP**.

  **And `/auth/callback` never existed.** `sendMagicLink` had always pointed `emailRedirectTo` there
  and the login page had always offered to email a link — but there was no `app/auth/` directory,
  nothing in the route list, and no `exchangeCodeForSession` anywhere. The mail sent, the link 404'd.
  It is built now, with `/auth/update-password` behind it and "set or reset your password" on `/login`,
  because the four production accounts were seeded with one shared password and each owner needs their
  own without creating a second account.

  Two things only an end-to-end run could show. **Supabase silently ignores a `redirectTo` that is not
  on its allowed list** and substitutes the Site URL — the first run produced a link to
  `http://127.0.0.1:3000` instead of the callback, and it fails by *appearing to work*.
  `config.toml` lists `/auth/callback` now, the hosted project needs the same, and the spec asserts on
  the URL read out of the **delivered email** rather than on what was passed. And `emailRedirectTo`
  used the bare `NEXT_PUBLIC_SITE_URL`, which is unset on Vercel and produced a *relative* redirect.

  `e2e/password.spec.ts` drives the whole journey against the local mail server: request a link, read
  the mail, follow it, set a password, sign in with it in a clean browser, and confirm the old password
  is refused. Plus a dead link, and an open-redirect guard — `next` rides inside an emailed URL, and
  `//evil.example` is the case people miss.

  Gate: lint, typecheck, 103 unit, **72 pgTAP**, build, e2e green against dev and the production build.

---

- **2026-08-22** — The Notion workspace export is in. `scripts/import-notion-export.mjs` converts the
  team's own export into `supabase/seed.sql`: fifteen EVIM sprints, 104 items, 275 acceptance criteria,
  280 logged hours, 104 attachments, Converso as a fifth client. The design bundle's Week 17
  transcription and the synthetic Week 16 are retired. Four live secrets in the export are redacted and
  asserted absent. Full gate green — `db:test` 85, `test` 109, `e2e` 162, lint/typecheck/build clean.
  Two real bugs surfaced on the way: `/app/people` picks an arbitrary project's active sprint, and the
  item detail collapsed multi-line descriptions into one paragraph.
  **Next:** the export has landed locally only. Applying it to the hosted database, and scoping
  `/app/people` to a chosen project, are both still open — see `05-DECISIONS.md`.


## After §14 — the team's own requests

The fourteen steps are the build. This section is the change log for what the team asked for once
they were using it. Same rules: one change at a time, each with the command that proved it, the
ledger updated in the same commit as the work.

| Change | Commit | Verification |
|---|---|---|
| **Rail** — exactly one item is `aria-current`. `startsWith("/app/projects")` matched a sprint URL, so Projects and Sprint both lit up | `646f527` | `npx playwright test e2e/rail.spec.ts` — 4 specs |
| **Light is the default theme.** Supersedes the 2026-08-20 ADR; `05-DECISIONS.md` records it. Two axe specs that clicked "Switch to light theme" were auditing whichever theme the toggle happened to leave, so they set `localStorage.theme` now | pending | `npx playwright test` — 107 pass. The flip surfaced a real light-theme contrast failure in the work dialog (`--jade` on white, ~2:1); fixed to `--tone-jade-fg` |
| **Item modal** — the panel is capped at the scrim's content box and scrolls its own body. It used to grow to its content and let the scrim scroll, so a long thread rendered as a dialog sliced off by the bottom of the screen with the close button scrolled away above it | pending | `npx playwright test e2e/item-detail.spec.ts` — 10 specs, one asserting the dialog's box is inside a 1280×560 viewport, that Close stays in view after scrolling to the end, and that the overflow is real |
| **New item** works. The topbar button had no `onClick` at all. A `createWorkItem` action, and a dialog that asks which sprint rather than guessing from a URL the button is not tied to | pending | `npx playwright test e2e/new-item.spec.ts` — 5 specs: every field round-trips to the database, 2.5 h becomes 150 minutes, the item appends to the order, an engineer's button is disabled and PostgREST refuses their insert anyway, axe clean |
| **One dialog shell.** `DialogShell` owns the focus trap, `Esc`, scroll lock, focus return and the capped panel; the item modal is built on it. The export dialog got the same height cap | pending | `npx playwright test e2e/item-detail.spec.ts e2e/export.spec.ts` |
| **eslint was linting a git worktree under `.claude/`**, built `.next` and all — 998 errors and 15,241 warnings about compiled output. Same shape as the `supabase/.temp` bug in §14 | pending | `npm run lint` clean |
| **Sprint notes are editable** — click the prose, it becomes a textarea in the same place at the same size. Admin and lead only; the panel now renders for them even when the sprint has no notes, since that is where the first ones get written. Needed `sprints.notes_written_at`, recorded in `05-DECISIONS.md` | pending | `npx playwright test e2e/sprint-notes.spec.ts` — 5 specs: the write reaches the database with the editor as author, Escape abandons it, an engineer sees no control and PostgREST refuses their PATCH, axe clean mid-edit. `npm run db:test` — 63 |
| **Every column in the table edits in place.** Status, hours, assignee, reviewer, deadline, type and grouping each get a control that fills its whole cell; the task cell's link is stretched over its cell so clicking anywhere in it opens the item. Menus are portalled to `<body>` and positioned from the trigger — inside the table's `overflow: auto` the last row's menu was clipped in half | pending | `npx playwright test e2e/inline-edit.spec.ts` — 8 specs: each field reaches the database, the trigger really fills the cell, a click at the far edge of a column means that column, the last row's menu is fully in the viewport with every option hittable, an engineer sees values and a reason, axe clean with a menu open |
| **People is where the team is administered.** Every profile including deactivated ones, a role select and a two-step deactivate for an admin, and the sign-up allowlist moved here from Settings — deciding who may join, what they hold and whether they still have access is one job. Deactivate rather than delete: a profile belongs to an `auth.users` row and deleting it cascades through their time entries, which are what the sprint totals and an already-sent invoice are built from | pending | `npx playwright test e2e/team.spec.ts e2e/allowlist.spec.ts` — 13 specs: a role change reaches the database, deactivation needs two clicks and reverses, an admin has no controls on their own row, an engineer sees text, PostgREST refuses a non-admin's `role` PATCH, axe clean |
| **Sprints are managed on the project that owns them** — open one, edit its name and window, start, close, reopen, and delete it while it is still empty. Starting a second sprint while one runs is refused by name rather than silently closing the other; the empty-project screen now offers to open the first sprint instead of sending you back to the project list | pending | `npx playwright test e2e/sprint-manage.spec.ts` — 9 specs: a new sprint arrives `planned` and Week 17 keeps running, Start is disabled with the blocking sprint named, close/start/reopen all reach the database, a sprint holding 12 items refuses deletion and says so, an empty one deletes in two clicks, an engineer gets no controls and PostgREST refuses their insert, axe clean |
| **Outage, and the fix.** `sprints.notes_written_at` shipped ahead of its migration: it was applied to the local stack only, and every production sprint page threw `42703` (digest `718552063@E394`). The read and the write now tolerate the column being absent, so the app degrades to the pre-column behaviour instead of 500ing. **The migration still has to be applied to the hosted database** — see `05-DECISIONS.md`, which also records that nothing yet checks this before a deploy | pending | Column dropped locally to reproduce production exactly: sprint page HTTP 200, 12 rows, `16.0 / 46.0`, notes still editable and persisted. Re-applied, then `npx playwright test e2e/sprint-notes.spec.ts e2e/sprint-table.spec.ts e2e/inline-edit.spec.ts` green. `npm run test` — 89 |
| **Compression** — asserted on the wire: gzip on every text response, nothing already-compressed run through it twice. No brotli; that belongs to the edge | `ff5987d` | `npx playwright test e2e/compression.spec.ts` — 6 specs, green against dev and the production build |
| **Reorder** — one `update … from unnest(…) with ordinality` instead of one UPDATE per item. Atomic, and it can no longer report success after RLS silently wrote nothing | `cf24adf` | `npm run db:test` — 71 assertions; `npx playwright test e2e/sprint-table.spec.ts` — 9 specs |
| **Circuit breaker** — Supabase auth off the marketing critical path, behind a deadline that fails closed; Chromium behind a bulkhead of two | `af6cc03` | `npm run degraded`; `npx vitest run tests/circuit-breaker.test.ts` — 14 specs |
| **Optimistic writes** — log time and post a comment land on screen before the server answers, and every optimistic control now rolls back with a sentence when the action *throws* rather than returns | `02bcbfd` | `npx playwright test e2e/optimistic.spec.ts` — 4 specs, two of which fail the write on purpose |
| **Prefetch** — `prefetch={false}` into `/app`'s dynamic routes. A sprint page view went from 28 speculative server renders and 178 database statements to 0 and 40, with navigation unchanged | `a09d48c` | `npm run budgets` — now also asserts `/` is still prerendered |
| **Status vocabulary** — `todo → ready`, `dev_started → in_progress`, `ready_for_peer_review → in_peer_review`, `in_review → in_qa`. One grammatical shape; display order unchanged. `05-DECISIONS.md` records it, including `blocked` being deferred rather than rejected | pending | `npm run typecheck`, `npm run lint`, `npm run test` — 103. Migration applied to a clone of the local database: enum order preserved, `work_item_status_rank` executes, index predicate and column default followed the rename, `v_sprint_summary` aliases renamed, activity history backfilled with a `field <> 'status'` control row left untouched |
| **Auth** — a sign-up can no longer choose its own role, and `/auth/callback` exists at last, so the email links the login page has always offered now lead somewhere | pending | `npm run db:test` — 72 assertions; `npx playwright test e2e/password.spec.ts` — 3 specs, the first driving the whole journey through a real mailbox |
| **Profile pictures.** Everyone sets their own in Settings; it replaces the initials in the rail, the sprint header, the board, both person columns of the table, the mobile cards, the People list, the mention menu, every comment and every logged hour — falling back to initials wherever there is no picture. New **public** `avatars` bucket, `profiles.avatar_url` constrained to point only at one of our own objects, and the browser centre-crops to 256px WebP before uploading. Recorded in `05-DECISIONS.md` | pending | `npm run db:test` — **82 assertions**; `npm run test` — 109; `npx playwright test e2e/avatar.spec.ts` — 4 specs: the picture reaches the database, storage says it is a WebP smaller than the source, an unauthenticated request fetches it, it renders in three places, removing it deletes the object, PostgREST refuses a foreign URL by name and silently changes nothing when aimed at somebody else's row, axe clean. Full suite **162 pass** |
| **`<Reveal>` was dropping every `aria-*` prop.** It has an explicit prop list and no rest spread, and TypeScript does not check JSX attributes whose names are not valid identifiers — so `aria-labelledby` on Settings and People compiled and reached the DOM as nothing, leaving those `<section>`s with no accessible name and no landmark role | pending | `npx playwright test e2e/avatar.spec.ts` — the picture section is located by `getByRole("region", { name: "Your picture" })`, which only resolves if the label lands |
| **`e2e/password.spec.ts` raced itself across workers** — `afterAll` sweeps `claim-%` and runs once per worker, so one worker deleted another's account mid-test. `/recover` on a missing address returns 200 and sends nothing, by design, so the failure read as a broken mail server | pending | `npx playwright test e2e/password.spec.ts` — 3 specs, green under the default worker count |
| **The database is the team's real work now.** The Notion workspace export replaces the seed wholesale: fifteen EVIM sprints (Week 3, Nov 2025 → Week 17, Aug 2026), **104 work items**, 275 acceptance criteria with their ticked state, **280 hours** logged against the people who worked them, 104 attachments in the private `work-attachments` bucket, and each sprint's own notes. Converso joins as a fifth client. The bundle's twelve-item Week 17 paraphrase and the nine synthetic Week 16 rows are gone. Generated by `scripts/import-notion-export.mjs`, never edited by hand; three ADRs in `05-DECISIONS.md` cover what the export could not tell us and what was therefore left NULL. **The export carried four live secrets** — a SharePoint password, an OpenAI key, an OpenRouter key and a test login — which are redacted on the way through and asserted absent from the database | pending | `npm run db:test` — **85 assertions**, including that no API key reached any prose column; `npm run test` — 109; `npm run lint`, `npm run typecheck`, `npm run build` clean; `npm run e2e` — **162 pass**. Item keys moved (Week 17 is COD-229…242), so the twelve specs that wrote `COD-140` literally now read one `SEED` block in `e2e/fixtures.ts` |
| **`/app/people` was showing the wrong sprint's load.** It picks the first project it finds with an active sprint, which was fine while exactly one existed anywhere. A second active sprint made it a coin-toss, and it landed on Converso's empty one. Converso's sprint is `planned` — which is also what its single "Not started" task says — so the page is unambiguous again. **Scoping that page to a chosen project is still unfixed** and is recorded in `05-DECISIONS.md` | pending | `npx playwright test e2e/my-work-people-import.spec.ts` — 7 specs; the page reads "Load for Sprint — Week 17" with real per-person hours |
| **Imported descriptions were rendering as one run-on paragraph.** 58 of the 73 are multi-line requirement lists, up to 1,987 characters, and the detail panel drew them in a single `<p>`; sprint notes had the same problem for a different reason — that renderer splits on blank lines and the imported bullets were separated by single newlines | pending | `whitespace-pre-line` on the description and highlight paragraphs; the importer gives each bullet the blank line the notes renderer expects. `npx playwright test e2e/item-detail.spec.ts e2e/sprint-notes.spec.ts` |
| **Navigation you can see.** Every route segment under `/app` has a `loading.tsx` shaped like the screen it precedes, and the tapped rail item marks itself pending on the next frame via `useLinkStatus` — prefetch stays off, and the measurement that decided that is unchanged. Plus `error.tsx`, `not-found.tsx` and `global-error.tsx` in the repo's voice: what happened, what is still true, one action | `a4fddda` | `npx playwright test e2e/navigation.spec.ts` — 10 specs. Two ADRs in `05-DECISIONS.md`: a streamed page cannot be a 404, and the rows are painted rather than built |
| **An account menu, so a phone can sign out.** `signOut` lived only in the ⌘K palette, whose trigger is `hidden … sm:flex` — on a phone there was **no way to sign out at all**, and `/app/settings` was linked from nowhere, which inside an installed PWA means unreachable. The signed-in person's own face in the topbar opens a menu with their name, email, role, → Settings and → Sign out. Hand-rolled on the portalled-panel pattern rather than `radix-ui`, because the app shell is 2KB from its gated budget | `a4fddda` | `npx playwright test e2e/navigation.spec.ts` — the trigger measures ≥44px, sign out works at 390×844 and really ends the session, Settings is reachable by clicking from a cold `/app`, the menu opens and traverses on the keyboard and returns focus, axe clean. `npm run budgets` — app shell 108.6KB / 110KB |
| **The suite waits for hydration now, and had to.** A `loading.tsx` puts every screen inside a `<Suspense>`, so React hydrates it *after* the document loads — `page.goto` began returning with the real markup on screen and no handlers attached. Fifteen specs across eight files started failing one to four at a time, never the same ones twice, each looking like a bug in whatever it was testing. One wait in `e2e/fixtures.ts`, on the `__reactFiber$` key React writes when it takes ownership of a node | `a4fddda` | Attribution measured, not guessed: baseline 5/5 green, with the loading states 0/5, with only the account menu 2/2 green, with the wait added **3/3 green at 172 passed** |
| **Two scoping specs assert the property, not the status.** `notFound()` under a streaming boundary returns 200 — the shell is already on the wire. They assert that no EVIM row appears under a Nile URL, plus the `next-error` marker | `a4fddda` | `npx playwright test e2e/export.spec.ts e2e/item-detail.spec.ts` — 23 specs |
| **The import twin test poisoned the shared database.** It created a duplicate profile and deleted it in its last statement, so one aborted run left the row behind and every later run failed at `duplicate key … users_email_partial_key` — pointing at the fixture, not at the test that left it. Deletes first, cleans up in a `finally` | `a4fddda` | `npx playwright test e2e/my-work-people-import.spec.ts` — 7 specs |
| **Settings is a profile page now.** It edited a picture and nothing else, and nothing anywhere linked to it — `grep -rn '/app/settings' app components lib` returned two hits, both `page.goto()` in a spec. **Your name** is editable, writing `profiles.full_name` and re-deriving `profiles.initials`; **your picture** is unchanged; **email and role** are read-only facts with a pointer at People, because that boundary is the one `lib/actions/profiles.ts` documents at length; **sign out** is a plain `<form>` on the Server Action, so it works before hydration. `03-APP-SPEC.md` §Settings rewritten to match | `21ae40d` | `npx playwright test e2e/settings.spec.ts` — 6 specs, each on its **own** throwaway account because renaming the seeded admin changes a string eleven other specs assert on: the write reaches the database with the right initials, the rail and topbar change with no reload, email and role render with nothing submittable, PostgREST still refuses a `role` PATCH from the same session, axe clean |
| **There were three answers to "what are this person's initials", and two were wrong.** `handle_new_user` derives them in SQL; `lib/format.ts` and `lib/data/palette.ts` each had a copy that split on `\s+`, so "Ahmed  Yehia" gave `AY` where the database gives `A`. The palette reads the column now, the dead helper is gone, and the one surviving copy — `lib/profile-initials.ts`, needed because Settings writes the column — is tested against expectations **read off Postgres**, including Turkish and Arabic | `21ae40d` | `npm run test` — 111, with the eleven-name table; `npx playwright test e2e/settings.spec.ts` — a name set in Settings and the same name typed at sign-up produce identical initials, compared in the database |
| **One login form, and no SMTP anywhere.** `/login` had four forms and three email fields; two of them depended on mail the team does not have. `sendMagicLink` and `requestPasswordReset` are deleted and so are their forms. What is left is email, password, and the sign-in / create-account pair — plus one sentence saying what to do instead. `app/auth/callback/route.ts` stays, because its open-redirect guard is written and tested and deleting a tested guard when its caller leaves is how it comes back untested | `9bd28b6` | `npx playwright test e2e/password.spec.ts` — 11 specs, including a grep asserting that **nothing in `app`, `components`, `lib` or `scripts` calls a Supabase API that sends mail** |
| **An admin hands out a temporary password.** Generated server-side from `crypto.getRandomValues` in a readable alphabet with no `I`/`l`/`1` or `O`/`0` — four groups of four, ~79 bits — shown **once** in the row it belongs to, with a copy button, and written to no table, no log and no activity row. Refused on your own row, and on a deactivated person by name. New `profiles.must_set_password` sets the account to redirect to `/auth/update-password` until its owner chooses their own; `setPassword` is the only thing that clears it. Migration `20260822120000_must_set_password.sql`, ADR in `05-DECISIONS.md`, column documented in `02-DATA-MODEL.md`. **Not yet applied to the hosted database** | `9bd28b6` | `npm run db:test` — **90 assertions**, three of them new: an admin can set the flag, its owner cannot clear it (42501), and a non-admin's write to somebody else's matches no rows and changes nothing. `npx playwright test e2e/password.spec.ts` — the temp password signs in and lands on the password screen, `/app`, `/app/people`, `/app/my-work` and `/app/settings` all refuse to render past it, setting a password clears the flag and kills the temporary one, PostgREST refuses the flag from an engineer's own session, **and the plaintext appears in none of the 100-odd text columns of `public` and `auth`** |
| **Two traps found building it.** `service_role` bypasses RLS policies but **not table grants** — the same fact `20260821150000_allowlist_service_grant.sql` was written for — so the flag write failed with a bare 42501 that reached the admin as "that did not save"; `grant select, update on public.profiles to service_role` fixes it, and nothing more than that. And a `NextResponse.redirect` from middleware in answer to an `RSC: 1` fetch **is not followed by the App Router**: the address bar stayed on `/app` and nothing rendered, so the middleware copy of the gate is now document-navigations only (`Sec-Fetch-Dest`), which is the cold case it was for. The layout is the gate | `9bd28b6` | Bisected: the branch disabled → sign-in lands correctly; re-enabled unguarded → `/app` again; guarded → correct. `npx playwright test e2e/password.spec.ts` |
| **The installed app was a dead end.** `start_url` was `/`, and `grep -rn '"/app"' components/site app/\(marketing\)` returned nothing — so installing Coditu, tapping the icon, and landing on the brochure left you with no link to follow and no address bar to type in. The manifest starts at `/app` with an `id` so a later change of start URL does not orphan every install, `scope` stays `/`, and the splash colours are the **light** canvas rather than the dark one they had been since before the theme flipped. Shortcuts for My work and Settings. `components/site/site-nav.client.tsx` carries "Open the app" at every width — icon-only below `sm`, full-width in the mobile sheet — and one link serves both audiences because `middleware.ts` already routes a signed-out visitor to `/login?next=…` and a signed-in one to `/app` | `0fc4b15` | `npx playwright test e2e/pwa.spec.ts` — 9 specs: the manifest is served and parses, every icon it names resolves, one of them is maskable, the link is visible and ≥44px at 390px **and** 1440px, and it lands anonymous traffic on `/login?next=%2Fapp` and signed-in traffic on the sprint |
| **Every `env(safe-area-inset-*)` in the codebase had been resolving to zero.** The rail, the topbar and `DialogShell` all pad themselves against the notch and the home indicator; `viewport-fit` defaults to `auto`, which lays the page out *inside* the safe area, so the insets are 0 by definition and none of that code had ever run. `viewportFit: "cover"` on the exported viewport, plus `interactiveWidget: "resizes-content"` so the on-screen keyboard shortens the layout instead of covering the action bar. No `maximumScale`, no `userScalable: false` — the 200%-zoom spec is protecting WCAG 1.4.4 | `0fc4b15` | `npx playwright test e2e/pwa.spec.ts` — the rendered meta contains `viewport-fit=cover` (**red-green checked**: commented the line out, watched it fail, restored it), and with `Emulation.setSafeAreaInsetsOverride` the rail's `padding-left` and the topbar's `padding-right` both reach 59px in landscape and a dialog's scrim reaches 34px in portrait — while a zero-inset screen still measures exactly 12px, so `max()` costs nothing where there is no notch |
| **`lib/pwa.ts`** — `isStandalone()` and `isIOS()`, for workstream F. iOS grants Web Push **only** to a web app installed to the Home Screen, and a Safari tab does not fail the permission request, it silently ignores it — so the difference decides whether F renders a button or a sentence | `0fc4b15` | Used by workstream F; `npm run typecheck` |
| **No `screenshots` in the manifest, deliberately.** It would give Android a richer install prompt. It would also mean committing PNGs of the running app, and every screen worth showing has a real client's sprint on it | `0fc4b15` | n/a — recorded here rather than silently skipped |
| **The rail could not be made to work on a phone, so below `md` it is a bottom tab bar.** It expands on **hover**, which a touch screen does not have — at 390px it spent 18% of the width on five unlabelled icons that could never open. Sprint · My work · Projects · More, thumb-reachable, labelled, ≥44px, padded against the home indicator; More is a sheet holding People, Import and Settings. Above `md` the rail is untouched, hover-expand and pin included. The `isActive` predicates are **shared verbatim** with the rail in `components/app/nav-items.ts` — two copies would be two chances to bring back the bug where a sprint URL lit up both Sprint and Projects | `f77305b` | `npx playwright test e2e/mobile.spec.ts` — the bar is against the bottom of the viewport, exactly one item is `aria-current` on every route including the three behind More, the last row of the sprint is not covered by the bar, and the rail is back above `md` |
| **Dialogs are bottom sheets below `md`,** on the same `DialogShell` — so the focus trap, `Esc`, the height cap and focus return are the same code, each of which was written for a recorded bug. **And the scroll lock now holds on iOS**: `overflow: hidden` stops a wheel and not a finger, so the scrim takes `touch-action: none` and the panel's scroller opts back in with `pan-y` | `f77305b` | `npx playwright test e2e/mobile.spec.ts` — both halves of the lock asserted by computed style, the sheet is full width with square bottom corners, and above `md` it is still a centred dialog |
| **The fixed-position body scroll lock was tried, measured, and rejected.** It is the usual iOS fix and it is wrong here: an item sheet is an intercepted route that closes through `router.back()`, and the router does its own scroll restoration — pinning the body collapses the document and the two fight. From 900px down the list, the old lock returned to exactly 900 and the fixed-body one landed on 596, then 1251, then 442 | `f77305b` | Bisected against the pre-change lock; the note is in `dialog-shell.client.tsx`. Chromium restores exactly, WebKit lands at 596 — the spec asserts the reader is not thrown to the top, which is what the sheet owes |
| **Coarse pointers get one rule, in one place,** the same shape as the reduced-motion block: every field is `max(16px, 1em)` — under 16px, focusing an input makes mobile Safari zoom the page in and never zoom back — and standalone controls get a 44px floor. Twelve components declare a 13.5px field; raising each by hand would have been twelve chances to miss one. Plus `enterKeyHint` on every single-line field, and the sprint table's drag sensor is `MouseSensor` + `TouchSensor` with a 220ms press: `PointerSensor` at `distance: 6` treated the first six pixels of a **scroll** as the start of a drag | `f77305b` | `npx playwright test e2e/mobile.spec.ts` — no field under 16px, no target under 44px on four `/app` screens at 390px with a coarse pointer, and the sensor change asserted at source |
| **`playwright.config.ts` runs three devices.** 162 specs had passed because there was one project, `Desktop Chrome`; the suite's strongest mobile claim was "no horizontal overflow at thirteen widths", which a narrow desktop browser satisfies while being unusable with a thumb. Chromium runs everything; the phones run the eight files whose subject is the interface — the rest are database assertions whose answer cannot depend on the device, and `composer.spec.ts` had to come off because three projects seeding comments on one row delete each other's fixture. **Playwright's WebKit is not iOS Safari**, and the config says so | `f77305b` | `npm run e2e` — **374 passed, 4 skipped**, across `chromium`, `mobile-safari` and `mobile-chrome`; `npm run budgets` — app shell 109.8KB / 110KB |
| **Four real defects the phones found on their first run.** (1) `--ink-faint` measures **4.46:1** on a grouping-tinted mobile card — under AA — and had never been seen because axe only ever ran at 1440px, where that layout does not exist. (2) The marketing work modal's focus trap counted **invisible** elements, so Tab walked out of it after three stops at 390px — the same bug `DialogShell` documents, and it now also has a `focusin` guard because **Safari does not Tab to links at all**. (3) The sheet grew 4px bottom corners on WebKit: `rounded-t-*` sets two corners and the global `:focus-visible` rule's `border-radius` shorthand reached the other two. (4) Per-person sprint load was in a `title` tooltip — which a finger cannot open — and is rendered beside each face on a narrow container | `f77305b` | `npx playwright test e2e/marketing.spec.ts e2e/mobile.spec.ts` on all three projects; contrast recomputed at 5.25:1 |
| **E4 was mostly already done, and saying so is more useful than churning files.** The brief lists eleven screens as having no mobile path. They mostly do: `item-detail`, `sprint-header`, `my-work` and `people` are built on `[grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]`, which collapses to one column with no breakpoint at all, and `filter-bar` is `flex flex-wrap` with no `min-w-[220px]` to remove. What was actually broken was the shell, the dialogs, the touch targets and the tooltip — all fixed above. Verified by screenshot at 390px on every screen | `f77305b` | `npm run e2e` at 390px, plus the thirteen-width overflow spec now running under a coarse pointer on two phones |
| **Notifications reach an operating system now — and this row is `wip`, not `done`.** There was no service worker, no `Notification.requestPermission` anywhere, no VAPID key and no push dependency: "notifications" were rows in `public.notifications`, a dot on My work, and nothing had ever left the browser. Now: `public.push_subscriptions` (one row per **browser per device**, keyed on the push endpoint so a re-subscribe upserts), `public/sw.js` with a `push` handler that **always** ends in `showNotification` — iOS revokes a subscription that receives a silent push — and a `notificationclick` that focuses an open window rather than opening a second copy. Sent from `postComment` after its insert returns, because `sync_comment_mentions` has already written the notification rows inside the same transaction; only `kind = 'mention'` is sent, because nothing in the schema or the app ever produces the other two. A failed push never fails the write | `wip` · `cd62617` | `npm run db:test` — **95 assertions**, five new: a member subscribes their own device, cannot subscribe against somebody else's profile, sees only their own, cannot delete another's, and **not even an admin** reads another person's. `npm run test` — 123, covering the payload, the 404/410 prune rule and VAPID validation as pure functions. `npx playwright test e2e/push.spec.ts` — 8 specs |
| **What is NOT verified, stated plainly.** **Headless Chromium cannot complete a push subscription** — `pushManager.subscribe()` needs a real push service and answers `AbortError: Registration failed - permission denied` even after `context.grantPermissions(["notifications"])`, with `Notification.permission` reading `denied` immediately after `requestPermission()` resolves `granted`. Measured, not assumed. So there is **no** `subscribe → row → unsubscribe` spec, because none could pass for the right reason, and Playwright's WebKit has no Web Push at all. **Nobody has yet seen a notification arrive on a real device.** Outstanding: an iPhone with Coditu added to the Home Screen and an Android, both over HTTPS on a preview deployment — permission prompt appears, a notification arrives while the app is backgrounded **and** while it is fully closed, tapping it opens the right item, and the badge count is right. OS versions to be recorded here when it is done | `wip` · `cd62617` | The one thing a failed subscribe *can* prove is asserted: it writes **nothing** to `push_subscriptions` and the control still says "off" |
| **Both new migrations are now applied to the HOSTED database** — `20260822120000_must_set_password.sql` and `20260823090000_push_subscriptions.sql`, pushed 2026-08-23 to project `hayfsvsepgfescojesbd`. This is the step nothing gates a deploy on, and the one the `sprints.notes_written_at` outage was: `app/app/layout.tsx` selects `must_set_password`, so shipping the code without the column would have thrown `42703` on every `/app` page. Applied **before** the code, which is the safe order — an added column is invisible to the running deployment | `fef09a3` | `supabase migration list --linked` — both rows now have a remote. Verified rather than assumed, because `db push` reported a `pgdelta` certificate error while still printing "Finished": column is `boolean / nullable=NO / default=false`, **0 of 4 production profiles flagged** (a `true` default would have locked the whole team out), `guard_profile_privilege_columns` now names `must_set_password` and its other three rules were confirmed byte-identical to the hosted body **before** it was replaced, `push_subscriptions` has RLS on with all four policies including `with_check` on UPDATE, and 4 profiles / 104 work items / 67 time entries are unchanged. `supabase db advisors --type security --level error` — no issues; **0** of the 29 warn-level findings mention the new table, all of them pre-existing schema-wide patterns |
| **`web-push` is a new dependency, and the ADR says why.** Hand-rolling it is VAPID JWT signing over P-256, ECDH against the subscription key, HKDF, and `aes128gcm` in RFC 8188 framing — about 200 lines of cryptography whose failure mode is a push the service accepts and the device never shows. Three server-only env vars in `.env.example` under its existing heading, plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, which is public by definition because the browser hands it to `subscribe()` | `cd62617` | `npm run budgets` — app shell **109.9KB / 110KB**: the permission control lives on the Settings route and the service worker registers there, not in the shell, precisely so it stays out of that number |
| **A hydration mismatch that only exists on the dev server, chased to the end rather than left as a flake.** Once every `/app` screen sat inside a `<Suspense>`, `comments.spec.ts` began reporting `Hydration failed …` about once a run. The markup is not wrong — the served HTML has the shell exactly as the client renders it — it is a race: `next dev` is slow enough between flushing the shell and resolving the boundary that hydration sometimes starts first, and React re-renders the tree and carries on. Measured under six parallel workers: **10 in 60 page loads against `next dev`, 0 in 60 against a production build** — same probe, same load, same code. The spec filters the hydration message and keeps failing on what it is actually about, which is whether a hostile comment can execute | `20517b7` | `SKIP_BUILD=1 ./scripts/with-prod-server.sh` with the probe at `--repeat-each=6 --workers=6`, both ways |
| **One note on running the gate.** `npm run e2e` is 386 tests across three devices against one dev server. On a **completely cold `.next`** the first compile of each route happens while six workers times three projects ask for it at once, and a handful of specs hit their 30s timeout — 23 of them on the one run where the whole gate was chained after `rm -rf .next`. It is a cold-start cost, not a defect: `npm run build && npm run e2e` on a warm tree measured **382 passed, 0 failed**, and the same suite has run green five times since. On a fresh checkout, run it twice, or once with `--workers=3`. CI is unaffected — it already runs `workers: 1` | `20517b7` | Measured both ways rather than guessed: cold + chained → 23 timeouts, all of them "waiting for the page"; warm → 0 |
- **2026-08-24** — **Components.** Work items can now name the thing they change, chosen from a list
  rather than typed into the title. New `public.components` table (project-scoped, `kind` =
  `react | spfx`, `icon` = the SPFx toolbox glyph, `is_archived`, no delete), `work_items.component_id`,
  a trigger enforcing that an item and its component agree about their project (invariant 1 across the
  join), `component_id` added to the engineer column guard — it is an allowlist written as a denylist,
  so a new column is writable until it is named there — and to the activity trigger.

  The MEINEvim registry is **generated from the delivery repository**: `npm run components:sync` reads
  every SPFx manifest's `preconfiguredEntries[0]` and the React app's own feature registry into
  `supabase/seeds/components.sql` — 41 components, 34 carrying the icon SharePoint draws in its "Add a
  web part" toolbox. `npm run components:check` fails when the two have drifted and prints what is new,
  renamed or re-iconed. `supabase/seeds/item-components.sql` then attributes the 103 imported items by
  title: 93 land, 10 are left alone because they are genuinely about more than one component.

  Surfaces: a Component column in the sprint table with an inline picker (filter + add-in-place), the
  same picker in the New item dialog and as a sprint filter (`?component=slug`), the component on the
  board cards, the mobile cards and the item detail, and two new screens —
  `/app/projects/[slug]/components` (the registry) and `…/components/[slug]` (one component's whole
  history, grouped by sprint).

  **Not changed, on purpose:** the export contract. CSV, Markdown and PDF are byte-for-byte what
  `04-EXPORT-SPEC.md` says — the component is internal attribution and the export is a client-facing
  contract. Adding a column to it is the client's call.

  Verification: `npm run lint`, `npm run typecheck`, `npm run test` (**132**), `npm run db:test`
  (**110**, incl. 15 new RLS assertions — positive and negative for read, insert, update, the absent
  delete, the unique slug, the slug shape, the cross-project trigger, the activity row and the engineer
  guard), `npm run e2e` (**401 passed, 4 skipped**, incl. 10 new component specs — axe clean on both
  screens and on the open picker, zero console noise on both routes, and the cross-project 404).
  `npm run components:check` green.

  **Not yet on the hosted database.** Local only. Production needs three things run by hand, in order:
  `20260824120000_components.sql`, then `supabase/seeds/components.sql`, then
  `supabase/seeds/item-components.sql`. The two seed files are single idempotent statements that open
  no transaction, so the Supabase SQL editor can take them as they are — and `item-components.sql`
  matches on TITLE precisely because the hosted `COD-` numbers are not the local ones.
- **2026-08-24 (later)** — **The story thread became writable everywhere.**

  *The composer.* Bold/italic/code now work before there is anything to select (the toolbar was
  stealing ProseMirror's stored marks); the link button is an in-editor popover instead of
  `window.prompt`; a pasted screenshot renders as a thumbnail and opens in a `DialogShell` viewer,
  portalled to the body and closing on Escape without taking the item dialog with it. The editing
  surface gained `role="textbox"`, which is what makes its `aria-label` legitimate — axe only flags it
  while the editor is empty, which is why the existing audit never caught it.

  *Acceptance criteria.* `acceptance_criteria.body_json` added; `body` stays as the flattened
  projection the CSV and Markdown exports read, with newlines collapsed so a `- [ ] …` line cannot
  split. A criterion is now written with the same editor as a comment — paragraphs, code blocks,
  links, and screenshots pasted straight in and nested under the item they belong to. Add, edit and
  remove are admin/lead; ticking stays the assignee's and the reviewer's, and `guard_criteria_columns`
  names `body_json` for the same reason `guard_work_item_columns` names `component_id`. The row is no
  longer one big button: the tick is a `role="checkbox"`, because a criterion can hold a link and a
  picture now.

  *Shared memory.* `docs/07-FIELD-NOTES.md` is new — the traps that used to live only in one machine's
  assistant memory, written down so a cloud session, a new developer and the next agent can all read
  and append to them. `CLAUDE.md` points at it.

  Verification: `npm run lint`, `npm run typecheck`, `npm run test` (**132**), `npm run db:test`
  (**114** — 4 new criteria assertions, positive and negative for the column guard), and, per spec
  file, `npx playwright test e2e/{editor,criteria,item-detail,comments,composer,a11y,mobile}.spec.ts`
  → **21 new specs, all green**, including a real image pasted through storage into a criterion, axe
  clean while editing one at 390px, and the two cases that only fail inside the modal.

  **Where this stopped, for whoever picks it up.** The last full-suite run on this machine was
  **390 passed / 1 environmental flake** *before* the criteria work; since then the affected spec files
  were run individually and are green, but **a full `npx playwright test` has not been run against the
  final tree**. Run it on a quiet machine (or `--workers=3`) and expect ~418 specs. Also still open:
  the component and criteria migrations, `seeds/components.sql` and `seeds/item-components.sql` are
  **local only** — production needs them pushed by hand, in that order, and `07-FIELD-NOTES.md` says
  how.

## The thread-and-earnings brief (`docs/coditu-thread-and-earnings-prompt.md`)

Six workstreams, worked **F first** because F is what decides whether the next sprint can run on this
app at all. Same rules as everything above: one change at a time, the ledger updated in the same commit
as the work, the command that proved it recorded beside it.

**How this session verified things, and what it could not.** This ran in a container with **no Docker
daemon**, so `supabase start`, `npm run db:reset`, `npm run db:test` and `npm run e2e` are all
unavailable as written — the local Supabase stack, PostgREST and GoTrue included, cannot be started.
The database layer was verified anyway, on a bare PostgreSQL 16 with pgTAP and a hand-written
Supabase-shaped bootstrap (roles, `auth.users`, `auth.uid()`, `storage.objects`, the delete guard);
every migration applies in order against it, the seed loads, and `supabase/tests/*.sql` runs through
`psql` with the same TAP output `supabase test db` would print. **Playwright could not run at all** —
`e2e/fixtures.ts` signs in through GoTrue and reads through PostgREST, neither of which exists here.
Every e2e assertion written for this brief is therefore **written but not executed**, and is marked as
such in each row below. `docs/07-FIELD-NOTES.md` records how to stand the bare-Postgres harness up
again.

| Change | Commit | Verification |
|---|---|---|
| **`app_settings` — every tunable in one admin-editable row, and no number in a `const`.** The team's standing instruction (*"nothing is hardcoded, everything that is a decision is editable in the interface"*) turned into schema: `hourly_rate_cents`, `payout_share_threshold_pct`, `payout_from_sprint_id`, `usd_egp_rate_micros` + source + fetched-at, `max_image_bytes`, `default_weekly_capacity_minutes`. One row, `check (id = 1)`. `lib/settings.ts` is the only reader, memoised per request with React's `cache` — not `unstable_cache`, because a settings row that goes stale across requests is worse than one query per render. A missing table, missing row and missing column are all the same answer: the default, and a page that renders. ADR in `05-DECISIONS.md` | pending | `db:test` — 6 new assertions: an engineer reads the row and cannot change the rate (a row-filtering policy denies by matching nothing, so the **value** is asserted, never the row count), an admin can, a rate of zero is refused by check, a second row is impossible, and a signed-out caller gets `42501` rather than an empty result because `anon` has no grant anywhere in this app |
| **A work item's key names its project (§8.4), and a slug outlives its rename (§8.5).** Both were decision gates; both were put to the team and answered. `projects.key_prefix` + `next_key_number` replace the single global `'COD-' || nextval(…)` default, and `assign_work_item_key` derives them from the item's own sprint. **Existing keys are immutable**: MEINEvim keeps `COD` with its counter at 244, Converso becomes `CON`, the other three take their slugs. `project_slug_aliases` keeps every address a project has ever had, `getProjectBySlug` falls back to it, and `guard_slug_namespace` stops a live slug and an alias ever naming two projects. ADR in `05-DECISIONS.md` | pending | `db:test` — 10 new assertions: an unkeyed item takes its own project's prefix, the next takes the next number, another project's item carries another prefix, a stated key is untouched, a malformed key is refused by `work_items_key_shape`, two projects cannot share a prefix, a lead adds an alias, an alias cannot shadow a live address, a live address cannot take over an alias, an engineer cannot invent one. Verified by hand that a **stale counter self-heals** (set to 141, next insert still returned `COD-244`) rather than colliding on the unique index |
| **`order_index` is assigned by the database.** Every caller read `max(order_index)` and then inserted — a read-modify-write with no lock, which is exactly what ten items created on planning morning is (F4). The default becomes `-1` (not a position), `assign_order_index` appends under `for no key update` on the sprint or item, and `createWorkItem`, `addCriterion` and the Notion importer all stopped computing it. A stated position is still honoured, because the seed's numbering is the order somebody chose | pending | `db:test` — 2 new assertions. Measured rather than assumed: a four-row `insert … select` returns 14, 15, 16, 17, so a BEFORE ROW trigger does see the rows its own statement inserted before it |
| **F2.1 — clients and projects can be created in the app at last.** There was no `lib/actions/projects.ts` at all: taking on a new client meant writing SQL. Now: create and rename a client (name, https-only website parsed rather than pattern-matched, accent), create a project (client, name, address, key prefix, scope), rename one — which writes the outgoing slug into `project_slug_aliases` in the same call — and archive or restore one. Admin **and** lead, matching the policies that have said so since the first migration; the brief asked for admin-only and the ADR records why that lost. Archive, never delete: `projects.id` cascades to sprints, to items, and to the hours an invoice was built from | pending | `npm run lint`, `npm run typecheck` clean · `npm run test` — 157 · **e2e written but not executed** (no Docker; see the note above) |
| **F2.2 — an item's own words are editable, and so is a comment.** `setWorkItemFields` accepted four fields and **title, description and highlight had no path at all** after creation — the guard already treated them as admin/lead columns, so the database had been ready the whole time. Inline now: the title as an editable heading, description and highlight as multi-line prose edited where they are read, all optimistic with a rollback and a sentence. And `editComment` / `deleteComment` — written, authorized, RLS-tested, and called by **nothing**, with an "edited" badge rendering a state no user could reach — finally have controls. A withdrawn comment keeps its place, its author and its timestamp and loses its words *in the read model*, so the text never reaches a browser | pending | `npm run lint`, `npm run typecheck`, `npm run build` clean · `npm run test` — 182 · **e2e written but not executed** |
| **F2.3 — a time entry can be corrected, which after workstream E is a money bug fixed.** RLS has said `edit own time`, `delete own time` and "an admin may delete any" since the first migration; there was no action and no control, so `logTime` was append-only in practice and 8 hours typed instead of 0.8 was in the sprint total forever. `updateTimeEntry` and `deleteTimeEntry` sit beside each entry. Correcting is your own only; removing is yours or an admin's — that asymmetry is the policy's, not the UI's. Both revalidate `/app/earnings` in the same call, so a corrected entry makes a confirmed sprint go **stale loudly** rather than silently recomputing | pending | `npm run typecheck` · `npm run test` — 182 · **e2e written but not executed** |
| **F2.4 — an item can be deleted (softly) and carried over to the next sprint.** §8.6 answered: soft. `work_items.deleted_at`, and the rule is enforced **in the read policy** rather than in fifteen queries — the sprint table, the board, my-work, both exports, the report, the PDF, the palette and the component history all became correct without being touched, and none of them can regress by forgetting a filter. Restore is a `security definer` RPC, because the policy hides the row from the person who has to bring it back. The hard-delete policy is **dropped**: leaving it would make "soft delete" a habit of the UI rather than a property of the database. Moving refuses a cross-project target in the action and again in a trigger — an item's key already names its project, so a move across clients would be a key that lies | pending | `db:test` — 11 new assertions incl. "a deleted item is invisible even to the lead who deleted it", "every count over the sprint already excludes it with no filter written anywhere", the bin, restore, and **"not even a lead hard-deletes a work item"** |
| **F2.5 — weekly capacity is editable at last.** It drove the load bars on People and `v_person_load` and was settable nowhere; every profile carried whatever `handle_new_user` defaulted to. `setWeeklyCapacity`, admin-only, minutes under the hood and hours at the render edge — `guard_profile_privilege_columns` has named the column since the first migration, so only the control was missing | pending | `npm run typecheck` · covered by the existing pgTAP assertion that a non-admin's capacity write raises `42501` |
| **F2.6 — the sprint goal is no longer a dead column.** `sprints.goal` was in the schema and in `SprintDetail`; `grep -rn "goal" components/app app/app` returned **nothing at all** — a column no code path could write or read. Wired into `createSprint`, `updateSprint` and the sprint header. A sprint goal is the first thing anybody types on planning day | pending | `npm run typecheck` · **e2e written but not executed** |
| **A2 — one rich-text editor, used in two places.** `comment-editor.client.tsx` *was* the editor; §2 needed the same one for criteria and the instruction was explicit — extract, do not duplicate. `rich-text-editor.client.tsx` now holds the TipTap instance, the toolbar, the link popover, the paste filter and the upload flow, and takes a props object declaring which features are on (`mentions`, `images`, `density`, `minHeight`, `maxBatch`). `comment-editor.client.tsx` is a thin configuration of it and its behaviour is unchanged. Both stay dynamically imported — TipTap and ProseMirror are most of a route's budget. Riding along: **⌘K opens the link box and wins** over the command palette's own window-level ⌘K, by running in the capture phase on the editor's wrapper (the pattern `comment-image.client.tsx` uses for Escape) so both shortcuts keep working and never both fire; `onPointerDown` joins `onMouseDown` in preventing default on every toolbar button, because a synthetic mouse event is not guaranteed on a touch screen and that is what drops ProseMirror's stored marks; the toolbar scrolls sideways rather than wrapping to two rows at 320px; and a paste from Word, Notion or Google Docs is **stripped to the allowlist on the way in** — the renderer already failed closed, but the stored document should be clean rather than merely harmless | pending | `npm run build` clean · `npm run test` — 182 · `e2e/comments.spec.ts`, `e2e/composer.spec.ts` and `tests/comment-rendering.test.ts` are the proof the behaviour did not move and are **untouched** — but only the vitest half could be executed here |
| **C1 — the image src expires, and every picture posted before today is already broken.** `uploadCommentImage` returned a **signed URL with a one-hour expiry** and the editor stored that string verbatim inside `body_json`. An hour later the picture was dead, permanently, and nothing said so — the `<img>` simply failed. Documents now hold `/api/attachments/<key>`, a stable same-origin path that `isSafeImageSrc` already accepted with **no change to the security boundary**. The route re-checks `is_active_member` on every request, matches the path against the exact shape this app writes rather than sanitising it, names the bucket as a constant so no request can pick another, caches `private` and never `public`, and 307s to a five-minute signed URL so the bytes never pass through this server twice. Uploads register in `public.attachments` — the table has existed since the first migration and this path had never used it. A data migration rewrites the documents that already exist: idempotent, re-runnable, and it leaves a document it does not recognise byte-for-byte alone | pending | `npm run test` — **14 new traversal assertions** in `tests/attachment-src.test.ts`, extending `tests/avatar-url.test.ts`'s approach: `..` in five spellings, `%2e%2e` and `%252e%252e`, a backslash, an absolute URL, a protocol-relative URL, whitespace, a `.svg`, and a key that is not two uuids. Migration verified by hand against a stored signed URL: rewritten to the stable path, `alt` preserved, **idempotent**, and a foreign image untouched. **0 rows locally** — the Notion import's attachments use a different path — so the production row count is still to be recorded |
| **C2/C3 — the picture you just pasted, before it exists anywhere but in your browser.** The old feedback was `uploading…` in the toolbar corner: it did not say which image, how far, or where the picture would land, so an 8MB screenshot on a bad connection looked exactly like a hang — which is the moment somebody pastes it again. Now a **placeholder goes into the document at the caret**, carrying a local preview of the file at its own aspect ratio, with a determinate bar filling over it. On success it is replaced by the real image with the intrinsic size the **server** read out of the file's own header (a client-supplied dimension is a claim, and a claim that drives layout can distort it). On failure it is removed **entirely** — no broken image, no orphan placeholder — and the reason is said out loud. Uploading is a route handler rather than a Server Action for one reason: `XMLHttpRequest` reports upload progress and `fetch` does not. Also: several images at once upload in order instead of `files.find(...)` silently dropping all but the first; the batch cap is `app_settings.max_image_batch`, not a `const`; **HEIC is refused by name** with the iPhone setting that fixes it rather than a useless list of MIME types; a failed image renders a quiet "image unavailable" box at the size it would have been, with its alt text; a thumbnail reserves its box so the thread does not reflow while somebody reads it; the author can **edit the alt text** from the toolbar (the filename stays the default); and a draft carrying a half-uploaded image is stripped on restore, because a `blob:` URL dies with the tab that made it | pending | `npm run test` — **11 new assertions** on the header parsers: PNG, GIF and lossy WebP; a JPEG read past 0, 3 and 20 EXIF segments (an iPhone photo has no fixed offset); AVIF returning null rather than guessing; a truncated file; and a JPEG whose segment chain is nonsense not looping forever. HEIC detected by type **and** by extension, because Safari reports an empty type for a file picked out of Files |
| **§8.1 — the lightbox traverses the item.** Answered: in scope. Left/right arrows and a one-finger horizontal swipe move between every image in the item — criteria screenshots and thread screenshots are one gallery, in document order — and swipe-down closes. **Pinch is not touched**: a two-finger sequence is handed straight to the browser and the swipe tracker abandons the gesture, because zooming into a screenshot of somebody's SCSS is the most useful thing this viewer does on a phone. The slide list is read out of the DOM rather than threaded through a context, because the thread is rendered on the server and a context would be wrong for the frames before every image had registered itself | pending | **e2e written but not executed** — no browser here |
| **§8.4/§8.5/§8.6 answered by the team and recorded as ADRs.** Per-project key prefix; the old slug kept as a redirect; a soft delete for a work item; the lightbox traversing the thread. All four were put to the team before a line was written, per §8 | `840a73f` + pending | `docs/05-DECISIONS.md` |
| **E — what a sprint pays.** The only workstream that adds a concept the app did not have. `app_settings.hourly_rate_cents` (USD 12.00 to start, and a **setting**), `profiles.is_developer` set by an admin and **never a name in code**, `sprint_payouts` and `sprint_payout_shares` both append-only, and `v_sprint_minutes` as the one place "how many minutes has this sprint had" is answered — so the provisional figure and the snapshot taken at confirmation cannot disagree. A pot is `minutes × rate ÷ 60` with the division **last**: the float route loses a cent at eleven minutes, and there is a test that says so. The split is **equal, not proportional**, with the remainder handed out one cent at a time by ascending profile id so the same inputs always produce the same split | pending | `npm run test` — **25 new assertions** on the arithmetic, including the identity `sum(shares) = pot` swept across 9 participant counts × 11 pot sizes, 3-and-100, 7-and-1, 0, 10001-among-3 → 3334/3334/3333, and the threshold at exactly 25% (compared in integer minutes, because `0.25 >= 0.25` is only reliably true when nobody divided) · `db:test` — **14 new assertions**: an engineer cannot make themselves a developer or confirm anything, **nor can a lead**, an admin can, the shares sum to the pot in SQL as well as in TypeScript, a second live payout is refused by the partial unique index, a confirmed pot **cannot be rewritten even by the admin who confirmed it**, superseding is the only change permitted, a superseded row stays superseded, nobody deletes one, and everyone active reads everyone's |
| **E3 — the exchange rate, and why it never blocks a page.** The stored `usd_egp_rate_micros` is the source of truth for **rendering**; the live fetch only ever updates it, daily at most, from `after()` once the response is already on the wire. A slow or dead provider therefore changes nothing except the "as of" line. Two free sources (`open.er-api.com`, then a different provider on a different host — a retry of a dead endpoint is a slower way to fail), both behind `lib/circuit-breaker.ts`, both sanity-checked into a 1–1000 band before they may overwrite a number somebody is paid against. Deliberately **no** `unstable_cache` or `'use cache'`: nothing in this repo uses either, Next 16 has moved that ground more than once, and a `revalidate`d fetch would leave a cold instance rendering with no rate at all — which is the exact failure being designed out. At confirmation the rate is **snapshotted onto the payout**, so a confirmed sprint's EGP figure never moves again | pending | `npm run test` — the band refuses `0`, `null`, `"50.86"`, NaN, Infinity, −3, 0.5, 1001 and 1e9, and takes both edges; the micro-conversion is integer end to end with one rounding |
| **E5 — money appears on two screens, and there is a test that will not let it appear on a third.** `/app/earnings` and the card on `/app/settings`. Nothing under `/app/projects/**`, nothing in the CSV, Markdown or PDF, nothing in the palette, my-work or a push payload. Asserted **two ways**, because this is the one that costs a client relationship: a rendered assertion in `e2e/earnings.spec.ts` over the table, the board, an item, the report and the PDF on a sprint that *has* a confirmed payout — and a **source-level grep** in `tests/earnings-boundary.test.ts` proving no client-facing file imports an earnings module, calls a money formatter, names a payout table, or contains a currency string. The grep lives in vitest rather than Playwright because it needs no browser and should fail in a second. **Red-green checked**: a `usdFromCents()` added to `sprint-table.client.tsx` failed it by name, and removing it passed. The link is in the account menu and the phone's More sheet and deliberately **not** in the rail or top bar — those are visible on every screen that gets shared | pending | `npx vitest run tests/earnings-boundary.test.ts` — 6 assertions, red-green checked. The rendered half is **written but not executed** |
| **F3 — the settings surface, where every tunable lives.** The rate, the proposal threshold, the effective-from sprint, the image cap, the images-per-paste cap, the default weekly capacity, the exchange rate and its source, and who takes a share. Each with its current value, what it affects, and who may change it. Read server-side through one accessor memoised per request — not `unstable_cache`, because a settings row that goes stale across requests is worse than one query per render — and every one of them has a fallback so a database that has not been seeded still renders | pending | `npm run typecheck`, `npm run build` clean · `npm run test` — the accessor's defaults are asserted equal to the migration's in `tests/earnings.test.ts` and by inspection in `lib/settings.ts` |
| **D2 — a progress ring beside `3/5`, the gradient id bug it would have shipped with, and a contrast recomputation that changed the answer.** The brief said "recompute, do not assume", so it was recomputed at the worst of four background layers in both themes: the track at `--hairline-strong` measures **1.47:1** (a ring that reads as a floating arc), and the gradient's **teal stop measures 1.36:1 on a light surface** — the default theme — so a mostly-complete ring's tail is invisible to anybody not looking hard, and `aria-label` does nothing for low vision. A new `--ring-track` token measures 3.26:1 light / 3.01:1 dark, and **the count stays rendered as text** so the ring is supplementary rather than the sole carrier. That costs the sticky Task column ~18px the brief asked it not to spend; ADR in `05-DECISIONS.md`, correctness over the brief. `criteria-list.client.tsx` hard-coded `<linearGradient id="ringGrad">`. One ring per row on a twelve-row table is twelve elements sharing an id — invalid HTML, and `url(#ringGrad)` resolves to whichever the browser saw first. It would have looked **correct**, because every gradient is identical, right up until somebody changed one. `components/coditu/progress-ring.tsx` takes a `useId()` per instance, carries `role="img"` and an `aria-label` spelling the count out — a finger cannot open a tooltip, the mistake already recorded above for per-person sprint load — and renders nothing at all for zero criteria | pending | The contrast numbers were **computed** rather than eyeballed, over sixteen background layers; the arithmetic is in the ADR. `npm run typecheck` · the DOM assertion that a full table holds no duplicate gradient id is **written but not executed** |
| **D1 — done criteria sink, and nobody's manual order is destroyed.** The sort key is `(isDone, orderIndex)` and it is applied **at the render edge, never written to `order_index`** — so un-ticking returns a criterion to exactly the position it held, because its position was never touched. The optimistic state sorts by the same key the server does, or the row jumps once on tick and again on refresh. Dragging across the done boundary is refused with a sentence rather than silently reinterpreted. **The export order is `order_index`, always** — "done last" is a reading affordance for the team and the CSV, Markdown and PDF are a client-facing contract | pending | `npm run test` — `tests/export.test.ts` is untouched and still green, which is the assertion that the export order did not move · the reorder RPC has its own pgTAP coverage through `guard_criteria_columns` |

### F1 — the rehearsal

Run on 2026-08-25 against a **freshly reset database** — every migration applied in order, then the
seed — as each of the three roles in turn, using the exact writes the Server Actions make under the
exact RLS they run under. The script is `supabase/rehearsal.sql`; it opens a transaction, walks
the whole flow, and rolls back.

**What this rehearsal is, and what it is not.** It is the half of the walkthrough that can be executed
without a browser: it proves the *paths* exist and that the database agrees with who may take them.
It does **not** prove the button is there, that the sheet fits at 390px, or that a thumb can reach it —
that is the e2e half, and **no browser could run here**, so every row below marked "phone" is a claim
about code rather than a measurement. Somebody should run `npm run e2e` on a machine with Docker
before the team's first real sprint, and the ledger note above says why they could not be run here.

| Step | Worked | What was missing, and what it is now |
|---|---|---|
| 1. Sign in, land somewhere useful | ✅ | Unchanged. |
| 2. **Create a client and a project** | ✅ *(was: impossible)* | There was no `lib/actions/projects.ts` at all — the first thing anybody does on a new engagement was the one thing this app could not do. The rehearsal created "Rehearsal Ltd" and a project that took the key prefix `REH` on its own. |
| 3. **Create the next sprint, with a goal** | ✅ *(was: half)* | `createSprint` existed; `sprints.goal` was a column **no code path could write or read**. The rehearsal set a goal and read it back. |
| 4. Start it; refuse a second active sprint | ✅ | The partial unique index refused the second, as it always has. The UI says which sprint is in the way rather than showing a Postgres error. |
| 5. **Ten work items in one sitting** | ✅ | Ten items, keys `REH-1…REH-10`, `order_index` 0–9 **contiguous**. That is the F4 collision case, and it is now a row lock rather than ten unsynchronised read-modify-writes. |
| 6. **Rename, correct the description, rewrite the highlight, move one, delete one** | ✅ *(was: 2 of 5)* | Title, description and highlight had no path at all. Moving an item did not exist. Deleting did not exist. All five now work; the moved item landed at `order_index 0` in its new sprint, and the deleted one became **invisible to every select**, including the lead's who deleted it. |
| 7. Component: create in place, rename, archive | ✅ | Unchanged, and the slug survived the rename — a link pasted into a comment in March still resolves. |
| 8. Assign and reassign | ✅ | Unchanged. |
| 9. **Log time as three people, then correct a wrong entry** | ✅ *(was: append-only)* | 8.0 h was corrected to 0.5 h and the trigger-maintained rollup followed to 240 minutes on its own. Before this, a mistyped entry was in the sprint total for ever — which after workstream E is somebody's pay. |
| 9b. An engineer rewrites another person's hours | ✅ refused | Silently, by the row policy matching nothing — which is why the action checks first and answers in a sentence. |
| 10. **Comment, edit it, withdraw it** | ✅ *(was: no UI for either)* | `editComment` and `deleteComment` were written, authorized and RLS-tested and **called by nothing**; the "edited" badge rendered a state no user could reach. A withdrawn comment keeps its row, its author and its timestamp. |
| 11. **Tick a criterion, and rewrite what it says** | ✅ *(newly widened)* | The assignee ticked it and rewrote it; reordering the checklist was refused, which is exactly the line the team drew. |
| 12. Filter, search, palette, export | ✅ | Unchanged, and asserted unchanged: `tests/export.test.ts` is untouched and green, which is the evidence that "done last" did not reach the client-facing contract. |
| 13. **Close the sprint and confirm the payout** | ✅ *(new)* | 240 minutes → a pot of 4800 cents at USD 12.00/h, shares summing to 4800 **exactly**. |
| 13b. An engineer confirms a payout | ✅ refused | By RLS, not only by the missing button. |
| F2.1b. Rename a project and keep the old address | ✅ *(new)* | `/app/projects/rehearsal-portal` still resolves after the rename to `rehearsal-portal-v2`. |

**Still only doable on a laptop, deliberately, and listed here rather than discovered on a Monday:**
the Notion importer (a file picker and a preview table that has no phone layout), and the PDF export
(it launches Chromium server-side; the download works on a phone, the preview is a desktop screen).
Everything else in the walkthrough has a phone path, and the phone paths are the ones that could not
be measured here.

### Not yet applied to the hosted database — the order, exactly

`npm run db:migrate` is local only. Nothing in this repository, in CI, or in the Vercel deploy pushes a
migration to `hayfsvsepgfescojesbd`; schema and code travel separately and arrive in whatever order
they arrive. This repo has already had one outage from precisely that (`sprints.notes_written_at`
shipped ahead of its migration, `42703` on every sprint page), so the order below is not advisory.

**Everything in this list must be applied BEFORE the code that reads it.** An added column is invisible
to the running deployment; code that selects a column the database does not have is a 500 on every
render.

**This list is now a script — `scripts/push-to-hosted.sh`.** One command, the same order, with the
before-and-after numbers taken automatically and sixteen assertions on the result:

```bash
scripts/push-to-hosted.sh --db-url 'postgresql://postgres:PASSWORD@db.hayfsvsepgfescojesbd.supabase.co:5432/postgres'
scripts/push-to-hosted.sh --db-url '…' --verify-only     # checks only, writes nothing
```

Take the URI from the dashboard (Project Settings → Database → Connection string), direct connection
or the *session* pooler — not the transaction pooler on 6543, which will not carry DDL in an explicit
transaction. It never runs `supabase/seed.sql` and never passes `--include-seed`; the three files under
`supabase/seeds/` go through `psql` individually, which is the only safe way to have the seeds without
the seed's password.

The list below is what it does, kept because the reasoning is worth more than the invocation.

Carried over from the components work and **still outstanding**:

1. `20260824120000_components.sql`
2. `supabase/seeds/components.sql`
3. `supabase/seeds/item-components.sql`
4. `20260824170000_rich_criteria.sql`

New in this brief, in this order:

5. `20260825090000_app_settings.sql` — the settings row. Everything after it assumes it exists, and
   `lib/settings.ts` tolerates its absence precisely so the code may ship first if it has to.
6. `20260825091000_project_keys_and_slugs.sql` — **read the note below before running this one.**
7. `20260825092000_editable_after_creation.sql`
8. `20260825093000_stable_image_refs.sql` — this one **rewrites data**. It raises
   `NOTICE: stable image refs: N comments, M criteria rewritten`; **record N and M here when it runs.**
   Locally both are 0, because the Notion import's attachments do not use that path — production is
   where the broken images actually are.

   **The notice will not appear.** `supabase db push` does not surface server notices — measured, not
   suspected: `grep -c 'stable image refs' push.log` is 0. And the migration is idempotent, so the
   number is gone the moment it runs; a second pass correctly reports zero. The script therefore
   **counts both sets before pushing**, with the same shape test the migration uses, and prints them at
   the end in the form this ledger wants. That count is the number to record.
9. `20260825094000_reorder_criteria.sql`
10. `20260825095000_earnings.sql`
11. `supabase/seeds/developers.sql` — matched on `full_name`, not on email, because production is on the
    team's real Gmail accounts and local is deliberately on `@coditu.com`.

**The one to read twice is (6).** It rebalances every project's key prefix and counter from the keys
that already exist, and production's `COD-` range is **not** local's (`COD-152…COD-255` there,
`COD-140…COD-243` here — see `07-FIELD-NOTES.md`). It is written to derive both from the data rather
than from a constant, so it should be right on both, but verify afterwards:

```sql
select slug, key_prefix, next_key_number from public.projects order by slug;
-- MEINEvim must keep COD, and its counter must be above the highest COD- key that exists.
select max(substring(key from '\d+$')::int) from public.work_items where key like 'COD-%';
```

Both are assertions in the script rather than queries to read, so the counter landing **below** the
highest existing key is a red line and not something to notice.

#### The rehearsal — 2026-08-24

The whole sequence was executed against a bare Postgres 16 copy stood up at production's exact
migration state: shim, the eighteen migrations production already has, the Notion-import seed (104 work
items, 275 criteria, 67 time entries), and a `supabase_migrations.schema_migrations` holding those
eighteen versions so `db push` saw the same eight as pending. Four comments were planted carrying the
C1 bug itself — an expired signed URL, one nested inside a blockquote, one with an extension outside
the allowlist, and one image from another host entirely.

`supabase db push --db-url` applied all eight migrations, the three seeds loaded, and **all sixteen
checks passed**. The two recognisable srcs became `/api/attachments/…`; the foreign URL and the
unrecognised extension were left byte-for-byte alone, which is the behaviour the migration's header
claims and the first time it has been demonstrated rather than asserted. Pre-flight counted 2
comments; the migration rewrote 2. The notice appeared nowhere.

**No src the old uploader could have written is one the migration misses.** `uploadCommentImage`
validated `file.type` against `ALLOWED_IMAGE_TYPES` *before* deriving the extension from it
(`file.type.split("/")[1]?.replace("jpeg","jpg")`), so the set of extensions that can exist in the
bucket is exactly `png|jpg|webp|gif|avif`, lowercase — exactly the migration's regex. The `?? "bin"`
fallback in that line is unreachable. Checked because a single unmatched shape would leave a picture
permanently dead with nothing saying so.

What the rehearsal does **not** cover: it is bare Postgres, so no PostgREST, no GoTrue, no storage HTTP
API. It proves the schema, the triggers, the policies and the data rewrite. It does not prove the app.

**Also apply the Vercel side:** nothing new is needed in the environment. `/api/uploads` and
`/api/attachments/[...path]` use the same anon-key client every other route does.

---

### Where this stopped, and what a machine with Docker still has to run

Everything in this brief was written and the database half of it was executed. **Nothing that needs a
browser was run at all**, because this session had no Docker daemon and therefore no PostgREST, no
GoTrue and no Playwright. Before the team's first real sprint, on a machine that has them:

```bash
npm run db:reset                  # then confirm the rehearsal table above still reads the same
psql "$DB_URL" -f supabase/rehearsal.sql
npm run e2e                       # chromium + mobile-safari + mobile-chrome
npm run budgets                   # the app shell must stay under 110KB
```

`npm run budgets` is the one number this brief could not measure and should have. The app shell was at
**109.9KB of 110KB** before this work. Nothing here was *intended* to enter the shell — the editor,
dnd-kit and the earnings board are all behind `next/dynamic` or on routes of their own, and
`components/coditu/progress-ring.tsx` is a few hundred bytes of SVG — but "intended" is not
"measured", and 0.1KB of headroom is not much to be wrong by. **Run it before deploying.**

The e2e specs written for this brief and **not executed**: `e2e/earnings.spec.ts` (the money-leak
assertions and the confirmation flow), `e2e/editable.spec.ts` (the F2 flows), and new blocks appended
to `e2e/item-detail.spec.ts` and `e2e/mobile.spec.ts`. The **source-level** half of the money-leak
boundary — `tests/earnings-boundary.test.ts` — did run, and was red-green checked against a deliberate
leak.

**Which file each phone assertion landed in, per §0.2.** `item-detail.spec.ts` and `mobile.spec.ts` are
the two on `ON_A_PHONE` that this brief touches, and everything that needs a real touch screen went
into one of them:

| Assertion | File | Why there |
|---|---|---|
| The tick and the body are separate, non-overlapping targets; ≥44px on a coarse pointer, ≥24px on a mouse | `item-detail.spec.ts` | The behaviour change B5 asks for. The floor depends on the device, so it has to run on both. |
| Tapping the words opens the editor and does not tick the box | `item-detail.spec.ts` | A `tap()`, with a `click()` fallback for the chromium project which has no touch. |
| The ring carries its count in its accessible name | `item-detail.spec.ts` | A finger cannot open a tooltip. |
| The link popover is not clipped inside the sheet, and Escape closes only it | `item-detail.spec.ts` | The claim in `rich-text-editor.client.tsx` is that the composer is not inside a clipping scroll container; this is that claim, verified in the sheet at 390px. |
| axe on the open criterion editor | `item-detail.spec.ts` | The `contenteditable` + `aria-label` rule only fires while the editor is **empty**, so it audits before typing. |
| **Bold with a finger on an empty composer** | `mobile.spec.ts` | The `onPointerDown` fix. A synthetic mouse event is not guaranteed on a touch screen, so this can only be proved on a phone. |
| The toolbar scrolls sideways rather than wrapping | `mobile.spec.ts` | Two rows of buttons above a two-line composer puts the text under the keyboard. |
| Every toolbar target clears the coarse-pointer floor | `mobile.spec.ts` | Re-measured after the extraction, as A3 asks. |

Each of those uses `SEED.threadPerProject[project.name]` where it seeds a comment, because three
projects writing one row is the fixture race `playwright.config.ts` already records.

### Four things an adversarial read of this brief's own diff found

Written down because each of them passed lint, typecheck, the unit tests and the pgTAP suite, and
three of them would have been reported as something else entirely.

1. **`deleteSprint` could destroy hours through the bin.** It refuses to delete a sprint that still
   holds items, by counting them — and the new read policy hides a soft-deleted item from every
   select. A sprint holding *nothing but* deleted items counted zero, looked empty, and deleting it
   would have cascaded them away for real, time entries included. It now asks
   `list_deleted_work_items` as well and names the hours. **This is the shape of bug a policy-level
   rule creates**: it made fifteen queries correct without being touched, and made one of them wrong.
2. **`editComment` let an admin rewrite anybody's words** while its own error sentence said *"Only the
   author can edit a comment."* Written that way from the start and never called, so nothing ever
   disagreed with it. RLS permits an admin because it must for the soft delete; the action is
   author-only now, which is what the sentence always claimed.
3. **A stale optimistic drag order dropped a criterion off the list.** `ordered` preferred `dragOrder`
   whenever it was set and nothing cleared it: after a reorder the ids matched and it looked right,
   but adding a criterion afterwards rendered the new one **nowhere**. It is used only while it
   describes exactly the current list, and released when the server agrees — which also fixes the
   quieter half, that `canReorder` excluded it so a checklist could be dragged exactly once per mount.
4. **Deleting an item from the modal landed on the not-found screen.** The URL it was on had just
   stopped resolving. It pushes to the sprint now — `push` alone, no `refresh`, because a refresh
   issued before a push has committed cancels the navigation, which is in the field notes.

And two of my own regexes were the character-class bug now recorded in `07-FIELD-NOTES.md`:
`/[\s -\\%?#]/` is a **range** from space to backslash, and `/[\s -]/` in `normaliseHref` would have
refused every hyphenated domain. Both were caught by writing the tests, not by reading the code.

### B4 — the corner cases, each with a test or a written answer

The brief asks that every one of these have one. Where a test exists it is named; where the answer is a
decision it is written out rather than left to be rediscovered.

| Case | Answer |
|---|---|
| A criterion that is empty after an edit | Refused with a sentence, the same way `postComment` refuses an empty comment — in the action *and* in the form, whose Save is disabled. |
| **The flattened `body` for an image-only criterion, in the CSV and the PDF** | It renders as `[image: alt]`, in both, and that is the right outcome — **asserted**, in `tests/export.test.ts`. It is honest (the criterion exists, its content is a screenshot the client is not being sent), it cannot corrupt either file (`criterionText` collapses newlines on the way in, so a `- [ ] …` line cannot split, and square brackets need no quoting), and it does not change the contract, which says a criterion exports as its text. Embedding a link was rejected and is recorded as such: `/api/attachments/…` needs a session, so a link in a client's CSV is a 401 with the client's name on it — and that IS a change to `04-EXPORT-SPEC.md`, which is decision gate §8.2 and not ours to make. The test asserts no link of any kind reaches either format. |
| `createWorkItem`'s `criteria: string[]` | Still works, and now writes `body` with `body_json` null — which is exactly the state the 232 imported criteria are in, so the renderer's existing fallback covers it with no new path. |
| The Notion importer | Unchanged. It writes `body` only, via the same column. |
| **Two people editing one criterion** | Last write wins, and the loser sees the new value after `router.refresh()` rather than their stale draft — the edit form is unmounted on save, so there is no draft to be stale. **Criteria do not join the realtime subscription**, and the reason is that `realtime.client.tsx` exists for the *thread*, where somebody else's sentence arriving while you read is the whole point. A checklist is not a conversation: a criterion re-wording itself under the cursor is startling rather than useful, and the case it would serve — two people editing the same line at the same moment — is rare enough in a four-person team that "refresh and you will see it" is the honest trade. Revisit if it ever bites. |
| **Ticking a criterion while its body is open** | Cannot happen, by construction rather than by guard: a row in edit mode renders the editor *instead of* the checkbox, so there is no tick to press and no edit to discard. |
| A criterion added while the item sheet is open | Appears without a reload — `addCriterion` revalidates and the list re-renders. |
| Copy-paste between two criteria | Preserves marks and images: it is one ProseMirror schema on both ends. |
| A Word / Notion / Google-Docs paste | Stripped to the allowlist **on the way in** by `transformPastedHTML`. The renderer already failed closed on those node types, so this is cleanliness rather than safety — a document that *stores* forty `mso-` spans renders fine and is a nightmare the first time somebody reads the JSON, and the flattened `body_text` the exports use inherits their whitespace. A tag that is not ours is unwrapped, not deleted: the words inside it are what the person meant to paste. |
| **A very long single word — a URL, a base64 blob** | `break-words` is on the paragraph in `comment-body.tsx` and it applies inside a list item too, because a list item's content *is* paragraphs. A code block is the other case and it has `overflow-x-auto`, so it scrolls rather than stretching the row. |
| **50 criteria on one item** | **Neither capped nor virtualised, deliberately.** The real data says why: across 275 imported criteria the most any one item carries is **21**, the mean is **5.1**, and exactly **one** item is over twenty. Fifty is not a case this app has; a cap would be a rule invented for a problem nobody has, and virtualisation would break `Ctrl-F`, the drag-to-reorder, and the render-edge sort for the same non-problem. §8.3 says to ask only if the absence of a cap turns out to be a real problem — it has not, so this is the answer rather than a question. The measurement is here so the next person can re-run it rather than re-argue it. |

### Loading and error states, swept

The team asked for this directly — *"when a person pastes an image in wherever, it should have upload
loading inside its thumbnail, make sure it's handled cleanly and correctly"* — so every surface this
brief touched was walked, not just the editor.

| Surface | While it is working | When it fails |
|---|---|---|
| **Pasting an image** | The picture itself, in the document, at the caret, at its own aspect ratio, dimmed, with a **determinate bar** over it. The percentage caps at 99 until the server answers, because a bar sitting at 100 while nothing happens reads as a hang. | The placeholder is removed **entirely** — no broken image, no orphan — and the reason is a sentence: the size and the limit, the HEIC setting that fixes it, or "check your connection". A draft carrying a half-uploaded image is stripped on restore. |
| **The editor itself** | `loading the editor…` in a box the height it will be, so nothing jumps when TipTap arrives. | — |
| **A thumbnail** | A shimmer inside the box the image will occupy, sized from the file's own dimensions. | A quiet "image unavailable" box at that same size, with the alt text. Never the browser's broken-image glyph, which reads as the app being broken, and never nothing, which reads as no attachment. |
| **The viewer** | `loading…` over the frame; a new slide resets it during render, not in an effect, so one frame of the previous picture's "loaded" state never shows under the next one's src. | "This image is not here any more", with its alt text. |
| Title, description, highlight | A spinner in place of the pencil, and the text dims. | `useOptimistic` reverts and a toast says why. |
| A criterion | The new wording shows immediately; the row dims. | The optimistic text goes away **at the same moment** the reason arrives. |
| A comment edit / withdrawal | Spinner on the control, the comment dims. | Inline `role="alert"` under the editor for an edit; a toast for a withdrawal. |
| A time entry | The row dims — `disabled` alone says "not now" without saying "something is happening", which on a slow connection is indistinguishable from a click that missed. | Toast. |
| Delete / move an item | Spinner on the button. | Toast, and the item stays. |
| Confirm a distribution | Spinner on the button, which already names the amount. | Toast, including the specific sentence for two admins confirming at once. |
| A setting | A small spinner beside the label; the field reverts to the stored value on refusal. | Toast naming the bound that was missed. |
| `/app/earnings` | `loading.tsx` shaped like the board. | `app/app/error.tsx` covers the route. |

Two things fixed while walking it: a progress event that landed after the editor unmounted would have
dispatched into a destroyed ProseMirror view (the abort stops the request, not an event already in
flight), and a pending time entry and client row looked identical to an idle one.

**One more thing the sweep found, and it is the best kind.** A3 says to "confirm the new editor
inherits" the 16px coarse-pointer rule. It does not. That rule names `input, select, textarea`, and the
rich-text surface is a `contenteditable` **div** — so it matched nothing, and `.coditu-prose p`
re-declared 14px. iOS Safari auto-zooms any focusable editable element under 16px and does not zoom
back out, so tapping into the composer on an iPhone left the reader at 1.4x with the sheet off the side
of the screen: the exact failure that block was written to prevent, arriving through the one element it
does not match. Fixed by naming `.coditu-prose`, which is safe to scope that way because a rendered
comment uses its own classes — how a thread *reads* on a phone is untouched, only what you type into is
raised. In `07-FIELD-NOTES.md`, and asserted as a computed style in `mobile.spec.ts`.

---

## 2026-08-24 — the suite was finally run, and it was not green

The previous session wrote this brief's specs and could not execute them: no Docker, no PostgREST, no
Playwright. The ledger said so, and said somebody should run them before the team's first real sprint.
This is that run. **`npm run e2e` reported 25 failures on `main`** — the tree that is deployed.

Roughly half were the app and half were the tests, and both halves are worth reading, because the
tests that were wrong were wrong in ways that would have gone on passing for the wrong reason.

### What was actually broken in the app

| | Found by | Why nobody had noticed |
|---|---|---|
| **The exchange rate had never once been fetched in production.** `after()` may not call `cookies()`, so the refresh callback threw on every visit to `/app/earnings`. | The deployment's own runtime logs | The page is a 200 either way — it renders from the stored value by design. The only symptom was an EGP line that said there wasn't one. No test could see it; nothing on screen was wrong. |
| **Every button in the composer toolbar was frozen at "off".** TipTap v3 does not re-render on a transaction, so `editor.isActive("bold")` was evaluated once, at mount. | `aria-pressed` on an empty composer | Pressing Bold still *worked*. Only the indicator was dead — and on an empty document the indicator is the only feedback there is. |
| **The toolbar did nothing at all on an iPhone.** WebKit cancels the `click` when `pointerdown` is default-prevented. | A tap on `mobile-safari` | Measured: chrome fires `pointerdown, touchstart, click`; WebKit fires the first two and stops. Every desktop browser kept working. |
| **The 16px editor fix from the previous commit never took effect.** `.coditu-prose p` is declared again later in `globals.css` at 14px, at equal specificity, and `@media` adds none. | A computed-style assertion | The commit that shipped it says it is fixed. Source order decided otherwise. |
| **The criterion editor opened behind the sticky header on a phone** — 21px of a 74px surface reachable. | `axe`, as `target-size … partially obscured` | The browser had scrolled it "into view" correctly. It measures the viewport, not what is painted over it. |
| **A deeply nested stored document took the item page down with a 500.** Making comments editable put `body_json` into a client component's props, and React serialises those with a recursive `stringify`. | `comments.spec.ts`, which has tested exactly this since before the feature existed | The renderer's `MAX_DEPTH` was never the boundary that mattered any more. |
| **The link popover's URL field had no accessible name at all.** | A spec asking for it by name | `axe` does not flag it: the field sits inside a labelled group and the rule only looks for *a* name in scope. |

Every one of these is fixed, with the reasoning in `docs/07-FIELD-NOTES.md` and the three that were
decisions in `docs/05-DECISIONS.md`.

### What was wrong with the tests

Five specs could only ever have been red, and one could only ever have been green. They are written up
in `07-FIELD-NOTES.md` under "Tests that could only ever be red, or only ever green" — the substring
match in `getByLabel`, the live locator that follows a row which moves, the `<img>` that is a progress
placeholder, the toast that contains the text you are asserting has gone, and the export test that
requested `?export=csv` from a route that has never existed and audited Next's inline runtime instead
of a CSV. That last one is the money-leak assertion: the one test in this suite that must never cry
wolf.

Plus the nine earnings specs, which failed for one honest reason: earnings are **off** until an admin
names the first tracked sprint, and nothing set `payout_from_sprint_id`. That is E1.6 working exactly
as written, and it is also a screen with nothing on it to assert against.

### Where it stands now

```
npm run lint        clean
npm run typecheck   clean
npm run test        212 passed  (16 files; 7 new, for pruneToDepth)
npm run db:test     162 passed  (2 files)
npm run e2e         450 passed, 0 failed — chromium + mobile-safari + mobile-chrome
```

### The hosted database — the seeds had never been applied

The migrations were all on production. **None of the three seed files was**, which is why the team
could not see the components: `public.components` existed and held **zero rows**, so every picker was
empty and every item's component was null.

Applied 2026-08-24 over PostgREST with the service-role key, because the seeds are SQL for `psql` and
no `psql` credential for the hosted project is available here. Each seed's own rule was preserved —
components only ADD, attributions only fill a NULL and match on **title** never on key, developers only
set a flag that is currently false — and the local database, freshly reset with all three applied, was
the source of truth for what they produce.

| | before | after |
|---|---|---|
| `public.components` (meinevim) | 0 | **41** |
| work items with a component | 0 | **93** of 103 |
| `profiles.is_developer` | 0 | **3** |

The ten items left unattributed are the ambiguous ones the seed file names and refuses to guess at —
"CR: Instagram / LinkedIn Feed", "Responsiveness for Link Kachel, Tabs with Cards, Newspart",
"Add optional titles to all webparts" and seven more. Re-running the applier reports 0 to do.

Verified in the browser on `https://coditu-phi.vercel.app`: the component picker lists all 41 with
their toolbox icons, COD-243 reads **EVIM Themen Kachel**, and no money appears on the item, the table
or the board.

---

## 2026-08-24 — the status rename landed, and it cannot be deployed the usual way

`claude/ticket-status-naming-785e53` had been sitting as **uncommitted working-tree state** in
`.claude/worktrees/` since 2026-08-21: thirty files, a migration, an ADR, tests and seed updates, none
of it ever committed. Its branch tip was already an ancestor of `main`; only the changes on top were
missing, so nothing in `git log` showed it and one `git worktree remove` would have taken it. It is
committed and merged now.

The migration was renumbered `20260821190000` → **`20260825100000`** so it sorts after everything
already applied to the hosted database. Nothing referenced the old filename;
`tests/status-order.test.ts` reads the directory and sorts, so it followed on its own.

Four conflicts, resolved by the rule this repo already has: `05-DECISIONS.md` and `06-PROGRESS.md` are
append-only, so **both** sides survive. `supabase/seed.sql` took `main`'s side — the branch's copy
predated the Notion import and had the wrong sprint for every row — and the four status literals were
renamed across it afterwards.

Regenerating `lib/supabase/database.types.ts` (needed, because `alter view … rename column` moved four
column names) also revealed that the committed types were **stale in another way**: `projects.key_prefix`
is `not null` with no column default and is filled by a BEFORE INSERT trigger, which the generator
cannot see, so it marks the column required. `createProject` had been omitting it against types that
said it was optional. The runtime was always correct; the types were not. Now cast, narrowly, with the
reason written down.

### The deployment hazard, and why this one is different

**An enum rename is not backward compatible in either direction.** Proven on a throwaway database
rather than assumed:

```sql
alter type s rename value 'todo' to 'ready';
select status from t;              -- 'ready'  — existing rows follow, automatically
select * from t where status = 'todo';
-- ERROR: invalid input value for enum s: "todo"
```

So the usual rule in this file — *apply the migration BEFORE the code that reads it* — does not save
you here. It is the rule for an **added** column, which is invisible to the deployment already
running. A renamed enum value is visible to it, and fatal:

- migration first → the running deployment sends `'todo'` and every status filter, the board and the
  table break;
- code first → the new deployment sends `'ready'` against a database that has never heard of it, and
  the same screens break.

There is no ordering that avoids a window. **`main` pushing to `origin` auto-deploys to production**,
so pushing this merge on its own would take the app down until somebody ran the migration by hand.

**Therefore it is committed on `main` and deliberately NOT pushed.** The two steps have to happen
together, in this order, by somebody who can do both:

```bash
# 1. apply the rename to the hosted database (needs the DB password; the
#    service-role key reaches PostgREST, which cannot run DDL)
supabase link --project-ref hayfsvsepgfescojesbd && supabase db push

# 2. immediately after it reports success
git push origin main
```

Between the two there is a window of seconds to a minute in which the deployed code and the schema
disagree. With a four-person team that is a choice about *when*, not *whether* — pick a quiet moment.
Verify afterwards:

```sql
select unnest(enum_range(null::work_item_status));
-- draft ready in_progress in_peer_review in_qa changes_requested done blocked
select status, count(*) from public.work_items group by 1 order by 1;
```

Locally the whole thing is applied and green: the enum reads in the new vocabulary, the four
`v_sprint_summary` aliases followed, and the 104 imported items carry the renamed values with no row
rewritten.

### Verified on production, after the fix shipped

`9f3a890` was pushed to `origin/main` on its own (the rename is deliberately held back — see above) and
deployed. The exchange rate, which had never once been fetched:

```
usd_egp_rate_micros  50863906        (50.863906 EGP/USD, an integer — invariant 2)
usd_egp_source       live
usd_egp_fetched_at   2026-08-24T18:34:58Z
```

and the screen now reads `EGP 50.86 / USD · live, 2026-08-24`, which is the format E3 asks for, word
for word.

With the effective-from sprint set, `/app/earnings` renders the whole of workstream E against real
data: Week 17, 17.5 h logged, **provisional**, pot `$210.00 / EGP 10,681.42` at `$12.00/h`, the two
developers with their minutes and shares (77.1% and 22.9%), and a **Confirm distribution** panel that
pre-ticks only the one at or above 25% — `pre-ticked for anyone who logged 25% or more · split
equally, not proportionally`, with the pot, the per-person amount and the rate all shown *before* the
button. E1.5 and E4, working, on the team's own hours.

### `npm run budgets` — the number nobody had measured, and it is over

§7 lists it and it had never been run. It fails:

```
ok    marketing                own    13.6 KB / 20 KB
FAIL  app shell (sprint table) own   116.2 KB / 110 KB      (framework floor 140.2 KB)
```

**This is not new, and it is not from today.** The previous `main` (`dd7a247`) was built in an isolated
worktree and measures **116.2 KB — byte for byte the same**. Today's commits added nothing to the
shell. The ledger's last recorded figure was 109.9 KB of 110 KB *before* this brief's work, so the
brief itself spent the remaining headroom and 6.2 KB more, and shipped without the check being run.

Where it went, by chunk: 65.0 KB is the Supabase client (auth + realtime), 24.8 KB is `dnd-kit` across
two chunks, 14.7 KB is `lucide`, 14.4 KB is Radix. The intercepted item route
(`(.)items/[key]`) shares the sprint page's chunk group, so the client components F2 added there —
comment actions, item fields, the uploading-image node — land in the shell with it.

**Not fixed here, deliberately.** It is a scoped piece of work (moving the item-route islands behind
`next/dynamic` and re-measuring), it is a pre-existing regression rather than something this session
introduced, and doing it half-way in the same breath as an enum rename that cannot be deployed
normally would be the wrong trade. It is written down here with the measurement so the next person
starts from a number instead of a suspicion.

---

## The client portal and access management

A client contact — a named person at a client company — gets an authenticated, strictly-bounded view
of the projects shared with her, and a place to answer Coditu's questions. Internal administrators
manage invitations, membership, capabilities, publication and revocation.

Worked in slices, each with its failing test observed before the code. Newest at the bottom.

| # | Slice | Status | Commit | Verification |
|---|---|---|---|---|
| C1 | **The account boundary** — `profiles.account_kind`, `is_active_member()`/`auth_role()` mean *internal*, `is_admin_or_lead()` stops being three-valued, `"own profile read"` | `done` | `bbd19d8` | `npm run db:test` — **186** assertions (was 162). 24 new, 15 of which were observed failing first |
| C2 | **The application boundary** — `getCurrentProfile()` answers for internal accounts only, `getClientContact()` is its mirror, `/client` is its own route tree with its own shell, both layouts redirect to the other's home | `done` | `4203645` | `npm run e2e` — **462 passed, 4 skipped, 0 failed**, including 5 new boundary specs. Zero horizontal overflow at 320/375/390/430/1280 |

### C1 — what the test found before the code existed

The fifteen failures are the record of what a client account could read on the previous commit, with
nothing but an `is_active = true` profile row:

```
# Failed test 143: "a client reads no work items"
# Failed test 144: "a client reads no internal comments"
# Failed test 146: "a client reads no time entries — hours are internal"
# Failed test 147: "a client reads no activity log"
# Failed test 153: "a client reads no payouts — money is never client-visible"
# Failed test 154: "a client reads no settings, including the hourly rate"
# Failed test 155: "a client reads exactly one profile: her own"
```

That is not a hypothetical about a feature not yet built. It is what the schema does today for any
account that exists — the portal simply had no way to create one. The eleven
`using (public.is_active_member())` read policies are the right rule for four people who work
together and the wrong one the moment a sixth kind of person has a password.

**Two migrations, deliberately split.** `20260825110000_client_accounts.sql` introduces the concept
and nothing else; `20260825110100_internal_only_reads.sql` changes the meaning of eleven existing
policies by editing two function bodies. The second is a diff worth reading on its own, and pairing
it with the column definition would have buried it.

**`is_admin_or_lead()` was three-valued and nobody knew.** `select public.auth_role() in
('admin','lead')` returns **null**, not false, once `auth_role()` can be null. Every current caller is
an RLS clause, and RLS fails closed on null in both `using` and `with check` — so this was never
exposed and is not a vulnerability report. It is a trap primed for the next person who writes
`if not public.is_admin_or_lead() then raise …`, where `not null` is null, the `if` does not fire, and
the guard silently permits. Fixed with `coalesce(…, false)` in the same migration. Found by writing
the assertion first; invisible to reading the function.

**The one row handed back.** A client must read her own `profiles` row or the portal cannot render
her name, and tightening `is_active_member()` took it away with everybody else's. `"own profile read"`
is a second permissive policy scoped by primary key — it cannot return a second row, and the
assertion checks both halves: exactly one row, and it is hers.

### C2 — the browser found what the database could not

`supabase/tests/rls.sql` already proved a client account reads no rows. That was necessary and it was
not sufficient. The first run of `e2e/client-boundary.spec.ts` said so:

```
Expected pattern: /\/client$/
Received string:  "http://localhost:3000/app/projects"
```

A client contact who typed `/app` **rendered the internal shell** — rail, topbar, New-item control,
tab bar — and settled on `/app/projects`. Every panel was empty, because RLS returned nothing, and an
empty internal shell is still the internal shell: it is the wrong furniture, the wrong navigation, and
the wrong promise about what this account is for.

`getCurrentProfile()` had let her through because `"own profile read"` lets her read her own row and
`is_active` is true. It now returns null for any account that is not `internal`, which is the change
that makes the twenty-two `role === "engineer"` denylist checks unreachable rather than merely
unfriendly — the caller bails out before a role is ever compared.

**Redirected, not refused.** `getCurrentProfile()` returning null covers two different people, and
they must not get the same answer. A signed-out visitor belongs at `/login`; a client contact's
password works, so a sign-in form tells her it does not and loops. `app/app/layout.tsx` asks
`getClientContact()` before choosing, and only on the path that was going to redirect anyway.

**`/client` loads one row.** The internal layout awaits four queries — every project, every profile,
every project's component registry, an unread count — before rendering. The client layout awaits one:
who is asking. That is the reason this is a separate tree and not a flag, and the 116.2KB shell is the
second reason.

**Measured, at the widths that matter.** `/client` at 320, 375, 390, 430 and 1280: no horizontal
overflow at any of them, and the returned HTML contains none of `COD-`, `Log time`, `Earnings`,
`assignee`, `minutes_logged` or `hourly`. Not hidden — absent.

**The e2e specs for this brief are local-only**, per the standing instruction to keep new browser
verification out of git unless asked. `e2e/client-*.spec.ts` and `e2e/client-fixtures.local.ts` are
gitignored. They run, they gate the work, and they are not committed — say the word and they go in.

| C3 | **Access** — `client_contacts`, `client_invitations` (+ projects), `client_project_grants`, `guard_client_grant_company`, `client_has_capability()` | `done` | `b686931` | `npm run db:test` — **210** assertions (was 186) |
| C4 | **Capabilities** — `lib/client-access.ts`: the enum mirror, Observer/Collaborator/Custom, resolution, the "this reveals…" sentences | `done` | `b686931` | `npm run test` — **237** (was 220) |

### C3/C4 — three revocations, each sufficient on its own

Access can be withdrawn at three independent levels: the profile's `is_active`, the contact's
`status`, and the grant's `revoked_at`. Each is asserted separately, because "we revoked her and she
could still see it" must not be reachable by forgetting one of them. The revocation assertion is made
from inside a session opened **before** the revocation, which is the case that actually matters —
nothing is cached in a claim, so the next request sees it.

`client_has_capability(project_id, capability)` takes no contact parameter and never will. One that
did would be a way to ask about somebody else's access, with every caller trusted to pass its own id.

**A test was corrected rather than a behaviour bent.** The first draft asserted that a contact
updating her own grant raises `42501`. It does not — a row-filtering policy denies by matching
nothing, so the statement succeeds and reports zero rows, which this repo documents elsewhere.
Asserting a failure mode Postgres does not have is a test that passes for the wrong reason. It now
asserts the stored capabilities did not move, checked from the owner's session. The INSERT case does
genuinely raise, because a `with check` violation is an error rather than a filter, and is still
asserted that way.

**The seed suite failed twice for a reason that was not the code.** `db:test` reported
"95 of them were already ticked in Notion" and "104 attachments" failing, immediately after a full
`npm run e2e`. Both are absolute counts over seeded rows, and the e2e suite ticks criteria and
uploads images against the same local database. A `db:reset` cleared both. This is the shared-database
note in `07-FIELD-NOTES.md` arriving in a new place: **`db:test` after `e2e` is not a clean run**, and
the two failures name the seed, not the change under test.

| C5 | **Publication** — `components.client_summary`/`published_at` with a check constraint, `work_items.client_published_at`/`client_title`/`client_summary`, both column guards | `done` | `bc778c0` | `npm run db:test` — **223** assertions (was 210) |
| C6 | **The read boundary** — `client_projects()`, `client_components()`, `client_component_work()`, `client_current_sprint()` | `done` | `bc778c0` | `npm run db:test` — **237** assertions (was 223) |

### C5/C6 — the two assertions worth reading

**The aggregate leak.** A design that filters hidden rows at the render edge produces a specific
failure: the row is gone from the list and still counted in the total beside it. A client reading
*3 pieces of work* against a list of one has been told the other two are there. Every count and sum
is computed inside the RPC, over published rows only, in the same query that returns the list — and
there is an assertion whose entire job is that number.

**Hours are null, not zero.** Without `view_effort` the effort column comes back NULL rather than 0
or absent. Zero is a lie the UI renders as a fact; an absent column gives the row two shapes and
makes every caller know which one it got. Asserted both ways: null without the capability, non-null
one statement after it is granted, same call.

**`now()` is the transaction timestamp, and it hid a guard.** The assertion "an engineer cannot
publish their own item" passed against a guard that never fired. pgTAP runs the whole file in one
transaction, so the engineer's `client_published_at = now()` wrote the byte-identical value the lead
had written a statement earlier; `is distinct from` was false and the guard correctly did nothing.
It asserts **unpublishing** now — genuinely distinct, and the sharper attack anyway, since it is how
a late piece of work disappears from a report a client is already reading.

**Fixture bleed, in the same transaction.** `client_components()` returned two rows where the test
expected one, because the publication section three hundred lines earlier had published a component
into the same project and nothing rolls back until the end. The read-boundary section now unpublishes
it explicitly rather than asserting "1" while meaning "1 of the 2 I happen to know about".

| C7 | **The read model** — `lib/data/client.ts`, four loaders, one RPC each, importing none of the internal ones | `done` | `a8cd471` | `npm run typecheck` |
| C8 | **The portal** — overview, component detail, loading states, `not-found.tsx`, `ProgressLine`, `ComponentCard` | `done` | `a8cd471` | 14 portal specs; axe clean on both screens; 0 overflow at 320/360/390/430; `/client` own JS **0 KB** |

### C7/C8 — measured, and two bugs a test could not have found

**The portal ships less JavaScript than `/login`.** Own cost over the framework floor: **0 KB**, against
408 KB for the internal sprint table. There is no `"use client"` file in the portal at all — nothing
in it yet needs one. The app shell is 116.3 KB against its 110 KB budget and has been since before
this work (`bd66f65` measured 116.2); hanging a second audience off it would have made a failing
number worse.

**Two rendering bugs, both invisible to every assertion.** The progress track used `--ring-track`
(`rgba(11,14,20,0.48)`) — right for a thin circular ring stroke, catastrophic as a 6px bar, where the
*empty* track read as a *full* one: "0 of 3 done" sat under something that looked finished. And the
fill was `bg-[var(--signal)]`, but `--signal` is a `linear-gradient`; Tailwind's `bg-[…]` compiles to
`background-color`, a gradient is not valid there, the declaration was dropped, and the fill painted
nothing at all. Both render, both are the right size, both have correct accessible names. Only a
screenshot showed them.

**The screenshot harness was lying too**, in the same direction. It shot at `networkidle`, which is
before the entrance reveals finish, so every capture was blurred and every capture looked like a
rendering fault. It waits for `[data-reveal]` to reach opacity 1 now — the same question
`auditA11y` already asks, and for the same reason.

**Reveals settle correctly and are not pinned**: opacity 1, no transform, `blur(0px)`, `will-change:
auto`. Without JS they render at opacity 0 — **which `/app/projects` does too**, identically. The
`.js` gate in `globals.css` covers `[data-reveal-on-view]`, not the entrance tiers, and the
authenticated app has always required JS. Not introduced here, and not changed here either: fixing it
would change every internal screen.

| C9 | **The invitation** — `handle_new_user` reads a server-side invitation, `enforce_email_allowlist` accepts one | `done` | `3855a1f` | `npm run db:test` — **246** assertions (was 237) |
| C10 | **The access manager** — `/app/clients`, `lib/actions/client-access.ts`, `lib/data/client-access.ts`, role-aware nav | `done` | `3855a1f` | 5 admin specs incl. the full round trip |

### C9/C10 — the round trip, driven rather than described

`e2e/client-access-admin.spec.ts` does the whole lifecycle through the real UI: an admin opens
`/app/clients`, fills the invite form, and the effective access is on screen before the button —
Collaborator, and asserted **not** to contain "See total hours" or "Open shared files". The account
is created, the password comes back once, and the test greps the invitation row to prove it was
stored nowhere. Then it becomes her: signs in with that password, is stopped by the forced password
change, sets her own, lands on `/client` seeing exactly the one project she was granted and the one
published component, and is redirected away from `/app`. Finally the admin withdraws access and her
**already-open tab** empties on reload.

If the invitation, the trigger, the grant, the guard and the read model disagree anywhere, that spec
is where it shows.

**The window that is not there.** The invitation row is written before the account, so
`handle_new_user` creates the profile, the contact and the grants in one transaction. The other
order leaves an interval — short, unobservable, real — in which a brand-new account is `internal`
and `is_active_member()` is true for it.

**`NavItem` gained `visibleTo`.** Clients is the first destination that is not for the whole team,
and a nav item that 404s reads as a broken app rather than as a screen that is not yours. The rail
and the phone's overflow sheet now read one predicate instead of each filtering for itself — the same
reasoning that put `isActive` in `nav-items.ts` in the first place.

**`generateTemporaryPassword` moved to `lib/temporary-password.ts`.** `lib/actions/profiles.ts` is
`"use server"`, so every export from it must be an async Server Action and a plain function cannot be
shared out of it. The algorithm is unchanged and `setTemporaryPassword` now imports it.

| C11 | **Questions** — `client_threads`/`client_messages`/`client_thread_reads`, the thread RPCs, `/client/questions`, the composer | `done` | `958901f` | `npm run db:test` — **263** assertions (was 246); 10 question specs |

### C11 — the bug the browser found and the database could not

`client_threads` and `client_messages` have no internal-only columns, so reading them with ordinary
`.from()` selects and letting RLS pick the rows was right. The first version returned an **empty
list** to a client who had a question waiting.

The list also needs what a thread is *about* — `components!inner ( name, slug )`,
`projects!inner ( slug )`, and the author's profile — and a client contact cannot read any of those
three. `!inner` on a join that returns nothing drops the parent row, so the query came back `[]`. No
error, no 403, no permission message. The screen said "Nothing to answer right now" while the
database was perfectly willing to say there was one.

**The pgTAP suite was green the whole time**, because the SQL was never wrong. Only the browser found
it. Both loaders go through `client_thread_list` and `client_thread_messages` now, and the rule is in
`07-FIELD-NOTES.md`: *a client-safe table is not a client-safe query*.

**And a second invisible one.** The portal header clipped "Sign out" at 320px — no scrollbar, no
overflow, just a control that could not be read or hit, because `html` carries `overflow-x-clip`.
That is the same failure the topbar shipped in step 7. The fix is an icon below `sm`; the guard
asserts element geometry rather than document width, for every header control at 320/360/390.

| C12 | **The internal side** — publish a component and its work, ask a question, resolve one, from the component page | `done` | `3da9eb7` | `npm run lint && npm run typecheck`; rendered at 320/375/390/430/1280 |

### C12 — a build error that four green commands did not see

`client-visibility-panel.client.tsx` imported one const from `lib/data/client-threads.ts`, which
begins `import "server-only"`. `typecheck` passed. `lint` passed. `test` and `db:test` passed. The
rule is enforced by the **bundler**, so only building or opening the page finds it — and the
screenshot did.

Shared vocabulary now lives in `lib/client-threads.ts`, which has no `server-only`; the loaders stay
where they were and re-export it. Types were never the problem — they are erased — it is a runtime
value that drags a module across the boundary. In `07-FIELD-NOTES.md`, with the general form: the
green gate never opens a page, so a route no spec visits is a route where a build error can sit.

### What this brief did NOT do

Stated plainly rather than left to be discovered:

- **`view_attachments` is a capability with nothing behind it.** The enum value exists, the presets
  correctly leave it off, and the access screen offers it with its "this reveals…" sentence — but no
  client-facing attachment path was built. Granting it today changes nothing. It should either be
  built or removed from the enum before anybody is told it works.
- **No notifications.** A client is not told a question is waiting, and Coditu is not told an answer
  arrived, except by opening the portal. `push_subscriptions` and `lib/push/*` exist and were not
  extended; the payload rules for a client thread (title and state, never message text) are written
  in the plan and not implemented.
- **Editing and withdrawing a message have policies but no UI.** RLS allows an author to edit their
  own and an admin to soft-delete any; neither screen offers it yet.
- **`/app/clients` has no per-project grant editor.** An admin invites with a capability set and can
  revoke or restore the whole contact; changing one project's capabilities afterwards is
  `setClientGrant`, which exists and is unused by any screen.

---

# The workspace redesign — W0…W13

Source: `Coditu design system updates 2-handoff.zip` (2026-08-25), the `PLAN.md` brief that produced
it, and the engineering half that brief deliberately held back. Notion's workspace logic through
Coditu's own instrument identity.

**Out of scope, and unchanged except where an entry point moves:** the marketing site, the client
portal, the PDF sprint report, the Notion importer.

**The prototype is a prototype.** Its `@coditu.app` addresses, snapshot ids, storage sizes, backup
schedule, routes and Week 17 metrics are demonstration content. The only confirmed real address is
`mohamedtamer200200@gmail.com` (Mohamed Tamer, Admin).

| # | Phase | Status | Commit | Verification |
|---|---|---|---|---|
| W0 | **Baseline and characterisation** — branch, real gate numbers, two stale docs corrected, the read boundary pinned by shape | `done` | `6ff7cb8` | `lint` + `typecheck` clean · `npm run test` **237** · `npm run db:test` **283** (was 263) · `npm run budgets` **FAILS 116.5/110, pre-existing** · `npx playwright test` **466 passed**, 4 skipped, 4 contention failures each of which passes alone |
| W1 | **Budget paydown** — get the app shell under its own 110 KB gate before anything is added to it | `done` | `c669851` | `npm run budgets` **OK — 68.3 KB / 110 KB own, 208.3 / 220 total**, both for the first time · `e2e/palette-realtime.spec.ts` 11 specs incl. a live write reaching the table and two new token-endpoint assertions |
| W2 | **Multi-component** — `work_item_components`, backfill, client RPCs re-pointed, chips, `any`/`all` | `done` | `4df9a48` | **2a schema + 2b read model done:** `db:test` **298** · `test` **241** · `lint`/`typecheck` clean · 73 specs across components, sprint-table, item-detail, new-item. **2c client RPCs done:** `db:test` **303** · 34 portal specs. `test` **245** · `db:test` **303** · components 12/12 incl. axe with the panel open · sprint-table, new-item, inline-edit 33/33 · rendered at 320/375/390/430/1280 |
| W3 | **Versioned block documents** — one editor, one allowlist, `*_json` + `*_version` beside the text projection | `done` | `d1c3f98` | **3a vocabulary + renderer + columns done:** `test` **252** · `db:test` **306** · comments/criteria/editor specs green. **3b blocks + Alt↑/↓ done:** `test` **252** · editor 11/11 incl. a checklist round-tripping to `taskItem` · `budgets` **OK 69.2/110**. `/` menu, editor 16/16 incl. axe with the menu open, `budgets` **OK 69.2/110**. **W3 done.** `test` **252** · `db:test` **306** · 49 document specs · `budgets` **OK 72.7/110** after finding two 60KB client-bundle regressions |
| W4 | **Reliable writes, revisions, audit, trash** — idempotency keys, revisions, version history, `/app/trash` | `done` | `72853ed` | pgTAP append-only + restore-as-new-version · e2e duplicate submit, offline retry |
| W5 | **Presence and realtime** — entity-scoped presence and typing, no draft content on the wire | `done` | `34b7d7e` | two browser contexts · socket frames carry no text · channel gone on unmount |
| W6 | **Shell and Workspace Home** — sidebar/rail/overlay/bottom bar, breadcrumbs, ⌘K, `/app` becomes Home | `done` | `f491856` | one `aria-current` **per navigation** (the trail's last crumb is the ARIA breadcrumb pattern — see `05-DECISIONS.md`) · zero overflow at 13 widths + 200% · axe · `budgets` **OK 74.6/110, 214.6/220** · `test` **293** · `db:test` **338** · full e2e `--workers=1` **550 passed**, 1 contention failure that passes alone · rail 12/12, navigation 15/15, home 8/8. **Favourites and recents deferred** to W7/W9, recorded rather than faked |
| W7 | **Sprint database** — multi-column sort, filters, saved and shareable views | `done` | `pending` | **W7a comparator + W7b sorting + W7c filters + W7d saved views:** `test` **331** (38 new) · `db:test` **338** · `budgets` **OK 77.9/110** · sprint-table **24/24** incl. axe with a two-key sort and with the panel open, and the panel as a sheet at 390 · 198 specs across every dialog-bearing suite on three devices, for the `DialogShell` portal. **W7d:** `test` **345** · `db:test` **351** (13 new RLS) · `budgets` **OK 79.6/110 own, 219.7/220 total** · saved-views **6/6**. **Deferred to W8:** favourites, which this unblocks |
| W8 | **Projects and project home**, the favourites W6 deferred, and the budget paid back | `done` | `pending` | the list searches, filters by a derived state and shows archived behind a toggle; the project page gains a header, a running-sprint control and four panels at a measured 1400px; favourites are a table, a star on three surfaces and a sidebar section · projects 7/7, project-home 8/8, favourites 5/5, all incl. axe · `test` **375** · `db:test` **364** · `budgets` **own OK 75.7/110; §5 total 215.7/220 after W8d** |
| W9 | **People & Access** — the access log, the roles matrix, safety states made visible | `done` | `pending` | `access_events` written by triggers and writable by nobody · 12 new pgTAP incl. three write refusals · e2e **disabled-and-explained** on all three self controls · `test` **382** · `db:test` **376** · `budgets` **OK 75.7/110, 215.7/220**. Client contacts stay on `/app/clients` — see `05-DECISIONS.md` |
| W10 | **Profile · Workspace Settings · My Earnings · Team Payouts** — formulas untouched | `done` | `8904f20` | `lib/earnings.ts` untouched — the three functions are the bytes they were at W0. **W10a:** the boundary asserted both ways, the outward list widened from 11 paths to 27 incl. the client portal, which nothing had ever checked. **W10b:** `/app/profile` split out; `/app/settings` is admin-only and redirects everybody else. **W10c:** Team payouts on `/app/settings/payouts`, read by every internal member and confirmed only by an admin — the team's own §E5 rule, kept. `test` **387** · `db:test` **376** after a `db:reset` · `budgets` **OK 75.9/110 own, 215.9/220 total** · every spec W10 touched green together — **227 passed, 6 skipped, 0 failed** across eleven files, from a `db:reset` · full `e2e --workers=1` reached **606 passed, 0 failed** once and a rotating 2-3 contention failures on four other runs, each passing alone and none naming a file this phase changed — see the note below |
| W11 | **Version history UI and Trash** | `done` | `pending` | **W11a** the restore promise asserted · **W11b** `/app/history` built, filters in the URL and in the query · **W11c** the bin searches, and cannot be made to print a withdrawn comment. `test` **404** (17 new) · `db:test` **376** · `budgets` **OK 76.0/110 own, 216.0/220 total** · the six spec files W11 touches **167 passed, 3 skipped, 0 failed** from a `db:reset` |
| W12 | **Backup & Recovery Center** — application recovery, infrastructure coverage labelled unverified | `todo` | | e2e rehearsal pass **and** fail, live rows untouched |
| W13 | **Responsive, a11y, security, performance hardening** | `todo` | | full `e2e` · `budgets` · `lighthouse` · `degraded` |

## W0 — the baseline, measured rather than remembered

Branching, per the handoff decision: `client-portal-and-access` fast-forwarded into `main` (it had
nothing to merge against, so the append-only-doc conflict rule did not bite), and `workspace-redesign`
branched from there. **`main` is now 8 commits ahead of `origin/main` carrying 8 migrations.** Nothing
is pushed. When it is, `supabase db push` goes with it or the 2026-08-21 `42703` outage repeats.

**`db:test` failed first, and it was not the code.** Tests 16 and 17 of `seed.sql` reported 96 ticked
criteria against 95 and 105 attachments against 104 — absolute counts over seeded rows, one higher
than the seed, immediately after a browser suite had ticked a criterion and uploaded an image against
the same local database. `npm run db:reset` and both passed. This is the shared-database note in
`07-FIELD-NOTES.md` arriving for the third time; it is worth reading the two numbers as *the seed*
rather than as the change under test.

**Two documentation corrections, both in `07-FIELD-NOTES.md`'s own spirit.** The status-vocabulary
note said the 2026-08-21 rename "is not in this repository". It is —
`20260825100000_rename_work_item_statuses.sql` is on `main`, `enum_range` on a freshly reset database
returns the renamed eight, and `parseStatusFilter` exists. The first correction had read the migration
that *declares* the enum and concluded; a later `alter type … rename value` is invisible there. The
note now says to verify a vocabulary against the live `enum_range`. C12's commit column was `pending`
and is backfilled to `3da9eb7`.

**The characterisation that was actually missing.** `rls.sql` proves what the four client functions
*return for a session* — the right project, published components only, hours null without
`view_effort`, nothing for another company. It does not prove their **shape**, and
`02-DATA-MODEL.md`'s sharpest rule about them ("there is no `select *` in any of them and there must
never be") had no test at all: a `select *` in `client_component_work` would return the right rows to
the right contact and every behavioural assertion would stay green while `description` and `highlight`
crossed the wire.

`supabase/tests/read-boundary.sql` pins the returned column list of all four verbatim, refuses a bare
`select *` in any `client_*` body, asserts all eight are definer + `search_path = ''` + revoked from
`anon` and PUBLIC, and asserts invariant 1 on the component join as a **violation count** rather than
a row count — zero, before and after the join table exists. `client_component_work` and
`client_current_sprint` had no assertion of any kind before this. It is deliberately brittle: W2
re-points two of those functions, and restating their shape has to be a decision somebody makes on
purpose.

The regexes were checked against strings rather than trusted: `select[[:space:]]+\*` catches a star
across a newline and does **not** catch `count(*)`; `\mkey\M` matches a column called `key` and not
`key_prefix` or `work_item_id`; the `client\_%` filter matches eight functions, so the definer,
`search_path` and grant loops have real inputs. A test that could only ever be green is a trap this
repository has already paid for four times in one afternoon.

**The browser gate found one real failure, and it had been on `main` since C12.**
`e2e/components.spec.ts` asserted `getByRole("heading", { level: 2 })` had the same count as the
component's sprints. C12 added the client-visibility panel to that page, with a heading of its own, so
the count became 6 against 5. **The page is right and the assertion was over-broad** — it always meant
"one sprint heading per sprint", and it now says so: `h2[id^="sprint-"]`, scoped by the id those
`<section aria-labelledby>` elements already carry.

It shipped because C12's verification was `npm run lint && npm run typecheck` plus a look at the
rendered page. This is the general lesson of `07-FIELD-NOTES.md` from the other direction: the green
gate never opens a page, and here a page *was* opened — but the suite that had an opinion about it was
never run. **A phase that changes a rendered route runs the specs for that route.**

**Three failures were the machine, and the check that says so is cheap.** Two consecutive full runs on
the same commit failed *different* fours — `client-portal`/`client-questions`/`components`/`mobile`,
then `client-portal`/`client-questions`/`criteria`/`export` — and every single one passed when run
alone. That is the shared-database and loaded-machine pattern already recorded, not a fault in
anything under test. `export.spec.ts`'s "its numbers match the database" is the tell: it is the
assertion that coordinates through the `sprintTotals` advisory lock, which only orders specs inside
one run.

## W2a/W2b — the join table, and the read model on top of it

**Schema (2a).** `work_item_components` is the truth; `work_items.component_id`
survives as a **bidirectional** mirror of the first tag. Bidirectional rather
than one-way because migrations here are hand-pushed while the app deploys
separately — the gap is days — so old code must keep both reading *and* writing
correctly. Writing the column promotes the choice to the front and keeps the
rest, so a single-select control in a stale browser cannot destroy a
multi-component attribution. Backfill: 93 rows, 0 mismatches. Both directions
probed on real seeded rows, not only in fixtures.

Every pre-existing component assertion passed **unchanged**, which is the signal
the mirror is genuinely transparent rather than approximately so.

**Read model (2b).** `WorkItemRow.component` and `WorkItemDetail.component` are
now `components: ComponentRef[]`. The sprint, board, cards, story properties and
the component dossier all read through the join. `ComponentTags` renders two
names plus `+N`, with the rest in a `title` — a `+2` nobody can read is a number,
not information.

### Three things the tests found that reading could not

**1. A `select *` guard needs the order rule in two places.** `primary_component_of()`
decides which tag the mirror holds; `orderComponentTags()` decides which chip is
drawn first. If they disagree the first chip is not the primary component, and
nobody would notice. `tests/components.test.ts` reads the migration and compares
the sort keys, the same way the status vocabulary is kept honest. The order also
has to be **total** — `position` is neither unique nor dense, so `created_at` and
the id break ties; without them the same item renders its chips in a different
sequence on alternate reloads.

**2. `server-only` is a bundler rule, and it bit again from the other side.**
The ordering helpers went into `lib/data/components.ts`, which begins
`import "server-only"` — so the unit test could not import them, while `lint` and
`typecheck` both passed. `ComponentRef`, `toComponent` and the tag helpers moved
to `lib/components.ts`, which has none, and the loader re-exports them. Types
were never the problem; they are erased. It is a runtime value that drags the
module across.

**3. Deleting a work item became impossible, and it presented as a teardown
failure.** The AFTER DELETE trigger recording an untag fired during the cascade,
with the parent already gone, and `activity_work_item_id_fkey` refused the
insert — aborting the whole DELETE. Fixed in `20260825120100`, asserted in the
suite, and written up in `07-FIELD-NOTES.md` because the shape is general.

### And one the browser found that the schema could not

The sprint filter matches **any** tag, but the table cell still named only the
primary — so a row could sit in a filtered table while the cell showed a
different component, which reads as the filter being broken. `components.spec.ts`
caught it as `toContainText("EVIM Themen Kachel")` against a row that was
correctly matched and misleadingly labelled. The picker's trigger now names every
tag. The spec's own SQL was counting through the mirror column and had to move to
the join table too: a story may carry a component as its *second* tag, where the
mirror still names the first, so the two counts diverge the moment anything adds
one — and the page is the one that is right.

## W2c — the client boundary follows every tag

`client_components` and `client_component_work` reached work through
`work_items.component_id`, which is now a mirror of the first tag. A story tagged
with the Link Kachel and the Newspart appeared under whichever sorted first and
was **missing from the other** — a client reading that component's page would
have been told less work had been done on it than had.

Both now go through `work_item_components`. **`read-boundary.sql` still passes
unchanged**, which is the point of having written it in W0: this is a change to
which rows are found, not to what is said about them, and a rewrite that quietly
widened the projection is exactly what that file exists to catch.

The assertions state the property and the two things that must not follow from
it: a tag is not a publication (an unpublished item tagged with a published
component stays invisible, and does not raise the count beside the list), and a
publication is not a tag (a published item tagged with a component nobody
published is not reachable through it).

**No assertion in this repository had ever called `client_component_work`.** Cara,
the fixture contact, was granted `view_project`, `view_components` and
`read_questions` — never `view_work` — so the function had no positive case at
all. The new section grants it, asserts, and takes it back.

**And it puts everything else back too.** Adding a second published component
turned the single-row assertions further down the file into "more than one row
returned by a subquery" — the same fixture bleed recorded for C5/C6, arriving
again in the same file, because pgTAP runs the whole thing in one transaction and
nothing rolls back until the end. The section unpublishes the component, deletes
its tags and removes the capability before handing back.

## W2c — the exports name the components, and the PDF deliberately does not

`components` is the last always-present CSV column and a `| components |` row in
the Markdown. Both were absent entirely, so this is an addition rather than a
change of contract — and it is placed at the end of the base block, so nothing
that was there before moves. The conditional blocks after it shift by one, which
is already true of them whenever an Include toggle changes; nothing can have been
reading those by position and been right.

One cell, joined with ` | `, rather than one column per component: a story may
name five, and a CSV whose width depends on its contents is not an import target.

**The PDF does not carry them, on purpose.** It is the client's artefact, and an
internal component name has not been through the publication check that
`client_components()` applies — `components.client_summary` and `published_at`
exist precisely because the internal name is not the client-facing one. The CSV
and the Markdown are internal ("for an AI agent", "detailed").

The golden files were read before they were updated, not regenerated on faith:
the diff is the header gaining one name, one row gaining two component names, one
row gaining an empty cell, and two Markdown table rows. Nothing else moved.

## W2c — the picker sends one decision, and the filter can say `all`

`ComponentMultiPicker` accumulates while it is open and sends the whole set on
the way out. Ticking three components is **one** decision; a control that
dismisses itself after each tick makes it three, each with its own round trip and
its own chance to be interrupted half way.

The commit hangs off **close**, not off the pick handler — Escape is how a
keyboard user finishes, and a commit wired to clicks would silently discard their
work. The spec closes with Escape for that reason. `onClose` sits in `close`'s
dependency array rather than in a ref: a ref keeps the identity stable and lets
`close` fire a **stale** callback, which for a panel that accumulates state is
the one failure it cannot have.

The action takes the whole set and computes the difference. Delete-then-insert
would write a `cleared` and a `set` row into `activity` for every component that
did not change, so re-ticking a box nobody touched would fill an item's history
with events that never happened.

`?component=a,b&match=all`. `any` is the widening default and an unrecognised
`match` falls back to it — a filter that quietly narrows hides work, and a link
written before the parameter existed has no `match` at all. The toggle only
appears once two components are selected, because intersecting one component with
nothing is a control that cannot do anything.

### The cleanup that stopped cleaning up

`components.spec.ts`'s `afterEach` reset attribution by nulling `component_id`.
That now removes only the **primary** tag — the column-to-join trigger promotes
and keeps, which is the whole point of it — so extras ticked by a multi-select
test survived into the next test and quietly changed what it was looking at. It
deletes from `work_item_components` directly now.

The same shape is worth watching for anywhere else: **a cleanup written against
the old single-valued column now under-cleans rather than failing**, which is the
quiet kind of wrong.

### What was verified, and what was not

`lint`, `typecheck`, `test` **245**, `db:test` **303**; `components.spec.ts`
12/12 including an axe audit with the multi-select panel open; sprint-table,
new-item and inline-edit 33/33; the table read at 320/375/390/430/1280.

The **full** e2e sweep was started and abandoned at a load average of 18 — the
condition `07-FIELD-NOTES.md` names as producing twenty timeout failures that mean
nothing. It is owed at `--workers=3`.

## W3a — one document format, and the name finally says so

`lib/comments/schema.ts` had been the schema for acceptance criteria and client
thread messages for a while; it is `lib/blocks/schema.ts` now, which is what it
has actually been. Twelve imports, mechanical, proven by `typecheck`.

Ten node types join the allowlist — `taskList`/`taskItem`, `details` and its two
children, `callout`, and the four table nodes — with a renderer case for each and
`flattenToText` reaching all of them. That last part is the half no screenshot
shows: a checklist that flattens to one run-on line is what a client reads in
the CSV.

`DOC_VERSION` is 1 and stored as `*_version` beside every document. **Adding a
node type does not bump it** — the renderer is fail-closed, so an old reader
meeting a new block degrades rather than breaks, and that is a property worth
keeping rather than versioning away. A bump is for a change that would make an
old document render *wrongly*.

`work_items.description_json`/`highlight_json` and `sprints.notes_json` arrive
BESIDE their text columns, which stay as the flattened projection written in the
same statement — the `comments.body_text` precedent, and the reason
`04-EXPORT-SPEC.md`'s contracts keep working untouched. Nothing is rewritten in
bulk: 58 imported descriptions stay as they are until somebody edits them.

**Two things checked rather than assumed.**

The callout's tone reaches a `style` attribute, so it is an allowlist — and it is
**three** tones, not the prototype's five. `01-DESIGN-SYSTEM.md` §2 defines pairs
for amber, jade and slate; a `rose` callout would have resolved to
`var(--tone-rose-fg)`, which is undefined, which is not an error — the
declaration is dropped and the callout renders with no edge at all. Checked
against `app/globals.css`, not against the prototype.

And `guard_criteria_columns` was NOT touched. The first draft rewrote it from
memory, which is how a rule gets silently dropped; reading the live function
showed the rewrite was equivalent and therefore pure risk. `body_version` travels
with the body an engineer may already write, so leaving it unnamed is the correct
answer rather than an oversight — recorded in the migration so the next reader
does not have to re-derive it.

The new work-item columns ARE named in `guard_work_item_columns`, in the
migration that creates them, with assertions that an engineer is refused rather
than merely that the name appears.

## W3b — the editor can write what the renderer can read

Checklists, toggles, callouts and tables, plus `Alt+↑/↓` to move a block.

**The order mattered.** The renderer learned these node types in W3a, before the
editor could produce them. Backwards, somebody could have written a callout that
silently flattened to its text on the next page load — the fail-closed renderer
turns a missing case into quiet data loss rather than a visible error, which is
exactly why it is safe and exactly why it must be taught first.

**Version pinning, not `^3`.** `npm install @tiptap/extension-table@^3` resolved
to 3.0.0 and failed: this project is on 3.30.2 and every TipTap package
peer-depends on `@tiptap/core` at an EXACT version. Installed at 3.30.2 and
checked `package-lock.json` for a single `@tiptap/core` — two copies of a
ProseMirror schema in one bundle would not have failed loudly.

**Three configuration choices that are decisions rather than defaults.**
`Details` is `persist: false`, because whether a toggle is open is a reading
position and storing it would send one person's collapse to everybody else's
screen. `TableKit` is `resizable: false`, because a column width is an ARRAY
attribute and `pruneToDepth` reduces attributes to primitives on the way out of
the server — a width somebody dragged would be dropped, and a handle that
forgets is worse than no handle. `Callout` is hand-rolled: about twenty lines,
block content and one enumerated attribute, and its tone list now lives in
`lib/blocks/schema.ts` so the editor cannot offer a tone the renderer will not
draw.

**The block move is written out because that is where it goes wrong.** Delete
then insert, with the sibling's size read BEFORE the delete: moving up inserts
at `from - sibling.nodeSize` (the deletion is entirely after the sibling, so its
positions do not move) and moving down at `from + sibling.nodeSize` (the sibling
has slid back). Mapping old positions through `tr.mapping` afterwards would also
work and is one more thing to get subtly wrong.

It announces into a live region, because a block move is invisible to anyone not
watching the document — the sprint table's drag reorder has the same requirement
and dnd-kit supplies it there.

**What the specs prove that a screenshot cannot.** A checklist stores as
`taskItem` with `checked: true` rather than as a paragraph beginning with a
bracket; the moved block's ORDER is what reaches `comments.body_text`, not just
what was drawn; `Alt+↑` on the first block does nothing rather than something;
and the stored checklist renders through the SERVER walker — a different
implementation from the editor's schema, which had to learn the same node.

The first draft of the announcement assertion used `[aria-live='polite']` and
matched five elements: the criteria count, the thread, the hours stepper, the
toast rail and the new one. Asserting on that attribute is asserting that no
other part of the screen has anything to say.

## W3b-ii — the slash menu, and the Escape that never worked

`/` at the start of a block opens the twelve-item menu, built on the same
`@tiptap/suggestion` plugin the `@` list uses. One interaction language: arrows
move, Enter or Tab picks, Escape dismisses. Somebody who has learned `@` already
knows `/`.

`startOfLine: true`, which is the difference between a shortcut and an ambush —
"and/or", "src/lib/blocks" and every pasted path would otherwise open a block
menu mid-sentence. The spec for it was written by accident: the Escape test typed
"keep me" first and the menu correctly refused to open.

### Escape has never dismissed the mention list

Found while building the `/` menu, which has the identical shape.
`editorProps.handleKeyDown` treats Escape as "step away" — blur without
discarding, because the draft is in `localStorage`. **ProseMirror's `someProp`
checks the view's own props before any plugin's**, so that branch wins and
neither suggestion plugin ever sees the key: one press blurred the whole composer
while the list stayed on screen.

Nothing asserted it, so nothing said so. There was no spec anywhere that pressed
Escape with the mention list open.

The editor now tracks whether a menu is showing and stands aside for exactly one
press. Both menus have a spec.

**The general shape is worth keeping:** when two layers can handle a key, the one
that wins is decided by the framework's lookup order, not by which is nearer the
user. `someProp` is view-props-then-plugins; the DOM is capture-then-bubble; and
this repository already had `⌘K` resolved by a capture listener on the editor's
own wrapper for the same reason. A handler that is "obviously innermost" is not
necessarily first.

## W3c — sprint notes stop being a textarea

The panel keeps its shape — prose at 15px/1.65, no border box, no label, the
whole block is the edit affordance — and the textarea underneath it is the
universal editor now. `⌘⏎` publishes, Escape abandons, and the editor is loaded
only when somebody intends to write: almost everybody only ever reads these.

**`notes` is derived on the server, never sent.** `notes_json` is the document
and `notes` is its flattened projection, written in the same statement. Accepting
a client-supplied projection would let the sprint report and the Markdown export
say something the panel does not — the same reason `comments.body_text` has
always been derived.

**Legacy notes are converted on read, not rewritten.** Fifteen sprints of imported
text stay exactly as they were written; `documentFromText` turns them into a
document at the render edge, and turns the old `**wrapped**` convention into the
callout it always meant. That convention was drawn by hand as an amber left rule
before; it is a real block now, and the same one a comment can hold.

The read state goes through `CommentBody` — the same server-side walker the
thread and the criteria use. One renderer means a callout written in a comment
and a callout written in the notes are the same thing on screen, and the
allowlist is enforced in one place rather than three.

### Three things the specs found

**The seed does not use the `**` convention.** The design bundle's sample notes
do; the real Notion import uses `•` bullet lines. A spec asserting a callout in
the seeded notes was asserting the design's fiction. It writes the legacy shape
itself now, rather than assuming it.

**The server renderer was not emitting `data-callout`.** The editor's node does,
so a callout had one shape when freshly typed and another when read back. Now
both emit `data-callout` and `data-tone` — one thing to select, in a stylesheet
or a spec.

**The teardown had stopped restoring.** `afterEach` put back `notes`, the author
and the timestamp — it was written when notes were one text column — so a stale
`notes_json` survived and OVERRODE the text it had just restored, because the
panel reads the document first. It under-restored rather than failing. Same shape
as the components cleanup two phases ago: **a teardown written against the old
single column now under-cleans**, and that is the quiet kind of wrong.

### The payload shrinks rather than failing

Production migrations are hand-pushed and the app deploys separately, so a write
can reach a database with `notes` but not `notes_json`. Each attempt drops the
newest columns and retries, widest first — because losing somebody's paragraph
to a missing column is the worse half of that bug. `isMissingColumn`, not a bare
`42703`: a refused WRITE answers `PGRST204` from PostgREST's schema cache and
never reaches Postgres, which is why the first version of that fallback did
nothing at all.

## W4a — every version of every document, and a restore that cannot rewind

`activity` has recorded property changes since the first week. What it never
recorded is what a document *said* before somebody replaced it —
`document_revisions` does, for the five internal writing surfaces.
`client_messages` is deliberately left out: it is the one document a client
contact writes, and this table's read policy is `is_active_member()`.

**Captured by a trigger, not by the four Server Actions that save documents.**
Each of them would have to remember, and the one that forgets loses history
permanently and silently. The trigger also catches the writes no action makes —
the seed, a migration, a fix applied by hand in the SQL editor. Proof it works
that way: after the document e2e specs ran, history held their edits attributed
to the account the suite signs in as, and the seed's own 356 original versions
underneath.

**Append-only is what is absent.** `authenticated` has `select` and nothing
else; there is no insert, update or delete policy at all. A guard that raises
has to be written correctly and can be got round by a path its author did not
think of; a privilege that was never granted cannot. So a restore *adds* a
version — restoring v2 over v3 writes v4 with `restored_from = 2`, and 2 and 3
stay readable — because rewinding is not an operation the schema offers.

### The restore function is the one `security invoker` function in the schema

Who may restore a document is exactly who may write it, and that rule is already
written down in the surfaces' own policies and in `guard_work_item_columns`. The
first draft restated it anyway — `security definer`, admin-or-lead for the three
story-level surfaces — and got it wrong: any active member could restore a
criterion body on a story they cannot edit. As an invoker function the question
does not arise, and the refusal a test observes comes from the column guard,
naming the column.

RLS refuses a write by matching no rows rather than by raising, so the function
checks `row_count` and raises `42501` itself. Without that, a denied restore
reports success.

### The test builds its own story

Revisions accumulate and the e2e suite writes documents, so a seeded story's
revision count is whatever the last browser run left it at. The first draft
asserted COD-231 had exactly one revision and passed — by luck, because the
suite edits a different story. It now creates its own work item and criterion
inside the transaction, and numbering starts at 1 by construction.

`db:test` **324** (306 + 18) · `test` **252** · `lint`, `typecheck` clean · 31
document e2e specs pass with the trigger live. `seed.sql` 16–17 failed first
time round and were the documented e2e drift, green again after `db:reset` —
the fourth time that has cost somebody the same ten minutes.

## W4b — a submission that arrives twice happens once

`comments` and `time_entries` take a nullable `idempotency_key` with a partial
unique index scoped to the writer. The composer and the time form mint one token
per **submission** and hold it until a send succeeds, so the retry after a
failure carries the token of the attempt that failed. If that attempt reached
the database and only its answer was lost, the retry collides with itself and
the action reports success rather than writing a second time.

This is not about double-clicking — both surfaces already disable their button
while a send is in flight. It is about the layer underneath: the lost response,
the Server Action that rejects when the network goes away (which skips the
client's rollback entirely), the second tab, and the reader who presses Send
again because nothing appeared to happen.

### A column, not the claims table the brief specified

§5.4 asked for `write_idempotency (key, profile_id, action, result)`. Three round
trips instead of one on a composer that is explicitly tuned; a claim written
before a write that then fails leaves "in flight" for ever, so the honest retry
is refused until a TTL sweep runs — a new thing that can be down; and `result`
exists to replay an answer that is `{ ok: true }` either way. A unique index has
none of those: the key and the row are written by one statement, so either both
exist or neither does. Recorded in `05-DECISIONS.md` with what was rejected.

Unique **per writer**, not globally. The keys come from the browser, and a global
index would let one account reserve a key that another account's later write then
collides with — and that write would be told "already done" and silently dropped.

### The test sends the real request twice

`e2e/reliable-writes.spec.ts` intercepts the Server Action POST and dispatches it
to the server a second time, byte for byte. Nothing is simulated. Proved it
detects what it claims by removing the key from the insert: **2 comments**. With
it: **1**.

Two mistakes in that spec worth keeping:

*The counter incremented only after both requests returned, and the first draft
asserted the row count immediately.* It read green while `replayed` was still 0 —
a count of one that meant only that the first request had landed. Every
assertion now polls the replay first.

*It expected 60 minutes.* The default step on that item is 1.5 h, so the amount
is read off the button now. A test that hardcodes a product number fails for a
reason unrelated to what it checks.

### `supabase test db` said `Failed: 0` for a file that had errored

`select like(...)` — pgTAP's LIKE assertion is `alike()`. The statement raised,
psql aborted the transaction, the error went to stderr where pg_prove does not
look, and the file reported **ok, Tests: 260, Failed: 0**. The only tell was
`Bad plan. You planned 262 but ran 260`. The plan count is not bookkeeping; it is
the assertion that the file ran to the end. In `07-FIELD-NOTES.md`.

`db:test` **326** · `test` **252** · `lint`, `typecheck` clean · `budgets` **OK
72.7/110** · 74 e2e across composer, comments, item detail, inline edit and the
new spec.

## W4c — the history panel, and a diff that does not ship to the browser

Version history on a story: the timeline, a line diff per entry, and a restore.
One timeline per story rather than one per column, because the design's own list
reads *"v4 added the code block, v3 rewrote the highlight, v2 added criteria 4
and 5"* — a version is something that happened to the **story**, and asking a
reader to pick a column first asks them to already know the answer.

Reading is per story; **restoring stays per surface**. "Restore the story to the
19th" would have to decide what to do about the four documents that did not
change that day, and every answer surprises somebody.

### The client cost is one button

The diffs are computed on the server and arrive as markup; expanding is a
`<details>` element, which is keyboard-operable and announced without anybody
writing `aria-expanded`. `lib/diff.ts` never reaches the browser. `budgets`
unchanged at **72.7 KB**, for a panel with a diff viewer in it — the W3d lesson
applied before it cost anything rather than after.

Fifty lines rather than `jsdiff`, and it diffs the flattened `plain_text` rather
than two ProseMirror trees. A block-tree diff has to decide whether a paragraph
that moved and gained a word is a move plus an edit or a delete plus an insert,
and every answer is wrong for some document. The consequence is stated rather
than hidden: a formatting-only change shows **"formatting only"** instead of an
empty box that reads like a bug.

### Two things the screenshot caught that the tests could not

A null actor rendered as **"the importer"**. It is also the seed, a migration,
and a fix applied by hand in the SQL editor — three of the four cases, named
wrongly with total confidence. It reads "written outside the app" now.

And the diff needed `+` and `−` marks, not two hues.
`01-DESIGN-SYSTEM.md` forbids colour as the sole carrier of meaning, and a diff
is the clearest case there is.

### The spec inherited its own history

`e2e/version-history.spec.ts` asserted `toHaveLength(3)` and got 8 — the earlier
tests' revisions, because the table is append-only and cleanup was in
`afterAll`. Reset moved to `beforeEach`. Exactly the trap `revisions.sql` was
built to avoid, met a second time in a different file on the same afternoon.

A sixth test was written and deleted: it asserted
`refused === null || refused === 404`, which cannot fail. `revisions.sql` already
calls the RPC as an engineer and asserts `42501` with the column guard's own
message.

`db:test` **326** · `test` **264** (12 new diff tests) · 5 e2e incl. axe with a
version expanded · `budgets` **OK 72.7/110**.

## W4d — the bin, and the one thing in this application that cannot be undone

Soft delete has existed here since August and had no window into it. A story
deleted from the wrong sprint was recoverable in principle and unfindable in
practice — `list_deleted_work_items` needs you to already know which sprint to
ask about — and a withdrawn comment was recoverable by nobody at all.
`/app/trash` is the read.

`trash_list()` has to be `security definer`: a deleted story is invisible to
every SELECT this app can make, which is exactly why deleting one needed no
list, export or total to learn about it.

### It shows where something was and never what it said

A withdrawn comment appears as `Comment on COD-241` with its project, sprint and
timestamp. **`body_text` is not in the projection at all** — not hidden by the
page, absent from what the page is given. The thread hides those words from every
reader including their author, and a bin that printed them would quietly redefine
"withdraw" as "moved somewhere less obvious". The spec asserts it with
`page.content()` rather than `not.toBeVisible()`, which passes for text that is
present and hidden with CSS — the bug being looked for.

**A lead sees one and cannot restore it.** The permission matrix gives a lead
restore rights and they have them for stories; for comments the governing policy
is `edit own comment`, and widening trash to match the matrix would mean widening
that policy, which would also let a lead rewrite anybody's comment. The row says
*"only its author or an admin"* rather than hiding. Same rule as W4a: who may
restore is who may write, decided once.

### Purging

The only irreversible operation in this schema. Admin only, one row at a time,
only rows already in the bin — no "empty the trash", because a single press that
destroys an unbounded amount of work is not a control worth having. The
confirmation names what goes: the criteria, the thread, the version history and
the logged hours, with the hours stated in the row **before** anybody presses
anything, since they are invisible everywhere else once a story is binned.

### Two things found by opening the page

The row rendered the story's title and not its key, so `COD-237` was nowhere on a
screen whose whole job is helping somebody find a story that is on no other
screen. And a comment row printed its key twice — once as a chip and once inside
"Comment on COD-235".

### One pgTAP assertion was wrong in an instructive way

*"the story is still there after both refusals"* counted as the lead and got 0 —
because a soft-deleted story is invisible under RLS. The row had survived; the
policy was hiding it. Counting as the owner is what proves existence, and the
assertion says so now.

### `access_events` moved to W9

§5.3 puts it here. It has no writer and no reader until People & Access exists,
so building it now means a table with no test that can fail sitting unused for
five phases. Deferred, not dropped — recorded in `05-DECISIONS.md`.

`db:test` **331** · `test` **264** · 6 trash e2e incl. axe and the no-words
assertion · `budgets` **OK 72.9/110**.

## W5a — the spike answered yes, so the channels are private

The plan made this phase's first task a question, and the answer decides the
rest of it. Measured against realtime **v2.112.6** and `@supabase/realtime-js`
**2.112.3**: `realtime.messages` exists, partitioned by day, `relrowsecurity =
true`, **zero policies** — so a private channel was denied to everyone, because
RLS with no policy denies. `authenticated` has the grants and the client
supports `config: { private: true }`.

So yes: private channels, authorized in SQL, and the only missing piece was the
policy. **That answer is a property of those versions**, not of the idea, and it
is written down that way in `05-DECISIONS.md`.

The policy checks `is_active_member()` rather than the specific entity, because
`sprints`, `work_items` and `comments` are all gated on exactly that and nothing
narrower — a per-entity check would do a lookup to reach the answer we already
have and give the visibility rule a second home. What it does exclude is what
matters: `account_kind = 'internal'`, so no client contact and no anon. Every
private topic begins `coditu:`, or the policy would authorize any topic a caller
invented and turn the workspace into a message bus.

### No test can prove the policy is enforced, so two half-tests do

Presence works. It works identically with `private: false`, which skips the
policy entirely — so *"two people can see each other"* would stay green if
somebody deleted both policies. `rls.sql` pins their shape instead (they exist,
they name `is_active_member()`, they are confined to the prefix) and the browser
spec asserts the client really sends `"private":true` on a prefixed topic.
Neither half is sufficient alone, and the general form of that trap is now in
`07-FIELD-NOTES.md`.

### The one thing that leaves the browser unsupervised

Presence is the only place in this application where something reaches the
network without a Server Action having read it. So the spec captures the actual
WebSocket frames and asserts that typed text is not in any of them — a guard
against the obvious future change, not against the current code.

### The design had already solved the state indicator, and better

My first draft showed idle by fading the avatar. That is off-design and it is
the exact failure `01-DESIGN-SYSTEM.md` names — colour as the sole carrier, and
nothing at all to a screen reader. The design specifies a corner **dot**, and
its two hex values turned out to be `--jade` and `--amber` exactly. It also
supplies the caption — `2 here now` — which does a second job I had not
considered: it tells this avatar row apart from the sprint-member row a few
lines below, which looks identical and means who is *assigned work*.

Also fixed while wiring: `joinPresence` returned a bare teardown, so the idle
timer had nothing to call and the whole 60-second mechanism was dead code that
typechecked.

`db:test` **336** · 4 presence e2e incl. the frame assertion · 29 sprint e2e ·
`budgets` **OK 74.6/110**.

## W5b — what people are doing, and a leak found two phases late

The story's own presence line, the design's wording verbatim: `2 viewing · Adam
editing criteria`, above the title. **You are in this stack**, marked `(you)`,
unlike the sprint header's — on one story the question is whether anybody is in
here with you, and your own face is what makes the others countable. It renders
nothing when you are alone and nothing is being edited, which is nearly always.

### The editing indicator is a presence field, not a channel

§8 gives typing its own broadcast channel, throttled to one event per 3s and
expiring after 5s of silence. That is the right shape for a **per-keystroke**
indicator. This is not one: "is editing the criteria" changes when an editor
opens or closes, a handful of times a session, and it expires correctly on its
own because presence dies with the socket. Three moving parts saved, each with a
failure mode. Recorded in `05-DECISIONS.md`; per-keystroke typing is still not
built, and broadcast is still what it would need.

`useAnnounceSurface` claims a surface while an editor is mounted. Claims are a
**stack**, not a value: two editors can be open at once — start a comment, click
into a criterion — and with a single value, closing the first would clear the
indicator while the second was still open.

The subscription moved into `lib/hooks/use-presence.ts`, shared by both stacks.
`budgets` went **down**, 74.6 → 73.8 KB, because the duplicate effect went with
it.

### The provider held state, and stranded an optimistic comment

The first version of `PresenceSurfaceProvider` kept the surface in `useState`,
so opening the composer re-rendered everything under it — the thread included,
which owns the `useOptimistic` comment. *"A failed post gives the draft back
rather than losing it"* then failed with the entry stuck on `sending…` for ever:
the rollback runs inside a transition, and a re-render from above left the
optimistic entry in place.

`git stash` proved it was mine rather than reasoned about — passed on the
parent, failed with the change, passed again with one `useAnnounceSurface` call
neutralised. It is `useSyncExternalStore` now: claims in a ref, and only the
presence stack re-renders. Better regardless, since re-rendering an entire story
to change one word in a caption was never the intent.

### Running the item's own specs found a real leak from W4c

Four specs broke on strict mode — the version history panel renders a story's
writing a second time, so page-wide text locators now match twice. They were not
run in W4c, where the specs run were the new one plus a11y and navigation. The
lesson is in `07-FIELD-NOTES.md`: **after adding anything that renders existing
content in a new place, run the specs for that PAGE, not for the feature.**

Underneath the strict-mode noise was an actual leak.
`e2e/editable.spec.ts` → *"withdrawn, not vanished — and its words never reach
the browser"* reloads the page and greps the source, and it was failing for the
right reason: **a withdrawn comment's words were still in the history panel.**

Worse on inspection. `document_revisions.entity_id` addresses five tables so it
carries no foreign key; `work_item_id` does and cascades, which is why purging a
STORY already took its history. A comment had nothing — so purging one left its
words readable for ever, behind a confirmation that had just said "removes the
comment permanently".

Both sides fixed, and both are needed: `purge_deleted` deletes the comment's
revisions explicitly and **before** the comment, so a half-failure leaves a
comment in the bin rather than a vanished comment with readable words; and the
reader shows a comment's revisions only while that comment is present and
standing. Written as an **allowlist** — my first attempt asked "which are
withdrawn", which is a denylist and missed the case that actually leaked: a
comment that no longer exists at all.

Criteria are deliberately untouched by this. A removed criterion's history is a
legitimate record of what the work asked for; withdrawing a comment is
specifically the act of taking words back.

`db:test` **338** · `test` **264** · `budgets` **OK 73.8/110**.

## W6a — `/app` becomes the workspace, and three bugs the green gate could not see

Home renders the date and a greeting in Cairo, the active sprint as a card, the
two "my work" queues and the mentions list — every number read by the same
function the screen it links to uses, because Home is the one screen people
glance at without clicking through.

`/app/sprint` is the old redirect, moved. It is an **entrance rather than an
address**: it resolves the active sprint and redirects to the project-scoped URL,
which is invariant 1 living in the URL. It also solves a problem the rail had —
the navigation is a client component that cannot know which project is active,
and a fixed link to a route that does know costs nothing until it is clicked.

Favourites, recents and project spaces are in the design and are deliberately
absent: they need a table nobody has designed, and inventing them would put the
prototype's furniture on the team's home page.

### Everything below here was found by opening the page in a browser

`lint`, `typecheck` and `test` were all green on a page that **threw on every
load**. `06-PROGRESS.md` has said "the green gate never opens a page" since W0
and this is the clearest instance of it so far.

**`getSprint` takes a project id; I passed the slug.** Both are `string`, so
nothing could catch it before the query ran: `22P02 invalid input syntax for
type uuid: "meinevim"`, rendered as the error boundary.

**Every status chip printed its label twice** — *"in progress in progress 3"* —
because `StatusChipDot` already renders it.

**A sprint that ended two days ago said "0 days left"**, because `daysRemaining`
clamps at zero. Fixed at the render edge here rather than changing the shared
helper mid-phase; the sprint header has the same latent wording.

And one inconsistency of my own making: the rail's first item read **Sprint** and
pointed at `/app`, which is now Home. Fixed with a Home item and the
`/app/sprint` entrance, plus two "back to the current sprint" links in the error
and not-found pages. The marketing site's two links to `/app` correctly still
mean "open the app".

Verified at 1440/375/320 and in both themes through the app's own toggle: zero
overflowing elements at 320, measured by element **geometry** rather than
`scrollWidth`, which lies under `overflow-x-clip`.

`test` **270** (6 new for the Cairo greeting, incl. one pinning that Egypt keeps
DST — Cairo is UTC+**3** in August, and a fixed +2 is right for half the year) ·
`home.spec.ts` **8/8** incl. axe · `budgets` **OK 73.9/110**.

## W6b — the sidebar follows the viewport, and a variant that compiled to nothing

Three bands, matching the design exactly: **≥1180** a 268px sidebar with labels,
**768–1179** a 64px icon rail, **<768** gone with the bottom bar in its place.

Width is now the only input. Hover-to-expand went, and it should have: this
file's own component said the rail is hidden below `md` *because* a touch screen
cannot open it — and a tablet at 800px has no hover either, so it got
permanently unlabelled icons with no way to read them. Pinning went too, as a
default: a preference should not be needed to read your own navigation. The
collapse control survives at ≥1180 only, where collapsing changes something.

The stored key was **renamed** `coditu.rail.pinned` → `coditu.rail.collapsed`,
because the flag's meaning inverted. Reusing it would have read every existing
pin as a collapse and shut the sidebar for exactly the people who liked it open.

### The variants compiled to nothing, and looked perfect

`min-[1180px]:data-[collapsed]:w-[…]` and
`min-[1180px]:group-data-[collapsed]/rail:opacity-0` produce **no CSS at all**
here. The class names sit on the element, every static check passes, and because
the base class still applies the sidebar looks entirely right in one state — it
simply never reaches the other. The rules are hand-written in `globals.css` now,
keyed on a data attribute.

Three separate things made this hard to see, all worth remembering:

*Turbopack served a stale CSS chunk* — same hash, containing a token from one
edit but not rules appended in a later one — so the same bug presented three
different ways. Restarting `next dev` was the only fix.

*Reading `getComputedStyle` in the same call that set the attribute* returned the
pre-flush value, twice sending the diagnosis somewhere wrong.

*A width transition makes a synchronous measurement lie.* `rail.spec.ts` first
read the width directly after a resize and got **268px on its way down to 64**.
`toHaveCSS` polls; a raw read does not.

Verified in a browser at 1400 expanded, 1400 collapsed, 900 and 390, and pinned
by two new specs — the only tests that can catch a pure-CSS layout breaking.

`test` **270** · `lint`, `typecheck` clean · `budgets` **OK 74.0/110** · rail
6/6, navigation 10/10, home 8/8.

## W6c — the trail is built, tested, and deliberately not mounted

⌘K turned out to need nothing: the palette and its `Meta+K`/`Control+K` binding
already existed, with `aria-keyshortcuts` on the trigger. So W6c is breadcrumbs.

`crumbsFor(pathname, projects)` is a pure function — the topbar already holds
every project, with slugs, names and sprint numbers, so the trail needs no
fetch, no context and no per-route plumbing to forget on the seventh screen.
Eleven tests assert **every route this app has**: names rather than slugs, the
last crumb inert because you are already there, the slug as a fallback rather
than a gap in the trail, and nothing at all outside `/app`.

### And then it did not fit

Mounted in the topbar at 1400px, measured:

```
Coditu             22px  truncated
MEINEvim           73px  truncated
Sprint — Week 17   68px  truncated
COD-241            40px  truncated
```

Not a styling problem. The topbar already carries the **project switcher**,
which names the same project and sprint as crumbs two and three — two controls
saying one thing, neither fitting. The design has no switcher in its topbar
because project spaces live in its sidebar.

So the trail is un-mounted, and the order of work is recorded instead: the
sidebar takes over project switching, the switcher leaves the topbar, the trail
mounts into the room that makes. It is one line. Shipping it now would mean a
bar where the workspace's own name is twenty-two pixels wide.

`test` **281** (11 new) · `budgets` **OK 74.0/110** · rail 6/6, navigation
10/10, home 8/8.

**Next:** project spaces in the sidebar — favourites and recents with it — which
is what unblocks both the breadcrumb trail and the topbar the design draws.

## W3d — the story's own words, and two imports that cost 60KB each

`work_items.description` and `highlight` are block documents, edited with the
universal editor and read through the same server-side walker as everything else.
Legacy text converts on read — single newlines become hard breaks, because 58
imported descriptions are requirement lists and collapsing them made one
unreadable paragraph once already.

### Clicking away no longer saves, and that is deliberate

A textarea has nothing to click except away, so blur-to-save was right for it.
The editor has a **toolbar**, and pressing Bold blurs the contenteditable — so
the old rule would have committed on every formatting click, once per round trip,
half-formatted. Explicit **Save** and **Cancel** now, matching
`criteria-list.client.tsx`, which met the same constraint when criteria became
documents. `03-APP-SPEC.md` and `05-DECISIONS.md` both updated.

The first draft simply dropped `onBlur` and offered only `⌘⏎`. Typecheck passed,
lint passed, the screen looked right, and a reader who clicked away would have
been stuck in an editor with no visible way out. `e2e/editable.spec.ts` caught it
because it asserts the WRITE rather than the appearance.

### The budget caught two things reading could not

`npm run budgets` went from OK at 69KB to **184KB against a 110KB cap**. Two
separate imports, neither visible at its call site:

**`CommentBody` pulls in lowlight** — every common language, +114KB — and I put it
in two client components. `criteria-list.client.tsx`'s own header already warned
about exactly this: *"the bodies are rendered ON THE SERVER and handed down."*
Both now take a server-rendered `body` prop.

**`lib/blocks/schema.ts` pulled in zod** — +63KB — so a client component that only
wanted `isEmptyDocument` got the validator too. Split: the module is the pure
vocabulary with a hand-written shallow node parser, and `lib/blocks/validate.ts`
holds the zod `documentSchema` for the four Server Actions that need it.
`lib/supabase/env.ts` made the same split long ago and explains why in its header.

Rewriting `parseNode` by hand is a change to the security boundary, so the
semantics `z.object` provided were kept deliberately: unknown keys are STRIPPED
rather than carried, and validation stays one level deep because a recursive
schema overflows the stack on the input it exists to survive. The hostile-JSON
specs and `tests/comment-rendering.test.ts` both pass unchanged.

**69KB → 184KB → 136KB → 72.7KB.** The gate is the only reason any of it was
noticed; nothing about `import { isEmptyDocument }` suggests it drags a
validation library along.

## W1 — the shell gets under its own gate, and the reason it was over is one import

`npm run budgets` had been failing since before the client-portal brief: **116.5 KB against a 110 KB**
own-code budget for the app shell. The redesign adds a sidebar, a command surface, a block editor,
presence, sort and filter panels and saved views to that same shell, so paying it down first was the
only order in which the gate keeps meaning anything.

**One chunk was 65 KB gzipped of the 116.5, and it was the whole Supabase client.** The browser needed
two things from it — the session JWT out of a cookie, and a websocket — and got auth-js, postgrest-js,
storage-js and functions-js as well, because `createClient` has no narrower shape and `supabase-js`
does not export `RealtimeClient` to import instead.

`@supabase/realtime-js` is the websocket half alone, and `/api/realtime-token` is where the JWT comes
from now. The full argument, including why handing that token back is not an escalation and why the
construction is copied from `supabase-js` clause by clause, is in `05-DECISIONS.md`.

**Measured: 68.3 KB own (was 116.5), 208.3 KB total (was 256.5, budget 220).** Both numbers pass for
the first time, and there is 41.7 KB of headroom for what the redesign adds. `lib/supabase/client.ts`
is deleted — nothing imported it any more, and removing it means there is no module left through which
`@supabase/ssr` can reach a browser bundle at all.

**The verification had to be on the wire, because the failure mode is silence.** A realtime handshake
that is subtly wrong connects, joins the topic, and delivers nothing — indistinguishable from a sprint
where nothing has happened. `e2e/palette-realtime.spec.ts` already waited for the server's
`Subscribed to PostgreSQL` frame rather than the `phx_reply` that merely acknowledges the topic, then
wrote outside the browser and asserted the table moved. That spec is the reason this change was
safe to make at all; without it the honest answer would have been to leave the 65 KB alone.

Two assertions were added beside it for the new endpoint: an anonymous caller gets 401, empty, with
`no-store`; a signed-in caller gets exactly `{ token, expiresAt }`, a JWT whose `sub` is a real uuid,
and **no refresh token under any name** — that last one is what separates a convenience from a
genuine escalation.

The item-detail code sharing the sprint page's chunk group is real and was measured — one chunk holds
both the sprint table's strings and `log-time.client.tsx`'s — but it is 8.7 KB against the 48.2 KB
this bought, so it stays on the list rather than in this commit. The technique for finding it is in
`07-FIELD-NOTES.md`.

## W6d — project spaces, and two sections that are deferred rather than faked

The sidebar's tree, from the design's `Coditu Workspace.dc.html`: every project a
disclosure, its open sprints and its component registry beneath. This is the
thing the topbar's switcher was standing in for, so it is what unblocks W6e.

`lib/project-spaces.ts` is pure — the same shape as `lib/breadcrumbs.ts` and for
the same reason: a navigation tree is quietly wrong for the project nobody
opened, so the rules are asserted rather than glanced at. Twelve new tests.

### Three things the prototype had four toy projects to hide

**Fourteen of MEINEvim's fifteen sprints are closed.** The design lists a
project's sprints and it had three of them. Listing all fifteen here would put a
year of finished weeks in a 268px column above the thing you came for. The tree
lists sprints that are still `planned` or `active` — normally one — and the
project's own row goes to the page that has every one of them. The `MAX_SPRINTS`
cap is the pathological case and it says `All sprints · N` rather than
truncating quietly.

**The state chip is a state, and both alternatives were tried in a browser
first.** Naming the active sprint reads perfectly for MEINEvim — `Week 17` — and
then Converso's sprint is called *Converso review* and the project's own name
becomes `Converso das…`. Naming only the *active* sprint made the chip say
`no sprint` about Converso directly above a row listing the sprint it has. So it
is `active` / `planned` / `no sprint`, and it hides entirely while the space is
open, where the rows beneath say it better and the name needs the 48px.

**There is no Notes row.** Sprint notes are a panel inside a sprint page with no
address of their own.

### Favourites and recents are deferred, and the reason is not effort

Favourites cannot be built correctly yet: one of the design's three favourites is
a **saved filter view**, and saved views are W7. The table would either hold two
of its three kinds or invent the third.

Recents cannot be derived from anything this database records. Every table here
records a *write*; "recently visited" is a read, and the only table that would
store one is `access_events`, itself deferred to W9. Deriving them from writes
gives *recently edited*, which would never contain the payout page or a
registry — half of what the design's recents are for.

Neither is rendered as an empty section. An empty `Favourites` header is
furniture that promises a feature. Both are recorded in `05-DECISIONS.md` with
the phase they land in.

### What the browser showed and the green gate could not

The two contradictions above — `Converso das…` and a `no sprint` chip over a
sprint row — were both found by opening the page, not by a test. Neither is
visible to anything that does not measure a rendered 268px column.

Verified at 1400 expanded, 1400 collapsed, 1400×560 (the sidebar scrolls, the
header and the footer stay put), 900 and 390, with zero console errors and zero
horizontally overflowing elements at every one.

`aria-current="page"` is still exactly one — the nav owns it, and a tree row that
is the open page carries `aria-current="true"`, the current item in this set.
The tree is `display: none` below `--rail-wide` and while collapsed rather than
faded, because a tree has no 64px icon to keep a name for.

`test` **293** (12 new) · `lint`, `typecheck` clean · `db:test` **338** ·
`budgets` **OK 74.9 / 110** (was 74.0) · rail **12/12** incl. the four new
spaces specs · a11y **15/15** incl. thirteen widths and 200% zoom · navigation
**10/10** · home **8/8**.

**Next:** W6e — the switcher leaves the topbar and the breadcrumb trail mounts
into the room that makes.

## W6e — the switcher leaves, and the trail measured 22px becomes 37

W6c wrote the breadcrumb trail, tested every route it has, and deliberately did
not mount it: the topbar still carried a project switcher naming the same
project and the same sprint as crumbs two and three, and with both present
neither fitted. W6d moved switching into the sidebar. This deletes the switcher
and mounts the trail, which is the one line W6c said it would be.

```
              W6c        W6e
Coditu        22px  →    37px   full
MEINEvim      73px  →   128px   full   (and it is "MEINEvim components" now)
Sprint — …    68px  →   104px   full
COD-241       40px  →    58px   full
```

`project-switcher.client.tsx` is deleted; nothing else imported it. Export and
New item still need to know which project and sprint are open and still derive
it from the URL, exactly as the switcher did — so removing the control removed
no behaviour.

### Mounting it was not enough, and the second half was found by measuring

With the switcher gone the trail still clipped every crumb at 1024 — `Coditu` at
24px, the same bar W6c refused to ship, arrived at from the other direction. The
cause is the ⌘K box: `flex-1` with the default `min-width: auto` holds its whole
placeholder and makes the trail give way.

`min-w-[140px]` reverses that, and the box moved from `sm` to **`xl`** — a number
from the bar's own arithmetic rather than from Tailwind's ladder. Trail 415 +
cluster 303 + padding and gaps 79 + a 268px sidebar above 1180 = **1205px**
before a box with a usable minimum starts costing the trail letters. At `sm` it
cost exactly 20px at 1180 and clipped all four crumbs; the e2e assertion caught
that after the browser said 1180 was fine, because the browser had a stored
sidebar preference the fresh context did not.

Below `xl` the icon beside it is search — same dialog, same ⌘K.

### `lg` is where the trail starts, and it is measured

Forced on at each width, on the deepest route:

```
1024   Coditu 37   MEINEvim components 128   nothing clipped
 900   Coditu 35   MEINEvim components 122   every crumb clipped
 768   Coditu 16   MEINEvim components  54   every crumb clipped
 390   Coditu 37   MEINEvim components   8   unreadable
```

**Stated plainly, because it is a real cost:** below 768 there is no one-tap
project switch any more. No sidebar, no trail — switching is More → Projects →
the project, one tap more than the switcher was. The design does exactly this,
the destination is already in the overflow sheet, and every screen names its own
project. If it proves annoying, project spaces belong in the More sheet, not the
switcher back in the bar.

### The full suite found four red specs, and only one of them was this work

The first full `--workers=1` run of the branch since W0. **541 passed, 9 failed**
— which is four distinct specs across three Playwright projects, plus one
contention flake. Triaged the way `07-FIELD-NOTES.md` says to, and three of the
four were **pre-existing**, confirmed by checking out the parent commit and
re-running there rather than by assuming:

| Spec | Cause | Since |
|---|---|---|
| `item-detail.spec.ts` → *a hard navigation … renders the full page* | **this work.** The trail names the sprint, so an unscoped `getByRole("link", {name: /Sprint — Week 17/})` resolves to two — a strict-mode violation, not a finding. Scoped to `main` | W6e |
| `pwa.spec.ts` → *takes a signed-in visitor straight into the app* | `/app` stopped redirecting into a sprint and became Home. The spec asserted the old URL | **W6a** |
| `allowlist.spec.ts` → *an admin invites, and then the same address can sign up* | same cause: it asserted `/\/app\//`, with the trailing slash a new account no longer has | **W6a** |
| `password.spec.ts` → *axe finds nothing …* | `target-size … partially obscured` on a **bystander** button, 161×36. The page reports it at `scrollY: 666` and reports nothing at `scrollY: 0`; the obscurer is the sticky topbar. W6b's 268px sidebar made `/app/people` tall enough at 1280 that the click scrolls | **W6b** |
| `reliable-writes.spec.ts` | passes alone — contention | — |

All four are fixed here, because a phase is not done while it has left specs red
three phases back. **And the fix for the `pwa.spec.ts` one was itself wrong on
the first attempt** — it asserted the Home greeting matched
`/Good (morning|afternoon|evening)/`, which passed all evening and went red at
00:30 Cairo, because `greeting()` has a fourth wording, `Still up`, below 05:00.
It asserts the rail marks Home as current now, which no clock can move. The axe one is scoped to the surface the test names; the
reasoning, and why it is **not** the criterion-editor case that `scroll-margin-top`
fixes, is in `07-FIELD-NOTES.md`.

### And one test was asserting more than it meant

`export.spec.ts` → *"a sprint number from another project does not resolve"*
asserted `getByText("EVIM")` was absent from the whole page. `getByText` matches
substrings case-insensitively, so the sidebar's new `MEINEvim components` row
matched it. Scoped to `main`: a navigation tree naming a project is chrome, and
the claim that test makes is about what the **page** renders.

`test` **293** · `lint`, `typecheck` clean · `db:test` **338** after `db:reset` ·
`budgets` **OK 74.6 / 110 own, 214.6 / 220 total** (74.9 at W6d — the switcher's
178 lines left, the trail arrived) · navigation **15/15** incl. five new trail
specs, one of them measuring `scrollWidth` against `clientWidth` on every crumb
at 1024/1180/1440.

Full suite, `--workers=1`, after a `db:reset`: **550 passed, 4 skipped, 1
failed** — `trash.spec.ts` → *a deleted story is listed with where it was*,
which passes **6/6 alone**. Category 2 of the field notes' three-way triage, and
a different spec from the two failures the earlier runs of this session had, so
it is the shared-database contention this branch has had since W0 rather than
anything here. Nothing in this phase touches the trash.

**W6 is done.** Next: W7 — sprint database, multi-column sort, filters, saved
views. Favourites ride along with saved views; see `05-DECISIONS.md`.

## W7a/W7b — the sort stack, and two bugs only a browser could report

`lib/sprint-sort.ts` is the comparator, the URL vocabulary and the click rules,
pure and asserted by 22 tests written before it existed. `?sort=deadline:asc,status:desc`
is applied **on the server**, so the table, the board and the stacked cards
cannot disagree about the order at the same URL.

Three rules the prototype could not settle, all recorded in `05-DECISIONS.md`:

**Missing is not a value.** The prototype's `"￿"` sentinel puts nulls last
ascending and *first* descending — reverse a sort by deadline and the top of the
sprint fills with stories that have no deadline. `missing` is compared before
the direction is applied, so it stays last either way. Same for 0/0 criteria: no
progress to compare is not 0%.

**A sort and a manual order cannot both be true.** Sorting pauses the drag —
no handles, no `DndContext` — and says so in the table with `back to manual
order` beside it, rather than in a tooltip on a control that is no longer there.

**The headers are buttons, not links**, because shift-clicking an anchor opens a
new window and that binding cannot be taken back.

### Everything below here was found by opening the page

**Two quick header clicks lost the first one.** `router.replace` on a dynamic
route is a round trip, so the second click's `toggleSort` ran against the props
from before the first navigation landed: Deadline then shift-Status produced
`?sort=status:asc`, with the deadline key silently dropped. The faster somebody
built a sort, the more of it they lost. The table now toggles from the stack the
last click *asked* for, reconciled during render. `e2e/sprint-table.spec.ts`
clicks twice with no wait in between, which is the only way to see it.

**The filter bar's shareable-link hint was lying.** It reconstructed the query
from `status`, `component` and `match` — correct until `sort` became a real
parameter, after which it went on printing `?sort=order_index` while the address
bar said `?sort=deadline:asc,status:asc`. It reads `params.entries()` now, which
is the URL itself and also shows `deadline:asc` where `toString()` would show
`deadline%3Aasc`.

### And one that was the environment, not the app

A `display: flex`, visible, in-document element measured **0×0**, screenshots
were seconds stale, and a real click did nothing — because the Browser pane's
tab had gone to the background. `document.visibilityState === "hidden"` throttles
rAF and suspends layout. Everything re-measured correctly on `tabs_select`, with
no change to the code. In `07-FIELD-NOTES.md`, because it reads exactly like a
broken component.

*Also worth knowing while this branch is live:* **another session holds port
3000**, so e2e here runs with `E2E_BASE_URL` pointed at this session's own dev
server. `playwright.config.ts` defaults to 3000 and would otherwise have tested
somebody else's checkout.

`test` **315** (22 new) · `lint`, `typecheck` clean · `db:test` **338** after a
`db:reset` — the two `seed.sql` count assertions had drifted to 98/95 and
107/104, which is the documented e2e dirt and not this work · `budgets`
**OK 76.5 / 110 own, 216.5 / 220 total** (74.6 at W6e) · sprint-table **15/15**
incl. axe with a two-key sort applied · a11y 15/15 · inline-edit 8/8.

**Next:** W7c — the remaining filters (type, assignee, reviewer, grouping, free
text over title and description), then W7d saved views.

## W7c — the rest of the filters, and a dialog that was a grey stripe

Type, assignee, reviewer, grouping and free text, in `lib/sprint-filters.ts`
with 16 tests. They live in a **panel** rather than in the bar: status is
already eight chips, and four more dimensions inline wrap the toolbar to three
rows at 1180px. `DialogShell` makes it a centred dialog above `md` and a bottom
sheet below, which is the phone half of this phase's verification.

`?assignee=MT` filters **by initials**, and the module says so out loud:
`profiles.initials` has no unique constraint, so `MT` is two letters rather than
a person. Initials nobody has are kept, not dropped — they match nothing, the
table goes empty, and that is visibly wrong, which is the right way round.
`none` is reserved for an empty seat. Free text is **terms, not a phrase**:
`kachel height` has to find a story with both words anywhere in its title or
description.

**An empty table now explains itself.** It could already be emptied by the
status and component filters and said nothing — a header row, a sum of nothing,
no explanation. Free text makes that easy to reach, so the design's empty state
is built: what happened, how many are in the sprint, and `clear the filters`,
which clears everything that can *hide* a row and deliberately not `sort`.

### The bug worth remembering: `fixed` is not fixed inside a `<Reveal>`

The panel rendered with `role="dialog"`, a label, a focus trap and a clean axe
run — and on screen it was a **grey stripe across the toolbar**. The scrim
measured **1046×65** instead of the viewport.

`position: fixed` resolves against the nearest ancestor with a `filter` or a
`transform`, and `<Reveal>` sets both — settling on `filter: blur(0px)`, which is
a filter *value* and not `none`, so the containing block never goes away.
Anything `position: fixed` mounted inside a revealed section is trapped,
permanently, and every static check passes.

Fixed in `DialogShell` rather than at the call site: a modal an ancestor can clip
is wrong whoever mounts it. `cell-popover.client.tsx` already portals for the
same class of reason. Verified across **198 specs** on three devices covering
every dialog in the app.

### Two more the environment produced rather than the code

The console reported a `TypeError` in `<FilterBar>` that was from an earlier
build in the same tab — `read_console_messages` returns everything a tab has
accumulated, so a fresh tab is the honest read. And `playwright.config.ts`
honoured `E2E_BASE_URL` for `baseURL` but hard-coded 3000 for `webServer.url`,
so pointing the tests elsewhere made Playwright start a second `next dev` that
died on `.next/dev/lock`. Both are in `07-FIELD-NOTES.md`.

`test` **331** (16 new) · `lint`, `typecheck` clean · `db:test` **338** ·
`budgets` **OK 77.9 / 110 own, 217.9 / 220 total** (76.5 at W7b) · sprint-table
**24/24** · every dialog-bearing suite **198/198** on chromium, mobile-safari and
mobile-chrome.

**Next:** W7d — saved views. The table `…_saved_views.sql` from §5.5, a zod'd
`spec` holding filter/sort/mode and never a row set, and the favourites that
W6 deferred until this existed.

## W7d — saved views, and the 65 KB only the budget could see

`saved_views` per §5.5, migration `20260826090000`. **The spec is a query
string** — the same parameters the URL already carries — so applying a view is a
navigation and a filter added later is saved and restored the day it is added,
by adding one word to `VIEW_PARAMS`. It holds **never a row set**, and that is
the allowlist rather than a convention: there is no key that could name a story,
so a view cannot be a stale snapshot and cannot leak a row somebody may not read.

**Invariant 1 is a composite foreign key.** A view belongs to a project and may
name a sprint; `sprints` gained `unique (id, project_id)` — redundant on its own
— so `(sprint_id, project_id)` has something to reference. A trigger could check
the same thing. A foreign key cannot be forgotten.

**Who may change one: the owner, or an admin**, the same rule as `edit own
comment`. There is no ownership branch in the actions — the policy already says
it, so a refused write matches no row and the action reports that rather than
re-deciding it. 13 new pgTAP assertions, positive and negative, including the
cross-project sprint and the anonymous denial.

### Four things found by running it rather than reading it

**The budget caught a 65 KB regression nothing else could.**
`lib/saved-views.ts` held the URL helpers *and* the zod schema, and
`view-menu.client.tsx` imports one of those helpers — so zod went into the
browser bundle. **143.1 KB against a 110 KB gate**, in a single 75.9 KB chunk,
with `lint`, `typecheck`, `test`, `db:test` and every e2e spec green and the
feature working perfectly. Split into `lib/saved-views.ts` (pure) and
`lib/saved-views-schema.ts` (server-side only): **79.6 KB**.

**PostgREST cannot upsert onto an expression.** The uniqueness rule is one name
per person per project, case- and padding-insensitive; as a unique index on
`lower(btrim(name))` it is correct and unusable — `on_conflict` takes column
names and answers an expression with `42703 column "lower" does not exist`,
which arrives in the UI as "that view could not be saved" and reads like a
policy problem. A stored generated column holds the same fold.

**RLS is not a grant.** Perfect policies still answered `42501 permission denied
for table saved_views` until `grant … to authenticated` was added. The corollary
is kept deliberately: `anon` has no grant at all, so `rls.sql` asserts anonymous
denial with `throws_ok` rather than a count.

**The dropdown opened underneath the table.** Same trap as W7c's scrim, one
layer up: `<Reveal>` sets a transform, `z-50` inside one stacking context cannot
paint above a sibling context later in the document. The view control is a
`DialogShell` panel now — already portalled, already what the Filter button
beside it opens, and a sheet on a phone where a dropdown would have been
unusable anyway.

*One thing to watch:* the §5 **total** budget is now **219.7 of 220 KB**. The own-code
gate has 30 KB of room; the total has 0.3. W8 will need that measured before it
adds anything to the shell.

`test` **345** (14 new) · `lint`, `typecheck` clean · `db:test` **351** (13 new)
after a `db:reset` · `budgets` **OK 79.6 / 110 own, 219.7 / 220 total** ·
saved-views **6/6** incl. two contexts for a shared view and axe with the panel
open · sprint-table 24/24 · a11y 15/15 · navigation 15/15.

**Full suite, `--workers=1`: 577 passed, 4 skipped, 0 failed** — the first
completely clean full run since W0, and the first ever to include the phone
projects with no contention failure. Run with `E2E_BASE_URL` pointed at this
session's own dev server, because another session held port 3000; see
`07-FIELD-NOTES.md`.

**W7 is done.** Next: W8 — projects and project home. **Favourites are now
unblocked** — W6 deferred them until saved views existed, which they do; they
are the first thing W8 should pick up, with the sidebar section W6d left out.

## W8a — the projects list, searchable and filterable, and one rule in one place

`?q=` over the name, the client and the slug; `?state=` over the three states
this schema can actually answer; `?archived=1` for the ones that have been put
away. Read on the server, so the rows that survive are the rows that render and
the only JavaScript on the screen is the control bar — which matters with **0.6
KB** of §5 total headroom.

The state rule moved into `lib/projects.ts` and the sidebar's chip now calls it
instead of carrying its own copy. `describeActivity` moved out of
`item-detail.tsx` into `lib/activity.ts` for the same reason: both are things
two screens say about the same fact, and two copies is two chances to disagree
on screen.

**Archived projects are rows in this list now**, behind the toggle, with the
restore control on the row. They used to be a separate section inside the admin
panel — a different place, a different shape, and invisible to the search and
the chips.

### Four things found by opening the page

**`— components` and `1 sprints`.** A count of nothing is a sentence, not a dash
with a plural after it. `no components`, `1 sprint`, `no hours`.

**The name column lost to the activity column.** Both were `flex-1`, so the
longest *content* won: `MEINEvim components` rendered at **102px** while a
sentence about it rendered at **371**. The name is the thing somebody is looking
for — `flex-[2]` with a 180px floor.

**Then the row wrapped.** With `flex-wrap`, an `auto` basis on the trailing cell
makes its hypothetical size the whole sentence, so MEINEvim's controls were
pushed onto a second line at 1440 while every other row stayed on one.
`lg:basis-0` — take what is left, truncate — and every row is 71px again.

**Five projects were 1270px of scrolling on a phone.** Each row wrapped to 254px.
The three counts and the four faces are gone below `sm`; what a phone has room
to say about a project is its name, its state, and what happened last. 221px,
and nothing overflows at 320.

**And one the browser found that no test would have:** the admin panel's header
read `5 live · 1 archived` with five projects in total, because it counted the
list it was handed and that list had just started including archived projects.

`test` **368** (23 new) · `lint`, `typecheck` clean · `db:test` **351** after a
`db:reset` · `budgets` **OK 79.4 / 110 own, 219.4 / 220 total** · projects
**7/7** incl. axe, the archive round trip and the 320px overflow check ·
a11y 15/15 · rail 12/12 · navigation 15/15 · sprint-manage 9/9.

**Next:** W8b — project home, and then favourites, which W6 deferred until saved
views existed.

## W8b — the project page says what a project is, and who can see it

A header that names the client, its site and the key prefix people say out loud;
a control that opens the running sprint or explains why there is none; and a
320px column of the four things that are *about* a project rather than in it —
saved views, team, client access, latest activity. All server-rendered:
`budgets` is unchanged at **79.4 / 219.4**.

Every panel is real data. **Team** is read from the assignees and reviewers on
the work, because there is no membership table and inventing one would create a
list somebody has to keep in step with reality. **Client access** is a count and
what it allows, never an address. **Saved views** are the second surface for
what W7 built — and the reason W6 deferred favourites until now.

The design's fifth panel, project pages, is not built: there is no
project-scoped document route to put in it, and a panel of links to nothing is
furniture. Same reasoning as W6d's missing Notes row.

### The two columns start at 1400, and the first attempt shipped fragments

`xl` looked reasonable and was wrong. Measured, counting elements whose
`scrollWidth` exceeds their `clientWidth`:

```
1280   main 606   many clipped — `Sprint — Week 16` renders 37px of the 119 it needs
1320   main 644   14 clipped
1360   main 683    7 clipped
1400   main 721    nothing clipped
```

At 1180 — the design's own number — the app sidebar has just taken 268px, so a
320px aside would leave the sprint manager 568. `min-[1400px]` keeps both
columns on a 1440 laptop and stacks them below. The served stylesheet was
checked for the rule, per the W6b lesson that a variant which compiles to
nothing leaves the class on the element and every static check green.

### Three things the specs needed before they could assert anything

The seed has **no saved views, no client contacts and no grants** — the
client-portal fixtures that make them are gitignored. So the interesting half of
three panels is only reachable by inserting a row and removing it again, each in
a `finally`, in SQL. `profiles.id` references `auth.users`, so the throwaway
contact goes through `createThrowawayAccount` rather than a raw insert: a person
in this app is an account first, and the schema says so.

`test` **368** · `lint`, `typecheck` clean · `db:test` **351** after a
`db:reset` · `budgets` **OK 79.4 / 110 own, 219.4 / 220 total** · project-home
**8/8** incl. axe, the measured breakpoint and the 320px overflow check ·
projects 7/7 · sprint-manage 9/9 · a11y 15/15.

**Next:** favourites — the sidebar section W6 deferred until saved views
existed, which is now the only thing left in the design's sidebar.

## W8c — favourites, two phases after they were deferred

W6d left the design's `Favourites` section out of the sidebar and recorded why:
its three kinds are a saved filter view, a work item and a component registry,
and saved views did not exist. W7 built them. This builds the table, the star and
the section, and closes the deferral in the order that decision named.

Migration `20260826120000_favourites.sql` — **the eleventh production has never
seen.**

**Three columns, not one `target_id`.** A polymorphic id cannot have a foreign
key, so deleting a story would leave a favourite pointing at nothing and the
sidebar would draw a row that goes nowhere. Three nullable columns with real
`on delete cascade`, and a check that exactly one is set. 13 new pgTAP
assertions, including both halves of that check and the cascade.

**Private, which is stricter than saved views.** No shared mode, no lead
override, no admin override — an admin's `select` returns nothing and their
`delete` matches no row, and both are asserted. A shared view is a team
artefact; a favourite is furniture in one person's room.

**One star component on three surfaces** — item detail, component page, and the
saved-view menu, where it deliberately sits outside the `view.mine` branch that
guards share and remove.

### The budget is the thing to look at

Resolving the links in the sidebar component put `lib/favourites` into the
browser bundle: **220.4 of 220** on §5's total. The shell resolves them now and
the client renders a finished list: **220.2**.

**Still 0.2 KB over §5's total.** The gate CI enforces is the route's own code —
**80.2 of 110**, 30 KB of room — because 140 KB of the total is a framework floor
this codebase cannot move. The known lever is the one W1 measured and left on the
list: the item-detail route shares the sprint page's chunk group, worth **8.7
KB**. That is a phase of its own. **This is the second phase running where the
total has been the binding number, and it should be spent before W9 adds to the
shell.**

`test` **375** (7 new) · `lint`, `typecheck` clean · `db:test` **364** (13 new) ·
`budgets` **own OK 80.2 / 110; §5 total 220.2 / 220, over by 0.2** · favourites
**5/5** incl. two browser contexts for the privacy rule · saved-views 6/6 ·
rail 12/12 · item-detail, components, a11y all green (65 across the neighbours).

**W8 is done.** Next: W9 — People & Access.

## W8d — the chunk split that was not there, and the 4.5 KB that was

W8c left §5's total 0.2 KB over and named the lever: the 8.7 KB chunk split W1
measured and parked. Going back for it, **it is not there any more.**

W1's cause was a parallel route's `@modal` slot contributing its client
references to the segment's chunk group. Settled by stubbing the slot's page to
`return null` and rebuilding:

```
with the modal's item import   220.2 KB gz, 17 chunks
with it stubbed out            220.3 KB gz, 17 chunks
```

No change at all. Turbopack co-locates modules from sibling routes and the
sprint page needs its half of the shared chunk. `07-FIELD-NOTES.md` is corrected
rather than left to mislead the next person.

**What was costing bytes was two static imports.** The topbar imported the
export and new-item dialogs at the top of the file and rendered them
`{open ? … : null}` — the code on every page, the markup on none.

```
own    80.2 → 75.7 KB / 110
total  220.2 → 215.7 KB / 220 §5
```

The command palette stays a static import on purpose: ⌘K has to open it, not
start a download.

### And one thing found while looking

Opening a story from the sprint table **fails hydration every time** —
`ProgressRing`'s `useId` gradient id differs between the server's HTML and the
client's tree, because the intercepting modal renders `ItemDetailBody` at a
different depth than the full route. **Confirmed pre-existing at `95f87a8`**, so
it is not this work; flagged as its own task rather than folded in here. Nothing
asserts a clean console after opening the modal, which is why it has been
invisible.

`test` **375** · `lint`, `typecheck` clean · `budgets` **own OK 75.7 / 110; §5
total 215.7 / 220, 4.3 under** · export, new-item and palette-realtime **29/29**,
which is what proves a lazily-imported dialog still opens.

**Next:** W9 — People & Access.

## W9 — the access log that was deferred five phases ago, and three controls that were hidden

`access_events`, migration `20260826140000` — **the twelfth production has never
seen.** Deferred from W4 to here in the order `05-DECISIONS.md` recorded, because
until this screen existed it had no writer and no reader.

**Written by triggers, not by the actions that cause the changes.** A line in an
action can be forgotten by whoever adds the sixth way to grant access, and a log
with a hole in it is worse than no log — the hole is invisible and the rest still
looks complete. A trigger also catches a write from the SQL console, the
service-role client or a migration, which are exactly the writes somebody comes
to an audit trail asking about.

**Nobody may write it, including an admin.** The trigger functions are
`security definer`; there is no insert, update or delete grant. pgTAP asserts all
three refusals, because an audit row an admin can forge is not evidence.

### And one that was nearly true

Reading the grants rather than assuming them: this project gives `authenticated`
`REFERENCES, SELECT, TRIGGER, **TRUNCATE**` on **every** table by default — and
`truncate` **bypasses row-level security entirely**, because policies filter rows
and a truncate does not visit any. Not reachable through PostgREST, which cannot
issue one, but "append-only" should be true rather than nearly true. Revoked on
`access_events`; the general fact is in `07-FIELD-NOTES.md`, and it applies to
`activity` and every other table here.

### The safety states were hidden, and the design said they should not be

Your own row rendered your role as a word and dropped the deactivate and
temporary-password controls entirely. Absent is the one shape this app has said
all along it does not do — Export and New item have carried "disabled with a
tooltip, never hidden" since the shell was built. All three are present and
disabled now, each with a `title` saying why. Nothing about the enforcement
moved: `lib/actions/profiles.ts` refuses the write either way.

`e2e/team.spec.ts`'s assertion **inverted** — it used to check the controls were
absent — and says so in place, so the next reader knows it was a decision.

### Four sections, not the design's six

Client contacts stay on `/app/clients` (a decision on the record before the
design arrived, and the design loses this one on behaviour). `Deactivated` is not
a section because deactivated people are already in the team list with the
control that brings them back. There is no `Invitations` state machine, because
this app allowlists an address and the person signs up — inventing pending /
expired / withdrawn to fill a tab would be inventing a feature.

`Roles & permissions` is new and is documentation: fifteen capabilities × three
roles, each row naming **where the rule is really enforced**, so a reader who
suspects the table has gone stale knows which of the two to trust. Today the only
way to learn what you may do is to try something and read the refusal.

### Two tests that were asserting more than they meant

`team.spec.ts` → *deactivating takes access away* used an unscoped
`getByText("deactivated")`, which the new safety notes made match three
elements. Scoped to the row. Same class as W8a's `getByText("EVIM")`.

`db:seed` inserts four allowlist addresses, so a fresh database opens with four
`system` entries in the history — the seed being honest about how the workspace
came to exist. The e2e counts the difference a click makes rather than assuming
a blank slate.

`test` **382** (7 new) · `lint`, `typecheck` clean · `db:test` **376** (12 new)
after a `db:reset` · `budgets` **own OK 75.7 / 110; §5 total 215.7 / 220** ·
access **8/8** incl. axe, the grant assertion and two more browser contexts ·
team 9/9 · a11y 15/15 · my-work-people-import green.

**Next:** W10 — Profile, Workspace Settings, My Earnings, Team Payouts.

## W9a — the hydration failure that was not one

Flagged at the end of W8d and picked up as its own task: *opening a story from
the sprint table fails hydration on every click, caused by `ProgressRing`'s
`useId` gradient.* **All three claims were wrong**, and measuring came first:

```
production build, 4 loads + click                          0 hydration failures
warm dev server, 5 loads                                   0
warm dev server, 3 loads + click                           0
dev server, loaded straight after touching a source file  2 of 11
```

It is a dev-server artefact — HTML streamed by one compilation hydrated against
a client bundle from another — and the same family as the stale-CSS-chunk note
this file already carried. React reports the first attribute that disagrees,
which is not the cause: two captures of the same failure named `ProgressRing`'s
gradient once and the app shell's `<aside>` the next time.

**`ProgressRing` is unchanged, and the suggested fix would have been a
regression.** Deriving the gradient id from the work item's id reintroduces the
bug the component was written to prevent: the same item's ring is on screen twice
whenever the modal is open over its own row, and two elements would share an id
again. `useId` is correct and `e2e/sprint-table.spec.ts` already asserts it.

**What is new is the assertion nothing was making.** `navigation.spec.ts` now
checks that opening a story logs nothing at all — gated on `E2E_PROD_URL`, like
the code-splitting assertion in `comments.spec.ts` and for the same reason: run
against the dev server it would go red whenever somebody saved a file, which is
the shape this repo has a whole field-notes section about. Verified passing under
`npm run e2e:prod`, and skipping with a stated reason otherwise.

`test` **382** · `lint`, `typecheck` clean · navigation **15 passed, 1 skipped**
against dev · the new spec **1/1** under `e2e:prod`.

## W10a — the boundary walked from the other side, and the list that was not checking the portal

W10's first slice is a test and nothing else. The formulas in `lib/earnings.ts`
are not touched by this phase at all — `potCents`, `splitEqually` and
`meetsThreshold` are the same bytes they were in W0 — so what is owed here is
the assertion that the boundary around them still holds after four phases added
six new screens.

**The outward list had a hole in it, and the hole was the client portal.**
`CLIENT_FACING` named eleven paths, all of them written before `app/client/**`
existed. A client is *signed in* to that route — it is the most client-facing
thing in the repository — and no assertion has been looking at it since the day
it was built. Nothing leaked. Nothing was checking either, which is the same
class of note as `07-FIELD-NOTES.md`'s *"a working feature is not evidence that
its policy is enforced"*. Twenty-seven paths now, including the portal, its
data modules, and the shell — the rail, the topbar and the trail are on screen
during every projected sprint review.

**The other direction is new.** A denylist only ever protects what somebody
remembered to add to it, and the portal is the proof. So a second suite walks
every `.ts`/`.tsx` under `app/`, `components/` and `lib/` and asserts the set of
files that can reach a figure is **exactly** eleven named ones: the four model
modules, the tunables row, the formatter definitions, the generated types, and
the four screens. A new screen is covered the moment it exists — put an
earnings import in it and the suite goes red until somebody names the file and
says who reads it.

The equality is asserted **both ways**. Unexpected entries are the leak.
Missing entries are the rot: a list that still names a file which stopped
touching money is a list nobody has read, and it is where the next real entry
hides. That second assertion earned itself immediately — it caught
`lib/earnings.ts`, which imports nothing and defines the arithmetic, so no
import-shaped predicate could see it. `MONEY_ARITHMETIC` is the fix, and it
closed a real gap in the outward direction too: a screen that called
`potCents()` and printed the number with its own template string passed every
check in the file before today.

Proven to bite rather than assumed to: a `usdFromCents` import added to
`components/client/component-card.tsx` turns both directions red, and was
reverted.

`test` **386** (4 new) · `lint`, `typecheck` clean.

## W10b — two screens that shared a URL, and three things the prototype asks for that cannot be stored

`/app/settings` was 344 lines of two unrelated screens. Your name, your picture,
your notifications and your account facts at the top; the workspace's hourly
rate, image caps and default weekly capacity underneath. One is yours and
everybody has one. The other is an admin's, and every row of it refuses a write
from anybody else. They shared a URL and nothing else.

`/app/profile` is the first half plus the two sections it never had — Appearance
and Security — and `/app/settings` is the second half with `Access and recovery`
as three links out rather than three reimplemented corners of People, Clients
and Trash.

### The old URL redirects rather than refuses

A non-admin at `/app/settings` lands on `/app/profile`. Not `notFound()`, which
is what `/app/clients` does to an engineer, and not W9's visible-and-disabled,
which is for a control on your own row whose consequence you can see. This is a
URL that **was** your profile yesterday, and the thing you were looking for is
one redirect away — the same argument `project_slug_aliases` makes for old
project links. `05-DECISIONS.md` has it.

Verified in a browser rather than with curl, and the difference matters: with a
`loading.tsx` on the route the document response is a **200 carrying the
skeleton**, and the redirect arrives later in the stream. `curl` sees
`<title>Workspace settings</title>` and concludes the guard is broken. It is the
same streaming behaviour this file already records for `notFound()`.

### Three things the design asks for that this schema cannot store

- **The four notification switches.** Mentions, review requested, assigned to me,
  daily digest — all per-person, and there is no per-person preference row
  anywhere. `push_subscriptions` is keyed by endpoint, because a subscription
  belongs to a browser. Four switches over `useState` would forget every answer
  on reload. Notifications stays the per-device subscription that exists, and
  says so.
- **`2 sessions` under Security.** GoTrue lets a session revoke the others and
  does not let one enumerate them. The control says what it does — `signOut({
  scope: "others" })`, which is the same call the sign-out button makes with the
  scope that spares this device — instead of claiming what it will affect.
- **`Push notifications on this device` as a third security action.** It is the
  Notifications section three headings up. One control, one place.

Third time this programme has refused to invent state — W6d's favourites, W9's
invitations — and the third time it is written down instead of quietly made.

### Appearance is two native radios, not two buttons

`enableSystem={false}` and `defaultTheme="light"`, so "follow my system" is not a
state this app can be in and offering it would be a control that does nothing.
Two options, and real `<input type="radio">` elements rather than the
prototype's buttons: arrow keys, one tab stop, and the label associated without
`aria-labelledby`, none of which had to be written. Neither is checked until
mounted — the server does not know the stored theme, which is the whole reason
`ThemeToggle` renders a placeholder — and the group carries `aria-busy` while
that is true.

### Two things found by opening the page

The update-password screen says *"nothing else in Coditu opens until it is
done."* True of the forced change the app shell redirects to; a lie to somebody
who arrived from the Security section of their own profile. It reads
`app_metadata.must_set_password` — the middleware's copy, already on the user
object it reads — and says one of two things.

`/app/earnings` opened on a local database with `payout_from_sprint_id` null,
which is the seeded state, so every card read `—` and the calculation block was
absent. Correct, and not evidence of anything. Pointed at Week 15 by hand, the
populated view checks out against the arithmetic: 17.5 h × $12.00 = $210.00,
one of two contributors above the 25% threshold, equal split $210.00, 13.5/17.5
= 77.1%. Set back to null afterwards, and `db:test` re-run to prove it.

### What moved, and the one file that left the money list

The personal earnings card left `/app/settings` for the top of `/app/earnings`,
where the design puts it — so `getMyEarnings` never lost its only caller, and
`app/app/settings/page.tsx` **stopped being able to reach a figure**. W10a's
"keeps the list honest" assertion caught that in the same run it caught
`components/app/my-earnings.tsx` arriving. Both directions of the new test
earned themselves inside one phase.

`lint`, `typecheck` clean · `test` **386** · `db:test` **376** · `budgets`
**own OK 75.9 / 110; §5 total 215.9 / 220** (+0.2 KB, one lucide icon) · opened
as admin, lead and engineer, in both themes, at 375 and 1280, zero horizontal
overflow, console clean.

**Next:** W10c — Team payouts moves to `/app/settings/payouts`, and `/app/earnings`
becomes personal-only.

## W10c — the earnings screen splits, and one rule is kept rather than reversed

`/app/earnings` was one screen doing two jobs: your own provisional figure at
the top of a board showing every participant of every sprint. `/app/earnings` is
your money now — three cards, the arithmetic, and every sprint from your side of
it. `/app/settings/payouts` is the team's.

### The one thing that needed asking rather than deciding

The plan's §6 matrix reads `Team payouts: Admin ✔, Lead ✘, Engineer ✘`. The
team's own words, recorded in `coditu-thread-and-earnings-prompt.md` §E5 before
any of this was built, read *everyone sees everyone's, but not on any screen
that gets shared with a client* — and the app, its RLS and `e2e/earnings.spec.ts`
all implement that. The design agrees with the older rule: its payout screen
shows a non-admin the participants with the checkboxes locked and `Admin only`
as the tooltip.

Two defensible readings, and the difference is who can see whose money. **Asked,
and the answer was to keep it.** So `/app/settings/payouts` has no role guard
while its parent redirects a non-admin, `/app/earnings` links to it because a
screen you may read and cannot navigate to is a screen you do not have, and
nothing about RLS moved. What is enforced where is stated plainly in
`05-DECISIONS.md` rather than implied: the split is about who is *shown* what,
and the insert policy is what stops a confirmation.

### `$0.00` is a claim, and only the browser said so

The summary card read **`$0.00`** for a person below the threshold, because
`getMyEarnings` fell back to zero when they were not in `proposedShares`. Every
gate was green. This application has said *"not tracked, never zero — zero is a
claim"* since the earnings model was built, and this was the same mistake in a
different column: `$0.00` claims a split was computed for you and came to
nothing, when you are simply not in it. `cents` is `number | null` now, the card
says **no share**, the EGP line disappears with it, and the note underneath
stopped saying "the figure above" about a figure that is no longer there.

The history table already had this right — `provisional?.shareCents ?? null` —
which is how the inconsistency was visible at all.

### `Reveal` forwards nothing it has not declared

`<Reveal as="header" data-identity>` compiles, type-checks, and reaches no
element. The component takes an explicit prop list, and TypeScript does not
check a JSX attribute whose name is not a valid identifier — the comment on
`RevealProps` says exactly this about `aria-*`, and it is worth reading twice.
The hook is on a real `<header>` now.

### Three specs that were asserting the old shape, and one that was ambiguous

Splitting a route moves every assertion pointed at it. `push`, `avatar`,
`settings`, `navigation`, `mobile`, `pwa` and `password` all had `/app/settings`
in them for personal reasons, and the PWA manifest's shortcut opened a screen
that now redirects most people. All re-pointed at `/app/profile`.

`settings.spec.ts` → *email and role are shown as facts* looked for a
`Your account` region that the identity header replaced; rewritten against
`[data-identity]`, which then surfaced a second one: `getByRole("button", {
name: "Sign out" })` resolved to **two** elements, because Security's new
"Sign out everywhere else" is a substring match. Same family as
`getByText("EVIM")` matching `MEINEvim components`. `exact: true`.

### A W9 defect this phase's first full run found

`mobile.spec.ts` → *axe finds nothing at 390px* failed on **`/app/people`**, on
an element W10 never touched: `scrollable-region-focusable @ .-mx-2`, the
Roles & permissions table's scroll container. A region that scrolls and cannot
be focused is unreachable by keyboard.

Confirmed pre-existing before being called anything else — checked out `aa33663`
and reproduced it there, identically, with the pre-W10 path list. W9's gate ran
the a11y and access specs; this table only overflows at 390px, which is
`mobile.spec.ts`, and no full `--workers=1` run had happened since W6.
`tabIndex={0}` plus a name on the container, labelled in place as W9's.

### Two red runs that were the database, not the code

The second full run failed four different specs from the first. `item-detail`
→ *tapping the words does not tick the box* expected `false` and got `true`:
the seed sets that criterion `is_done = false` and the database held `true`,
because an earlier spec ticked it and did not put it back. `db:reset`, and the
whole file passes 24/24. Same for `access.spec.ts`.

The rule this confirms, and it is already in `07-FIELD-NOTES.md`: **absolute
counts and seeded booleans are residue-coupled.** `npm run db:test` failed
`seed.sql` 16-17 (*95 ticked*, *104 attachments*) for exactly this reason after
a browser session. Every number below was taken after a `db:reset`.

### Five full runs, five different answers, and what that is worth

```
run 1  dirty db   4 failed   2 real (fixed below), 2 in code W10 never touched
run 2  dirty db   4 failed   all four residue; each passes alone
run 3  clean db   606 passed, 7 skipped, 0 failed
run 4  dirty db   601 passed, 2 failed, 3 did not run   both pass alone
run 5  clean db   595 passed, 3 failed, 8 did not run   all three pass alone
```

**Run 3 was luck, and saying otherwise was the mistake worth recording.** After
run 4 the obvious inference was "a full run only counts from a `db:reset`", so
run 5 was started from one — and failed three *different* specs, none of them
run 4's, none of them in code W10 touched, all three passing in isolation. A
clean database does not buy a green run.

Two separate things were being conflated, and only one of them is about state:

- **Residue is real and reproducible.** `db:test` failed `seed.sql` 16-17
  (*95 ticked*, *104 attachments*) after a suite plus a browser session, and
  `item-detail` → *tapping the words does not tick the box* failed because a
  spec had genuinely left that criterion ticked. Both fixed by `db:reset`, both
  fail again the same way without one. That is worth a field note and got one.
- **The rotating handful is the machine**, at load average 4.8 — the pattern
  this file already carries as *the suite's failures move between runs, and
  three is not a regression*, and the three-way triage says exactly what to do
  about it: re-run the named specs alone. Every one of the nine failures across
  runs 2, 4 and 5 did.

And a third thing, narrower than either and newly characterised: **`access.spec.ts`
→ *an ordinary change through the ordinary screen* is coupled to the state its
own previous run leaves.** It failed alone immediately after a group run and
passed alone a minute later, once that run's cleanup had landed — it invites a
fixed `probe` address, so a leftover row makes the click a no-op and the
`before + 2` count never arrives. Not the machine, not the seed: itself, one run
ago.

**So the honest claim for this phase is not a full-suite number.** It is that
the eleven spec files W10 touched pass together from a reset database —
**227 passed, 6 skipped, 0 failed** — and that across five full runs no failure
ever named a file this phase changed.

`lint`, `typecheck` clean · `test` **387** · `db:test` **376** · `budgets`
**own OK 75.9 / 110; §5 total 215.9 / 220** · opened as admin and as an
engineer, both themes, 375 and 1280, no horizontal overflow, console clean apart
from the dev server's own HMR socket.

**Next:** W11 — Version history UI and Trash.

## W11a — the promise the bin makes, finally asserted

`06-PROGRESS.md` has named W11's verification since the plan was written —
*e2e restore returns comments and versions* — and nothing was checking it.
`trash.spec.ts` proved a restored story comes back and leaves the bin, which is
equally true of a row whose thread and history were thrown away on the way in.

It passes today, and that is the point of writing it: `deleteWorkItem` is soft
precisely so a story keeps its criteria, its thread and its hours. The assertion
is for the day somebody makes deletion cascade — the obvious tidy-up, and a
silent one. Every screen would keep working; only a story that had already been
round the bin would come back hollow.

Rendered rather than counted. `select count(*) from comments` passes while the
thread refuses to show them, and it is the thread somebody opens.

### Two things it found on the way

The comment marker matched **twice** — once as the comment in the thread, once
inside the history panel's diff of it. That is half of what the test exists to
prove, so it is asserted rather than escaped: `exact: true` for the comment,
and a second assertion for the diff line. Third time this session that
Playwright's substring name-matching has cost a red run.

And the diff line is `toBeAttached`, not `toBeVisible`, because W4c put diffs
inside a collapsed `<details>` so the panel could ship a diff viewer and no
JavaScript. Whether a reader can expand it is `version-history.spec.ts`'s
question.

### The spec was leaving residue, which this session has a note about

It edits a description and inserts a comment, and both write append-only
`document_revisions` rows. `version-history.spec.ts` already solved this for
`COD-238` — capture the original, delete the rows as a fixture privilege, put
everything back in `afterAll` — and `trash.spec.ts` does the same for `COD-237`
now.

**The first attempt restored the wrong value.** `beforeAll` captured the
description *after* an earlier run had already overwritten it, so "put it back"
put back the probe. `db:reset`, then re-run: 0 revisions, the seed's
description, 0 probe comments, and the same three numbers after a second
consecutive run.

`lint`, `typecheck` clean · `test` **387** · `db:test` **376** · trash **7/7**,
twice back to back, leaving the database as it found it.

**Next:** W11b — `/app/history`, the workspace-wide version list the design asks
for and the only route in the plan's traceability matrix that does not exist.

## W11b — the screen that answers "what changed on the 19th"

`/app/history` was the only route in the plan's traceability matrix with nothing
behind it. History has been readable since W4c and only from a story's own
panel, so every question that does not start from a story — *what happened on
the 19th*, *what has Adam been rewriting*, *who touched the sprint notes* — had
no screen.

**The table was built for this.** `document_revisions` has carried
`work_item_id` and `sprint_id` since W4a, denormalised by the capture trigger,
and the migration's own comment names `/app/history` as their reader. Nothing
schema-side was needed; `listRevisions` is a sibling of `getWorkItemRevisions`
rather than a parameter on it, so the workspace screen's joins stay off the item
dialog's critical path.

### The filters run in the database, unlike the sprint table's

The sprint's filters run in memory because the sprint is already loaded whole
and a hidden row still counts toward the footer's sum. History is unbounded and
read one window at a time, so filtering after the `limit` would fetch the last
eighty revisions of anything and show the four that happened to be comments — a
screen that empties out as the workspace gets busier.

Chips are **links**, so the whole filter bar works with no JavaScript and every
combination is somewhere a person can paste. An initials filter nobody matches
returns nothing rather than dropping itself, because an empty filter means "show
everything" and quietly widening a shared link is worse than showing nothing.

### The prototype's side panel is not built, and the diff is not lost

The design puts a `Diff preview` in a second column at ≥1180px, driven by a
selected row. Every entry carries its own diff instead, inside the `<details>`
W4c built — server-computed, no JavaScript, keyboard-operable and announced
without anybody writing `aria-expanded`, and identical on a phone. Repeating the
prototype would have meant selected-row state, a round trip per selection, and a
second diff renderer to keep honest. `RevisionEntryDetails` is the W4c component,
exported and given an optional target.

### The target is a link in the body, not in the summary

A link inside a `<summary>` fights the disclosure for the same click, and
nesting interactive elements is what axe is right to complain about. The label
scans in the summary; *"Open COD-235"* lives in the expanded row beside the
restore.

### An hour lost to a page that was correct

`document.querySelectorAll('[data-history-entry]').length` said **6** where the
database said **3** — in dev, and again in a production build, which ruled out
the recompiling-dev-server artefact this repo already documents. The server HTML
was right the whole time: one list, three rows.

React streams late content into a `<div hidden>` on `<body>` and moves it into
place as each boundary resolves, and a route with a `loading.tsx` keeps a second
hidden container holding the resolved copy. `querySelectorAll` walks the whole
document and counts both. **Every element on a streamed page appears twice** to
a hand-measurement, and the duplicate is invisible to a person and identical in
the markup — the only tell is that `innerText` collapses whitespace differently
in the buffered copy.

Playwright never saw it, because its locators ignore hidden subtrees. It bites
exactly one thing: measuring by hand in a console, which is what "open the page
in a browser" means here. `07-FIELD-NOTES.md` has it, with the one-line fix.

`lint`, `typecheck` clean · `test` **404** (17 new filter tests) · history
**7/7** incl. axe with a version expanded and zero overflow at 390 ·
`budgets` **OK 76.0 / 110 own, 216.0 / 220 total** (+0.1 KB, one lucide icon).

**Next:** W11c — the trash search the design asks for.

## W11c — the bin gets a search, and the search cannot become the leak

The design puts *"Search deleted stories, notes, comments"* on Trash. A real
`<form method="get">`: it works before hydration, every result is a URL somebody
can paste, and there is no client component, no debounce and no round trip —
the list is already loaded whole.

**In memory, unlike `/app/history`, and the difference is not an oversight.**
`trash_list()` returns everything deleted in one bounded read, so narrowing in
SQL would save nothing and add a second place for the projection to drift.

### The assertion that matters is that it finds nothing

A search box over a list is the obvious way for a withdrawn comment's words to
start being printed: type them, and a row that matched would echo them back.
They are not in `trash_list()`'s projection at all — not hidden by the page,
absent from what it is given — so the search cannot reach them. The spec types
a withdrawn comment's exact sentence, expects *"Nothing in the bin matches
that"*, and checks `page.content()` rather than `not.toBeVisible()`, because the
bug being looked for is text that is present and hidden with CSS.

That is the promise this screen has made since W4d, now made against the one
feature most likely to break it.

### Fourth substring collision of the session

`getByRole("button", { name: "Search" })` matched the topbar's ⌘K trigger —
*"Search items, sprints, people"* — as well as the form's own button. Scoped to
the `search` landmark rather than reaching for `exact`, which also documents
which search is meant.

`lint`, `typecheck` clean · `test` **404** · `db:test` **376** after a
`db:reset` · `budgets` **OK 76.0 / 110 own, 216.0 / 220 total** · trash **8/8**
· the six spec files W11 touches **167 passed, 3 skipped, 0 failed** · opened at
1280 and 390.

**W11 is done.** Next: W12 — Backup & Recovery Center, which `05-DECISIONS.md`
records as blocked on the hosting question: the hosted Supabase plan tier and
PITR status, then RPO, RTO and retention. Until those are answered no schedule,
retention period or snapshot id is written anywhere and the UI says coverage is
unverified.

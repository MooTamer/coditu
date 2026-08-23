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

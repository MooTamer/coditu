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
| 13 | **Motion pass** — every tier applied, reduced-motion verified, no `will-change` left pinned | `done` | pending | `npm run e2e` — 9 motion specs asserting computed style: no pinned `will-change` on either surface, nothing blur-animated past 40vh, no per-row blur on filter, the scrim resolves and the panel trails it, reduced motion complete; `./scripts/verify-tokens.sh` greps the built CSS for all of it |
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


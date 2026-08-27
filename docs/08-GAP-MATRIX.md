# 08 — Gap matrix

**Reopened 2026-08-27.** The overall audit is **not closed**. Repository, migration and
deployment synchronisation are complete — 35 migrations, local `main` at `b1bce94`
matched to `origin/main` *(both have since advanced to `b63f4c7`; see the fourth pass)*, all 35 entries matched entry-for-entry to the linked remote
history, the hosted schema verified by `db diff --linked` (*"No schema changes found"*),
and that commit verified **READY** in production at the provider — but **disaster
recoverability is not**. No backup layer has been configured; §4 of
`docs/09-BACKUP-PROPOSAL.md` is still six unanswered questions.

*(The figures above replace the ones this file opened with — 29 migrations at `f4b7aae`
— which were true when the audit was reopened and had gone stale within hours.)*

Source hierarchy, in order:

1. `PLAN.md` — the user requirements (the copy-ready design prompt plus §"Preserved for the
   later Claude Code prompt" and §"Locked assumptions").
2. The returned `Coditu design system updates 2-handoff.zip` — `Coditu Handoff.dc.html`
   (navigation hierarchy, component table, interaction rules, breakpoint table, designed
   states, what changed, unresolved decisions) and `Coditu Workspace.dc.html` (the
   prototype those are extracted from).
3. The current implementation and `docs/05-DECISIONS.md`.

**An ADR does not waive an explicit user or handoff requirement** unless Mohamed
explicitly approved that waiver. The four divergences recorded in `05-DECISIONS.md`
("Four places the build does not match the returned handoff, named on purpose") were
recorded, not approved. This matrix supersedes that framing: they are gaps until fixed or
waived by Mohamed.

Status vocabulary: `met` · `partial` · `gap` · `waived (Mohamed)` · `out of repo`.

**Second pass, 2026-08-27 — every repository-scoped gap below is now `fixed`.**
*(Read that sentence narrowly. It means every gap **in the table below**, and that table
is a **functional** comparison. It is not a claim of product conformance, and it is not a
claim of visual conformance — see the fourth pass at the end of this file, which found
fifteen surfaces that carry no measure at all.)*
The `Status` column is the state at the start; the `Now` column is the state
after the work, with what proves it.

**Third pass, 2026-08-27 evening.** The repository work of this audit is now on
`origin/main` and live: all nine commits are pushed and `b1bce94` was the READY
production deployment *at the time of that pass*. It has since moved twice — see the
fourth pass; `origin/main` and production are now `b63f4c7`. **No provider configuration has been changed** — PITR is off
and the provider lists no recoverable backups. Infrastructure backup remains
proposed and unapplied.

---

## A. Version history and recovery UI

| # | Requirement | Source | Status | Evidence |
|---|---|---|---|---|
| A1 | Free-text search of history | user | `gap` | `lib/history-filters.ts` `HISTORY_PARAMS = ["surface","actor"]`. No `q`. `app/app/history/page.tsx` renders chips only — no search input. |
| A2 | Filter by person | PLAN §11, user | `met` | `parseActorFilter`, `?actor=MT,AE`, plus the reserved `outside` token for sessionless writes. |
| A3 | Filter by content type | PLAN §11, user | `met` | `parseSurfaceFilter`, `?surface=comment,sprint_notes`. |
| A4 | Filter by project | PLAN §11, user | `gap` | No project parameter, and no column to filter on: `document_revisions` denormalises `work_item_id` and `sprint_id` only (migration `20260826220000` L2515-2540). |
| A5 | Filter by date | PLAN §11, user | `gap` | No date parameter. `created_at` is indexed only under the two scope partial indexes. |
| A6 | Filter by action | PLAN §11, user | `gap` | No action parameter. `created / edited / restored` is derivable (`revision_no = 1`, `restored_from is not null`) but is neither exposed nor queryable. |
| A7 | URL-shareable filter state | user | `met` | `toggleHref()` builds `URLSearchParams` from the current spec; every filter is a `<Link>`, no client component, works with JS off. Must be preserved by A1/A4/A5/A6. |
| A8 | Version History exposed from Sprint Notes | user | `gap` | `RevisionHistory` is imported by `components/app/item-detail.tsx` only (`grep -rn RevisionHistory app components lib`). `components/app/sprint-notes.client.tsx` contains no reference to history. A sprint note's versions are reachable only from `/app/history`. |
| A9 | Useful block/property diffs, not an unexplained "formatting only" | user | `gap` | `lib/diff.ts` diffs `plain_text` only and its own header states the consequence: *"a change that alters only formatting produces no diff lines"*. `summariseDiff()` returns the bare string `formatting only`; `RevisionEntryDetails` then renders "nothing to compare". `document_revisions.doc` holds the block tree and is never read for a diff. |
| A10 | Restore always creates a new current version | user, handoff §Recovery | `gap` | `record_document_revision()` returns early when `(old.doc, old.text) is not distinct from (new.doc, new.text)` — so restoring the version that is already current writes **no** revision, and `restore_document_revision` then returns the pre-existing latest as though it were new. |
| A11 | Intermediate versions preserved | user | `met` | `document_revisions` has `select` policy only; no `insert`/`update`/`delete` policy for anybody including admin. `supabase/tests/revisions.sql` asserts each refusal. |
| A12 | Restore records `restored_from` | user | `met` | `restore_document_revision` sets `coditu.restored_from`; the trigger stamps the column. `comment on column` records the intent. |
| A13 | Restore records actor and timestamp | user | `met` | `actor_id := (select auth.uid())`, `created_at default now()`. |
| A14 | Restore records audit activity | user, handoff §Recovery | `gap` | `record_work_item_activity()` fires on `status, assignee_id, reviewer_id, deadline` only. A restore writes no `activity` row. The revision itself carries `restored_from`, but nothing surfaces it as an audited event. |
| A15 | Withdrawn-comment tombstones never expose text to unauthorized readers | user | `partial` — verify | Three defences exist: `trash_list()` returns `'Comment on ' \|\| w.key` and never `body_text`; `getWorkItemRevisions` / `listRevisions` drop comment revisions by **allowlist** (comment present *and* standing); `purge_deleted` takes the revisions with it. **Not yet verified**: the client portal, the exports, the PDF report, and history search once A1 lands (a search that matches a withdrawn comment's words must not confirm they exist). |

## B. Missing document surfaces

| # | Requirement | Source | Status | Evidence |
|---|---|---|---|---|
| B1 | Project notes/pages | PLAN §3, §7, user | `gap` | No table. `grep 'create table public\.'` across `supabase/migrations` lists 32 tables and none is a page. The prototype's `pgNotes` entries call `this.toast("Project page — same block editor, project-scoped")` — furniture, by the design's own admission. |
| B2 | Standalone workspace notes/pages | PLAN §3, user | `gap` | Same. The prototype's palette offers `new note` → `this.go("notes")`, which lands on **sprint** notes. |
| B3 | Project-pages panel on the project page | handoff §Project page ("Pages & notes" eyebrow, `pgNotes`) | `gap` | `app/app/projects/[slug]/page.tsx` has `#components` and `#sprints` headings and nothing else. |
| B4 | Real routes rather than prototype-only furniture | user | `gap` | The handoff navigation hierarchy names `/app/sprint/notes`; the repo has no such route either — sprint notes render inside the sprint page. |
| B5 | Pages use the universal block editor | PLAN §3, user | `gap` (follows B1) | `RichTextEditor` exists and is reused by comments, criteria, story body and sprint notes; nothing mounts it for a page. |
| B6 | Pages support mentions | PLAN §3, user | `gap` (follows B1) | `mention-suggestion.tsx` is wired per surface. |
| B7 | Pages support acknowledgement-based publishing | PLAN §3, user | `gap` (follows B1) | The pattern exists (`settle()` + `lib/action-result.ts`, explicit Publish on sprint notes); no page to apply it to. |
| B8 | Pages have revisions and history | PLAN §11, user | `gap` | `revision_surface` enum has five values and none is a page. |
| B9 | Pages appear in Trash | PLAN §11, user | `gap` | `trash_list()` unions `work_item` and `comment` only. |
| B10 | Pages support selective recovery | PLAN §11, user | `gap` | `lib/recovery.ts` rehearsal covers the four things the app owns today; pages are not among them. |

## C. Workspace handoff gaps

| # | Requirement | Source | Status | Evidence |
|---|---|---|---|---|
| C1 | Recently opened pages | PLAN §2 ("Recently opened stories, projects, and notes"), handoff sidebar + Home `RECENTS` | `gap` | No `recent`/`recents` token in `components/app/rail.client.tsx`; no table; Home has favourites and activity but no recents. |
| C2 | 620px desktop story side peek | handoff breakpoint table (768–1023, 1024–1179, 1180+), `05-DECISIONS.md` divergence 1 | `gap` | `DialogShell` is `justify-center` with `maxWidth = 1080` and no second state. The prototype carries both: `peekWidth: full ? min(1080px,94vw) : min(620px,96vw)`, `peekJustify: full ? center : flex-end`. |
| C3 | "Open as full page" and return-to-peek | handoff `toggleFull`, `05-DECISIONS.md` divergence 2 | `gap` | The modal has a close button; `e2e/item-detail.spec.ts` asserts exactly that. |
| C4 | Scoped topbar presence | handoff component table ("56px topbar carries breadcrumbs, **surface presence**, save chip…"), `05-DECISIONS.md` divergence 3 | `gap` | `components/app/topbar.client.tsx` renders breadcrumbs, search, theme, Export, New item, account. Presence exists but only inside the story (`item-presence.client.tsx`). |
| C5 | Save-confidence states: Draft saved, Sending, Saved (after acknowledgement), Offline—will retry, Failed—draft kept, Recovered draft | PLAN §3, handoff component table + designed states, `05-DECISIONS.md` divergence 4 | `gap` | `grep -rni "draft saved\|recovered draft\|will retry\|draft kept"` → one hit, `comment-composer.client.tsx:302`. `navigator.onLine` is read in `lib/upload-image.ts` only. No shared chip, no shared vocabulary. |

## D. Remaining quality findings

| # | Requirement | Source | Status | Evidence |
|---|---|---|---|---|
| D1 | Isolate and fix every sub-44px mobile target; repeat the run enough times to catch the intermittent failure | user, PLAN §13 | `partial` | `e2e/mobile.spec.ts:357` covers four paths only — sprint, `/app/my-work`, `/app/people`, `/app/profile`. Home, projects, project page, history, trash, recovery, settings, payouts, earnings, import, clients, item detail and the whole client portal are unmeasured. It also caps at `.slice(0, 8)` and uses a single `waitForTimeout(250)`, which is where an intermittent pass comes from. |
| D2 | Stop read-only story visitors downloading the 329 KB ProseMirror chunk | user, `06-PROGRESS.md` | `gap` | Measured at `06-PROGRESS.md`: one chunk of 329,083 bytes containing `prosemirror-model` and `prosemirror-view` is fetched on a story's full page by a reader who never opens a composer. Cause not established; the ledger's hypothesis is a module-scope `dynamic()` preloaded on hydration. |
| D3 | Put the production-bundle test into the routine gate | user | `gap` | `npm run e2e:prod` exists (`scripts/e2e-prod.sh`) and is in no gate. The §14 checklist in `06-PROGRESS.md` does not name it, so `comments.spec.ts`'s bundle assertion silently skipped for weeks. |
| D4 | Add `Redaktionskalender` | user | `gap` | `npm run components:check` → `+ new Redaktionskalender (react, icon —)`; `supabase/seeds/components.sql` is stale. |
| D5 | Archive `Anfrage` and `Redakteurkalender` without deleting associations or history | user | `gap` | `npm run components:check` → `- gone Anfrage`, `- gone Redakteurkalender`, with the script's own advice: *archive it in the app; it keeps its history*. |

## E. Infrastructure backup

| # | Requirement | Source | Status | Evidence |
|---|---|---|---|---|
| E1 | Keep the Recovery Center honest | user | `met` — hold | `app/app/settings/recovery/page.tsx` states the split explicitly, chips the infrastructure card `not verified by this app`, and invents no schedule, retention, snapshot id or objective. Any change made here must not weaken that. |
| E2 | Concrete Supabase-specific backup proposal (PITR/physical, Storage objects, off-site copies, encryption, integrity verification, failure alerts, RPO, RTO, retention, scheduled restore drills) | user | `gap` | Nothing in `docs/` states an RPO, an RTO, a retention period or a drill schedule. `05-DECISIONS.md` records that these are undecided. |
| E3 | Do not pretend the in-database revision system protects against database/project loss | user | `met` — hold | The page already says so. The proposal must repeat it. |
| E4 | Stop and request Mohamed's decision on policy and cost before changing provider configuration | user | `out of repo` | No provider change is made by this audit. |

---

## What was checked and found conforming

Recorded so the matrix is a comparison and not a defect list.

- **Multi-component many-to-many, `any`/`all` filtering** — `lib/components.ts:230` `COMPONENT_MATCHES = ["any","all"]`, `matchesComponentFilter()`; join table `work_item_components`.
- **Multi-column sort stack** — `lib/sprint-sort.ts` `SORTABLE_COLUMNS`, `MAX_SORT_KEYS = 4`, `parseSort`, `compareRows`; asc / desc / cleared per header.
- **Saved, shareable views** — `saved_views` table, `lib/saved-views.ts` URL helpers with the zod half deliberately split into `lib/saved-views-schema.ts` so a client import cannot ship zod.
- **Roles Admin / Lead / Engineer, no Owner; self-demotion and last-admin protections** — `lib/roles.ts`, `20260821180000_role_is_not_client_supplied.sql`, `e2e/team.spec.ts`.
- **Earnings privacy** — `/app/earnings` (self) and `/app/settings/payouts` (admin) are separate surfaces; `e2e/earnings.spec.ts` and `e2e/client-boundary.spec.ts` hold the boundary.
- **Presence, scoped and named** — `presence-surface.client.tsx` + `item-presence.client.tsx` name the surface ("editing the description"), which is exactly the handoff's rule. Only its *placement* is a gap (C4).
- **Breakpoints of the shell** — `rail.client.tsx` 268px with labels at ≥1180, 64px icons below, gone below 768 where the bottom bar takes over. Those three numbers are the handoff's. *Amended in the fourth pass:* "line for line" was too strong — the handoff's 768–1179 row also calls for an **overlay drawer on demand**, which does not exist, and its mobile row lists **five** bottom-bar destinations against the four that are built. See V-S3 and V-S6.
- **Status vocabulary** — `in progress · peer review · in qa · changes req. · ready · draft · blocked · done`, the handoff's own words.
- **Trash** — searchable (`?q=`), real GET form, shows original location, deleted by, deleted at, permission-aware restore and admin-only purge; never prints a withdrawn comment's words.
- **Idempotent writes** — `e2e/reliable-writes.spec.ts`: a submission arriving twice happens once. The *behaviour* under C5 is real; the vocabulary on screen is what is missing.

## Explicitly not waived

`05-DECISIONS.md` §"Four places the build does not match the returned handoff" reasoned that
those four are additive and therefore deferrable. That reasoning is withdrawn: the user has
now asked for all four by name (C2, C3, C4, C5). They are gaps, and they are being built.

## Concurrent-edit guard

`05-DECISIONS.md` §"Two people editing one story: last write wins" stands. The user's
reopening asks to *verify* concurrent edits, not to add a base-revision guard, and the
recorded behaviour — every version preserved, attributed and restorable — is what will be
demonstrated. This is a **hold**, not a gap, and it is listed here so it is not mistaken for
an omission.


---

# Second pass — what was done, and what proves it

Every row below was a `gap` or a `partial` above. Each is closed with the command
or the file that holds it.

## A. Version history and recovery UI

| # | Now | Proof |
|---|---|---|
| A1 | `fixed` | `?q=` on `/app/history`, matched against `plain_text` with `%`/`_` escaped, backed by a `pg_trgm` index (`20260827120200`). `tests/history-filters.test.ts` → *"the search term"*. |
| A4 | `fixed` | `?project=` by slug. `document_revisions.project_id` denormalised and backfilled; `on delete set null`, not cascade. `supabase/tests/pages.sql` asserts the trigger writes it. |
| A5 | `fixed` | `?from=` / `?to=`, calendar dates read in `Africa/Cairo` through `Intl` rather than a hard-coded `+02:00` — Egypt observes DST. A range written backwards is read as the range between the two dates. |
| A6 | `fixed` | `?action=created,edited,restored`, derived rather than stored: `revision_no = 1`, `restored_from is not null`, and everything else. Two-of-three is expressed as the negation of the missing one. |
| A7 | `held` | Every filter is a `<Link>` or a real `<form method="get">`; the chips re-enter the form as hidden fields, which is the bug a GET filter bar usually has. Round-trip asserted. |
| A8 | `fixed` | `/app/projects/{slug}/sprints/{number}/notes` — a route that **did not exist and was already being linked to**. The sprint header's notes panel carries a `Version history` link to it. |
| A9 | `fixed` | `lib/block-diff.ts` — 14 unit tests. `formatting only` became *"a paragraph: formatting none → bold"*, *"a paragraph became a callout"*, *"a checklist item: ticked no → yes"*, *"link → https://…"*. Aligned by text, so a moved block is a move and not two rewrites. |
| A10 | `fixed` | The capture trigger's no-op guard is skipped when `coditu.restored_from` is set. `supabase/tests/pages.sql` → *"restoring the version that is already current still writes a new version"*. |
| A14 | `fixed` | `record_restore_activity()`, an `AFTER INSERT` on `document_revisions` — a table with no insert policy, so the row cannot be forged. Covers the four story surfaces; sprint notes and pages are covered by `?action=restored`, recorded in `05-DECISIONS.md`. |
| A15 | `verified` | Three defences confirmed and a fourth added: history search runs `ilike` in the database and the withdrawn-comment **allowlist** drops the row after it, so the words never leave the database and a searcher learns nothing from the absence. `e2e/trash.spec.ts` holds the bin's half. |

## B. Missing document surfaces

| # | Now | Proof |
|---|---|---|
| B1–B2 | `fixed` | `public.pages`, one table, `project_id is null` is the workspace page. Routes `/app/pages`, `/app/pages/[slug]`, `/app/projects/[slug]/pages`, `/app/projects/[slug]/pages/[page]`. |
| B3 | `fixed` | The project page's **Pages & notes** panel, between Components and Sprints, where the prototype has it. |
| B4 | `fixed` | Real routes, plus `/app/sprint/notes` as an entrance the way `/app/sprint` is. |
| B5–B7 | `fixed` | `PageEditor` mounts the same `RichTextEditor` behind `next/dynamic`, with mentions, an explicit Publish, and a *"Not published yet — only you can see this page"* banner enforced by RLS rather than by a filter. |
| B8 | `fixed` | `revision_surface` gained `page`; `document_revisions.page_id`; history on the page itself and in `/app/history`. |
| B9 | `fixed` | `trash_list()` gained a third arm. `e2e/trash.spec.ts` → *"a page goes to the bin, is listed without a sprint, and comes back"*. |
| B10 | `fixed` | A fourth rehearsal check, `pages` — a separate tick box, because selective is what "selective recovery" means. |

## C. Workspace handoff gaps

| # | Now | Proof |
|---|---|---|
| C1 | `fixed` | `recent_views`, bounded at 20 per person by a trigger. On **Workspace Home**, where `PLAN.md` §2 and the prototype put it — it was in the sidebar for an hour and the e2e suite found why that was wrong. |
| C2 | `fixed` | `DialogShell variant="peek"`. Measured live: **620 × 900**, docked right, `20px 0 0 20px`. Below `md` it is still the full-width sheet. |
| C3 | `fixed` | `Open as full page` (a `<Link replace>`) and `BackToPeek` (a button, because the two states are the same URL). |
| C4 | `fixed` | `TopbarPresence`, channel per route, caption from the shared surface store — *"Adam is editing the description"* from anywhere in the shell. |
| C5 | `fixed` | `save-state.client.tsx`: six words, one store, a chip in the topbar, `useTrackedSave()` at every writing surface. `Saved` only after acknowledgement; `failed` becomes `offline` when the browser says it is. |

## D. Remaining quality findings

| # | Now | Proof |
|---|---|---|
| D1 | `fixed` | One rule in `globals.css`; `e2e/mobile.spec.ts` now sweeps **21 routes**, measures a checkbox through its label, exempts `sr-only`, waits on `networkidle` instead of 250ms, and no longer caps at 8. Run ×4: 84 passed. |
| D2 | `fixed` | `lib/blocks/uploading.ts`. The recorded hypothesis was wrong; the cause was a two-line import. `@prod` assertion passes. |
| D3 | `fixed` | `npm run gate`, `npm run e2e:bundle`, `@prod` tags. |
| D4–D5 | `fixed` | `Redaktionskalender` added; `Anfrage` and `Redakteurkalender` in a `RETIRED` list, still inserted, archived by an explicit idempotent `update`. `Redakteurkalender` keeps its one story after a full `db:reset`. |

## E. Infrastructure backup

| # | Now | Proof |
|---|---|---|
| E1 | `held, strengthened` | The screen still invents no number. It now says **"Version history is not a backup"** in those words, and the `not set` card points at the proposal. |
| E2 | `proposed` | `docs/09-BACKUP-PROPOSAL.md` — four layers, real commands, real prices, RPO/RTO/retention tables with and without PITR. |
| E3 | `held` | §0 of the proposal, and the paragraph on the screen. |
| E4 | `held` | **No provider configuration was changed.** PITR is still off. §4 of the proposal is the list of six decisions waiting on Mohamed. |

## Still requiring Mohamed's decision

Nothing below is a defect. Each is a question this audit deliberately did not
answer for him.

1. **Backup policy and cost** — `docs/09-BACKUP-PROPOSAL.md` §4, six questions.
2. **Who may author a page.** Admin and lead today, matching sprint notes and the
   prototype's own data. The handoff raises the same question about notes and
   leaves it open.
3. **Trash retention.** Nothing purges automatically. Safe, and unbounded.
4. **Board drag semantics** — the handoff's own unresolved list; unchanged by
   this audit.
5. **Concurrent edits stay last-write-wins.** Every version preserved,
   attributed and restorable. Recorded, demonstrated, not changed.
6. **The app shell is at 218.6 KB of §5's 220.** Under budget, 1.4 KB of
   headroom. Worth knowing before the next client component.

---

# Fourth pass — visual conformance, 2026-08-27

**Audit only. Nothing below is implemented. The audit is not closed.**

*Working-copy note.* A second session shares this checkout and was committing and pushing
throughout this pass. `HEAD` moved from `b1bce94` to `c59e77b` mid-audit, `origin/main`
to `b63f4c7`, and the four uncommitted documentation edits that this session was asked to
leave alone were committed by that other session as `422194a`. This session committed
nothing. Any SHA in this file is the SHA at the moment it was written.

The three passes above compared *behaviour*. This one compares *appearance*: layout,
hierarchy, spacing, component placement, styling and designed responsive states. It was
opened because the rendered app does not look like
`Coditu design system updates 2-handoff.zip`, and none of the passes above would have
caught that — they never measured a container.

## What the bundle actually contains

Byte-compared against the committed `design/project/`:

| | |
|---|---|
| `Coditu App.dc.html`, `Coditu Brand.dc.html`, `Coditu Site.dc.html`, `Coditu Sprint Report.dc.html`, `Current Site - Strukture Digital.dc.html`, `doc-page.js`, `support.js` | **byte-identical** to what is committed |
| `Coditu Workspace.dc.html` (4364 lines), `Coditu Handoff.dc.html`, `Coditu Editor.dc.html`, `Coditu Table.dc.html`, `assets/legacy/logo.svg`, `assets/legacy/logo-stripped.svg` | **not in the repository at all** |

So the bundle is purely additive, and `design/` is missing the four files that are the
actual source of truth for the workspace. `Coditu Editor` and `Coditu Table` are
*components*, not screens; `Coditu Handoff` is the written contract; `Coditu Workspace`
is the one prototype that renders every surface.

**Gap V-0 — `design/` does not contain the design.** Severity **high**. The repo's
stated design source is a superseded five-artboard bundle. Correction: commit the four
new files into `design/project/` and say in `design/README-REPO.md` which bundle is
current. Verification: `diff` of the two file lists is empty.

## Method

Both sides rendered in the same browser at the same emulated viewports —
1440, 1024, 834, 768, 390, 320 — in light and dark. The prototype was served from a
local static server; the app from `next dev` at `localhost:3000`, signed in as
`mohamed@coditu.com`. Design values are read from the prototype's source, not eyeballed;
app values are read from `getComputedStyle` in the live page. Screenshots and probe
output are in the session scratchpad, outside the repository, and are not committed.

Two things the reader should know about the evidence:

- **Data differs and that is expected.** The prototype is frozen Week 17 demonstration
  data (12 items, 16.0 h of 46.0 h). The local database is real and was being written
  by a second session's e2e run during this audit (17 items, 58.0 h). Every row below is
  about structure, never about a number on screen.
- **The Next.js dev indicator** (a dark circle marked `N`, bottom-left) appears in
  every app screenshot and is not part of the app.

## Expected real-data differences — not gaps

Recorded so nobody re-files them.

- Item counts, hour totals, status distribution, people, dates, greeting.
- The prototype's `Nile Atelier partner portal` / `Ops Console` show `planning`; the app
  shows `no sprint`. The app's word is the truthful one.
- The prototype's teammate and client email addresses are placeholders; the handoff says
  so itself (§07, "Non-admin email addresses").
- Empty states differ because the local data is genuinely empty ("Nobody has needed you
  yet."). The empty states themselves are real and must stay.

## What conforms, measured

Not a defect list. Each of these was checked and matches.

- **Colour, both themes, token for token.** `getComputedStyle(document.documentElement)`
  against `palette()` in the prototype. Light: `--canvas #ebeff6`, `--raised #f8fafc`,
  `--overlay #fff`, `--ink #0b0e14`, `--ink-muted #52607a`, `--ink-faint #5f6b80`,
  `--accent #1e4ae0`, `--hairline` 10%, `--hairline-strong` 18%, `--scrim` 45%. Dark:
  `#07090e / #0c1119 / #111826 / #edf1f7 / #93a0b4 / #7c899c / #21e2c6`, hairlines 7% and
  13%. **Every one exact.** The drift in this audit is structural, not chromatic.
- **Rail geometry.** `--rail-collapsed: 64px`, `--rail-expanded: 268px`, expanded at
  `min-width: 1180px`, hidden below `md`. The handoff's three numbers.
- **Favourites and project spaces** exist in the rail, with the live component count.
- **Story peek geometry.** `dialog-shell.client.tsx` implements `min(620px, 96vw)` docked
  right with `rounded-l-section rounded-r-none`, `min(1080px, 94vw)` centred for the full
  page, full-screen below 768 — the handoff's story column exactly, and it cites it.
- **Surface presence and the save chip exist** as components (`topbar-presence.client.tsx`,
  `save-state.client.tsx`) and both quote the handoff in their own comments.
- **No horizontal page overflow** at 320, 390, 834 or 1440 on Home. The handoff's
  zero-overflow promise holds where it was checked.
- **Status vocabulary and chip tone pairs** match the prototype's `STATUS` table.

## V-A. Measure — the largest single divergence

The prototype gives **every** surface an explicit centred measure. The app gives two
surfaces a measure, and both are wrong; the other thirteen have none and simply fill
whatever the rail leaves — 1157–1172 px at a 1440 viewport, and wider on a larger monitor.

Design source: the `max-width` on each surface's root `div` in `Coditu Workspace.dc.html`.
Current values: `getComputedStyle` at a 1440 viewport, signed in as admin.

| ID | Route | Design | Current | Implementation file | Severity | Correction |
|---|---|---|---|---|---|---|
| V-A1 | `/app` | `1320px` | **`1080px`** | [app/app/page.tsx](app/app/page.tsx) | **high** | Raise to 1320; it is the container the right column needs (V-B5). |
| V-A2 | `/app/…/sprints/:n` | `1520px` | none (fills 1157) | [page.tsx](app/app/projects/[slug]/sprints/[number]/page.tsx) | **high** | Cap at 1520. |
| V-A3 | sprint notes | `860px` | none (fills 1172) | [notes/page.tsx](app/app/projects/[slug]/sprints/[number]/notes/page.tsx) | **high** | Cap at 860 — a reading measure, currently 1172 of prose. |
| V-A4 | `/app/my-work` | `1240px` | none | [my-work/page.tsx](app/app/my-work/page.tsx) | medium | Cap at 1240. |
| V-A5 | `/app/projects` | `1320px` | none | [projects/page.tsx](app/app/projects/page.tsx) | medium | Cap at 1320. |
| V-A6 | `/app/projects/:slug` | `1320px` | none | [[slug]/page.tsx](app/app/projects/[slug]/page.tsx) | medium | Cap at 1320. |
| V-A7 | `/app/people` | `1320px` | none | [people/page.tsx](app/app/people/page.tsx) | medium | Cap at 1320. |
| V-A8 | `/app/profile` | `900px` | none (fills 1157) | [profile/page.tsx](app/app/profile/page.tsx) | **high** | Cap at 900 — a settings form at 1157 is the worst case in the app. |
| V-A9 | `/app/settings` | `900px` | none (fills 1157) | [settings/page.tsx](app/app/settings/page.tsx) | **high** | Cap at 900. |
| V-A10 | `/app/earnings` | `1080px` | none | [earnings/page.tsx](app/app/earnings/page.tsx) | medium | Cap at 1080. |
| V-A11 | `/app/settings/payouts` | `1080px` | none | [payouts/page.tsx](app/app/settings/payouts/page.tsx) | medium | Cap at 1080. |
| V-A12 | `/app/trash` | `1240px` | **`880px`** | [trash/page.tsx](app/app/trash/page.tsx) | medium | Raise to 1240. |
| V-A13 | `/app/history` | `1320px` | none | [history/page.tsx](app/app/history/page.tsx) | medium | Cap at 1320. |
| V-A14 | `/app/settings/recovery` | `1240px` | none | [recovery/page.tsx](app/app/settings/recovery/page.tsx) | medium | Cap at 1240. |
| V-A15 | `/app/import` | `1080px` | none | [import/page.tsx](app/app/import/page.tsx) | low | Cap at 1080. |

**Proposed correction, all fifteen:** one shared `<PageShell measure="…">` that renders
`<main class="mx-auto w-full max-w-[…] px-… py-…">`, rather than fifteen hand-written
wrappers. Four routes (`/app`, `/app/trash`, sprint, notes) do not render a `<main>` at
all today, so the same change closes a landmark gap.
**Verification viewport:** 1440 and 1920 — the defect is invisible at 1280 and below.

## V-B. Workspace Home — missing visual structure

The design's Home is a two-column composition, `grid-template-columns: minmax(0,1fr) 320px`
at ≥1180, collapsing to one column below. The app renders three equal cards
(`330.664px × 3`) and has no right column.

| ID | Element | Design source | Current | Severity | Correction | Verify at |
|---|---|---|---|---|---|---|
| V-B1 | Quick actions row | `quickActions` — New story `n`, New note `N`, Open sprint `s`, Log time `t`, right-aligned beside the greeting, each with its key hint | absent | **high** | Add the four; they are the only keyboard affordance on Home | 1440 / 390 |
| V-B2 | Sprint **Goal** column | `sprintGoal` + window, `max-width: 44ch`, inline-editable | absent — app shows dates + `ended` only | **high** | Add Goal as the first of the three sprint-card columns | 1440 |
| V-B3 | Status **stacked bar** | 10 px full-width bar, `border-radius: 999px`, one span per status, plus a clickable legend that filters | app shows chips + counts, no bar | medium | Add the bar; keep the chips as the legend | 1440 / 390 |
| V-B4 | Per-person **load bars** | `sprintLoad` — initials, 5 px progress track, hours, right-aligned | app shows initials + number only | low | Add the track | 1440 |
| V-B5 | **320 px right column** — Online now / Recently opened / Activity | `homeCols: wide ? "minmax(0,1fr) 320px"` | absent; Recently opened is a third equal card, Online now and Activity do not exist | **high** | Build the right column; needs V-A1 first | 1440 (present) / 1024 (stacks) |
| V-B6 | My work **tabs** | `workTabs` — Assigned / Reviewing / Due this sprint, with counts | two static stacked lists | medium | Convert to tabs | 1440 |
| V-B7 | Home `h1` | `26px`, `letter-spacing -0.024em` | `24px` | low | Raise to 26 | 1440 |
| V-B8 | Mentions rows | avatar, author, where, when, body, unread dot, `mark all read` | empty state only in this data; markup not verified against a populated list | low | Re-check against seeded mentions before building | 1440 |

## V-C. Shell and navigation

| ID | Element | Design source | Current | Severity | Correction | Verify at |
|---|---|---|---|---|---|---|
| V-C1 | Breadcrumbs on every surface | topbar `crumbs`, shown at **all** widths — the 390 and 320 renders both show `Coditu / Home` | [breadcrumbs.client.tsx](components/app/breadcrumbs.client.tsx): `hidden … lg:flex` **and** `if (crumbs.length < 3) return null`. Absent on `/app`, `/app/my-work`, `/app/people`, `/app/projects`, `/app/history`, `/app/trash`, `/app/settings`; present on sprint, notes, earnings, profile, payouts, recovery | **high** | Mohamed's call. The file records real measurements — every crumb clipped at 900 and below — so this is a **reasoned divergence, not an approved waiver** | 1440 / 1024 / 390 |
| V-C2 | Rail search button | `Search or run` + `⌘K` pill, 36 px, first item in the rail | absent from the rail; search is a topbar field ≥1280 and an icon below | medium | Add to the rail | 1180+ |
| V-C3 | Rail footer tools | `railFooter` — Trash, Workspace settings, above the profile row | absent; both reachable only via other routes | medium | Add both | 1180+ |
| V-C4 | Rail header subtitle | `workspace · 4 members` under `Coditu` | absent | low | Add | 1180+ |
| V-C5 | Profile presence dot | 9 px jade dot on the rail avatar | absent | low | Add | 1180+ |
| V-C6 | Overlay nav drawer, 768–1179 | `navOverlay` — `min(320px, 86vw)` drawer + scrim, opened by the topbar hamburger | no drawer; the 64 px icon rail is the only navigation in that band | **high** | Build the drawer | 834 / 1024 |
| V-C7 | Save chip when idle | persistent jade `All changes saved` | [save-state.client.tsx](components/app/save-state.client.tsx) renders nothing when idle, by choice | medium | Mohamed's call — quiet-when-idle is defensible; it is a divergence either way | 1440 |
| V-C8 | Topbar `Export` | not in the design's topbar | present at every width | low | Confirm it stays; the design puts Export on the sprint header | 1440 |
| V-C9 | Topbar height | `min-height: 56px`, padding `8px clamp(12px,1.6vw,22px)` | `60px`, padding `0 28px` | low | Align to 56 / the design's gutter | 1440 |
| V-C10 | `--tint` token | `rgba(11,14,20,0.035)` light, `rgba(255,255,255,0.05)` dark — every hover in the prototype | **not defined**; hovers use `--canvas` | medium | Add the token, then use it | both themes |

## V-D. Sprint, projects, people, my work

| ID | Surface | Design source | Current | Severity | Correction | Verify at |
|---|---|---|---|---|---|---|
| V-D1 | Sprint — presence | `sprintPresence` "On this sprint now", fourth column of the sprint header | absent | medium | Add the column | 1440 |
| V-D2 | Sprint — saved views | `savedViews` menu, shared, with an `unsaved` marker and a copy-link that carries filters, sort and mode | a `Default order` control; `saved_views` exists in the data layer | medium | Surface the menu | 1440 |
| V-D3 | Sprint — sort stack | numbered, reorderable, removable panel; `panelWidth: 390px` docked right, full-width below 900 | `lib/sprint-sort.ts` implements the stack; no panel UI | medium | Build the panel | 1440 / 768 |
| V-D4 | Sprint — burn-up chart | **not in the design** | present in the sprint header | low | Confirm it stays | 1440 |
| V-D5 | Sprint — notes placement | notes are their own route, reached by a header button with a badge | notes render inline in the sprint page *and* have their own route | low | Mohamed's call | 1440 |
| V-D6 | Table → cards below 768 | `isTableNarrow` — story cards with component chips and a hairline footer row | not verified in this pass | medium | Verify before building | 390 / 320 |
| V-D7 | Sticky Task column, 768–1023 | handoff breakpoint table, "sticky Task column" | not verified in this pass | medium | Verify before building | 834 |
| V-D8 | My work as a table | handoff component table: the data table appears on "my work, projects, people, trash, history, snapshots, payouts" | three card lists | medium | Convert to the table component | 1440 |
| V-D9 | People — six sections | team, invitations, client contacts, roles, deactivated, audit | four: team, who can sign up, roles, latest access changes | medium | Add invitations, client contacts, deactivated as their own sections | 1440 |
| V-D10 | People — density | compact table rows, 44 px min | one large card per person with inline select and two buttons | medium | Convert to the table component | 1440 |
| V-D11 | Projects — list/cards toggle | `list + cards, search, status filter, archived` | search, status filters and `Show archived` exist; no list/cards toggle | low | Add the toggle | 1440 |

## V-E. Responsive states

| ID | Band | Design | Current | Severity | Correction |
|---|---|---|---|---|---|
| V-E1 | 768–1179 | icon rail **plus overlay drawer on demand**; topbar keeps breadcrumbs | icon rail only; no drawer; breadcrumbs gone below 1024 | **high** | V-C6 + V-C1 |
| V-E2 | 320–767 | bottom bar with **five** destinations: Home, Sprint, My work, **Search**, More | four: Home, Sprint, My work, More; search is a topbar icon | medium | Add Search as the fourth tab, More fifth |
| V-E3 | 320–767 | topbar carries hamburger + breadcrumb + save chip + theme + New | topbar carries search, theme, export, New, avatar — no brand, no location | medium | Add a location indicator |
| V-E4 | all | zero horizontal overflow at 320/390/834/1440 | **holds** on Home — `scrollWidth === innerWidth` at every width checked | — | none |
| V-E5 | 320–767 | touch targets ≥44 px | `tabbar-h: 60px`; per-control audit not run in this pass | medium | Run an explicit ≥44 px sweep before signing off |

## V-F. Correctness

**V-F1 — a false backup claim: fixed on production during this audit, and about to be
re-introduced by the new design. Severity: critical.**

`Coditu Workspace.dc.html` `backupCards` renders four assertions on the Recovery Centre:

```
Automated backup   Nightly · 03:00 UTC   Full workspace, including attachments.
Last successful    2026-08-25 03:00      42 MB · 4 minutes 12 seconds.
Integrity          Verified              Checksums match on every table and bucket.
Warning            1 delayed run         2026-08-23 ran 51 minutes late…
```

**None of it is true.** `supabase backups list` returns `pitr_enabled: false` and an
empty `backups` array; daily backups are a Pro/Team/Enterprise feature and this project
is on Free. There is no nightly run, no last successful backup, no integrity check and
no delayed run, because there is nothing to delay.

The instruction that opened this pass asked for the **production** Recovery Centre's
"last daily backup" sentence to be logged as a critical correctness gap. **It was real,
and it was on production when that instruction was written.** The deployed commit at
that moment was `b1bce94`, and `git show b1bce94:app/app/settings/recovery/page.tsx:92`
carries it verbatim:

> Point-in-time recovery — **off**. "Read from the hosted project on 2026-08-26. Without
> it, the recoverable position is whatever **the last daily backup** holds, not the last
> minute."

There is no last daily backup. The screen offered a fallback that does not exist, on the
one card whose whole purpose is to say what can be got back.

**It was fixed and deployed while this audit was being written**, by a second session
sharing this working copy: `422194a` rewrote the copy, `c59e77b` replaced the fact with
`Provider-held backups — none … There is no restore point: not last night's, not any`,
and Vercel deployed `b63f4c7` — which contains both — to production, READY. The header
comment in [recovery/page.tsx](app/app/settings/recovery/page.tsx) records the old
wording and why it was wrong.

*A note on how this was nearly recorded wrongly, because it is the same trap the field
notes already carry.* This audit's first check of the sentence read the **dev server**,
whose working tree the other session had already edited, and concluded the claim was
never on production. It took `git show` against the deployed SHA to get the true answer.
A running dev server is not evidence about production; the deployed commit is.


So the gap is not behind us, it is **in front of us**: implementing this prototype
literally would put the invented figures back on the one screen in the application where
an invented figure is most likely to be believed, and believed on the worst day.

**Correction:** the Recovery Centre adopts the prototype's *layout* — the four-card
header, the snapshot table, the numbered recovery steps — and **none** of its *values*.
The cards keep the current truthful copy. This must be an explicit, recorded waiver
before any work starts on `/app/settings/recovery`.
**Verification:** the string `Nightly · 03:00 UTC` must never appear in `app/` or
`components/`; assert it in the e2e suite.

## Not audited in this pass, and named so the gap in the audit is visible

Honest limits, not omissions.

- **Sprint Board**, project home, import, and the editor's slash/mention menus were not
  rendered side by side. V-D6 and V-D7 are read from the handoff table, not measured.
- **Presence with more than one person online** could not be produced — the local
  database had one signed-in account. The component exists; its rendered appearance is
  unverified.
- **A ≥44 px touch-target sweep** was not run (V-E5).
- **No visual-regression harness exists.** Every number here was taken by hand and will
  drift. A Playwright screenshot suite at the five viewports × two themes, gitignored per
  the repo's local-only rule, is the thing that would stop this recurring — and its
  absence is why three passes of this audit could report "fixed" without noticing that
  thirteen surfaces have no measure.

---

## V-G. The eight checks the fourth pass left open, now closed

Run against `visual-conformance` at `030fd6a`, its own dev server on :3100, the shared local
Supabase, signed in as `mohamed@coditu.com`. Nothing here is assumed; each row says what was run.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | **Sprint Board** side by side | `partial` | Renders with per-status columns, counts and cards. Diverges: columns are `minmax(240px,1fr)` gap `14px` against the design's `minmax(264px,1fr)` gap `12px`; and at `@min-[900px]` the app reflows to a **wrapping row grid** where the design keeps one horizontally-scrolling row at every width. Cards omit the deadline, the component chips and the 3 px left group border, and add a "story" kind label the design does not have. → **V-D4a** |
| 2 | **Project home** | `met` (structure) / `gap` (measure) | Already the design's two-column shape: left Components / Pages & notes / Sprints, right Saved views / Team / Client access / Latest activity. Breadcrumbs present. No `max-width` — fills 1157 px against the design's 1320. → V-A6 only |
| 3 | **Import** | `gap` (measure, crumbs) | Renders; `main` fills 1172 px against the design's 1080; no breadcrumb trail. → V-A15, V-C1 |
| 4 | **Slash and mention menus** | **`met`** | `npx playwright test e2e/editor.spec.ts e2e/composer.spec.ts --workers=1` → **22 passed**. Covers: slash opens the block menu and the keyboard drives it; slash does *not* fire mid-sentence; Escape closes the menu and leaves the draft; the menu is axe-clean; `@` opens the mention list and stores the profile id rather than the name; Escape dismisses the list and only the list. The handoff's interaction rules for both menus hold. |
| 5 | **Table → cards at 390 and 320** | `met` (behaviour) / minor drift | 17 cards at both widths, zero horizontal overflow. Card carries key, status chip, title, assignee, hours, deadline, criteria. Drift: radius `14px` vs `12px`, padding `16px` vs `13px`, and the **component chips row is absent**. |
| 6 | **Sticky Task column at 834** | **`gap`, and worse than the matrix assumed** | The sticky mechanism is right — `position: sticky; left: 0; z-index: 2`, `background: #F8FAFC` (`--raised`), wrapper `overflow-x: auto`, `min-width: 340px` (design 300). **But it is never seen at 834**, because the table→card switch is a `@max-[900px]` *container* query ([sprint-table.client.tsx:289](components/app/sprint-table.client.tsx:289), [sprint-cards.tsx:43](components/app/sprint-cards.tsx:43)) and the design's switch is `w < 768` *viewport*. At 834 the design shows the full table with the sticky column; the app shows cards. → **V-D7 confirmed** |
| 7 | **Touch targets, all designed mobile routes** | **`gap` — fails on 11 of 11** | See the table below. |
| 8 | **Presence, two authenticated contexts** | **`met`** | `npx playwright test e2e/presence.spec.ts --workers=1` → **5 passed**: two people on one sprint see each other; leaving removes the avatar; a story names who is on it and what they are doing; nothing typed reaches the socket; the channel join is authorised in SQL. Behaviour conforms — only *placement* is a gap (V-B5, V-D1). |

### V-G7 — touch targets: **the first measurement was invalid and is withdrawn**

**Struck.** This section carried a table of per-route counts — 115 on `/app/history`, 31 on
`/app/projects`, 30 on `/app/people`, and so on down to 3. **Not one of those numbers was real**,
and they must not be cited again.

The sweep that produced them measured through the `adminPage` fixture, which is a plain desktop
context: no `hasTouch`, no `isMobile`. `app/globals.css` puts the 44px floor behind
`@media (pointer: coarse)`, so on that context **the rule was never in effect** — the sweep measured
the fine-pointer sizes the design asks for at that width and called every one of them a failure. It
also had no semantic exemptions (visually-hidden file inputs, checkboxes targeted through their
label, links inline in a sentence) and it asserted per route, so it stopped at the first.

`e2e/touch-targets.local.spec.ts` has been rewritten to use a real coarse-pointer context, the same
four exemptions and the same 43.5px tolerance as the canonical sweep in `e2e/mobile.spec.ts`, and to
**aggregate every route into one assertion** so a run says everything that is wrong rather than the
first thing.

**What the repaired sweep actually found, across all 21 routes:**

```
/app/sprint                          — summary "Burn-up · hours logged0%" 308×17
/app/projects/meinevim/sprints/17    — summary "Burn-up · hours logged0%" 308×17
```

Two entries, one control, the same surface reached two ways — and it was **introduced by this
branch**, in the commit that made the burn-up a collapsible `<details>`. `<summary>` is a control
the browser gives you for free, which is exactly why the 44px block in `globals.css` had never named
it: nothing declares it, so nothing thought to size it. It is named now, beside `button`,
`[role=button]` and `a[href]`, so every future disclosure inherits the floor.

Re-run after the fix: **1 passed**, all 21 routes, zero targets under 44px.

The `/login` note below the old table was produced by the same invalid method and is withdrawn with
it. Whether `/login` conforms on a coarse pointer is now simply unmeasured.

### What this changes in the plan

- V-D6 and V-D7 move from "read from the handoff table, not measured" to **measured**, and V-D7 is
  a single-threshold fix rather than new work: `@max-[900px]` container → `< 768px` viewport.
- ~~A new phase-0 item: touch targets.~~ **Withdrawn** — the counts it rested on were invalid. See
  the struck V-G7 section.
- Checks 4 and 8 are **closed as conforming** — the editor and presence engines do not need work;
  only where their output is placed does.

---

# Fifth pass — implementation, 2026-08-27

Branch `visual-conformance`, from `origin/main` at `b63f4c7`.
**Visual conformance is NOT complete.** This section is the row-by-row state. A row is
`done` only where the Evidence column names a command or a measurement that was run.

## Done, with the measurement that proves it

| Row | What changed | Evidence |
|---|---|---|
| **V-0** | The four workspace files are in `design/project/`; `README-REPO.md` names `Coditu Workspace.dc.html` as the source of truth for `/app` and records the two places the prototype is not the authority | `030fd6a`. Byte-compare showed the five older artboards, `doc-page.js` and `support.js` identical between bundles, so nothing was duplicated and no runtime added |
| **V-A1 – V-A15** | One `PageShell` carries all fifteen measures; four routes gained a `main` landmark they never had | `e2e/measures.local.spec.ts` — **15/15 at 1920**, each asserting the exact `max-width`, a `main`, and no horizontal overflow |
| **V-C1** | Breadcrumbs at every width; below `lg` the trail collapses to `Coditu / … / COD-229` instead of disappearing; folded crumbs stay in the accessibility tree | `e2e/navigation.spec.ts` **15/15**, including a rewritten spec that asserts the ellipsis, the surviving middle crumb, and the trail on Home. Measured at 320: the trail occupies 161px of 320 |
| **V-C8** | Export removed from the global topbar, added to the sprint header beside Sprint notes | Browser at 1440: `topbarHasExport: false`, `pageHasExport: true`. `a11y.spec.ts › axe: the export dialog` passes against the new location |
| **V-C9** | Topbar is `min-height: 56px` and wraps, not a fixed 60 | Served CSS carries `--topbar-h: 56px` |
| **V-C10** | `--tint` exists in both themes at the design's values and is used across the shell | Computed: `--tint: #0b0e1409` light. 27 content-level `--canvas` hovers are **left, deliberately** — see Outstanding |
| **V-D4a** | Board is one horizontally scrolling row at every width; columns `minmax(264px,1fr)`, gap 12px | Source; **still not measured in the browser** — the board is out of this batch's scope |
| **V-D6 / V-D7** | Table→cards moves from a 900px *container* query to the design's 768px *viewport*. The sticky Task column is exercised for the first time | Browser at 834: `tableVisible: true`, `stickyPos: sticky`, `cardsVisible: 0`, `overflow: false` |
| **V-E2** | Bottom bar carries the design's five destinations | Measured at 320: five tabs at 64px each, `truncated: false` on all five, no overflow. The "five would truncate" note this replaced was never measured |
| **Locked 3** | Export in the sprint header only | as V-C8 |
| **Locked 4** | Sprint notes are their route; the duplicated inline panel is gone | Browser: `inlineNotesEditor: false`, `notesLink: true` |
| **Locked 5** | Burn-up is a closed `<details>` below the designed header | Browser: `burnUpDetails: true`, `burnUpOpen: false`. Works before hydration |
| **V-G7** | Topbar controls, theme toggle and account trigger are 44px below `md`; `summary` added to the coarse-pointer floor in `globals.css` | `e2e/touch-targets.local.spec.ts` — **1 passed**, 21 routes aggregated, real `hasTouch` + `isMobile` context, zero targets under 44px |

## Outstanding — nothing below has been implemented

Ordered as the plan orders them. Every one is still a gap.

| Row | What is still missing |
|---|---|
| **V-B1 – V-B8** | Workspace Home's whole composition: quick actions, sprint Goal column, status stacked bar, per-person load bars, the **320px right column** (Online now / Recently opened / Activity), My work tabs, the 26px `h1`. Home has its 1320px measure now and nothing to put in it |
| **V-C2 – V-C6** | Rail search button, rail footer tools, rail subtitle, profile presence dot, and the **768–1179 overlay drawer** — the largest remaining shell gap |
| **Locked 2** | The truthful idle save chip. Untouched: the chip still renders nothing when idle, which is neither the design's persistent "All changes saved" nor the required proof-of-no-pending-write |
| **V-D1 – V-D3** | Sprint presence column, saved-views menu, sort-stack panel |
| **V-D8 – V-D11** | My work, People and Projects as database-style tables; People's six sections; the Projects list/cards toggle |
| **V-F1** | Recovery Centre structure. **The truthful copy is untouched and must stay that way** — the four-card header may be adopted, none of the prototype's values may be |
| ~~**V-G7, routes**~~ | **Closed, and it was never open.** The per-route counts were an artefact of measuring without a coarse pointer — see the struck section above. The repaired aggregate sweep is green on all 21 routes. |
| ~~**V-B1 – V-B8**~~ | **Done** — see the sixth pass below. |
| ~~**V-C2 – V-C6**~~ | **Done** — see the sixth pass below. |
| **Phase 9** | Editor, mention, slash, presence, empty, loading, offline and failure states in their designed placements |
| **`--tint` sweep** | 27 files still hover with `--canvas`. Left because it is a 27-file visual change I could not verify in one pass, not because it is right |

## Verification still owed

The plan lists twelve checks. These have **not** been run:

- 768, 1180 and 1920 sweeps in the browser (only 320, 390, 834, 1024 and 1440 were).
- **Dark theme across the changed surfaces.** Tokens were verified; the changed layouts were not.
- **Lead, Engineer and Client boundaries** against the new shell.
- 200% zoom, multi-user presence, offline and failed-save states.
- **Production bundle budgets** (`npm run budgets`) — `PageShell` is a server component and should be free, but that is reasoning, not a measurement.
- **The full serial browser suite.** Attempted twice on `mobile.spec.ts` + `a11y.spec.ts`:
  83 passed / 13 failed, then 87 passed / 13 failed **with a different thirteen**.

  Those runs mixed together two failure kinds that have nothing to do with each other, and the
  earlier entry here wrongly implied one cure for both. They are:

  **Cold-render races — a compilation and streaming problem, and a `db:reset` does nothing for it.**
  The dev server compiles a route the first time it is asked for, and while a route streams its
  `loading.tsx` renders `<main data-loading-skeleton>`. A spec that waits only on `networkidle`
  can measure the skeleton. Three separate observations, all of them this:
  - `e2e/measures.local.spec.ts` cold: **11 of 15**. Warm: 15 of 15, same rows.
  - `e2e/navigation.spec.ts` cold: **13 passed, 2 failed, 1 skipped**. Both failures passed warm.
  - `a11y.spec.ts › axe: the export dialog` failed in a cold run and passed alone warm.

  The cure is a readiness marker, and it is in now: `PageShell` renders `data-page-shell` on the
  `<main>` that carries the measure, and the local specs wait for it rather than for the network.

  **Database determinism** is the separate thing: the suite writes rows, three browser projects run
  against one local Supabase, and only a serial run from a fresh `db:reset` — auth container
  restarted, PostgREST cache reloaded — produces a number `06-PROGRESS.md` would keep. **That reset
  has not been run and will not be from this branch: the local stack is shared with a second
  session's worktree.** No claim about the suite total is made here.

  The one failure that survived both runs was `mobile.spec.ts:357 › every target clears 44px`. It
  was neither of the above: it was a **real regression introduced by this branch** — the burn-up
  `<summary>` at 308×17 — recorded at the time as a pre-existing gap, which it was not.
  Fixed; see the struck V-G7 section.


---

# Sixth pass — Workspace Home and the shell, 2026-08-27

Branch `visual-conformance`, `e5097e3`. **Visual conformance is still NOT complete** — this
batch was V-B1 – V-B8 and V-C2 – V-C6 only, and the rows the Fifth pass lists as outstanding
below those are untouched.

## Rows closed, with the measurement

| Row | What it is now | Evidence |
|---|---|---|
| **V-B1** | Quick actions beside the greeting: New story `n`, Sprint notes `N`, Open sprint `s`, Log time `t` | `e2e/home-shell.local.spec.ts` asserts all three visible controls. Every key is **bound**, and the listener stands down inside `input`, `textarea`, `select` and `contenteditable`, and on any modifier |
| **V-B2** | The sprint goal is the first of the card's three columns, `max-w-[44ch]` | same spec — `Goal` visible at 1440 |
| **V-B3** | 10px stacked status bar, one span per status by share, with a legend | same spec — `role="img"` whose label names every slice and its count |
| **V-B4** | Per-person load bars: initials, 5px track, hours | Share of the sprint's **logged** time, which is the only honest comparison between those two numbers — not of a capacity nobody set |
| **V-B5** | The 320px right column: Online now, Recently opened, Activity | Measured at 1440: `grid-template-columns: 761px 320px`. `e2e/home-shell.local.spec.ts` asserts two tracks ending `320px` at 1920/1440/1180 and one column at 1024/834/768/390/320 |
| **V-B6** | My work is three tabs — Assigned / Reviewing / Due this sprint — with counts | same spec — `getByRole("tab")` is exactly 3. "Due this sprint" is the assigned rows filtered by the sprint's own `endsOn`, compared as ISO calendar strings (invariant 5), so it adds no query |
| **V-B7** | Home `h1` is 26px / `-0.024em` | Measured: `h1Size: "26px"` |
| **V-B8** | Mentions rows unchanged; the card moved into the left column | Not a change — recorded so the row is not read as done work |
| **V-C2** | `Search or run` + `⌘K` at the top of the sidebar | same spec. Dispatches the event the topbar's palette already listens for — `⌘K`, the phone's Search tab and this are one dialog and one piece of state |
| **V-C3** | `Trash` and `Workspace settings` in the rail footer | same spec. **Admin-only**, because both routes are: `/app/settings` redirects a lead and `/app/trash` is admin-gated at the database |
| **V-C4** | `workspace · N members` under the name | same spec, against a live count from the profiles the shell already reads |
| **V-C5** | A jade presence dot on your own face in the rail | The one presence fact a component can know without a socket. Teammates' dots are on Home, where a channel is actually subscribed |
| **V-C6** | The 768–1179 overlay drawer | `e2e/home-shell.local.spec.ts` — opens from the topbar hamburger, `x = 0`, `width = 320`, closes on Escape. Built on the existing `DialogShell` with a new `drawer` variant, so there is one focus trap and one scroll lock |
| **V-G7** | `summary` added to the coarse-pointer 44px floor | `e2e/touch-targets.local.spec.ts` — **1 passed**, 21 routes aggregated. And the canonical `e2e/mobile.spec.ts:357` now passes on all three browser projects |

## Verification actually run for this batch

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint app components e2e` | clean |
| `vitest run` | **451 passed**, 33 files |
| `git diff --check` | clean |
| **Bundle budgets** | `npm run budgets` → **OK**. App shell **219.1 KB of §5's 220** own+total; marketing 153.7/130 with a 140.0 KB framework floor. **0.9 KB of headroom — down from 1.4.** Worth knowing before the next client component |
| **1920 / 1440 / 1180 / 1024 / 834 / 768 / 390 / 320** | `home-shell.local.spec.ts` — **2 passed** (light and dark), asserting per band: no horizontal overflow, the right grid, the right navigation, and the breadcrumb trail present |
| **Light and dark** | as above, and the palettes were already verified token-for-token in the fourth pass |
| **200% zoom, keyboard, thirteen-width overflow, axe every route** | `e2e/a11y.spec.ts` + `e2e/navigation.spec.ts` → **29 passed, 1 skipped, 0 failed** (the skip is `@prod`, which needs a production URL) |
| **Safe areas, sheets, coarse pointer, 16px fields** | `e2e/mobile.spec.ts`, all three projects → **60 passed, 0 failed** |
| **Lead, Engineer and Client boundaries** | `e2e/access.spec.ts` + `e2e/client-boundary.spec.ts` + `e2e/team.spec.ts` → **19 passed, 0 failed** |
| **Aggregate coarse-pointer sweep** | **1 passed**, 21 routes, real `hasTouch` + `isMobile` |

No database reset was run and none was needed for any of the above.

## Two things measured that contradicted a reasonable assumption

- **`md:flex min-[1180px]:hidden` put the drawer's hamburger on a 1920px screen**, beside a fully
  labelled sidebar. Two utilities from different breakpoint families do not order the way reading
  them suggests. Both that range and Home's two-column grid are plain rules in `globals.css` now,
  on attributes React sets — the same remedy the sidebar's own two states already use, and for the
  same reason.
- **Both CSS changes needed a `.next` wipe to appear at all.** The served stylesheet had zero
  `--tint`, zero `summary:not([data-dense])` and zero `[data-home-grid]` while the source had each.
  `07-FIELD-NOTES.md` carries the trap and its one-command check; it has now caught it three times
  in this branch.

## Still outstanding after this batch

Unchanged from the Fifth pass, minus the rows above: the sprint's saved views and sort panel, the
database-style Projects / My work / People layouts, the Recovery Centre's structure, Phase 9's
editor and reliability states, the truthful idle save chip, and the 27 content-level `--canvas`
hovers. The board's column geometry (V-D4a) is in the source but has not been measured in a browser.

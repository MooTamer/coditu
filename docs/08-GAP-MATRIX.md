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
| **V-A1 – V-A15** | One `PageShell` carries all fifteen measures; four routes gained a `main` landmark they never had | `e2e/navigation.spec.ts › the surfaces carry their measure` — **15/15 at 1920**, each asserting the exact `max-width`, a `main`, and no horizontal overflow. *(Was `e2e/measures.local.spec.ts`, which git does not carry; promoted 2026-08-28 — Eighth pass.)* |
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
| **V-B1 – V-B7** | **Done. V-B8 is NOT** — see the sixth pass below, which was reopened and corrected. |
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
# Sixth pass — Workspace Home and the shell, 2026-08-27, corrected 2026-08-28

Branch `visual-conformance`. Implementation `e5097e3`, **corrected by `526c62c`**.
**Visual conformance is still NOT complete** — this batch was V-B1 – V-B8 and
V-C2 – V-C6 only, and every row the Fifth pass lists below those is untouched.

## Why this section was rewritten

The first version of it claimed V-B1 – V-B8 and V-C2 – V-C6 closed, and recorded
`home-shell.local.spec.ts` as **2 passed**. The file contained four tests, not
two, and what they asserted was that things were **visible**. Visible is not the
claim any of those rows makes, and underneath it nine things were wrong — the
sprint card outside Home's grid, the goal printed twice, an inert status legend
signed off on the `role="img"` of the bar above it, load bars divided by the
total instead of the largest entry, "Due this sprint" scoped by a date alone,
`Log time` pointing at a table that cannot log time, an `N` key cited as source
conformance against a source that gives that action no key, tabs with no panel
and no arrow keys, a drawer that duplicated `rail-project-spaces`, and workspace
presence that only existed while Home was mounted.

`526c62c` fixes all of them. The instruments below were rewritten to assert URLs,
measurements and resulting rows rather than presence, and the counts here are
what those instruments actually printed.

## Rows closed, with the measurement that proves it

Unless stated otherwise the evidence is
`E2E_LOCAL=1 npx playwright test e2e/home-shell.local.spec.ts --project=chromium --workers=1`
→ **16 passed**, run three consecutive times (20.4s / 18.4s / 18.2s).

| Row | What it is now | Evidence |
|---|---|---|
| **V-B1** | Quick actions beside the greeting: `New story n`, `New note` (**no key**), `Open sprint s`, `Log time t` | The four rendered labels are read back and compared exactly. `New story` opens the real `NewItemDialog`; `Log time` resolves to `/app/projects/…/sprints/…/items/COD-…#log-time` and the panel with the `Log …` control is asserted at the destination. Each key is pressed and its outcome awaited; the listener is proved to stand down inside the palette's field, inside a `contenteditable`, on ⌘/Ctrl/Alt/Shift, and on `repeat` |
| **V-B2** | The sprint goal is the first of the card's three columns, `max-w-[44ch]`, and is printed **once** | Every non-empty paragraph in the card is counted; any repeat fails the test. The loose copy under the sprint name is gone, and the days-left chip moved to the header row where the source draws it |
| **V-B3** | 10px stacked status bar, one span per status by share, with a legend **that filters** | Each legend entry's `href` is asserted, clicked, the resulting URL awaited, and the sprint's `tbody tr` count compared to the number the legend printed — for every slice |
| **V-B4** | Per-person load bars: initials, 5px track, hours, measured against the **busiest** person | `lib/home.ts` `loadShare`/`busiest`, with fixtures in `tests/home.test.ts` proving it divides by the largest entry and not the sum, and does not divide by zero. Real minutes throughout; `hours()` is the only division by 60 |
| **V-B5** | The 320px right column, beginning **level with the sprint card** | **The track:** `e2e/navigation.spec.ts › … › Home is one column below 1180 and a 320px aside above it` — `grid-template-columns` ends ` 320px` at 1920/1440/1180 and does not at 1024/834/768/390/320. **The alignment:** measured at 1440 in `e2e/home-shell.local.spec.ts` — the card is inside `[data-home-left]` and is its first child, its width equals the left track's, its top within 1px of `Online now`'s — and that half is still local, so a clone cannot re-run it. *(Split 2026-08-28 — Eighth pass.)* |
| **V-B6** | My work is three tabs — Assigned / Reviewing / Due this sprint — as a real tablist | `e2e/a11y.spec.ts › keyboard contracts a scanner cannot see › My work is a real tablist with a panel and roving focus` *(promoted 2026-08-28 — Eighth pass)*: every tab has `aria-controls` pointing at a real `tabpanel` that names it back; exactly one tab is in the tab sequence and exactly one is selected; ArrowRight/ArrowLeft/Home/End move selection **and** focus, wrapping both ways. "Due this sprint" is scoped to the active project **and** sprint before the deadline is applied — six fixtures in `tests/home.test.ts`, including another project's work with a deadline in range. The assertion that the *rendered* rows sit under the active sprint's path was **not** promoted and is still `e2e/home-shell.local.spec.ts`, so a clone re-runs the predicate and the tablist but not that |
| **V-B7** | Home `h1` is 26px / `-0.024em` | `font-size: 26px` and the computed letter-spacing, measured at 1440 |
| **V-C2** | `Search or run` + `⌘K` at the top of the sidebar | Asserted in the rail, and **clicked**: it opens the same dialog `⌘K` and the phone's Search tab open |
| **V-C3** | `Trash` and `Workspace settings` in the rail footer | Both asserted in the rail. Admin-only, because both routes are |
| **V-C4** | `workspace · N members` under the name | Compared against the number of rows `Online now` actually lists, so the count cannot drift from the roster |
| **V-C5** | A jade presence dot on your own face in the rail | Exactly one, `rgb(35, 201, 127)` |
| **V-C6** | The 768–1179 overlay drawer | `e2e/a11y.spec.ts › keyboard contracts a scanner cannot see › the tablet drawer traps, restores, locks and closes` *(promoted 2026-08-28 — Eighth pass)*: opens from the topbar hamburger at `x = 0`, `width = 320`; the rail is still in the document behind it; `body` overflow changes while open and is restored on close; Tab and Shift+Tab each cycle past the end without escaping; Escape closes it and focus returns to the opener; a navigation from inside it closes it. `rail-project-spaces` and `drawer-project-spaces` each appear exactly once, and no id in the page is duplicated |

## V-B8 is NOT closed — *closed in the Seventh pass below, 2026-08-28*

The Mentions composition from the source — avatar/initials, author, project and
item, time, body preview, unread tint and dot, and a truthful `mark all read`
wired to the existing `markNotificationsRead` Server Action — **is implemented**
in `526c62c`. It is **not verified in a populated state**, and this row must not
be read as done.

`public.notifications` on this machine holds **0 rows** (`select count(*)` —
the seed inserts none, and notifications are written by the
`sync_comment_mentions` trigger). The local stack is shared with another
session's worktree, so this pass may not create rows to look at. What is proved:

- the empty state, and that `mark all read` is **not** offered when there is
  nothing unread — a control that reports success while changing nothing is
  indistinguishable from a broken one;
- the row-to-sentence mapping, by fixtures in `tests/home.test.ts`: the author
  comes from the comment's own author through `comment_id`, an `assigned` or
  `review_requested` row genuinely has no actor to name and falls back to its
  verb rather than inventing one, and a comment that previews as whitespace does
  not render a blank line.

**Still owed for V-B8:** the populated card in a browser, on a database somebody
may write to. — **Paid on 2026-08-28**, on the isolated `coditu-iso` stack; see the
Seventh pass.

## One decision left for Mohamed

The source gives `New note` **the empty string** as its key:

```js
{ label: "New note", key: "", icon: "M6 4h9l3 3v13H6zM14 4v4h4", run: () => this.go("notes") },
```

The build drew and bound `N`, and the first version of this section cited that as
conformance. It is not, so the badge and the binding are both gone. Whether
Coditu wants a shortcut there anyway is a product call, not an audit finding —
it needs an answer before anyone reinstates it, and reinstating it means
amending the source or recording the divergence in `05-DECISIONS.md`.

## Verification actually run for this batch

Everything below ran against a `next dev` on **:3007** started from this
worktree, because port 3000 is held by another session's checkout of `main` —
`reuseExistingServer` would otherwise have measured that code and reported it as
this branch's.

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npx eslint app components lib e2e tests scripts` | clean |
| Unit | `npx vitest run` | **471 passed**, 34 files (was 451 / 33; `tests/home.test.ts` adds 20) |
| Whitespace | `git diff --check` | clean |
| **Bundle budgets** | `npm run budgets` | **OK**. App shell **79.2 KB own / 110**, **219.3 KB total / 220** — **0.7 KB of headroom, down from 0.9**. Marketing 13.7/20 own, 153.7/130 total against a 140.0 KB framework floor |
| **Home, drawer, presence** | `E2E_LOCAL=1 playwright test e2e/home-shell.local.spec.ts --project=chromium --workers=1` | **16 passed**, three consecutive runs |
| **1920 / 1440 / 1180 / 1024 / 834 / 768 / 390 / 320, light and dark** | same file | per band: no horizontal overflow, the right grid, the right navigation, the breadcrumb trail |
| **Cross-route presence** | same file | two authenticated contexts: one on `/app`, one on `/app/people`. Home shows **both** online, and the `N of M` count agrees with the dots it drew |
| **Measures and the coarse-pointer sweep** | `E2E_LOCAL=1 playwright test e2e/measures.local.spec.ts e2e/touch-targets.local.spec.ts --project=chromium --workers=1` | **16 passed** — 15 measures at 1920, plus the aggregate 21-route sweep with a real `hasTouch` + `isMobile` context |
| **The canonical touch-target check** | `playwright test e2e/mobile.spec.ts -g "every target in the app clears 44px on a coarse pointer" --workers=1` | **3 passed** — chromium, mobile-safari, mobile-chrome |
| **Axe every route, 200% zoom, keyboard, thirteen-width overflow** | `playwright test e2e/a11y.spec.ts e2e/navigation.spec.ts --project=chromium --workers=1` | **29 passed, 1 skipped, 0 failed** (the skip is `@prod`, which needs `E2E_PROD_URL`) |

**Not run, deliberately.** The mutation-heavy groups — the full `mobile.spec.ts`,
`access.spec.ts`, `team.spec.ts`, `client-boundary.spec.ts` — write and delete
rows, and the local database is shared with another session. The Sixth pass's
first version reported numbers for all four; those numbers are withdrawn, not
because they were wrong but because this pass cannot stand behind them. They are
owed on an isolated, resettable database. — **Run on 2026-08-28** on exactly that:
**68 passed, 6 failed, 5 not run**, all six failures one cause. See the Seventh pass.

**No database was reset, and nothing was written to it.** The counts below were
re-measured on 2026-08-28 in a `PGOPTIONS='-c default_transaction_read_only=on'`
psql session against the shared stack on `:54422`, because the paragraph that
stood here was wrong.

It claimed "six comment revisions exist that the seed does not describe."
**Six** is the count of `document_revisions` with `surface = 'sprint_notes'` —
a different surface, read off the wrong row of a `group by surface`. The real
drift is an order of magnitude larger, and it is three numbers, not one:

```sql
select count(*) from public.comments;                              -- 68
select count(*) from public.document_revisions
  where surface = 'comment';                                       -- 112
select count(*) from public.document_revisions r                   -- 44
 where r.surface = 'comment'
   and not exists (select 1 from public.comments c where c.id = r.entity_id);
```

- **68 comments, where `supabase/seed.sql` inserts 70.** The `insert into
  public.comments` block at `seed.sql:2552` carries 70 rows across 70 distinct
  `work_item_id`s — one comment each for 70 of the 107 work items. All 68
  survivors are seeded ids, none is soft-deleted, and nothing has been added, so
  the deficit is exactly two deletions:
  `490119e5-9a5c-1c6c-3e86-f595867a6008` on **`COD-238`** and
  `97ffbd29-c5f1-4ec7-9ed0-6d70892041b3` on **`COD-240`** — two different items,
  not two comments on `COD-238`.
- **112 comment revisions, where a fresh reset leaves 70.** `seed.sql` writes no
  `document_revisions` itself, but `record_comment_revision` — an `after insert
  or update of body_json, body_text` trigger — writes one for every comment, so
  the 70 seeded comments leave 70 revisions, all at `revision_no = 1`. That
  baseline is **measured, not assumed**: a `supabase db reset` on an isolated
  stack gives `comments 70 · comment revisions 70 · orphans 0`. So 42 of the 112
  are the suite's. The whole table on the shared stack reads
  `acceptance_criterion 304 · comment 112 · work_item_description 79 ·
  sprint_notes 6 · work_item_highlight 2`.
- **44 of those 112 are orphans**, across 44 distinct `entity_id`s — nothing
  cascades `document_revisions` when a comment goes. **Two** are baseline
  revisions left behind by the two deletions above. The other **42** name
  comment ids the seed never defines: comments the suite created and then
  removed. The arithmetic closes exactly — 70 baseline + 42 suite = 112 revisions,
  and 2 + 42 = 44 orphans, against 70 - 2 = 68 comments.

The 68/112/44 numbers come straight from the three statements above. The 70, the
two named ids, and the 2/42 split of the orphans need the seed's own id list, so
that the next reader can re-run it rather than take it on trust:

```bash
# the 70 comment ids the seed defines
awk 'NR>2552' supabase/seed.sql | awk '/^insert into/{exit} {print}' \
  | grep -oE "^\s*\('[0-9a-f-]{36}'" | grep -oE '[0-9a-f-]{36}' > /tmp/seeded.txt

IDS=$(awk '{printf "%s(\047%s\047::uuid)", (NR>1?",":""), $0}' /tmp/seeded.txt)
PGOPTIONS='-c default_transaction_read_only=on' \
psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" <<SQL
with seeded(id) as (values $IDS)
select s.id, wi.key from seeded s
  left join public.comments c on c.id = s.id
  left join lateral (select work_item_id from public.document_revisions dr
                      where dr.entity_id = s.id limit 1) r on true
  left join public.work_items wi on wi.id = r.work_item_id
 where c.id is null;                       -- the two deletions, with their items

with seeded(id) as (values $IDS)
select count(*) filter (where s.id is not null) as from_seeded_comments,
       count(*) filter (where s.id is null)     as from_unseeded_comments
  from public.document_revisions r left join seeded s on s.id = r.entity_id
 where r.surface = 'comment'
   and not exists (select 1 from public.comments c where c.id = r.entity_id);
SQL
```

None of this is a defect in the application: it is the residue of e2e runs on a
stack nobody reset. It is also why "the seed inserts none" is the wrong baseline
to reason from — a trigger, not the seed, is what puts the first 70 there. It is recorded because it is the reason the four withdrawn
suites could not be trusted here, and because a stale count in an audit is worth
no more than no count at all.

## What the instruments got wrong, and what that cost

Playwright's selector engine matched **two** of every element on Home. It was not
the application: `document.querySelectorAll` returned one at every sample, the
accessibility tree contained one, and the second match reported
`connected: false` with the parent chain `MAIN < DIV#S:0`.

`#S:0` is React's streaming placeholder. `/app` streams, so when the page
resolves React delivers it inside `<div hidden id="S:0">` and then moves the
children into place — and both the emptied wrapper and the detached former
subtree stay matchable. Anything asserting a count on this page has to exclude
them, which `:visible` does and `:light()` does not, because none of it is shadow
DOM. Written down on `home()` in the spec, with the measurement.

Two hours went into that, most of it spent believing the duplicate was a
hydration mismatch. `07-FIELD-NOTES.md` already warns that this dev server
fabricates hydration diffs after a recompile; the lesson to add is that a
*doubled* element is a different animal from a *changed* one, and the first thing
to ask is whether the second copy is `connected`.

## Still outstanding after this batch

Unchanged from the Fifth pass, minus the rows above, **plus V-B8** *(V-B8 has since
been closed — see the Seventh pass)*: the sprint's
saved views and sort panel, the database-style Projects / My work / People
layouts, the Recovery Centre's structure, Phase 9's editor and reliability
states, the truthful idle save chip, the 27 content-level `--canvas` hovers, and
the board's column geometry (V-D4a), which is in the source and has still not
been measured in a browser.


---
# Seventh pass — the Sixth pass's debts, paid on an isolated database, 2026-08-28

Branch `visual-conformance`, worktree `/Users/motamer/Dev/Freelance/coditu-visual-conformance`.
Nothing pushed, nothing merged, nothing deployed.

The Sixth pass owed two things it could not pay: **V-B8** needed a populated Mentions card on a
database somebody may write to, and the four mutation-heavy suites needed a stack that was not
shared. Both are paid here, on a second Supabase project that exists only for this.

## The database, so the isolation is auditable rather than asserted

|  | shared (untouched) | isolated (used here) |
|---|---|---|
| `project_id` | `coditu` | **`coditu-iso`** |
| API / Kong | `:54421` | **`:54521`** |
| Postgres | `:54422` | **`:54522`** |
| Studio | `:54423` | **`:54523`** |
| Mailpit | `:54424` | **`:54524`** |
| containers | `supabase_{db,auth,rest,kong,storage,realtime,studio,pg_meta,inbucket}_coditu` | **the same nine, suffixed `_coditu-iso`** |
| dev server | `:3000`, another session's checkout of `main` | **`:3011`, from this worktree** |

The isolated project is a copy of `supabase/` **outside the repository**, with `project_id` and the
seven ports rewritten and `site_url` pointed at `:3011`. Nothing about it is a tracked change, and
`docker ps` shows eighteen containers in two disjoint sets.

The only thing this pass did to `:544xx` was **read** it, in a session opened with
`PGOPTIONS='-c default_transaction_read_only=on'`, for the three counts corrected above.

**Proof the application was bound to the isolated stack and not to the shared one.** Env vars alone
are not proof — `NEXT_PUBLIC_*` is compiled in, and `07-FIELD-NOTES.md` already records a build that
ignored an override. So the served bundle was read back from the browser:

```js
// in the page, over every <script src> the app loaded
{ iso54521: ["lib_ee7a3085._.js"], shared54421: [] }
```

One chunk names `127.0.0.1:54521`. **No chunk names `127.0.0.1:54421`.** `.next` was deleted before
the server started, because a warm cache is exactly how the wrong URL survives an env change.

The sequence, in order, from the isolated workdir:

```bash
supabase start                       # coditu-iso, 545xx
supabase db reset                    # 35 migrations, then 4 seed files
docker restart supabase_auth_coditu-iso supabase_rest_coditu-iso supabase_kong_coditu-iso
psql "postgresql://postgres:postgres@127.0.0.1:54522/postgres" -c "notify pgrst, 'reload schema'"
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54521/auth/v1/health   # 200, second poll
```

Baseline immediately after that, and the number the corrected paragraph above leans on:

```
comments=70  comment_revisions=70  notifications=0  profiles=4
```

## V-B8 — closed

`public.notifications` is written by `sync_comment_mentions`, not by any Server Action, so the card
was populated the only truthful way: by inserting comments whose `body_json` carries mention nodes
and letting the trigger do the rest. Six comments from the other three people, mentioning Mohamed
Tamer, across two projects and three sprints; four left unread, two marked read. If the trigger were
broken this produces nothing to look at, which is the point of driving it from that end.

```sql
insert into public.comments (id, work_item_id, author_id, body_json, body_text, created_at)
select m.comment_id, m.work_item, m.author,
  jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object(
    'type','paragraph','content', jsonb_build_array(
      jsonb_build_object('type','mention','attrs',
        jsonb_build_object('id','a0000000-0000-4000-8000-000000000001','label','Mohamed Tamer')),
      jsonb_build_object('type','text','text',' ' || m.body))))),
  '@Mohamed Tamer ' || m.body, now() - m.age
from m;   -- m: (comment_id, work_item, author, body, age, read), six rows
```

The trigger stamps `created_at` with `now()`, so every row would have read "just now". Each
notification's `created_at` was then set to its own comment's, and two were given a `read_at`. Those
two columns are the only ones touched; the rows themselves are the trigger's.

Read back from the DOM at 1180 wide, signed in as the admin:

| What V-B8 claims | What the card did |
|---|---|
| avatar | `AN` / `AY` / `AE` initials, one per row, from `PersonAvatar` |
| author | `Adam Nafie`, `Ahmed Yehia`, `Abdelrahman Elkhateeb` — resolved through `comment_id`, never invented |
| project and item | `COD-229 · MEINEvim components`, `COD-243 · Converso dashboard` — and the `href`s land on `/app/projects/converso/sprints/1/items/COD-243` and `/app/projects/meinevim/sprints/16/items/COD-220`, so project **and** sprint come from the item's own chain and not from the active scope |
| time | six distinct stamps, `2026-08-28 01:25` down to `2026-08-24 19:36` |
| body preview | the comment's `body_text`, truncated, `@Mohamed Tamer …` |
| unread tint | four rows `data-unread="true"` at `background-color: rgba(11, 14, 20, 0.035)`; the two read rows at `rgba(0, 0, 0, 0)` |
| unread dot | four accent dots, each with the `sr-only` " — unread"; **zero** on the read rows |
| the count | `data-mentions-unread="4"`, and the control read `mark all read — 4 unread` |

`mark all read`, clicked once:

```
before: unread=4 read=2
after:  unread=0 read=6
```

and the four newly-read rows carry the same `read_at` to the second (`22:39:35`) while the two
already-read rows **keep their original timestamps** — the action stamps what was unread, it does not
overwrite the table. Without a reload the card then reported `badge: null`, `dots: 0`, `tinted: 0`,
and **no `mark all read` button at all**, which is the empty-state behaviour the Sixth pass proved
from the other direction, now shown from this one.

**V-B8 is closed.** The Sixth pass's "Still owed for V-B8" is discharged.

## A harness defect found on the way, and fixed

`e2e/team.spec.ts:190` wrote its literal `http://127.0.0.1:54421` into a `page.evaluate`, so the one
test that proves *the database refuses a lead's role change even when the app is bypassed* would have
fired at the **shared** stack while every assertion around it read the isolated one. It would not have
failed. Every local Supabase project ships the same default JWT secret, so the token validates; the
row simply is not there; PostgREST patches nothing; and `readSubject()` then reads the database the
test meant all along and finds the role unchanged — which is exactly what the test wants to see.

A negative test cannot tell "the guard held" from "I asked the wrong server". `SUPABASE_URL` is
exported from `e2e/fixtures.ts` now and passed into the `page.evaluate`, so there is one answer.

Re-run on its own, the test passes — and the proof that it passes for the right reason is in the
proxy logs, not in the green tick:

```
supabase_kong_coditu-iso  "PATCH /rest/v1/profiles?id=eq.1dd4bd00-… HTTP/1.1" 204  referer http://localhost:3011/
supabase_kong_coditu      (nothing, same three-minute window)
```

The bypass reached the isolated stack. The shared one never saw it.

**Seven other specs still carry the same literal** — `allowlist`, `earnings`, `new-item`, `settings`,
`password`, `sprint-manage`, `sprint-notes` — and `avatar.spec.ts` keeps its own private copy of the
constant. None is in this batch; all of them will silently target `:54421` the next time somebody
points the suite elsewhere.

*(**Eight files, not seven.** `avatar.spec.ts` is named in the sentence above and then dropped from
the count in the summary at the end of this pass — its `?? "http://127.0.0.1:54421"` is the same
literal wearing a different shape, and a spec that reads a default is bound to a stack exactly as
firmly as one that writes the URL inline. Corrected below; all eight are swept in the Eighth pass.)*

## The four withdrawn suites, run

```bash
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test e2e/mobile.spec.ts e2e/access.spec.ts e2e/team.spec.ts \
                    e2e/client-boundary.spec.ts --workers=1
```

From the pristine reset above, serial, one worker, no retries. **3.8 minutes.**

| File | Project | passed | failed | did not run |
|---|---|---|---|---|
| `access.spec.ts` | chromium | 4 | **4** | 0 |
| `client-boundary.spec.ts` | chromium | **5** | 0 | 0 |
| `mobile.spec.ts` | chromium | **20** | 0 | 0 |
| `mobile.spec.ts` | mobile-safari | **20** | 0 | 0 |
| `mobile.spec.ts` | mobile-chrome | 19 | **1** | 0 |
| `team.spec.ts` | chromium | 0 | **1** | **5** |
| **total** | | **68** | **6** | **5** |

The five that did not run are `team.spec.ts`'s remaining tests: the file is
`describe.configure({ mode: "serial" })`, so the first failure skips the rest. They are one
consequence, not five results.

**These numbers replace the Sixth pass's withdrawn ones. They are not green, and they are not being
presented as green.**

## The six failures are one cause, and it is the harness

Every failing assertion died the same way — `strict mode violation: … resolved to 2 elements` — on
`Self-protection`, `person@example.com`, `Access history names…`, `[data-access-history]`,
`Role for Team Subject`, and `Write a comment — @ to mention`. That is the duplicate the Sixth pass
diagnosed on Home, on three more routes, and against the committed suite rather than a local one.

Measured rather than assumed, five loads of `/app/people` per selector, sampling every 20 ms from
`load`:

| selector | max matches, bare | max matches, `:visible` | samples showing two |
|---|---|---|---|
| `[data-access-history]` | **2** | **1** | 26 of 46 |
| text `Self-protection` | **2** | **1** | 33 of 48 |

At `waitUntil: "load"` the element exists **once**, inside `DIV#S:1` — React's streaming placeholder,
which is `hidden`, so `:visible` counts zero. At `networkidle` it exists **once**, at
`DIV < BODY < HTML`, visible. In between, while React moves the subtree into place, both are
matchable, and Playwright's auto-retry starts in that window. Roughly half the samples land in it,
which is why this reads as flake.

So: the application renders one of each element; the suite asks a question that has two answers for
about a tenth of a second. `:visible` never resolved to more than one in 94 samples.

**What this does not mean.** It is not a licence to call these six green. The fix is real work —
`:visible` (never `:light()`, none of this is shadow DOM) or a wait on `[data-page-shell]`, the
readiness marker the Sixth pass added for exactly this, applied to the six assertions. It is
deliberately **not** done in this pass: rewriting committed specs changes what is under test, and
this pass was asked to produce numbers, not to move the goalposts under them.

## Still outstanding after this batch

Everything the Sixth pass listed, **minus V-B8**, which is closed above: the sprint's saved views and
sort panel, the database-style Projects / My work / People layouts, the Recovery Centre's structure,
Phase 9's editor and reliability states, the truthful idle save chip, the 27 content-level `--canvas`
hovers, and the board's column geometry (V-D4a), still not measured in a browser.

Added by this pass:

1. **Six failing assertions across `access`, `team` and `mobile`**, diagnosed above, unfixed.
   *(All six have since been measured, confirmed as the harness, fixed and re-run — see the Eighth pass.)*
2. **Eight specs still hard-coding `:54421`** — `allowlist`, `avatar`, `earnings`, `new-item`,
   `password`, `settings`, `sprint-manage`, `sprint-notes` — which will point at the wrong stack
   without failing. *(This read "Seven" and omitted `avatar.spec.ts`. All eight are closed in the
   Eighth pass.)*
3. **The visual evidence is not reproducible outside this Mac** — see
   `05-DECISIONS.md`, *The visual evidence lives in three specs git does not carry*.


---
# Eighth pass — the six failures, measured before being touched, 2026-08-28

Branch `visual-conformance`, worktree `/Users/motamer/Dev/Freelance/coditu-visual-conformance`.
Nothing pushed, nothing merged, nothing deployed.

The Seventh pass diagnosed six strict-mode failures as the streaming duplicate and deliberately
left them alone, having measured only two of them. This pass measures the other four the same
way, and only then repairs them.

## The database, again disjoint from the shared one

A second Supabase project, stood up from a copy of `supabase/` **outside** the repository with
`project_id` and the seven ports rewritten. The shared `544xx` stack was neither written to nor
read from in this pass.

|  | shared (untouched) | isolated (used here) |
|---|---|---|
| `project_id` | `coditu` | **`coditu-iso`** |
| API / Kong | `:54421` | **`:54521`** |
| Postgres | `:54422` | **`:54522`** |
| Studio | `:54423` | **`:54523`** |
| Mailpit | `:54424` | **`:54524`** |
| containers | `supabase_{db,auth,rest,kong,storage,realtime,studio,pg_meta,inbucket}_coditu` | **the same nine plus `edge_runtime`, suffixed `_coditu-iso`** |
| dev server | `:3000`, another session's checkout | **`:3011`, from this worktree, `.next` deleted first** |

Baseline after `supabase db reset` — 35 migrations, then four seed files — matching the Seventh
pass's exactly:

```
work_items=107  comments=70  profiles=4  notifications=0  access_events=6
```

**On the binding check.** The Seventh pass proved the app was bound to `:54521` by finding the
port inside a served chunk. That check does not reproduce here and the reason is worth writing
down rather than glossing: under this dev server **no** served response names either port —
`{ responses: 63, iso54521: [], shared54421: [] }` across `/login`, `/app` and `/app/people`.
Turbopack splits the browser client differently, so the compiled-in URL is not in a body the
page fetches. What settles it instead is the traffic: every sign-in, every `page.evaluate` PATCH
and every `query()` in the run below went to `127.0.0.1:54521` / `:54522`, and the assertions
that read rows back agreed with the writes. A chunk grep that finds nothing is not evidence of
isolation; it is the absence of that particular evidence, and saying so is cheaper than
implying a proof that was not obtained.

## The four that had not been measured

Same method as the Seventh pass's two: five raw loads per selector — `waitUntil: "load"`, on a
context that is deliberately **not** instrumented, because `instrumentPage`'s readiness wait is
the very window being measured — sampling the bare locator and `.filter({ visible: true })`
every 20 ms for 1200 ms. ~225 samples each.

| selector | route | max, bare | max, `:visible` | samples showing two | the second match's chain |
|---|---|---|---|---|---|
| placeholder `person@example.com` | `/app/people`, admin | **2** | **1** | 4 of 207 | `INPUT < LABEL < FORM < … < MAIN < DIV#S:1 < BODY` |
| text `/names capabilities that are an admin/` | `/app/people`, engineer | **2** | **1** | 8 of 224 | `P < DIV < SECTION < DIV < MAIN < DIV#S:1 < BODY` |
| label `Role for Team Subject` | `/app/people`, admin | **2** | **1** | 5 of 226 | `SELECT < LABEL < SPAN < … < MAIN < DIV#S:1 < BODY` |
| text `Write a comment — @ to mention` | item detail, Pixel 7 | **2** | **1** | 4 of 226 | `SPAN < BUTTON < … < MAIN < DIV#S:1` — `isConnected: false` |

Every second match's parent chain runs through `DIV#S:1` — React's streaming placeholder — and
`:visible` never exceeded one in any of ~880 samples. The first three were caught while the
subtree was still inside the `hidden` wrapper; the fourth after the move, detached. **None of the
four is a real duplicate**, and neither were the two the Seventh pass measured. There was nothing
here to stop and report.

`#S:1`, not `#S:0`, is the useful detail: this is a **nested** Suspense boundary, which is why
`instrumentPage`'s wait did not cover it. That wait settles the outer boundary — no
`[data-loading-skeleton]`, a `__reactFiber$` on `main` — and the inner one resolves afterwards.
It is not a bug in the wait; it is a second boundary the wait cannot see.

## The repair

`shell(page)` — `main[data-page-shell]:visible` — is exported from `e2e/fixtures.ts` now, with the
table above in its comment. Sixty spec files did not need changing; three did:

| File | What changed |
|---|---|
| `e2e/access.spec.ts` | the four failing assertions scoped through `shell()`; the lead/engineer pair's hand-rolled `browser.newContext()` page handed to `instrumentPage`, which `fixtures.ts` already asks for and which this file is the reason for |
| `e2e/team.spec.ts` | `Role for Team Subject` and the rest of the file's page-level element locators scoped through `shell()`; its bypass test's hand-rolled page instrumented |
| `e2e/mobile.spec.ts` | the composer's opener scoped through `shell()` |

`:visible` and not `:light()`, because none of this is shadow DOM. The absence assertions matter
as much as the clicks: `toHaveCount(0)` against a page-level locator fails on the wrapper's copy
and reads as *the guard did not hold*.

## The re-run

From a pristine `supabase db reset`, serial, one worker, no retries:

```bash
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test e2e/mobile.spec.ts e2e/access.spec.ts e2e/team.spec.ts \
                    e2e/client-boundary.spec.ts --workers=1
```

Twice, each from its own fresh reset:

| | passed | failed | did not run | time |
|---|---|---|---|---|
| first run | **78** | 1 | 0 | 3.7 min |
| second run | **79** | **0** | 0 | 3.5 min |

Against the Seventh pass's **68 passed / 6 failed / 5 never ran**. All six named failures are gone
in both runs, and `team.spec.ts`'s five skipped tests ran and passed — the file is
`describe.configure({ mode: "serial" })`, so they were one consequence, not five results.

## The one failure in the first run is a different animal, and is NOT fixed

`[mobile-safari] › mobile.spec.ts:160 › the page behind is locked, and stays where it was`:

```
Error: the wheel is not locked
Expected: "hidden"
Received: "clip visible"
```

`clip visible` is `app/globals.css:372` — `body { overflow-x: clip }` — which is the body's
**unlocked** state. The read is a single un-retried `page.evaluate` taken immediately after
`expect(dialog).toBeVisible()`, and Radix applies the scroll lock in an effect after mount. So it
caught the body between the dialog rendering and the lock landing.

It is a race in the harness of the same family as the six, and it is **not** one of the six, so it
has been left exactly where it is. What is known about it:

- re-run alone on `mobile-safari`, three times: **3 passed**
- the second full serial run: **passed**
- it is a read, not a poll — `expect.poll` on `getComputedStyle(document.body).overflow` is the
  obvious repair and it is somebody's deliberate decision, not a thing to slip into this batch

## The literal, in eight files and not seven

The Seventh pass named seven specs carrying `http://127.0.0.1:54421` and then wrote "Seven" into
its own summary while `avatar.spec.ts` sat outside the count with
`process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421"` at the top of the file. That is
the same literal in a different shape: it follows an override, so it is less wrong than the seven —
but it is a second answer to a question `e2e/fixtures.ts` already answers, and two answers is the
whole problem. **Eight**, corrected above in both places.

All eight are on the exported `SUPABASE_URL` now. Where the literal was inside a `page.evaluate`,
the URL is passed in as an argument alongside whatever the callback already took —
`{ sprintId, supabaseUrl }` — the shape `team.spec.ts` was given in the Seventh pass:

| File | Call site |
|---|---|
| `allowlist.spec.ts` | `POST /rest/v1/allowed_emails` |
| `avatar.spec.ts` | the file's private `SUPABASE_URL`, deleted; `PUBLIC_PREFIX` now builds on the exported one |
| `earnings.spec.ts` | `POST /rest/v1/sprint_payouts` |
| `new-item.spec.ts` | `POST /rest/v1/work_items` |
| `password.spec.ts` | `PATCH /rest/v1/profiles?id=eq.…` |
| `settings.spec.ts` | `PATCH /rest/v1/profiles?id=eq.…` |
| `sprint-manage.spec.ts` | `POST /rest/v1/sprints` |
| `sprint-notes.spec.ts` | `PATCH /rest/v1/sprints?id=eq.…` |

### The grep

```
$ grep -rn 54421 --exclude-dir={node_modules,.next,test-results,.git} .
e2e/fixtures.ts:21:export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
```

is the only hit **under `e2e/`**, which is what the sweep was about. It is not the only hit in the
repository and it should not be reported as one:

| Remaining | Why it stays |
|---|---|
| `supabase/config.toml:15`, `.env.example:10` | where the port is **defined**. Deleting the number here deletes the stack |
| `scripts/check-budgets.mjs:73`, `scripts/check-degraded-dependency.mjs:41` | their own `process.env.… ?? default`, the same shape as `fixtures.ts:21`. Each is one file's single answer, and both follow an override |
| `tests/*.test.ts` (5 lines) | vitest fixtures. The string is **input** to `normaliseHref`, `avatarUrl` and `attachmentSrc` — nothing connects to it |
| `supabase/tests/rls.sql:683` | an arbitrary URL being written into `avatar_url` inside a pgTAP `lives_ok`. Data, not a target |
| `docs/*` | prose about the stack, including this file's own tables |

### The proof, from the proxy rather than from a green tick

The four bypass tests plus `password.spec.ts`'s were re-run on the swept code — **11 passed** — and
both Kong access logs read afterwards. Every browser-side write in that window reached the isolated
proxy:

```
supabase_kong_coditu-iso    44 PATCH /rest/v1/profiles   9 PATCH /rest/v1/sprints
                             6 POST  /rest/v1/work_items  5 POST  /rest/v1/allowed_emails
                             3 POST  /rest/v1/sprints     …
supabase_kong_coditu        (nothing from :3011 after 23:38:50Z)
```

**And the run immediately before it demonstrated the defect, because it had to.** Establishing that
the three pre-existing failures below were not caused by the sweep meant running the eight specs
once on the pre-sweep code, and the pre-sweep code does what this entry says it does:

```
supabase_kong_coditu  23:37:44Z  POST  /rest/v1/work_items                    403  referer …:3011/
supabase_kong_coditu  23:37:59Z  PATCH /rest/v1/profiles?id=eq.a0000000-…004  403  referer …:3011/
supabase_kong_coditu  23:38:13Z  PATCH /rest/v1/profiles?id=eq.71b2198b-…     204  referer …:3011/
supabase_kong_coditu  23:38:25Z  POST  /rest/v1/sprints                       403  referer …:3011/
```

Four requests from this worktree's dev server at the **shared** stack, while every assertion around
them read the isolated one. The `204` is the instructive one: PostgREST answers a PATCH that matches
no rows with `204`, and the test then read the database it meant and found the role unchanged — the
guard "holding" for a reason that has nothing to do with the guard.

The shared stack was checked read-only afterwards and is **unchanged**: `71b2198b…` does not exist
there, no work item titled `E2E new item — smuggled`, no sprint numbered `902`, four profiles with
one admin, four allowlist rows, and `a0000000-…004` still `engineer`. Three 403s and a no-op.

### Three failures in that run, none of them the sweep's

Run serially from a fresh reset, all eight files, one worker:

| | passed | failed | did not run |
|---|---|---|---|
| pre-sweep (stashed) | 42 | **4** | 16 |
| post-sweep | **44** | **3** | 1 |

The sweep removes one failure and adds none. The three that remain are pre-existing and are **not**
fixed here — they are outside what this batch was asked to do, and each is a different animal:

1. `allowlist.spec.ts:77` — `getByLabel('Email')` resolves to two on `/login`. Both tabs of the
   sign-in form are in the document, so this is a real second field, not the streaming copy. It
   needs a scope, not a `:visible`.
2. `earnings.spec.ts:255` — expects `1.0 h added` and reads `41.5 h added`. The file's own earlier
   tests move the sprint's minutes, and this one asserts a delta against a confirmation taken
   before them. It is an ordering assumption inside one file, visible only at `--workers=1`.
3. `sprint-notes.spec.ts:46` — the seeded notes are not on the page. Its serial `describe` then
   skips the rest of the file, which is why one test "did not run".

## The long-term answer, taken

`05-DECISIONS.md`, *The visual evidence lives in three specs git does not carry*, listed promoting
the durable assertions as the right answer and asked that somebody choose it rather than default
into it. Chosen. The four claims it names are in the committed suite now, where `npm run gate`
runs them:

| Claim | Now lives in |
|---|---|
| the fifteen measures at 1920 | `e2e/navigation.spec.ts › the surfaces carry their measure` — fifteen tests, one per route |
| the 320px right column | `e2e/navigation.spec.ts › … › Home is one column below 1180 and a 320px aside above it` |
| the tablist keyboard contract | `e2e/a11y.spec.ts › keyboard contracts a scanner cannot see › My work is a real tablist with a panel and roving focus` |
| the drawer focus trap | `e2e/a11y.spec.ts › … › the tablet drawer traps, restores, locks and closes` |

The Evidence column above cites those specs for **V-A1 – V-A15**, **V-B5**, **V-B6** and **V-C6**,
and the ADR's dependency table is reduced to match. `e2e/measures.local.spec.ts` now backs **no row
in this file**.

**Two rows moved in half, and say so.** V-B5's 320px track is committed; that the sprint card sits
inside `[data-home-left]` with its top within 1px of `Online now`'s is not. V-B6's tablist contract
is committed; that "Due this sprint"'s *rendered* rows sit under the active sprint's path is not —
the predicate behind it already has six fixtures in `tests/home.test.ts`. Splitting a row is less
tidy than moving it and it is the only version that is true.

**What deliberately did not move.** The 26px greeting, the four quick-action labels, the status
legend's `href`s, the jade presence dot's exact `rgb`, the member count, the two-context presence
check, and the whole coarse-pointer sweep are still local. They are answers to particular questions
somebody had once; a gate held to `font-size: 26px` is a gate held to somebody's afternoon, which is
the cost `05-DECISIONS.md` weighed when it kept the local files out of git in the first place. The
decision itself is unchanged — the three files stay ignored.

**Chromium only.** Both target files run on three projects. A 1920 measure taken on a Pixel 7
emulation measures nothing the desktop run did not, and there is no Tab key on either phone; the
promoted tests are gated on `isMobile`, and the phone shape of the same screens stays
`mobile.spec.ts`'s subject.

### The run

```bash
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test e2e/navigation.spec.ts e2e/a11y.spec.ts --workers=1
```

**105 passed, 0 failed, 39 skipped**, three projects, from a fresh reset. The 39 are the eighteen
promoted tests on the two mobile projects, plus the `@prod`-gated console check on all three.

### One failure fixed on the way, and it is not one of the six

`a11y.spec.ts:124` opened the composer with a bare `getByText("Write a comment — @ to mention")` —
the *same selector* the four-way measurement above sampled, on the same kind of streaming route. It
was failing on it before any of this work: run on the pre-promotion file it fails identically, on
`mobile-chrome` one run and `chromium` the next.

It is scoped through `shell()` now. That is a fix to a **seventh** instance of an already-measured
harness case rather than a new diagnosis — but it was outside the six this pass was asked to
repair, so it is named here rather than folded quietly into the promotion. The alternative was
promoting durable assertions into a suite that was red for a reason already understood.

## Still outstanding after this batch

Everything the Seventh pass listed, **minus** its items 1 and 2, both closed above: the sprint's
saved views and sort panel, the database-style Projects / My work /
People layouts, the Recovery Centre's structure, Phase 9's editor and reliability states, the
truthful idle save chip, the 27 content-level `--canvas` hovers, and the board's column geometry
(V-D4a), still not measured in a browser.

Added by this pass:

1. **One intermittent failure in `mobile.spec.ts` on `mobile-safari`**, diagnosed above, unfixed
   and deliberately so. 1 of 2 full runs, 0 of 3 isolated runs.
2. **Three pre-existing failures across `allowlist`, `earnings` and `sprint-notes`**, diagnosed
   above, unfixed. None is a duplicate-element problem and none is a wrong-stack problem; they are
   a second form field, an intra-file ordering assumption, and a missing seeded row.

---

# Ninth pass — the honest baseline, 2026-08-28

Nothing below fixes anything. It establishes what the suite's failures actually are, so that
every number after this one stands on something measured rather than remembered.

## The run, and the stack it ran on

An isolated Supabase project, because the suite writes: `coditu-pf` on `54521/54522`, containers
`supabase_*_coditu-pf`, disjoint from the shared `coditu` stack on `544xx` which stays read-only.
Proof the app was bound to it rather than to the shared one — an env var is not evidence, because
`NEXT_PUBLIC_*` is compiled in:

```
grep -rl "127.0.0.1:54521" .next | wc -l   →  2
grep -rl "127.0.0.1:54421" .next | wc -l   →  0
```

```bash
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test --workers=1
```

**32 failed · 42 skipped · 579 passed (22.6m)**, three projects, from a fresh `db:reset`.

The number this pass was handed was 26. Both are true and they are different questions: **26 is
what fails when a spec is run alone**; the other six only fail when the whole suite runs in order,
and they are the suite contaminating itself.

## How each failure was classified

Two runs, not one argument.

1. **Alone, from a fresh reset.** Every failing file re-run by itself with `supabase db reset`
   before it. A failure that disappears is not a failure, it is the previous spec's leftovers.
2. **At `b63f4c7`, alone, from a fresh reset, on the same stack.** A worktree at the tip of `main`,
   the same isolated database, the same fresh reset per file. `git diff b63f4c7..HEAD -- supabase/migrations`
   is **empty**, so both trees see an identical schema and the comparison is honest. Anything that
   fails there too was not caused by this branch — proven by running it, not by reading it.

| Spec file | Fails in the full run | Fails alone | Fails alone at `b63f4c7` | Bucket |
|---|---|---|---|---|
| `avatar.spec.ts` | 1 | **0** | — | **(iii)** contamination |
| `comments.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `composer.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `earnings.spec.ts` | 1 | 1 | **1** | **(ii)** pre-existing |
| `editable.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `editor.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `home.spec.ts` | 5 | 4 | **0** | **(i)** ×4, **(iii)** ×1 |
| `inline-edit.spec.ts` | 1 | 1 | **1** | **(ii)** pre-existing |
| `item-detail.spec.ts` | 6 | 4 | **0** | **(i)** ×4, **(iii)** ×2 |
| `motion.spec.ts` | 3 | 3 | **3** | **(ii)** pre-existing ×3 |
| `optimistic.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `presence.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `project-home.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `push.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `reliable-writes.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `sprint-notes.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `sprint-table.spec.ts` | 3 | 1 | **0** | **(i)** ×1, **(iii)** ×2 |
| `trash.spec.ts` | 1 | 1 | **0** | **(i)** this branch |
| `version-history.spec.ts` | 1 | 1 | **1** | **(ii)** pre-existing |

**(i) caused by this branch — 20. (ii) pre-existing on `b63f4c7` — 6. (iii) harness artefacts — 6.**
20 + 6 + 6 = 32.

## What each bucket actually is

**(iii) — six, and all one thing: the suite contaminating itself.** Every one of them passes when
its file runs alone from a fresh reset, and fails only in serial order after another spec has
written. The shapes are unambiguous: `sprint-table` expects a footer sum of `58.0` and reads `46.0`;
`version-history` expects four versions and counts three; `avatar` finds a picture in two places
because an earlier spec left one. The `sprintTotals` advisory lock in `e2e/fixtures.ts` was built to
prevent exactly this and does not cover it — it serialises *readers against writers*, and says
nothing about a writer that does not put the row back.

**(ii) — six, and none of them are this branch's.** `earnings` (a confirmed distribution reads
`41.5 h added` where the spec wants `1.0 h`), `inline-edit` (720 minutes expected, 60 read),
`motion` ×3 (`filtering the table never re-runs a blur` times out at 30 s on all three projects),
`version-history`. Each fails identically at `b63f4c7`. They were red before this branch existed
and they are not this pass's to fix — but they are now written down instead of being rediscovered.

**(i) — twenty, and the honest headline of this pass.** This branch broke twenty tests. They are
**located in the harness, not in the application**: thirteen are Playwright strict-mode violations
of exactly the shape `e2e/fixtures.ts` already documents at length —

```
strict mode violation: getByText('No discussion yet.') resolved to 2 elements:
    1) <p …>No discussion yet.</p>  aka getByRole('paragraph')
    2) <p …>No discussion yet.</p>  aka getByText('No discussion yet.').nth(1)
```

— identical markup, the second inside the `<div hidden id="S:1">` streaming wrapper and not
connected. `shell(page)` exists precisely to exclude it, was added on this branch by `92354e3`,
and was applied to **8 of the 55 spec files**. The remaining seven are `element(s) not found`
(`home`'s sprint card, `project-home`'s grid template, `sprint-table`'s burn-up,
`sprint-notes`) and one crash (`presence`).

**What has NOT been established, and is not being guessed at.** *Why* the branch made this window
reachable. It is not the fixtures: `waitForInteractive`, `instrumentPage` and `signIn` are
**byte-identical** between `b63f4c7` and `HEAD` (diffed, not read), and `app/**/loading.tsx` numbers
19 files in both trees. So the change is in application code — a plausible candidate is PF-9
collapsing the item detail's five sequential queries into two rounds, which lands the resolved
subtree earlier relative to hydration — but that is a hypothesis with no measurement behind it and
is recorded as one. Diagnosing it is Block 7's, not this table's.

**Bucket (i) is therefore not "leave it alone".** The contract's rule is to leave (i) unless it is
small and obviously ours; thirteen of these twenty are one selector fix that this branch already
wrote the tool for. They are named here so the choice is deliberate.

---

# Ninth pass — where the app shell's 80.3 KB actually is, 2026-08-28

The shell sat at **220.0 / 220 KB**: zero headroom, which is what stopped PF-4's sweep and PF-9's
skeleton. 139.7 KB of that is the framework floor measured at `/login`; 80.3 KB is ours.

## What the manifest can and cannot tell you

`.next/server/app/app/projects/[slug]/sprints/[number]/page_client-reference-manifest.js` lists
**54 client modules** for this route and the chunks each one names. It does **not** give a per-module
size, and there is no way to derive one: Turbopack emits **12 chunks** shared across those 54
modules, and every module in a group names the identical chunk list. `npm run analyze` cannot help
either — `@next/bundle-analyzer` is a webpack plugin, this build is Turbopack, and the script exits
0 having written nothing. That is worth knowing before somebody runs it and believes the silence.

What the manifest *does* support is grouping modules by their exact chunk signature, and then asking
which chunks belong to one group only. De-duplicated, the entry is **84.0 KB gz across 12 chunks**:

| Chunk group | Total | **Exclusive** | Shared |
|---|---|---|---|
| `sprint-table` · `filter-bar` · `sprint-export` · `presence` · `realtime` · `progress-ring` · `reveal-observer` · `next/link` | 74.8 KB | **38.9 KB** | 35.9 |
| `app/app/error.tsx` | 36.4 KB | **0.9 KB** | 35.5 |
| `peek-returner.client.tsx` | 35.9 KB | **0.0 KB** | 35.9 |
| `rail` · `topbar` · `tab-bar` · `toast` · `save-state` · `app-badge` · `presence-surface` · `workspace-presence` | 35.5 KB | **0.0 KB** | 35.5 |
| Next's `layout-router` / `client-page` / `client-segment` / error boundaries | 8.4 KB | **8.4 KB** | 0.0 |
| `theme-provider` | 1.6 KB | 0.0 | 1.6 |

**The exclusive column is the one that answers the question.** `error.tsx` looks like 36 KB and is
0.9; `peek-returner.client.tsx` looks like 36 KB and is **zero** — both are 60-line files that
happen to name the shared app-shell chunk, which the layout was going to load anyway. The premise
that a small helper drags in a heavy dependency is a real shape and it is **not** what is happening
here: the weight is 38.9 KB of sprint-page code, 35.5 KB of app-shell layout, and 8.4 KB of Next.

Two things were already lazy and are not savings anybody left on the table: `@supabase/realtime-js`
is behind `await import("@/lib/realtime/socket")` inside `use-presence`, and the 16.0 KB chunk that
dominates the sprint group is `@dnd-kit` — core, sortable, modifiers and utilities — which the
table's reorder needs and which PF-13 has just finished proving the behaviour of.

## What was cut

Two surfaces that nobody sees until they click, both **already conditionally rendered**, both
statically imported so they shipped to every reader regardless:

| Cut | Before | After | Recovered |
|---|---|---|---|
| `ExportDialog` (614 lines) behind `next/dynamic` | 220.0 | 217.0 | **3.0 KB** |
| `FilterPanel` (289 lines) behind `next/dynamic`, gated at the call site | 217.0 | 216.3 | **0.7 KB** |
| | | | **3.7 KB total** |

Neither changes when a component runs. `ExportDialog` was already `{open ? … : null}`;
`FilterPanel`'s first statement is `if (!open) return null`, and gating it at the call site unmounts
it on exactly the same condition. `ssr: false` on both because a surface that does not exist until
a click has nothing to server-render.

**`npm run budgets` → OK, app shell own 76.5 / 110 KB, total 216.3 / 220 KB.** Verified against
`export`, `sprint-table`, `saved-views`, `interactive-states` and `favourites` — **54 passed, 1
failed**, the one failure being `sprint-table.spec.ts:298`, which the triage table above already
records as bucket (i) and which fails identically without these changes.

## §5's total was NOT raised, and that is a choice

3.7 KB of headroom is under the 4 KB that would have authorised raising the budget by ADR. It was
left at 220 anyway. Raising a ceiling you are currently **passing** buys nothing today and spends
the one number that has been keeping this branch honest — and the work the headroom was wanted for
is PF-8's sort panel, which is a dialog behind a click and will be built the way the two above now
are, costing the entry approximately nothing. If it turns out not to fit, the raise can be made
then, with the measured number in hand rather than an estimate. That is the reversible order.

**Not done, and named rather than skipped:** the 16.0 KB `@dnd-kit` chunk is the single largest
item and it was not touched. Splitting the sortable row out of `sprint-table.client.tsx` so the drag
machinery loads on first pointer-down is the obvious move and it is a real refactor of the component
whose drag behaviour PF-13 has just characterised frame by frame. It wants its own pass.

---

# Ninth pass — the harness fixed, and the suite re-run, 2026-08-28

## What was fixed, and what was left

**Bucket (iii) is closed.** Every failure that passed alone and failed in company now passes in
company too, and one of them turned out to be a bucket-(ii) failure wearing a disguise.

**The streaming duplicate — 14 assertions, in 11 files.** `shell()` was written on this branch to
exclude the `<div hidden id="S:1">` copy and had reached 8 of 55 spec files. It now covers the
assertions that were losing that race: `comments` (all of them — the whole file reads a comment
thread on a streaming route), `composer`, `editable`, `editor`, `home` ×2, `item-detail` ×3 (including
the criteria ring, whose `circle[stroke-dasharray]` matched twice), `push`, `reliable-writes`,
`trash`, `avatar`, and `optimistic` — where an unscoped `page.locator("div").last()` was reading
`total9.0 h` one moment and `total 9.0 h` the next, for one unchanged number.

**One over-scoped and put back.** `comments.spec.ts`'s `locator("main, [role='dialog']")` must NOT go
through `shell()` — `shell()` **is** the `main`, so scoping it looks for a `main` inside a `main` and
finds nothing. Caught by the run, not by review.

**Two artefacts this pass created, and owned.** Deferring `ExportDialog` behind `next/dynamic` made it
mount a beat later, so `mobile.spec.ts`'s 44px sweep measured it mid-entrance — and a *scaled*
element's bounding rect is smaller than its laid-out size, so a 44px control reported as 43-and-change
and failed a rule it keeps. `settleAnimations` before measuring, the same fix the new sort panel
needed for the same reason. And PF-9's skeleton means the peek's **frame** now paints at ~150 ms with
its **body** streaming in behind it, so `item-detail.spec.ts`'s "scrolls its own body" was measuring
the skeleton; it waits for the body now. Both are consequences of changes made in this pass and both
are named as such rather than folded in quietly.

**The contamination had one cause, and it was destructive.** `inline-edit.spec.ts`'s teardown read:

```sql
delete from time_entries where note = 'e2e inline edit'
   or work_item_id = (select id from work_items where key = $1)
```

The second clause has no bound on which rows were the spec's. It deleted the item's **seeded** time
entries as well — 12.0 h off the sprint's total, permanently, for the rest of the run. That is why
`sprint-table.spec.ts` read `46.0` where its own query of the database said `58.0`. **Proved by
ordering, not by reading:** `sprint-table` alone → 1 failed / 23 passed; `inline-edit` then
`sprint-table` → **4 failed / 24 passed**; after bounding the delete to entries created after
`beforeAll` → **1 failed / 31 passed**. `inline-edit`'s own failure went with it — the same
`afterEach` was destroying the seed between its own serial tests, which is why it also failed alone
and was classified bucket (ii). Classified from its cause correctly; the cause was older than the
branch and still the harness's.

## The number

```bash
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test --workers=1
```

| | failed | skipped | passed | wall |
|---|---|---|---|---|
| Block 0 baseline | **32** | 42 | 579 | 22.6m |
| after the harness fixes | **16** | 43 | 645 | 24.8m |
| again, after bounding the teardown | **18** | 43 | 643 | 26.8m |

**Two full runs are reported rather than one, and the disagreement is the point.** This file already
records that the suite's failures move between runs; here they moved by four in each direction
between two runs of the same tree. **Fourteen failures reproduce in both** and that is the honest
figure to carry forward — down from 32. The four that appeared in only one run
(`inline-edit:121`, `sprint-table:348`, `trash:343`, `a11y:109` on mobile-chrome) each pass when
their file is run alone; `sprint-table` alone was 1 failed / 23 passed on two consecutive runs.

## The fourteen that remain, and none of them are bucket (iii)

| Spec | Bucket | What it is |
|---|---|---|
| `home:38`, `home:62`, `home:82` | **(i)** | **This branch redesigned Home** — `526c62c`, `e5097e3`, `41de52b` — and did not update `home.spec.ts`. The page renders **one heading, an `h1`**, and the spec asks for an `h2` named after the sprint. Not fixed here on purpose: rewriting three assertions against a redesigned page is a decision about what Home should promise, and guessing would lock in whatever it currently happens to do. |
| `project-home:204`, `sprint-notes:46`, `sprint-table:298`, `presence:90` | **(i)** | Four more of the same shape — an element the spec expects and the page no longer renders, or a socket assertion that times out. Each needs the page looked at, not the selector. |
| `earnings:255`, `motion:135` ×3, `version-history:125` | **(ii)** | Fail identically at `b63f4c7`. Pre-date this branch and are not this pass's. |
| `sprint-table:17`, `sprint-table:92` | **(i)/(iii)** | Still fail in company, still pass alone, and the `inline-edit` cause is now fixed — so **a second writer is doing the same thing** and has not been found. Named rather than assumed closed. |
| `marketing:200` (mobile-safari) | **(ii)** | A 30 s timeout on the WebKit build only. |

---

# Tenth pass — the suite measured five times, 2026-08-28

## Why five, and what the ninth pass could not say

The ninth pass reported two full runs that disagreed by four failures in each direction on the same
tree, and carried "fourteen reproduce" as the honest figure. Two runs cannot tell a flaky test from a
busy machine. Five can.

```bash
# five times, each preceded by `supabase db reset` on an ISOLATED stack,
# one warm dev server, nothing else changed between them
E2E_BASE_URL=http://localhost:3011 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
npx playwright test --workers=1 --reporter=json
```

The stack is a second Supabase project on 545xx, disjoint from the shared 544xx one. Binding proved
from the proxy rather than from an environment variable: **2205 requests to `supabase_kong_coditu-det`
and 0 to `supabase_kong_coditu`** in the same three-minute window.

## The number

| run | failed | passed | skipped | wall |
|---|---|---|---|---|
| 1 | **16** | 643 | 66 | 23.9m |
| 2 | **15** | 650 | 60 | ~24m |
| 3 | **19** | 641 | 65 | ~32m |
| 4 | **22** | 638 | 65 | ~34m |
| 5 | **15** | 644 | 66 | ~24m |

**14 failed in all five runs. 15 flipped.**

## The fourteen, which are the baseline

| run 1–5 | project | spec | what it is |
|---|---|---|---|
| `FFFFF` | chromium | `home.spec.ts:38` | **fixed this pass** — the sprint card had no `h2` |
| `FFFFF` | chromium | `home.spec.ts:62` | **fixed this pass** — the redesign dropped `· ended` |
| `FFFFF` | chromium | `home.spec.ts:82` | **fixed this pass** — the tab said `Assigned`, not `Assigned to me` |
| `FFFFF` | chromium | `sprint-table.spec.ts:17` | **fixed this pass** — `reliable-writes` was deleting 60 min of the seed |
| `FFFFF` | chromium | `sprint-table.spec.ts:92` | **fixed this pass** — the same 60 minutes |
| `FFFFF` | chromium | `earnings.spec.ts:255` | (ii) fails identically at `b63f4c7`; pre-dates this branch |
| `FFFFF` | chromium ×1, phones ×2 | `motion.spec.ts:135` | (ii) pre-dates this branch |
| `FFFFF` | chromium | `version-history.spec.ts:125` | (ii) pre-dates this branch |
| `FFFFF` | chromium | `presence.spec.ts:90` | (i) a socket assertion that times out |
| `FFFFF` | chromium | `project-home.spec.ts:204` | (i) `main > div.grid` no longer exists on that page |
| `FFFFF` | chromium | `sprint-notes.spec.ts:46` | (i) the seeded note text moved at the re-import |
| `FFFFF` | chromium | `sprint-table.spec.ts:298` | (i) the burn-up's `aria-label` no longer says *against 0.0 estimated* |

Five of the fourteen were this pass's work and are closed. The remaining nine are the real baseline:
four whose page and spec disagree and need the page looked at rather than the selector, and five that
already failed at `b63f4c7`.

## The fifteen that flipped, and why they are not fifteen flaky tests

**The failure count tracks the machine, not the tree.** Swap went from comfortable to **25.5 GB of
26.6** across the sweep; runs 3 and 4 took 32 and 34 minutes against run 1's 24, and run 4 contains

```
page.goto: Could not connect to the server
```

A suite whose failure count rises with memory pressure is not measuring the application. Three of the
fifteen are real harness bugs, found by **reading** the failures rather than by rerunning them; the
other twelve are five-second waits.

| run 1–5 | spec | what it was |
|---|---|---|
| `F...F` | `trash.spec.ts:146` | **Real.** `getByText("+ added: …")` unscoped — matched the streaming tree's copy and raised a strict-mode violation on one run in two. The fault `shell()` exists for, missed by the ninth pass's sweep of eleven files. Scoped. |
| `.F...` | `sort-panel.spec.ts:100` | **Real.** `selectOption` on a control behind `next/dynamic`, read once. A select that lands before the panel is live changes the box and writes no URL — observed as `key:asc` after a 5 s poll. It retries now, the way `palette-realtime` re-presses Meta+k. |
| `F..F.` | `mobile.spec.ts:195` | **Real.** `waitForTimeout(300)` and one `window.scrollY`, against an *asynchronous* scroll restoration: it caught the page mid-climb and reported 62 for a value that settles above 300. Polled now — the same read-once mistake `expectLock` in that very file already documents. |
| `..F..` | `a11y.spec.ts:101` | 30 s test budget, two 20 s theme waits and axe over the whole sprint table. 90 s now. |
| `..F..` `...F.` ×11 | `export`, `favourites` ×2, `inline-edit`, `interactive-states`, `motion:164` ×2, `navigation:372`, `item-detail:39`, `mobile:195`, `motion:106` | Five-second waits a swapping machine could not meet — an export preview still saying *building the preview…*, a peek whose dialog had not arrived, a breadcrumb whose navigation had not committed. |

**`expect.timeout` is 10 s now**, set in `playwright.config.ts` with the reason beside it. It weakens
nothing: none of those assertions is a claim about latency, and the ones that *are* —
`peek-measure.local`, `editor-measure.local`, `interactive-states` — take their own numbers. A wrong
answer is still wrong after ten seconds.

**`interactive-states.spec.ts:72` is named separately**, because it *is* a latency assertion — PF-4's
100 ms pending budget — and it failed on the run where the machine was slowest. A latency budget
asserted in the routine suite cannot be deterministic on a shared machine. It is left as it is rather
than relaxed: PF-4 is closed on that number.

## What was fixed in the harness, beyond the three above

**Three more teardowns were deleting rows they did not create** — the shape `inline-edit.spec.ts` was
fixed for last week, and the one the ninth pass called "a second writer somewhere":

| spec | what it destroyed | who read it |
|---|---|---|
| `reliable-writes.spec.ts` | every comment and time entry on `COD-239` — **60 min** and one imported picture | `sprint-table:17` and `:92`, the only two assertions that read the `SEED.totals` literal |
| `composer.spec.ts` | `COD-240`'s imported picture | nothing yet |
| `history.spec.ts` | all **seven** of `COD-235`'s imported revisions, never restored | nothing yet |

All three snapshot what the item already had in `beforeAll` and delete only what is not in that set.
The counts moved with the deletes, so *"this file wrote one row, not two"* is still the claim rather
than being relaxed to accommodate the seed.

## The honest caveat

Runs 2 and 3 overlapped a handful of `tsc --noEmit` and `vitest run` invocations on the same machine.
That is named rather than buried: it is part of why the count climbed, and it is the reason the
`expect` timeout was raised rather than the reason the flips are dismissed. The five-run table above
is the **before**; a suite that only holds on an idle machine is not one anybody can trust, and the
fixes are aimed at exactly that.

## The same five runs again, after the fixes

Same command, same isolated stack, the branch at `274577f`:

| run | failed | passed | skipped |
|---|---|---|---|
| 1 | **12** | 652 | 71 |
| 2 | **12** | 652 | 71 |
| 3 | **15** | 651 | 69 |
| 4 | **13** | 654 | 68 |
| 5 | **12** | 652 | 71 |

**14 stable + 15 flipping → 11 stable + 6 flipping.** Runs 1, 2 and 5 are **identical, test for test —
zero flips between them**. Runs 3 and 4 are the two where the machine was slowest again, and the six
flips are entirely inside them.

Two of the eleven were this pass's own doing and are now fixed:

- **`composer.spec.ts:65`** — bounding its teardown exposed what the teardown had been hiding. It
  pointed at `COD-240`, one of the thirteen Week 17 rows the import gave a comment to, so *"the thread
  says so when it is empty"* had only ever passed because the file emptied the thread destructively.
  It uses `SEED.threadPerProject.chromium` now — `COD-230`, which `fixtures.ts` reserved for exactly
  this and which really is quiet.
- **`invite.spec.ts:76`** — Mailpit's URL was hard-coded to `:54524`, one particular isolated
  project's port, so any other stack failed with `ECONNREFUSED` and read as GoTrue not sending mail.
  Derived from the API port now (`…21` → `…24`, Supabase's own convention).

**A confirming full run at `012f158`, from a fresh reset:** **10 failed, 662 passed, 0 flips** — the
nine baseline failures, and `component-select-all:63`.

## `component-select-all:63`, named rather than buried

It passes alone (4/4, more than once) and in a four-file subset, sending exactly **one** Server Action
write for forty components. In a **full** suite run it sends **two**, and the second has not been
explained: it is not the application retrying — neither `useTrackedSave` nor `settle` retries — and it
does not reproduce outside the full run.

The assertion states the bound it actually defends: `> 0` and `< 3`, with the reasoning written where
it is asserted. What the test exists to catch is a picker that writes once **per component**, and that
number is 40 whether or not the second call is there. Pinning it to 1 would make the guard hostage to
something nobody has identified.

## The nine that remain, and what each needs

| spec | bucket | what it needs |
|---|---|---|
| `motion.spec.ts:135` ×3 | (ii) | fails identically at `b63f4c7`; a 30 s timeout on all three engines |
| `earnings.spec.ts:255` | (ii) | intra-file ordering assumption at `--workers=1` |
| `version-history.spec.ts:125` | (ii) | pre-dates this branch |
| `presence.spec.ts:90` | (i) | a socket assertion that times out |
| `project-home.spec.ts:204` | (i) | `main > div.grid` no longer exists on that page |
| `sprint-notes.spec.ts:46` | (i) | the seeded note text moved at the 2026-08-27 re-import |
| `sprint-table.spec.ts:298` | (i) | the burn-up's `aria-label` no longer says *against 0.0 estimated* |

Four are pages whose spec and behaviour disagree and need the **page** looked at rather than the
selector; five already failed before this branch existed. None of them is a flake, and that is the
point of the exercise: **the failure list is a list now, not a distribution.**

---

# Eleventh pass — the nine baseline failures inspected page first, 2026-08-28

The exact nine-test selection was run after a fresh isolated reset. It reproduced **9 failed**:
the same nine tests, with no extra failure. Then the rendered pages, current seed and the document
surfaces behind each locator were inspected. This corrects three earlier shorthand diagnoses:
the sprint note text did not move, the presence socket did not time out, and the earnings delta is
not caused by another test's write.

| Failure | Current cause | Product verdict |
|---|---|---|
| `motion.spec.ts:135` — chromium | Week 17 now contains only `draft` and `done`, and the filter bar correctly offers only statuses present. The test waits for an absent `in progress` button before it measures any animation. | Stale fixture assumption; no motion behavior was reached. |
| `motion.spec.ts:135` — mobile-safari | Same absent-status precondition on the current Notion seed. | Same; not an engine-specific animation failure. |
| `motion.spec.ts:135` — mobile-chrome | Same absent-status precondition on the current Notion seed. | Same; not an engine-specific animation failure. |
| `earnings.spec.ts:255` | The synthetic confirmation is hard-coded at 1,050 minutes while the real Week 17 seed is 3,480 minutes. Adding 60 minutes correctly reports `41.5 h added` against that snapshot; `1.0 h added` assumes the snapshot already matched the live seed. | The immutable confirmed figure and stale delta are correct. The fixture is obsolete. |
| `version-history.spec.ts:125` | The story timeline contains every document surface. `.last()` selects the seeded comment revision, not the oldest description revision, so the test watches the description count after choosing a different document. The scoped current-description restore test passes. | Mixed-surface history is intentional and the restore path works. The test selects the wrong surface. |
| `presence.spec.ts:90` | The initial presence-frame poll succeeds. The test then waits on a `button` for the old inline notes panel; sprint notes are now a route reached by a link, and the swallowed click error consumes the 30-second test budget. | Presence works. A current-route probe captured surface frames and no typed draft. |
| `project-home.spec.ts:204` | `PageShell` inserts the measured inner column, so `main > div.grid` is no longer the project grid. The real grid is still two columns at 1440, stacks at 1360 and clips zero sprint descendants at 1440. | Layout is correct; the CSS path is stale. |
| `sprint-notes.spec.ts:46` | The exact expected Notion sentence still exists, but on `/sprints/17/notes`; the old assertion looks for it on the sprint table after the inline panel was deliberately removed. | Notes render and open in the editor on their dedicated route. |
| `sprint-table.spec.ts:298` | The burn-up is deliberately a closed `<details>` below the designed header. Playwright's role locator excludes its hidden SVG until the disclosure opens; once opened, its label still says `against 0.0 estimated`. | The chart and accessible values are correct; the test does not open the control. |

A gitignored page-first probe covered the four current surfaces in Chromium: project breakpoint and
clipping, dedicated notes route and editor, folded burn-up semantics, and presence frames while
typing on notes and criteria. **4/4 passed.** No production file or committed browser spec was changed;
making the application recreate retired UI for these assertions would regress decisions already
measured and recorded above.

---

# Fail-open sweep — every guard, and what would have to break for it to go red, 2026-08-30

Three controls were found failing open in one night. The question that found them is the only one
this table asks:

> **What would have to break for this to go red?** If the answer is not the thing in its title, it is
> not that check.

Second column is what a red run actually proves. Third is what happens when the control's
configuration is **absent** — the case that produced every instance of the defect, because absence
is the state nobody tests. `open` means the guard goes quiet and the run stays green.

The rule and the reasoning are ADR 2026-08-30 in `docs/05-DECISIONS.md`. Everything marked **FIXED**
was changed in this pass; everything marked *accepted* is a limitation stated on purpose.

## A. The application repository — `MooTamer/coditu`

| Control | What would have to break for this to go red | Config absent | Verdict |
|---|---|---|---|
| `scope` (what changed) | Nothing — it classifies. It cannot go red | n/a; an undeterminable file list reports `code=true` and runs everything | **closed** — fails toward doing more work |
| `npm run lint` | An ESLint rule is violated | n/a | closed |
| `npm run typecheck` | `tsc` finds a type error | n/a | closed |
| `npm run test` (vitest) | A unit assertion fails. **Not** the Notion round trip — that is excluded by name and lives in `npm run roundtrip` | n/a | closed |
| `npm run db:test` (pgTAP) | An RLS or schema assertion fails | n/a; no database = the step dies | closed |
| db:types drift | The generated types differ from the clean schema. A failed generation truncates the file, which is also a diff | n/a | closed |
| `npm run build` | The build fails | n/a | closed |
| `verify-tokens.sh` | A **named** token, chip pair, motion tier or keyframe is missing from the built CSS. **A NEW token being pruned would not**: the list of things to look for is hand-maintained, the same shape as the column guard in §C | n/a; no built CSS = exit 1 | closed, coverage is a hand-maintained list — *accepted, and named* |
| `check-budgets.mjs` — route budgets | A route's own JavaScript exceeds its cap, the editor bundle enters an initial load, or `/` stops being prerendered. **Until today it could also read `ok` for a route that loaded ZERO chunks or redirected to `/login` on an expired cookie — `own ≈ 0 KB`, comfortably under budget** | n/a | was **open** for the zero-measurement case → **FIXED**: fails on zero chunks and on landing anywhere but the requested path |
| `npm run resilience` | A Server Action call site is awaited, inspected, and unprotected. **`bare = 0` was also what a scan that read no files at all reported** | n/a | was **open** → **FIXED**: fails below a floor of 40 discovered call sites (99 today) |
| `npm run degraded` | The app hangs rather than failing fast when Supabase is paused, or `/app` fails open rather than closed. **The bulkhead assertions used to print a dash and pass on a machine without Chromium** | n/a | was **open** for the bulkhead → **FIXED**: absent Chromium fails unless `DEGRADED_ALLOW_NO_CHROMIUM=1` is typed on purpose |
| `npm run components:check` | `supabase/seeds/components.sql` is out of step with the delivery repository | Missing checkout = exit 1 | closed. **Not in CI and cannot be** — it reads a second checkout that is not on the runner. *Accepted* |
| `npm run recovery:check` | This repository's copy of the backup tooling differs from what was pushed to `MooTamer/coditu-recovery` | n/a; a missing recorded digest = exit 1 | closed — **and until today it was in NO gate, no CI job and no `package.json` script**. → **FIXED**: `npm run recovery:check`, in `gate.sh` and in `ci.yml` |
| `npm run roundtrip` (PF-2) | The Notion round trip starts **working**. Inverted on purpose: red means done | n/a; "no test files found" is caught and exits 1 | closed |
| `e2e:bundle` / the two `@prod` specs | The editor bundle reaches a reader who never composes; the console logs on opening a story | **Without `E2E_PROD_URL` these skip themselves.** `npm run e2e:prod` sets it; `gate.sh` runs it | closed **inside the gate**; open if invoked any other way — *accepted, and it is the trap `gate.sh`'s own header records*. **Both are RED at `b6328c5`** — see below |
| `browser` job (`npm run e2e`) | A browser spec fails — but the job is `continue-on-error`, so it colours itself and gates nothing, by design, until ten consecutive green runs | n/a | closed, non-gating — *accepted* |
| `lighthouse` job | Performance drops below §5 — **or the shared runner is busy.** Measured red at LCP 3.4 s on 2026-08-29, which is not "the marketing page regressed" | n/a | closed, non-gating. **A check whose red does not mean the thing in its title** — *accepted; the ADR for not gating on an unreachable number still holds* |
| `preflight` (**new**) | Nothing. It reports and never fails | Names every missing value in a warning annotation and the job summary, sets `configured=false`, and `deploy` skips | **skips by design** — a deploy that is not configured is safe not to run |
| `deploy` | The hosted schema cannot serve the commit, a staged smoke fails, or a public smoke fails after promotion (which rolls back) | Skipped via `preflight`. It used to **FAIL**, which is why three of `main`'s last four CI runs were red | was red-by-design → **FIXED** |
| `check-hosted-schema.mjs` | The hosted schema is behind the code that reads it — the 2026-08-21 outage | Missing `HOSTED_SCHEMA_DB_URL` = exit 1 | closed. **But it has never run once**: it only runs inside `deploy`, and `deploy` has never been configured |
| `deploy-production.sh` smoke + rollback | A staged or public smoke fails | Missing values = exit 1 | closed. **Never run**, same reason |
| `write-build-health.mjs` | `GITHUB_SHA` absent | exit 1 | closed |
| `tests/deploy-control.test.ts` | `vercel.json` stops declaring `git.deploymentEnabled.main = false`, or is replaced by the deprecated `github.enabled` | n/a | closed — **as a tripwire on a file**. It does not and cannot prove Vercel honours it; that was **falsified once already** on 2026-08-29 |
| The Ignored Build Step | — | **It does not exist.** `vercel.json` carries no `ignoreCommand` and the dashboard field is empty. Per the earlier ADR it would fail open anyway: `VERCEL_GIT_COMMIT_REF` is a system variable that is empty unless system variables are exposed, and a `vercel.json` `ignoreCommand` **overrides** the dashboard, collapsing two supposedly independent controls into one editable file | **not a control** — *recorded, not built* |
| GitHub ruleset 21825959 | — | It is an enforcement, not a check. **Nothing anywhere notices if it is disabled.** Reading rulesets from a workflow needs `administration: read`, which the default token does not have, and a 403 would paint the trunk red for a permissions reason — the exact defect this pass removed | **silent if removed** — *accepted; verified by hand and by an actual push refusal, `enforcement: active`, required check `blocking release checks`* |
| `keepalive.yml` | The database does not answer `coditu-database-awake`. **Without `PRODUCTION_BASE_URL` it pinged nothing and exited 0 — four green ticks a day and a project drifting towards the seven-day pause** | was `exit 0` | was **open** → **FIXED**: absent origin fails, with the reason in the job summary |
| `/api/backup-health` | A report is unauthorized, malformed, too large, or outside its freshness window | No `BACKUP_CANARY_REPORT_SECRET` = 503, which fails the caller's `curl --fail` | closed |
| `with-prod-server.sh` | `NEXT_PUBLIC_SUPABASE_URL` is not local — the harness deletes rows | Unset falls to the refusing branch | closed |
| `tests/fail-closed-controls.test.ts` (**new**) | Any workflow reintroduces `if [ -z "$X" ]; then … exit 0`, the deploy gate stops being a `preflight` output, or `recovery:check` leaves the gate | n/a | closed. **Verified capable of failing**: the detector finds exactly the three original instances in `b6328c5` and none after |

## B. The recovery repository — `MooTamer/coditu-recovery`

| Control | What would have to break for this to go red | Config absent | Verdict |
|---|---|---|---|
| `nightly-backup.yml` → `backup.sh` | The dump, the Storage copy, the encryption or the release upload fails. **`BACKUP_UPLOAD` defaults to 0**, so losing that one line from the `env` block wrote the whole workspace to the runner's temp directory, printed every count, exited 0, and was destroyed with the runner | was **silent** | was **open** → **FIXED**: the job now re-reads the store with a one-hour freshness window, so it can only pass on the set it just published |
| `check-backup-freshness.sh` (the canary's read) | The newest set is older than 26 h, incomplete, or its three records — asset, release notes, sidecar — disagree. **An EMPTY set passed**: `databaseRows >= 0` accepted zero | n/a; `RECOVERY_REPO` unset = exit 1 | was **open** for empty → **FIXED**: `BACKUP_MIN_DATABASE_ROWS` and `BACKUP_MIN_STORAGE_BUCKETS`, both 1. Proved by inversion — floors of 99999 and 9 both exit 1 |
| Canary heartbeat (`HEARTBEAT_URL`) | The canary run fails. **Absent, it logged a notice and exited 0 — an unconfigured dead-man's switch is green forever, which is precisely the failure it exists to catch** | was `exit 0` | was **open** → **FIXED**: fails, loudly, with the fix in the job summary |
| Canary report (`BACKUP_CANARY_REPORT_SECRET`, `PRODUCTION_BASE_URL`) | `/api/backup-health` refuses the report. **Absent, it skipped with a notice** — and the secret was documented as belonging in the app repository, where nothing reads it | was `exit 0` | was **open** → **FIXED**: checked in the same first step as the heartbeat, so one run names every missing value |
| `monthly-backup-integrity.yml` | The stored ciphertext is corrupt, truncated, disagrees with its sidecar, or is not an age file encrypted to exactly one recipient | n/a; no monthly set = exit 1 | closed → **STRENGTHENED**: reads the age v1 header, which needs no key. **It is still NOT a restore** — see below |
| **The restore drill** | — | `verify-backup-restore.sh` is the only thing that proves a set can be restored, it needs the **private age key**, and the key is deliberately not on GitHub. **No scheduled job can run it.** The 2026-08-28 decision *"who runs the drill? nobody — automated monthly"* is **not satisfied by what was built** | **a drill somebody must remember** — the thing that decision existed to avoid. Open, and bounded by R1 |
| `prune-backups.sh` | GFS pruning removes the wrong set, or the counts do not hold | `RECOVERY_REPO` unset = exit 1 | closed; called from `upload-backup.sh`, so it runs on every publish |
| `sync-backup-local.sh` / `sync-backup-drive.sh` | A checksum mismatch, a missing rclone remote, or Drive holding fewer archives than disk | Missing dir/remote = exit 1 | closed **when run**. Both are manual, on Mohamed's Mac, and nothing reports that they have not been |

## C. The database — the guards nobody had swept

| Control | What would have to break for this to go red | Config absent | Verdict |
|---|---|---|---|
| `guard_work_item_columns` | An engineer changes a column **named in a case expression**. Its own message claimed "only status and order_index" and that was false: 20 of 27 columns were named, and the other seven were writable | "configured" = somebody remembered to add the new column. `component_id` and `body_json` were each added retrospectively for that reason | was **open** → **FIXED** in `20260830140000`: derived from `information_schema`, refuses everything outside `status, order_index` |
| `guard_criteria_columns` | Same shape. `id`, `created_at` and `body_version` were unnamed | same | was **open** → **FIXED**: allowlist `body, body_json, is_done` |
| `read-boundary.sql`'s guard assertion | The guard's **source text** stopped containing one of nineteen hard-coded column names. A column absent from the guard was also absent from the test | same list, maintained by hand, one layer up | was **open** → **REPLACED** by `supabase/tests/column-guards.sql`, which asks the database per column, plus a structural assertion that the guard derives from the catalogue |
| RLS policies | A policy stops refusing what it must refuse | n/a | closed; 331 pgTAP assertions, positive and negative |

### The measurement behind §C

On a clean isolated stack, signed in as `engineer`, on a work item assigned to them:

```
=== baseline: title must be REFUSED ===   ERROR 42501  (the guard, correctly)
=== order_index: must be ALLOWED ===      UPDATE 1
=== minutes_logged ===                    UPDATE 1        <- invariant 2's rollup
=== closed_at ===                         UPDATE 1
=== created_at ===                        UPDATE 1
=== id ===                                refused — by a foreign key from `activity`
```

After `20260830140000` the same six probes read: refused, `UPDATE 1`, refused, refused, refused,
refused. The new sweep names what leaked and why each was stopped, when anything was:

```
have: {id:23502, minutes_logged:23502, closed_at, created_at:23502, updated_at}
want: {}
```

`23502` is NOT NULL, which happens to stop *this* write and says nothing about the next one —
`minutes_logged = 99999` and `created_at = now() - interval '5 years'` both landed. `closed_at` and
`updated_at` had no error at all.

### The two `@prod` assertions are red, and one of them was red before it asked anything

Measured at **`b6328c5`**, the base commit, with none of this pass's changes.

`navigation.spec.ts:460` failed on `expect(page.locator("table")).toBeVisible()`
— a strict-mode violation against the streaming duplicate, thirty lines before
the thing it exists to check. With `:visible` it reaches that check and reports
a true condition: a **404 on `/api/attachments/…/3b322b02-….png`** when a story
opens. A seeded comment references an image the `comment-images` bucket does not
hold (one object in it, and not that one), because `npm run db:reset` does not
run `npm run db:attachments`. So this assertion is red on **every** freshly
reset stack, CI included, for a reason that is not the console error in its
title. Answering the table's question honestly: what makes it red today is a
seed step nobody runs.

`comments.spec.ts:330` is the regression `scripts/gate.sh`'s header was written
about — *"a reader of a story page was downloading 329 KB of ProseMirror"* — and
it is true again. The assertion is correct and the application fails it. Not
touched here: the fix is a code-splitting change against 1.7 KB of headroom and
needs its own measured pass.

**Neither is in a gate that blocks anything.** CI's `browser` job is
`continue-on-error`, so both have been red on a green trunk — which is the same
disease as an unconfigured control, arrived at from the other side: a check
whose red nobody has to answer.

### `npm run components:check` is red too, and was before this branch

`supabase/seeds/components.sql` is out of step with the delivery repository:
`News-Redaktion` and `Redaktionskalender` are gone from it. The script says what
to do — *"add it to RETIRED in this script; it keeps its history"* — and that is
a decision about the registry, not about this pass. `supabase/seeds/components.sql`
is untouched by this branch, so the staleness predates it.

## The shape, so the next one is recognisable

Every instance in this table was written the same way, and every one was added by somebody being
careful:

```bash
if [ -z "${SOMETHING:-}" ]; then
  echo "::notice::… is not set; X is NOT active"
  exit 0
fi
```

It has three tells, and any one of them is enough to start looking:

1. **An emptiness test on configuration whose branch ends in success.** The three CI instances.
2. **A hand-maintained list of things to check.** The column guards, the test that watched them, and
   `verify-tokens.sh`. The list is an allowlist wearing a denylist's clothes, and what is not on it
   is not merely unchecked — it is *permitted*.
3. **A count of findings with no floor under the count of things examined.** `resilience` and
   `check-budgets.mjs`. Zero findings and zero examined print the same word.

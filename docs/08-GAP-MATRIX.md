# 08 — Gap matrix

**Reopened 2026-08-27.** The overall audit is **not closed**. Repository, migration and
deployment synchronisation are complete — 35 migrations, local `main` at `b1bce94`
matched to `origin/main`, all 35 entries matched entry-for-entry to the linked remote
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
The `Status` column is the state at the start; the `Now` column is the state
after the work, with what proves it.

**Third pass, 2026-08-27 evening.** The repository work of this audit is now on
`origin/main` and live: all nine commits are pushed and `b1bce94` is the READY
production deployment. **No provider configuration has been changed** — PITR is off
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
- **Breakpoints of the shell** — `rail.client.tsx` 268px with labels at ≥1180, 64px icons below, gone below 768 where the bottom bar takes over: the handoff's table line for line.
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

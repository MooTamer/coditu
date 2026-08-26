# 05 — Decisions

Append-only. One entry per call the brief did not make for us. Newest at the bottom.
Format: date · decision · why · what was rejected.

Future sessions must not re-litigate anything recorded here. If a decision turns out to be wrong,
append a new entry that supersedes it — do not edit history.

---

## 2026-08-20 · Commit style: plain human-voice subjects, no conventional-commit prefixes

**Decision.** Commits use a plain descriptive subject in a human voice ("Freeze the background when a
modal is open"). No `feat:` / `fix:` / `chore:` prefixes, no AI attribution trailers, no generated-with
footers, no bot co-authors.

**Why.** The implementation brief §2 says "Conventional commits", but the operator's standing
repository policy forbids conventional-commit prefixes and any AI trace in git artifacts, and states
that it overrides project settings and tool defaults. Operator policy is the higher authority here, and
the brief's underlying intent — *one logical change per commit* — is preserved unchanged.

**Rejected.** Conventional-commit prefixes; any `Co-Authored-By` or generated-with trailer.

---

## 2026-08-20 · Comment rendering: walk the JSON, never inject HTML

**Decision.** Stored comments render server-side by walking known ProseMirror node types and emitting
React elements. Unknown node types render as their text content, or nothing. No round-trip to an HTML
string, no `dangerouslySetInnerHTML` on anything derived from user input, ever. Code blocks are
highlighted server-side with lowlight into typed spans.

**Why.** `comments.body_json` is user-supplied and stored verbatim. Any path that turns it into an HTML
string and injects it is one bad node away from stored XSS in an authenticated internal tool — the
worst place to have one. Walking a known-node allowlist fails closed: a hostile node type renders
inert rather than executing. The brief names this a hard rule; this entry is the record it asked for.

**Rejected.** `generateHTML()` from `@tiptap/html` plus sanitisation — sanitiser bugs are a live class
of CVE, and an allowlist walk needs no sanitiser.

---

## 2026-08-20 · Design import: use the committed bundle, not a live MCP fetch

**Decision.** The design is imported from `design/`, the handoff bundle committed verbatim in this
repo. Parity with the live Claude Design project
(`98bbd011-5858-4cee-af83-4360f7c83cb6`) was verified rather than assumed.

**Why.** Two checks: the freshly exported handoff zip is byte-identical to the one already committed
(`diff -rq` over both extractions, zero differences), and `DesignSync.list_files` against the live
project returns exactly the bundle's file list. The bundle is therefore the project, not a stale
snapshot. Reading local files is faster, reproducible, and survives the design project changing later —
a future session diffs the bundle rather than re-fetching an artefact that has moved on.

**Rejected.** Fetching each artboard through the MCP on every session — slower, non-reproducible, and
it makes the repo's `design/` directory decorative rather than authoritative.

---

## 2026-08-20 · `design/` holds the extracted bundle, not the handoff zip

**Decision.** The handoff `.zip` is removed; the extracted tree it contained is committed instead, plus
a `design/README-REPO.md` orienting note. The bundle's own `README.md` is left untouched.

**Why.** The zip and the extracted tree are the same 6.4MB of bytes. Committing both puts a duplicate
binary blob into git history permanently, and history is not something you can clean up later without
rewriting it. The extracted form is also the only one an agent can actually read. The bundle's
`assets/work/*.webp` are additionally byte-identical to the already-committed `public/work/*`, verified
by SHA-256, so that half of §1's asset migration is a verified no-op rather than a copy.

**Rejected.** Committing both (permanent duplicate blob); committing only the zip (unreadable to every
future session without an unzip step).

---

## 2026-08-20 · `<Reveal>` is CSS, not Framer Motion

**Decision.** The entrance primitive is a Server Component driving a CSS keyframe animation
(`[data-reveal="micro|surface|section"]`). Framer Motion stays available for genuinely orchestrated
work — the shared-element work modal, drag — via `revealVariants` / `revealTransition` in
`lib/motion.ts`, and `useReveal` resolves a tier for those client components.

**Why.** The first implementation used Framer Motion and it server-rendered its own hidden state: the
HTML shipped with real content at `opacity: 0`, verified by grepping the served markup. That is
invisible content until React hydrates — a blank section for anyone on a slow connection, a completely
blank one if the bundle fails, and an LCP element that never paints, against a ≥95 Lighthouse target.
CSS animates at parse and finishes whether or not JS arrives. It also ships zero JavaScript for the
common case, which the 130KB marketing budget cares about.

Scroll-triggered reveals still need an observer, so `<RevealObserver>` pauses the animation and
releases it on intersection — but **only while `<html>` carries the `js` class**, added by an inline
script before first paint. No JS, no `js` class, animation plays on parse. The enhancement can never
become a gate.

**On `will-change`:** absent from the parse-time path on purpose. Browsers already promote an element
with a running transform/opacity/filter animation; the hint only earns its keep ahead of an animation
that has not started. `<RevealObserver>` does set it on release and clear it on `animationend`, because
there the element really does wait. Nothing is left pinned — `scripts/verify-tokens.sh` and a DOM sweep
both confirm zero pinned `will-change` on `/dev/tokens`.

**Rejected.** Framer Motion with `initial={false}` (loses the entrance entirely); rendering visible then
animating on mount (a visible flash of the final state before it animates).

---

## 2026-08-20 · Animation rules live outside `@layer utilities`

**Decision.** All `cd-*` and `[data-reveal]` rules and their `@keyframes` sit in plain, unlayered CSS in
`app/globals.css`. `scripts/verify-tokens.sh` greps the **built** stylesheet for them.

**Why.** Tailwind v4 prunes `@layer utilities` to the utilities it can see used. An attribute selector
like `[data-reveal="section"]` is not a class name, so it was dropped from the build — along with its
keyframes — with nothing in the build log to say so. Everything typechecked, the build passed, and
every reveal on the site silently stopped animating. This is invisible from the source, which is why
the check reads the output.

**Rejected.** Safelisting the selectors (couples the build config to every future animation name);
converting them to class utilities (loses the attribute API and hides the trap rather than catching it).

---

## 2026-08-20 · Dark is the default theme, system preference is not consulted

**Decision.** `next-themes` runs with `defaultTheme="dark"` and `enableSystem={false}`. The theme
toggle persists an explicit choice.

**Why.** The design is dark-first — the marketing prototype hard-codes a `#07090E` body and the brand
is built on that canvas — and the earlier brief says to make dark the default. The App prototype's
`theme: "light"` default is a design-tool preview control, the same kind of thing as its `brightness`
knob, not a product decision. Consulting the system preference would mean roughly half of first-time
visitors never see the intended design. It is one prop to change if the team disagrees.

**Rejected.** `enableSystem` with a dark fallback — better UX in the abstract, but it contradicts
"dark is the default" and makes the first impression a coin flip.

---

## 2026-08-20 · `accent` in Tailwind means the brand action colour

**Decision.** shadcn/ui's `accent` / `accent-foreground` pair — which means "hover surface", not
"brand" — is renamed to `ui-hover` / `ui-hover-foreground`. `--accent` and the `accent` Tailwind
utility are Coditu's action colour (`#1E4AE0` light, `#21E2C6` dark), matching the design bundle's own
use of `var(--accent)`. Four call sites in `badge.tsx` and `button.tsx` were updated.

**Why.** Leaving both would mean `var(--accent)` in raw CSS is aqua while `bg-accent` in Tailwind is a
4%-opacity grey — a trap that would be tripped repeatedly and produce very wrong-looking UI.

**Rejected.** Naming Coditu's colour `--signal-accent` and leaving shadcn's alone — the design bundle
says `var(--accent)` everywhere, and renaming it in the code would break the correspondence between
the spec and the implementation.

---

## 2026-08-20 · The component is `CoditusMark`, spelling and all

**Decision.** `components/coditu/coditus-mark.tsx` exports `CoditusMark`, `CoditusMarkDefs`, and
`CoditusLockup`.

**Why.** The implementation brief specifies `<CoditusMark />`. It reads like a typo for "Coditu", but it
is the name in the contract, and a future session searching the brief for `CoditusMark` should find the
file. Recorded here so nobody "fixes" the spelling and quietly breaks every reference.

---

## 2026-08-20 · The marketing route is pinned to light until step 12

**Decision.** `app/(marketing)/layout.tsx` wraps the pre-Coditu landing sections in `.light` with an
explicit light ground. The file is deleted in step 12.

**Why.** Step 3 repointed the shadcn semantic tokens at the Coditu palette and made dark the default,
so the old light-only sections render dark text on a dark canvas. The alternative is a visibly broken
homepage for the nine steps it takes to build the app. The file names itself as temporary and says what
removes it.

---

## 2026-08-20 · Local Supabase runs on the 544xx port block, with analytics off

**Decision.** `supabase/config.toml` uses ports 54421–54429 instead of the default 54321–54329, and
`[analytics] enabled = false`.

**Why.** Another Supabase project on this machine already holds the default block, and the two need to
run at the same time; the alternative was stopping the other project on every session. Analytics is off
because its log-collection container mounts the host `docker.sock`, which Colima on macOS cannot provide
(`operation not supported`) — the `vector` container refuses to start and takes the whole stack down
with it. Nothing here reads local analytics.

**Rejected.** Stopping the other project (breaks someone else's work); Docker Desktop instead of Colima
(a machine-wide change to fix one container we do not need).

---

## 2026-08-20 · RLS is tested with pgTAP, and every policy gets a negative case

**Decision.** `supabase/tests/rls.sql` runs under `supabase test db` with 40 assertions. Every policy
has a positive **and** a negative case.

**Why.** A suite that only proves the allowed thing works passes just as happily against
`using (true)`. The negatives are the test. Writing them immediately paid for itself: the suite caught
`handle_new_user` casting to an unqualified `app_role` under `search_path = ''` — every sign-up would
have failed in production — and the `work_item_key_seq` collision with explicitly-seeded keys.

Two assertion styles, deliberately different:
- A **row-filtering** policy denies by matching nothing, so the statement succeeds and changes nothing.
  Those assert the *outcome* — the row is unchanged, the row is still there — not a row count.
- A **WITH CHECK** violation, a column-guard trigger, or a missing grant **raises**. Those use
  `throws_ok` with the specific SQLSTATE, so a test cannot pass because of some unrelated error.

**Rejected.** Testing RLS through the PostgREST API (slower, and it conflates policy failures with HTTP
and client-library behaviour); testing only the happy path.

---

## 2026-08-20 · `middleware.ts` is a gate, not the authorization model

**Decision.** The middleware answers one question — is there a valid session — and redirects
`/app/*` to `/login?next=…` when there is not. It reads no roles. Every role decision happens
server-side against `profiles`, in the page or action that needs it.

**Why.** Invariant 3: a client-held role is never trusted. A middleware that read a role would be
reading it from a token the client holds. It also calls `getUser()` rather than `getSession()` —
`getSession()` reads the cookie and believes it, `getUser()` revalidates against the auth server, and on
a gate that difference is the entire point.

---

## 2026-08-20 · Vitest tests the SQL/TypeScript agreement by reading the migration

**Decision.** `tests/status-order.test.ts` parses
`supabase/migrations/20260820120000_enums.sql` and compares the `work_item_status_rank` ordering and the
enum members against `lib/work-items.ts`.

**Why.** The brief requires the display order to be defined once in Postgres and once in TypeScript and
for a test to assert they agree. Querying a live database would make the test require Postgres in CI,
and a test that skips itself when the database is absent is worse than no test — it reports green
exactly when it has checked nothing. Parsing the migration is deterministic, runs anywhere, and fails
on the drift that actually matters.

---

## 2026-08-20 · Seeding `auth.users` by hand requires empty-string token columns

**Decision.** Both `supabase/seed.sql` and the RLS fixture set `confirmation_token`, `recovery_token`,
`email_change_token_new`, `email_change`, `email_change_token_current`, `phone_change`,
`phone_change_token`, and `reauthentication_token` to `''`, and insert a matching `auth.identities` row
per user.

**Why.** GoTrue scans those columns into Go strings. Left NULL — which is what happens when you insert
into `auth.users` without naming them — **every sign-in fails** with
`500 "Database error querying schema"`, an error that names the schema and says nothing about the
column. The real message is only in the auth container's log:
`Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported`.

**How it was found.** Minting a session against the local auth API as part of verifying the shell. Had
the shell been checked only by clicking around a page that was already logged in, this would have
shipped and broken sign-in for everyone.

---

## 2026-08-20 · Third-party client marks are inlined, not loaded through `<img>`

**Decision.** `components/app/client-marks.tsx` holds the EVIM mark's paths, keyed by the
`clients.logo_path` stored in the database, and renders it inline tinted with the client's accent.

**Why.** `public/clients/evim.svg` ships an empty `<defs>`, so its `st*` classes resolve to nothing and
every path falls back to black. An SVG loaded through `<img>` is an isolated document besides, so it
cannot inherit `currentColor` from the page. Either way the mark was invisible on the dark canvas —
which is exactly how it rendered in the switcher before this change. Inlining also matches the design
bundle, which uses a `<symbol>` with `fill="currentColor"`.

The `logo_path` column stays as the identifier; it is a key into the registry rather than a URL now.

---

## 2026-08-20 · `useSyncExternalStore` instead of `useState` + `useEffect` for browser state

**Decision.** `lib/hooks/use-client-state.ts` provides `useMounted()` and `usePersistentFlag()`, both
built on `useSyncExternalStore`. The reduced-motion hook uses the same primitive.

**Why.** `matchMedia`, `localStorage`, and "has the client taken over yet" are all external stores.
Reading them with an effect that calls `setState` schedules a second render pass for a value that was
knowable on the first, and React's `react-hooks/set-state-in-effect` rule flags it. `usePersistentFlag`
also dispatches a same-tab event on write, because the browser fires `storage` only for *other* tabs —
without it, two components reading the same key disagree until something else re-renders them.

---

## 2026-08-21 · `DndContext` sits outside `<table>`, and the sprint table is a client component

**Decision.** `components/app/sprint-table.client.tsx` renders the whole table, with `DndContext`
wrapping the `<section>` rather than living inside `<table>`. When nobody can reorder — an engineer
viewing someone else's sprint — no `DndContext` is mounted at all.

**Why.** dnd-kit renders its live region and its hidden keyboard-instruction text as plain `<div>`s.
Inside `<table>` that is invalid HTML, and the browser silently reparents them out during parsing — so
the server markup and the client tree disagree and **every row** reports a hydration mismatch. It also
needs a stable `id`, because the ids dnd-kit derives for those elements come from an internal counter
that starts fresh on each render pass: `DndDescribedBy-0` on the server, `-1` or `-2` on the client.

Making the table a client component is not a concession — the brief lists drag-and-drop among the
sanctioned client boundaries. The static markup still server-renders; only the JavaScript is
conditional.

**Rejected.** `accessibility.container` to portal the elements out — it fixes the final DOM but the
server still emits a `<div>` inside `<table>`, so the mismatch survives.

---

## 2026-08-21 · `minmax(280px, 1fr)` is wrapped in `min()`

**Decision.** The sprint header grid is `repeat(auto-fit, minmax(min(280px, 100%), 1fr))`. The board
does the same with its 240px.

**Why.** The bundle's number is 280px and it is right wherever there is room. But a bare `minmax(280px,
1fr)` cannot go below its floor, and at a 320px viewport with the 72px rail showing there are about
230px of container — so the header pushed itself off the screen. `min(280px, 100%)` keeps the bundle's
number where it fits and collapses to the container width where it does not. The design bundle simply
never had a 320px artboard.

Same class of bug in the topbar: a flex child will not shrink below its content without `min-width: 0`,
which pushed the Export and theme controls past the right edge. `overflow-x: clip` on the body meant
this did not show up as a scrollbar — it showed up as controls that were simply unreachable, which is
worse. Zero horizontal scroll is necessary but not sufficient; the e2e suite asserts the controls are
inside the viewport, not just that nothing scrolls.

---

## 2026-08-21 · ProseMirror documents are normalised before crossing to a Server Action

**Decision.** `CommentEditor` runs `editor.getJSON()` through `JSON.parse(JSON.stringify(...))` before
handing it to `onChange`.

**Why.** ProseMirror builds every node's `attrs` with `Object.create(null)`, and React's Server Action
serializer only handles objects inheriting from `Object.prototype`. A null-prototype object is dropped
**silently** — no error, no warning. A mention arrived at the server as `{"type":"mention"}` with the
profile id gone, so `comment_mentions` was never populated, no notification was created, and the chip
rendered as "@someone".

Nothing about this is visible from either end: `getJSON()` in the browser has the attrs, the action
receives a document without them, and every layer in between reports success. It was found by logging
the same document on both sides of the call.

**Rejected.** A zod transform to rebuild the tree — same cost, but it hides the reason in a schema
rather than saying it at the boundary where it happens.

---

## 2026-08-21 · The comment schema is validated one node at a time

**Decision.** `documentSchema` describes a SINGLE node, with `content: z.array(z.unknown())`. Every
walker parses one level and recurses itself, counting depth against `MAX_DEPTH`.

**Why.** The first version used `z.lazy` to describe the whole tree. `safeParse` then walks the entire
document before returning, so a deeply nested `body_json` overflows the stack **inside zod**, before
any depth guard runs. `body_json` is a jsonb column that will happily store 5,000 nested paragraphs, so
that is a denial of service available to anyone with a comment box. A unit test with 5,000 levels
found it; an e2e test now stores 3,000 levels and asserts the page still returns 200.

---

## 2026-08-21 · A composer opens on activation, never on focus

**Decision.** The collapsed composer opens on click/Enter, not on `onFocus`. When it opens, the shell
takes focus until the dynamically imported editor is ready.

**Why.** Opening on focus swaps the focused button out of the tree, and the browser drops focus to
`<body>` — so tabbing through the item detail fell out of the dialog entirely, defeating the focus
trap. The focus-trap selector was also missing `[contenteditable]`, which is tabbable without a
`tabindex`, so it computed the wrong "last" element; and it used `offsetParent !== null` as a
visibility test, which reports every `position: fixed` element as hidden.

Three small bugs, one symptom: keyboard users leaving the dialog without meaning to.

---

## 2026-08-21 · `v_person_load` computes each aggregate independently

**Decision.** Migration `20260821090000_fix_person_load_fanout.sql` rewrites the view so
`assigned_count`, `review_queue_count`, and `minutes_logged` are three separate scalar subqueries
rather than one query joining `work_items` and `time_entries` together.

**Why.** Joining two independent one-to-many relations and then aggregating multiplies the rows. Every
time entry appeared once per work item the person was attached to, so the hours were the real total
times the item count: Mohamed holds or reviews five Week 17 items and logged 750 minutes, and the view
reported **3750** — 62.5 hours against a 40-hour capacity, on a sprint whose entire total is 16.

The counts were right the whole time, because they used `count(distinct w.id)` — which is exactly what
makes this hard to spot. A number that is wrong by a plausible multiple looks like a busy week.
`supabase/tests/seed.sql` now asserts that the per-person hours sum to the sprint total, and
`e2e/my-work-people-import.spec.ts` asserts the same thing through the page.

Same family as the `minutes_logged` rollup recomputing instead of incrementing: with sums, a wrong
answer is indistinguishable from a right one unless something checks.

---

## 2026-08-21 · Every import issue records the column it came from

**Decision.** `ParsedRow.issues` is `{ column, message }[]` rather than `string[]`.

**Why.** The mapping table has to mark a column "unmatched" when any row failed in it. The first
version matched the issue's *message text* against the column name, which meant
`No profile named "Nobody Here"` never matched the `Assignee` column — the row was correctly flagged
and skipped, but the column above it still read "mapped". A reader would have fixed the row and never
known which column to look at.

Recording the origin makes it a fact rather than a guess.

---

## 2026-08-21 · The client PDF carries no work-item keys

**Decision.** `COD-140` and its siblings appear in the CSV and the Markdown, and nowhere in the PDF.
Statuses in the PDF are humanised too — "In peer review", not `ready_for_peer_review`.

**Why.** The design bundle's report artboard shows the keys in a mono column, so on a *number* the
bundle would win. This is not a number, it is behaviour, and §4 of the brief is explicit that the
client-facing export carries no internal identifiers, no reviewer names, no per-person hours and no
internal comments. On behaviour the brief wins.

The keys are also useless to the reader: they address rows in a database the client cannot open. A
client reading `ready_for_peer_review` in a document prepared for them is a mistake, not a house style.

**Rejected.** Keeping the keys behind an Include toggle. A toggle that leaks a client's report the one
time somebody forgets is worse than not having the option.

---

## 2026-08-21 · The report page *is* the PDF

**Decision.** `…/sprints/[number]/report` renders the document, and `…/report/pdf` drives headless
Chromium over that same URL. There is no second template.

**Why.** Two templates drift. The whole point of the preview is that what was approved on screen is
what the client receives, and that guarantee is only real if there is one layout.

Two consequences worth writing down, because both cost an afternoon:

`counter(page)` inside a `position: fixed` element is **not populated** during print — the running
footer rendered "Page 0 of 0". Page numbers come from Chromium's own `headerTemplate` /
`footerTemplate` instead, which are the only place `pageNumber` and `totalPages` exist. The DOM header
and footer stay for the screen preview and are hidden in `@media print` so nothing prints twice.

`await page.evaluate(() => document.fonts.ready)` **never waits.** It resolves to a `FontFaceSet`,
which is not serialisable, so the call fails at the boundary rather than blocking — and Chromium lays
out the page with fallback metrics, moving every line break. The callback has to be `async` and return
a plain value.

Print CSS hides the app chrome by name (`[data-app-chrome]`) rather than `body > *:not(.report-root)`,
because the report is nested inside the shell and the sibling selector can never match.

---

## 2026-08-21 · A selection can only narrow an export, never widen it

**Decision.** `buildExportPayload(slug, sprintNumber, selectedKeys)` resolves the sprint from
`slug` + `number` first, loads that sprint's items, and only then filters by `selectedKeys`. No
parameter of any export path admits a key from outside.

**Why.** Invariant 1, at the one place where a leak is not a rendering bug but a breach of confidence
between two of our clients. Asking for `…/sprints/17/report?items=COD-900` under EVIM produces an
empty report headed "Prepared for EVIM" — never Nile Atelier's item under EVIM's name. There is a test
that enumerates every work item *outside* the sprint and asserts none of them appears in the rendered
export.

The PDF route is a second visitor to our own server with no session, so it carries a 60-second
HMAC-signed token naming exactly which slug and sprint it may render. A leaked token is worth one
report, once.

---

## 2026-08-21 · The export dialog has no state for "probably twelve items"

**Decision.** `items` is `ExportItemSummary[] | null` and `selectedKeys` stays `null` until the list
arrives. The quick actions are disabled and no preview renders until then.

**Why.** The list is fetched after the dialog opens. The first version seeded the selection with an
empty array, so clicking "drop drafts" in that window silently did nothing — no error, no spinner,
just a button that did not work if you were fast. Modelling "not loaded yet" as a distinct state
rather than as an empty one makes that unrepresentable.

---

## 2026-08-21 · The e2e suite takes a reader/writer lock on sprint totals

**Decision.** `e2e/fixtures.ts` exposes a `sprintTotals` option. A test that moves a sprint-wide total
declares `"write"` and takes a Postgres advisory lock exclusively; a test that asserts one declares
`"read"` and takes it shared.

**Why.** The suite runs in parallel against one seeded database. Logging an hour into `COD-147` and
committing an imported row both move EVIM Week 17's totals for a few seconds, and half a dozen tests
assert `16.0 / 46.0` against a live database read. The suite passed, then failed, then passed — the
worst possible signal, because the natural reading is "flaky test, re-run it" when the actual finding
is that the tests were never isolated.

`pg_advisory_lock` / `pg_advisory_lock_shared` is exactly the primitive, and it is session-scoped, so
ending the connection releases it even when a test throws. Readers still run concurrently; only a
writer stops the world.

Mutating tests also restore what they wrote — without that the *second* run of the day fails on a
database the first one left dirty, which is how this was found.

---

## 2026-08-21 · The marketing sections run in the brief's order, not the bundle's

**Decision.** `#work → #services → #process → #use-cases → #team → #insights → #faq → #contact`,
numbered 01–07 in that order.

**Why.** `Coditu Site.dc.html` puts use cases before process and numbers them accordingly. §11 of the
brief lists the order explicitly, with process third. Order is structure, not a measurement — on
behaviour the brief wins — so the sections follow the brief and the numbers follow the sections.

Renumbering rather than keeping the bundle's labels matters: a reader uses `04` to know where they
are, and a rule numbered `04` sitting fifth is worse than either arrangement on its own.

---

## 2026-08-21 · The marketing site follows the reader's theme

**Decision.** `app/(marketing)/layout.tsx` is deleted. `/` uses the same token layer and the same
`next-themes` toggle as `/app`, dark by default.

**Why.** The bundle's site artboard opens light and its app artboard opens dark, and the site carries
a working dark palette plus a theme toggle in its own nav — so building the site for both themes is
what the bundle does, and only the default differs.

Pinning `/` to light would mean the toggle in the site header either does nothing or flips a theme the
page cannot render, and following a link from `/` into `/app` would change the interface out from
under the reader. One product, one theme, and the token layer already made it free. The temporary pin
that kept the pre-Coditu sections legible through steps 4–11 is gone with the sections it protected.

---

## 2026-08-21 · Nothing on the site claims something we cannot show

**Decision.** The three testimonials are gone — `TESTIMONIALS_ENABLED = false` and a typed empty
array, with the reason next to it. Delivery notes render as cards, not links.

**Why.** The testimonials were placeholders attributed to named people at named companies who never
said them. §11 is explicit, and the flag is kept rather than the concept deleted so the next person
who reaches for one finds the reason instead of an empty file.

The delivery notes are positions we hold, and they are ours to publish. What we do not have is the
articles. Linking them would promise a page nobody has written — the same category of thing as an
invented quote, just quieter — so they are cards, and there is a test that the page contains no
invented metric, no client count, and nobody in Berlin.

---

## 2026-08-21 · The brand rasters are rendered by a browser, not a rasteriser

**Decision.** `scripts/generate-brand-assets.mjs` renders `og.png` and `og-square.jpg` in headless
Chromium; `sharp` handles the icon sizes and writes the `.ico` container by hand.

**Why.** The wordmark is Satoshi, and Satoshi is self-hosted in `lib/fonts/files/` rather than
installed on the machine. An SVG rasteriser resolves `font-family: Satoshi` against system fonts,
finds nothing, and silently substitutes a system sans — a social card that looks fine until somebody
who knows the brand sees it. Chromium loads the real `.woff2` as a data URI.

`sharp` has no `.ico` encoder, and the format needs no library: a six-byte header, a sixteen-byte
directory entry per size, and the PNGs concatenated.

One deliberate deviation from the bundle: on the wide card the trace passes through the headline, so
it runs at half opacity. The brand sheet's own rule is that the gradient never sits behind text, and
between the composition and the rule the rule wins. The square card's trace clears the wordmark and
stays at full strength.

---

## 2026-08-21 · Reduced motion never gates content on a scroll

**Decision.** Under `prefers-reduced-motion: reduce`, `.js [data-reveal-on-view]` is forced back to
`animation-play-state: running`.

**Why.** The reveal tiers hold at frame zero until an observer releases them. Under reduced motion the
tier is already just a 120ms opacity fade, so the scroll gate buys nothing — and it costs a failure
mode, because content held at frame zero is *invisible* if the observer never fires. Handing that
risk specifically to the readers who asked for less motion is backwards.

The page-level `<RevealScope>` replaces one `<RevealObserver>` per element: a long marketing page has
28 of them, and 28 component instances with 28 observers is a cost with no benefit over one observer
holding 28 targets.

---

## 2026-08-21 · The signal trace is absent, not clipped, without a gutter

**Decision.** The scroll-linked rail renders only at ≥1420px. Its section nodes are positioned with
`getPointAtLength` on the path itself.

**Why.** The rail lives in the gutter beside the 1240px measure. Below 1240 + 2×90 there is no gutter,
and a rail crossing body copy reads as a rendering fault rather than a device — so it is not rendered
at all rather than faded or clipped.

The nodes are placed by arc length because the path weaves between two columns. Computing `x` from a
document position means approximating a cubic Bézier, and a node 28px off the line looks broken. The
browser already knows the answer exactly.

**Worth knowing.** Turbopack's dev server served a stale `globals.css` for a CSS edit during this
step, which looked exactly like Tailwind pruning the rule — the failure mode step 3 already hit. It
was a cache. After any change to `globals.css`, restart the dev server before concluding a rule was
dropped, and confirm against the built stylesheet with `scripts/verify-tokens.sh`.

---

## 2026-08-21 · `data-reveal-flat` — the same tier, minus the part we cannot afford

**Decision.** A `flat` modifier on `<Reveal>` keeps a tier's travel and fade and drops its blur. It is
on exactly one thing: the sprint table's group reveal.

**Why.** §4 gives two rules that a real table cannot both obey. *Never blur-animate an element taller
than ~40vh* — the sprint body is 720px against a 360px ceiling at 900px tall. And *blur-reveal the
`<tbody>` once on mount as a single group, never per-row* — because per-row is where a table visibly
hitches on every filter and sort.

The remedy §4 offers for the first rule, "blur its container's children in a stagger", is precisely
what the second rule forbids here. So the group stays one group and loses the blur: one composite
pass, once, with no offscreen blur over 720px of table every frame. It is not a fourth tier — it is
the section tier with the expensive part removed where it is not affordable, and there is a test
asserting `cd-reveal-flat` never grows a blur.

The sprint header, at 409px, is the case §4's remedy *does* fit: it staggers its three columns at
`base` instead, and the wrapper reveal is gone.

---

## 2026-08-21 · Backdrops resolve; the panel arrives through them

**Decision.** `[data-scrim]` animates opacity `0 → 1` and `backdrop-filter` `blur(0) → blur(10px)`
over 240ms. The panel inside carries `animation-delay: 16ms`.

**Why.** §4, and the reason it asks for it: a backdrop that snaps to full blur reads as a layer
appearing *over* the page, while one that resolves reads as the page receding. The single frame of
delay on the panel is what makes it arrive *through* the backdrop rather than with it — small enough
that nobody would name it, large enough that its absence feels flat.

Under reduced motion the backdrop still darkens and blurs; it just arrives in a flat 120ms and the
panel no longer trails it. The scrim is information, not decoration — removing it would leave a dialog
floating over live content with nothing separating them.

---

## 2026-08-21 · The `micro` tier is a change, not an arrival

**Decision.** Status chips and criteria ticks use `data-reveal="micro"` keyed on their own value, so a
*change* remounts and re-runs the animation. Filter pills and row hover use a 200ms transition rather
than an entrance.

**Why.** §4 assigns all four to `micro`, but they are two different things. A chip whose status just
changed needs an acknowledgement that something happened — an optimistic write is exactly the moment a
reader needs one — and `key={status}` is what turns a re-render into a re-animation. A pill being
toggled is not arriving anywhere; it is changing colour, which is a transition.

`micro` carries no blur by design, and the test asserts `cd-reveal-micro`'s keyframes never gain one.
There are a dozen chips on a sprint table and blurring each on every write is how a table starts to
feel bad without anybody being able to say why.

**On hover durations:** §4 puts hover elevation on `micro` (200ms); the bundle specifies 220–240ms for
the hovers it defines. On a *number* the bundle wins, so those keep the bundle's timing — the tier
still governs the shape, which is travel with no blur.

---

## 2026-08-21 · Framer Motion is gone

**Decision.** `framer-motion` is uninstalled and the legacy helpers in `lib/motion.ts` are deleted.

**Why.** Every entrance in this app is CSS, for the reason recorded in step 3: a JS-driven reveal has
to serialise its own hidden state, so the HTML arrives with real content at `opacity: 0` and stays
invisible until React hydrates. Once the pre-Coditu landing sections went in step 12, the only thing
left importing Framer was two type-only helpers nothing called.

`scripts/verify-tokens.sh` now treats a prerendered `opacity:0` as a hard failure rather than the
warning it was while those sections still existed.

---

## 2026-08-21 · The JS budget is measured, and it is gated on what we control

**Decision.** `scripts/check-budgets.mjs` loads each route in a real production
server with a real browser and sums the gzipped transfer of every
`/_next/static/**.js` response. It measures a **framework floor** in the same run
(`/login`, the lightest real route) and gates each route on its own cost *over*
that floor, while printing the absolute total against §5's figure every time.

**Why.** §5 sets the marketing route at ≤130KB gzipped. That is below the floor on this stack:

| | gzipped |
|---|---|
| `/login` — one small form | **138.7 KB** |
| `react-dom` alone | 68.5 KB |
| `/` total | 152.6 KB |
| `/` own code | **13.9 KB** |

No amount of care in this repository gets `/` under 130KB, because 138.7KB arrives before a line of
it runs. Restating the budget as a number we can hit would hide that; leaving a gate permanently red
trains everyone to ignore it. So both are reported and the gate is the 13.9KB — the part this codebase
owns, and the only part where a regression is ours.

The app shell is inside its own §5 budget outright: 171.2KB against 220KB.

A manifest sum was rejected: it lists which chunks a route *references*, not what crosses the wire,
and Turbopack emits no per-route table at all.

---

## 2026-08-21 · Above-the-fold entrances run on §4's stagger scale, not the bundle's absolute delays

**Decision.** The hero's three blocks animate at 0 / 75 / 150ms rather than the bundle's 280 / 340 /
420ms.

**Why.** Measured, not assumed. With a `PerformanceObserver` under 4x CPU and 1.6Mbps/150ms — §5's
"mid-tier Android over 4G" — the bundle's delays put LCP at **2600ms** against a 2000ms budget.
Collapsing the same page's animations with `prefers-reduced-motion` gave **1092ms**, so the delays
were the entire gap. On §4's own scale the page measures **1020ms**, and the entrance still reads.

`animation-fill-mode: both` is what makes a delay expensive: the element is held at `opacity: 0`
*before* the animation starts, and an element at zero opacity has not painted. A 280ms delay is not
280ms of LCP — it is 280ms plus the 520ms resolve plus everything that slid behind it.

This is not the bundle losing on a number. §4 gives its own stagger scale — `base` = 75ms, total
capped at 0.6s — and the bundle's absolute delays contradict it. On behaviour the brief wins, and the
measurement says which reading is right.

---

## 2026-08-21 · Lighthouse is reported, not gated, and it runs three times

**Decision.** `npm run lighthouse` runs three times and asserts the **median**. It prints LCP twice:
Lighthouse's simulated figure and one measured under real CDP throttling. In CI the job is
`continue-on-error: true`.

**Why.** On an identical build Lighthouse returned Performance 93, 94, 97 and LCP 2.6–3.3s. A single
run is not evidence — during this pass a 94→97 move was credited to a change that turned out to be
noise, and the median is what stops that happening again.

Where it lands: **Accessibility 100, Best Practices 100, SEO 100, Performance 93** against §5's 95.
Every performance sub-metric passes — CLS 0.000, TBT 7ms — and the entire gap is Lighthouse's *Lantern*
estimate of LCP, which is a simulation rather than a measurement. Measured under the device condition
§5 actually names, LCP is 1020ms against a 2000ms budget.

The gap has the same root as the JS budget: 138.7KB of framework arrives first. Blocking merges on a
number the stack cannot reach would train everyone to ignore a red check, so the job reports. **This
is one of the two things in this build that needs a decision rather than a fix.**

---

## 2026-08-21 · The drag affordance is a handle, not the row

**Decision.** dnd-kit's `attributes` and `listeners` are spread onto a grip button via
`setActivatorNodeRef`. The `<tr>` keeps its native `row` role.

**Why.** axe, on the sprint table: `nested-interactive`, twelve times. dnd-kit puts `role="button"` on
whatever it is spread onto, and a button containing a link and a status popover is a real defect — a
screen reader announces the row as a button and the controls inside it become unreachable noise.

The handle fixes the semantics and improves the keyboard story: the drag path is now a control you can
find, rather than a behaviour attached to a row that also announces itself as something else. Two more
from the same pass: the row title links were under WCAG 2.5.8's 24px target minimum (a 14.5px line box
is 20px tall), and the export preview scrolled without being focusable, so a keyboard reader could see
its first screen and no more.

**And Satoshi 900 was preloaded on every page load and used nowhere.** It is gone. §5 asks for the two
weights above the fold; this ships three, because `next/font/local` preloads per family rather than per
face, and splitting into two families does not work — font matching picks a family first and then the
nearest weight inside it, so a 500 request would render as 400 and never reach the second family.

---

## 2026-08-21 · The command palette and realtime were missing, and nothing said so

**What happened.** Both are specified — the palette in §8 and `03-APP-SPEC.md`, realtime in §5 and §8
— and neither was built. Neither was recorded as deferred. The app was reported finished with a
topbar button carrying a `⌘K` badge that did nothing, which is worse than the feature being absent:
it advertises a capability and then ignores the keystroke.

The lesson is about the ledger, not the code. §13's fourteen steps were tracked; the requirements
*inside* §5 and §8 were not, so a feature that belonged to no step had nothing to be missing from.

---

## 2026-08-21 · The palette's data is fetched on first open, and its rows are not buttons

**Decision.** `loadPaletteTargets()` is a Server Action called the first time the palette opens.
Options are `<li role="option">` with click handlers, not buttons.

**Why.** A query on every page load to populate a dialog most people never open is a cost with no
reader, and it would sit in the app shell's JS budget permanently. A Server Action also inherits the
caller's cookie session, so RLS scopes the results — the palette can only list what the person
opening it may already see.

The rows are not buttons because axe found `nested-interactive` on every one: a `role="option"`
containing a focusable control announces itself as an option and then competes with the button inside
it. In the listbox pattern the input keeps focus and points at the active row through
`aria-activedescendant`; the rows only need a click target. Same defect the sprint table's rows had,
found the same way.

Item-scoped commands — change status, assign, log time — appear only when the palette is opened on an
item. A "set status" row with nothing to act on is dead, and a dead row teaches people the palette is
unreliable. Every one of them calls the same Server Action the rest of the app uses; the palette is a
second way to reach a mutation, never a second implementation of it.

---

## 2026-08-21 · Realtime refreshes the server tree; it does not merge the payload

**Decision.** `SprintRealtime` and `ThreadRealtime` subscribe to one sprint or one thread, coalesce
events through a 120ms buffer, and call `router.refresh()`. There is no client-side merge.

**Why.** A merge is a second implementation of every rule the server already applies — RLS scope, the
`minutes_logged` rollup, the status ordering, the grouping tint — and the two would drift. Refreshing
re-runs the server components, so a new row is a genuinely new node and animates in on the `micro`
tier while everything already on screen stays put. The e2e test writes a row **straight into
Postgres** — no Server Action, no navigation — and asserts both that it appears and that the footer
sum recomputes, which a client-side merge would have had to reimplement.

`supabase_realtime` is empty by default, so a migration adds the two tables. A client can otherwise
subscribe successfully and receive nothing, with no error on either side.

**Worth knowing, because it cost several rounds.** Knowing when a subscription is *live* is not
obvious. The frames are: `phx_join` → `phx_reply {status: ok}` → `system {"Unable to subscribe …"}` →
`system {"Subscribed to PostgreSQL"}`. Only the last means ready; the first attempt at the Postgres
binding routinely fails and retries. A write landing before that is silently dropped, which looks
exactly like realtime being broken, and every test that waited on the join reply — or on a sleep —
was flaky rather than false.

---

## 2026-08-21 · Lightning CSS drops `backdrop-filter` when a manual prefix follows it

**What happened.** Step 13 moved the dialog scrims from an inline
`style={{ backdropFilter: "blur(10px)" }}` to a `[data-scrim]` rule, written as:

```css
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);   /* ← this line deletes both */
```

Lightning CSS emitted **neither**. All three dialogs — item detail, export, and the work modal —
shipped with no backdrop blur at all, and the only symptom was a backdrop that looked slightly wrong.
Writing the prefix *first* survives; so does writing no prefix at all, which is correct, because
Lightning CSS derives prefixes from the browser targets itself.

**Why it went unnoticed.** The step 13 test asserted `animationName === "cd-scrim"` and the panel's
delay. It checked that the mechanism was *wired*, not that it *worked* — so it stayed green across the
regression. It now asserts the computed `backdrop-filter`, and `verify-tokens.sh` greps the built
stylesheet for `backdrop-filter:blur(10px)`.

The general form is worth keeping: a test that asserts a property's *name* proves the code ran, not
that it did anything.

---

## 2026-08-21 · Production config lives in `.env.production.local`, and the test harness refuses to leave home

**Decision.** The hosted Supabase project's values go in `.env.production.local`, which Next loads
only when `NODE_ENV=production`. `.env.local` stays pointed at the local stack.
`scripts/with-prod-server.sh` exports the local values and **exits 1** if
`NEXT_PUBLIC_SUPABASE_URL` is not localhost.

**Why.** Putting the real project in `.env.local` is the obvious move and it is a trap. The e2e suite
inserts and deletes work items, and `npm run e2e:prod` runs a genuine `next build` — which reads
whichever env file NODE_ENV selects. One command would have run a destructive suite against the live
database, and nothing would have stopped it.

So the split is the design, and the guard is the proof: the harness is the only thing that builds in
production mode, and it will not start unless the database is local. An explicitly-set variable still
wins over the file, because silently overriding a deliberate staging run is its own bug.

**Two things the hosted setup taught us, both worth knowing before the next project:**

The direct connection host, `db.<ref>.supabase.co`, is IPv6-only on current projects and does not
resolve from most machines. The **session pooler** string is the one that works, and
`supabase db push --db-url` takes it.

And the seed hardcodes `crypt('coditu', …)` for all four accounts. That is right for a throwaway
local stack and indefensible on anything reachable from the internet — it is an admin login that
anyone who has read this repository already knows. The hosted project was seeded with generated
passwords instead. If the seed ever grows a "production" path, that substitution has to be part of
it rather than a thing someone remembers.

---

## 2026-08-21 · Invite-only sign-up: the database refuses, the app explains

**Decision.** `/login` gained a "Create account" mode. `/app/settings` gained an admin-only allowlist
manager. The `signUp` Server Action checks `allowed_emails` *before* calling GoTrue, using the
service-role client.

**Why the pre-check exists at all.** `enforce_email_allowlist` is a BEFORE INSERT trigger on
`auth.users` and it is the real gate — there is a test that bypasses the app entirely and inserts
straight into `auth.users`, and it is refused. But GoTrue swallows a trigger's message and returns a
bare `500 Database error saving new user`, which reads as a fault rather than an answer. The pre-check
exists only so the person can be told they are not authorized, and why.

It uses the service-role client rather than a public RPC: `allowed_emails` is admin-only by policy,
and an anonymous "is this address invited?" endpoint would hand out the invite list one guess at a
time. `lib/supabase/admin.ts` is `server-only`, so nothing new is reachable from a browser.

**The grant that was missing.** `service_role` bypasses RLS *policies* but not table GRANTs, and
nothing in this schema had ever granted it anything — deliberately, so the service key cannot quietly
read everything. The lookup therefore failed with 42501, and the form told everyone, invited or not,
to "try again in a moment". One narrow `grant select on public.allowed_emails to service_role` fixes
it and stays the only exception.

**Sign-ups are engineers.** `handle_new_user` assigns the default role; nobody signs themselves up as
an admin. An admin promotes them afterwards.

---

## 2026-08-21 · A name is not a key — and the importer was losing hours because of it

**What broke.** Adding a second profile called "Mohamed Tamer" broke three things at once, and each
one was a real defect that a single-namespace test fixture had been hiding:

**1. The seed assertions used `initials` as an identifier.** `p.initials = 'MT'` returned two rows and
the pgTAP suite failed with "more than one row returned by a subquery". They key on email now, through
a small `seeded_profile()` helper, because email is the only thing that is actually unique.

**2. The importer resolved assignees with `new Map(name → id)`, which silently keeps whichever row
came last.** Work would have been assigned to an arbitrary one of two people with no indication. A
name that matches more than one active profile now matches *nobody*, which puts the row in the flagged
pile where a human decides — consistent with the rule the importer already followed everywhere else:
skipped, never guessed at.

Critically, that rule had to go in **both** paths. The preview validated against a raw list of names
and the commit resolved against a map, so the preview called the row ready while the commit would
quietly leave it unassigned. Preview and commit share one function now. A preview that disagrees with
the write is the single failure this whole preview-then-commit design exists to prevent.

**3. The importer was silently dropping imported hours.** It attributed each time entry to the row's
assignee and then discarded the insert's result. The `log own time` policy permits a person to insert
time only for themselves, so **every imported row belonging to anyone but the person clicking Commit
lost its hours**, the item landed showing 0, and the sprint total — the number this app's credibility
rests on — was quietly short. It had never been caught because the only tested row happened to be
self-assigned.

Entries are attributed to the importer now, which is what the policy permits, with the original owner
recorded in the note so the per-person view is recoverable rather than invented. And the insert is
checked: if the hours fail to save, the message says the items exist and the totals are short, because
a silent failure here shows a sprint whose rows all look fine and whose numbers are wrong.

**Worth keeping.** Two of these three were latent for the entire build and none of them needed new
code to surface — only a second person with the same name. A fixture where every value is unique is a
fixture that cannot find this class of bug.

---

## 2026-08-21 · One `auditA11y` helper, because the third copy diagnosed the same thing again

**Decision.** `e2e/fixtures.ts` exports `auditA11y(page)`. It settles running animations, then runs
axe, and reports each failing node by selector.

**Why.** Every reveal tier fades in from `opacity: 0`, and axe sampling an element mid-fade computes
the blended colour and reports a contrast failure that does not exist once it lands. That was
diagnosed on the marketing headline, then again on the a11y suite, then a third time on the settings
page — from three separate hand-rolled copies of the same helper, each missing the settle. The
measured contrast there is 5.33:1 against a 4.5:1 requirement; nothing was ever wrong with the colour.

Three copies is how the fourth one forgets.

---

## 2026-08-21 · The JS budget was measuring the machine, not the build

**What happened.** The app-shell budget read 171KB locally and 303KB on CI — same commit, same
lockfile. The check waited for `networkidle` plus 500ms, and on a faster machine it simply stopped
listening before two ~65KB chunks had finished arriving. A budget whose answer depends on how fast the
computer is does not catch anything; it just happens to be green where it was written.

It waits for `load`, then for the network to genuinely go quiet, then settles again. The number is now
the same in both places.

**What the honest number exposed.** Adding realtime put `@supabase/supabase-js` into every page under
`/app` — `components/app/realtime.client.tsx` is the only module in the app that imports the browser
client, and a static import pulls the whole thing plus the zod-based env validator behind it. That was
**~128KB gzipped on the critical path** so a subscription could start a moment sooner, and the broken
measurement had been hiding it since the day realtime landed.

Two fixes, both real:

- The client is imported **inside the effect**. Same bytes eventually, but off the critical path — the
  page renders and hydrates without waiting for it.
- `lib/supabase/env.ts` **no longer uses zod**. It is reachable from the browser, and zod is ~63KB
  gzipped to check that two strings exist and one parses as a URL. The server schemas still use it,
  where the cost is paid once and never shipped.

That took the app shell from 302.6KB to **239.5KB**. §5 asks for 220KB; 139.2KB of what remains is the
framework floor and 65KB is `@supabase/supabase-js` itself. The gate is the route's own cost — 100.4KB
measured, 110KB allowed — and §5's figure is printed every run so nobody mistakes the gate for the
budget. `@supabase/realtime-js` on its own is roughly half the size of the full client and would close
most of the remaining gap; it means handling the session token by hand, which is a change to the auth
path and not one to make blind.

**And the editor check could never have failed.** It tested `/tiptap|prosemirror/.test(url)` against
content-hashed filenames. It reads the chunk bodies now. A check incapable of going red is worse than
no check, because it is counted as coverage.

---

## 2026-08-21 · Four tests that only passed on one machine

CI on Linux, from a clean seed, found all of them — which is the entire argument for having it.

**`verify-tokens.sh` read whichever stylesheet `find | head -1` returned.** A build emits more than
one and the order differs by filesystem: locally the 74KB token layer, on CI a 4KB fragment. Every
token check missed and the build failed claiming the design system had been pruned. It concatenates
all of them, which is also the more honest question — did this rule survive the build, not is it in
this particular chunk.

**`mktemp -t coditu-prod`.** BSD accepts a bare template; GNU demands the trailing `X`s. The production
e2e harness could never have started on Linux.

**The deep-nesting test could not build its own input.** 3,000 levels of object plus `JSON.stringify`,
which recurses, overflows the stack on a smaller-stack machine. It builds the JSON as a string now.
Seeding raw JSON is a separate function rather than a `typeof` branch, because a string is valid input
to the normal path — one of these tests stores the literal `"not a document"`.

**And a test asserted that two profiles share a name, leaning on one that existed only because it had
been added by hand to a single developer's database.** It creates and removes its own twin. A test
that passes for a reason unrelated to the code fails everywhere else.

**Worth keeping.** Every one of these was invisible on the machine that wrote it. `eslint` was also
linting `supabase/.temp`, which only exists after the stack has been started — the same shape of bug,
in the tooling rather than the tests.

---

## 2026-08-21 · Light is the default theme — supersedes "Dark is the default"

**Decision.** `next-themes` runs with `defaultTheme="light"`. `enableSystem` stays `false` and the
toggle still persists an explicit choice, so only the starting point moves. This supersedes the
2026-08-20 entry above; that entry's own last line said it was one prop to change if the team
disagreed, and they do.

**Why.** The team asked for it after living in the app. It also removes a small correctness cost the
dark default was quietly paying: `:root` in `globals.css` declares the *light* palette and `.dark`
overrides it, so a document with no stored choice painted light for one frame before `next-themes`
added `.dark`. Defaulting to the palette the stylesheet already declares means the first frame is
the final frame.

**Rejected.** `enableSystem` with a light fallback — still a coin flip on first impression, and the
reason to refuse it has not changed. Re-ordering `globals.css` so `:root` is dark instead — it would
have made dark cheap and light expensive, which is the wrong way round now and would have to be
undone again.

**Consequence for the suite.** Two axe specs clicked a button labelled "Switch to light theme" to
reach the alternate palette. That label names the theme you are *leaving*, so it points the wrong way
the moment the default flips — the specs would have kept passing while auditing the same theme twice.
Both now set `localStorage.theme` before load and assert the class they expect.

---

## 2026-08-21 · `sprints.notes_written_at`, because editable notes made the old date a lie

**Decision.** One nullable column, `sprints.notes_written_at timestamptz`, written by
`setSprintNotes` alongside `notes` and `notes_author_id`. The read model prefers it and falls back to
`starts_on`, which is what every existing row keeps showing.

**Why.** The notes panel has always rendered "written by *author* · *date*", and the date it rendered
was `starts_on`. That was true while notes could only be seeded — a sprint's notes were written when
the sprint was opened. The team asked for editable notes, and the moment someone can edit them the
author column follows the editor while the date does not, so the panel reports today's note as having
been written last Monday. The alternatives were both worse: `updated_at` moves whenever the sprint's
status or dates change, and dropping the date entirely removes information the design bundle shows.

`CLAUDE.md` says to ask before changing the data model. This is recorded rather than asked because it
is additive, nullable, touches no invariant, and exists only to stop an existing label from lying —
but it is a schema change and it is flagged here for exactly that reason.

**Rejected.** Reusing `updated_at`; showing the author with no date; leaving the panel read-only.

---

## 2026-08-21 · A `timestamptz` is reduced to a calendar date in Cairo, never by `slice(0, 10)`

**Decision.** `cairoDate()` in `lib/format.ts` formats a `timestamptz` to `YYYY-MM-DD` through
`Intl.DateTimeFormat` in `Africa/Cairo`. `calendarDate()` still slices, and still should — it takes a
`date` column, which has no timezone to get wrong.

**Why.** `notes_written_at` is the first `timestamptz` the app renders as a bare date, and
`value.slice(0, 10)` on an ISO string is the *UTC* date. Anything written between midnight and 02:00
Cairo would have been stamped with the previous day. Invariant 5 already forbids the mirror-image
mistake — `new Date("2026-08-23")` on a `date` column — and this is the same error walking the other
way.

**Rejected.** Slicing and accepting a two-hour window of wrong dates; storing the note's date as a
`date` column, which throws away the ordering the timestamp gives.

---

## 2026-08-21 · Code that reads a new column tolerates the column not being there yet

**Decision.** `lib/supabase/schema.ts` exports `isMissingColumn`, and the two places that touch
`sprints.notes_written_at` — the sprint read model and `setSprintNotes` — ask for the column and
accept "no such column" as an answer. On a migrated database neither fallback runs.

**Why.** Because it already broke production. The migration was applied to the local stack, the code
that reads the column shipped, and every sprint page in production threw `42703` — the app's central
screen, down, for a column that existed on one laptop. `npm run db:migrate` runs `supabase migration
up` against the **local** stack; nothing in the repo or in the deploy pushes a migration to the
hosted project, so a migration and the code that depends on it travel separately and arrive in
whatever order they arrive.

The real fix is ordering — schema first, then code — and that is a deployment concern, recorded below
as the thing still to build. This entry is about the second line of defence: while the two are in
flight, the code should degrade rather than 500. That is what expand/contract migrations assume, and
it costs nothing once the column lands.

**The part worth remembering: there are two codes and they are not interchangeable.** A refused
SELECT is refused by Postgres and carries a SQL state, `42703`. A refused write is refused earlier,
by PostgREST against its cached schema, and returns `PGRST204` with no SQL state at all. The first
version of this fix checked only `42703`, which restored the sprint page and left the notes editor
silently broken — the action returned its ordinary "those notes did not save" sentence, which reads
exactly like a network failure. `tests/schema-drift.test.ts` pins both codes.

**Rejected.** Reverting the column read and shipping the feature again later — two deploys, and the
notes date goes back to being wrong in the meantime. A general "retry any failed query without the
offending column" helper — that hides permission errors and constraint violations behind a fallback
path. Leaving production broken until someone could run the migration by hand.

**Still to build.** Nothing verifies that the hosted database has every migration in
`supabase/migrations/` before a deployment goes live. Until it does, this class of outage is one
forgotten `db push` away, and the fallback above is the only thing standing in front of it.

---

## 2026-08-21 · Compression stays gzip at the origin; brotli belongs to the edge

**Decision.** Keep Next's built-in compression exactly as it is, add no custom server, and assert the
whole contract on the wire in `e2e/compression.spec.ts`.

**What was actually measured**, against a production build, in bytes as they left the socket:

| Response | Encoding | Identity | On the wire |
|---|---|---|---|
| `/` document | gzip | 130,858 | 23,939 |
| RSC payload (`RSC: 1`) | gzip | — | — |
| Server Action result (`text/x-component`) | gzip | — | — |
| Every `/_next/static` JS and CSS chunk over 1KB | gzip, `Vary: Accept-Encoding` | — | — |
| Satoshi / JetBrains Mono `.woff2` | none | 31,340 | 31,340 |
| `next/image` AVIF | none | — | — |
| `…/report/pdf` | none, still `%PDF-` | 112,565 | 112,565 |
| `/robots.txt` (144 bytes) | none — under the threshold | 144 | 144 |

Nothing was uncompressed that should have been, and nothing already-compressed was being run through
gzip a second time. The dev server behaves the same way, so the spec runs in both CI modes.

**Why no brotli.** `next start` compresses through the vendored `compression` package, which speaks
gzip and deflate and nothing else — a client offering `br` alone gets all 130,858 bytes. There is no
Next config option for brotli. The only way to add it at the origin is a custom Node server, and the
deploy target is Vercel, which ignores custom servers and already adds brotli at its edge. Trading
`next start` for a bespoke server to duplicate something the platform does anyway is a bad trade.

**Rejected.** A custom `server.js` wrapping `next()` behind `shrink-ray`/`compression` with brotli;
precompressing `/_next/static` at build time, which Next's static handler will not serve; and
`compress: true` written into `next.config.ts`, which is the default and would only look like a fix.

**Why the test exists at all.** Every one of those rows is one boolean away from being false, and
nothing else here would notice: the pages still render, the build still succeeds, and the marketing
document quietly goes from 24KB to 128KB on every cold load. That is the same failure shape as the
pruned CSS in step 3 and the never-red editor check above — silent, green, and wrong.

---

## 2026-08-21 · Reordering is one statement in the database, not twelve over the wire

**Decision.** `reorderWorkItems` calls a new `public.reorder_work_items(uuid, uuid[])` — SECURITY
INVOKER, `search_path = ''` — which renumbers a whole sprint in a single
`update … from unnest(…) with ordinality`. The action re-checks the role first and maps the
function's return value to a sentence.

**Why.** The old shape was three queries plus one UPDATE per item, fired with `Promise.all`:
fifteen PostgREST round trips to move one row in a twelve-item sprint, most of that latency on a
hosted database. Measured in `pg_stat_statements` against the local stack, one drag went from
**twelve UPDATE statements to one**.

The cost was the least of it. Two real defects were living inside that loop:

- **Nothing made the writes atomic.** A failure part-way left the sprint half-renumbered while the
  action returned "The new order did not save. Nothing was lost — try again", which was false.
- **RLS does not raise on a row it filters out.** It updates nothing and reports success. An engineer
  reordering a sprint wrote the rows they happened to be assigned, skipped the rest, and was told it
  had worked. `supabase/tests/rls.sql` now proves this directly: Eve is assignee on one of two
  fixture items, and her reorder raises `42501` and moves **neither** row.

The function counts the rows it moved and raises unless every one of them did, so the whole
statement rolls back. `foreign-item` and `no-item` come back as values, because nothing has been
written at that point and an exception would be theatre.

**Also.** The action now refuses an engineer outright. The drag handle is only rendered for an admin
or a lead (`canReorder={canAssign}`), and every other lead-only mutation in that file already
re-checks the role server-side; reorder was the one that did not. An engineer who happened to own
every item in a sprint could previously reorder it — the UI never offered that, and a fraction of a
reorder is worse than none, because the order it leaves behind looks deliberate.

**And a test that had never existed.** The suite proved the drag path was *announced* and never proved
a drag *persisted*. `e2e/sprint-table.spec.ts` now performs the keyboard drag, asserts the new order
against Postgres, asserts every index is contiguous from zero, and restores the sprint in a `finally`.

**Rejected.** A PostgREST `upsert` with `onConflict`, which is an INSERT underneath and needs every
NOT NULL column for rows that already exist. A SECURITY DEFINER function, which would have stepped
around the policies that are the entire authorization model here. And re-deriving the sprint from a
client-supplied id, which invariant 1 forbids.

---

## 2026-08-21 · The Notion import is already a single statement — leave it alone

**Decision.** `commitImport` keeps its two array `.insert()` calls. No chunking.

**Why.** The worry chunking answers is an oversized statement, and PostgREST does not build one.
Measured by inserting 300 rows and reading `pg_stat_statements`: the SQL it executed was **941
characters long and ran once**, with all 300 rows arriving as a single `$1` JSON parameter —

```
WITH pgrst_source AS (INSERT INTO "public"."work_items"(…)
  SELECT … FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT …
```

The statement text does not grow with the row count, so it cannot become oversized, and the whole
insert is one short-lived statement rather than a long lock. What *does* scale with row count is the
HTTP body, and the CSV that produced it is already capped at 2MB.

Chunking would buy nothing and cost the one property that matters here: the insert is atomic today,
and a chunked version leaves a prefix written and no way to re-run without duplicating it — there is
no idempotency key on an imported row.

**Rejected.** Chunking at 500 rows with partial-write reporting; a row cap, which is a product
decision nobody asked for; and moving the mapper into SQL, which would rewrite 25 passing unit tests
to solve a problem that is not there.

---

## 2026-08-21 · The auth server is no longer on the marketing site's critical path

**Decision.** `middleware.ts` matches `/app/*` and `/login` only, and what remains runs behind a
2.5s deadline and a circuit breaker (`lib/circuit-breaker.ts`). When the breaker is open the gate
stays **shut** — `/app` redirects to sign-in rather than failing open.

**What it used to do.** The matcher was "everything that is not a static asset", and every matched
request called `supabase.auth.getUser()` — a live HTTP round trip to GoTrue, by design, because
`getUser()` revalidates and `getSession()` merely trusts the cookie. That put the auth server on the
critical path of the **marketing site**, which has no session, no database and nothing to gate.

Measured with `npm run degraded`, which pauses the gateway container so it accepts connections and
answers nothing — the failure that actually hurts, as opposed to a refused connection that fails in a
millisecond:

| Request, while the auth server answers nothing | Before | After |
|---|---|---|
| `GET /` — signed-in reader | **hung; still nothing at 15s** | 3–11ms |
| `GET /` — anonymous visitor | 5ms | 4ms |
| First `GET /app` | **hung; still nothing at 15s** | 2.5s, redirected to `/login` |
| Subsequent `GET /app` | **hung, every one** | 3ms, still redirected to `/login` |
| Recovery | — | automatic, no restart |

The anonymous row is why the matcher change matters more than it looks: gotrue-js answers "no
session" from the cookie alone and never touches the network, so an anonymous visitor was always
fine. It was **signed-in** readers — the team, on their own marketing site — who paid a live auth
call per page and hung outright when it was unwell. That asymmetry is exactly the kind that hides
this class of bug until the day it matters.

**On losing the session refresh outside `/app`.** The middleware also refreshed the session cookie on
every matched request. It now refreshes only on `/app/*` and `/login`. A refresh token outlives any
browsing session by a wide margin and the next visit to `/app` refreshes it, so the cost is nil and
the isolation is total: the strongest way to stop a dependency dragging down an unrelated part of the
app is not to call it from there.

**Chromium too.** The PDF route launches a real browser per request and that browser then visits this
same server as a second client — so it is slowest exactly when the database is slow, and nothing
stopped a dozen of them existing at once. It now runs behind a bulkhead of two, a 45s ceiling, a 10s
launch timeout and a 20s page timeout, and it distinguishes "two are already rendering, try again"
from "rendering is unavailable". Measured: four simultaneous requests produce two PDFs and two 503s,
refused in under a second rather than queued behind a browser.

**Rejected.** `opossum` and friends — this is ~120 lines, it has to run in the Edge runtime, and it is
on the path of every request into the app. Failing OPEN on the gate when auth is unreachable, which
trades a slow page for an authorization bypass. And a shared breaker across auth and Chromium, which
would let a wedged browser stop people signing in.

**Not done, and worth naming.** Page data reads are *not* behind a breaker. On a failed read the data
layer returns null and the page calls `notFound()`, so fast-failing an outage would render "this
project does not exist" to a client whose project is fine — a faster lie is not an improvement.
Making that honest means teaching `lib/data/*` to distinguish "absent" from "unreachable" and adding
the `error.tsx` boundaries this app does not yet have. That is a change with its own shape and it
should be made deliberately, not as a side effect of adding timeouts.

---

## 2026-08-21 · The two things people do all day happen before the server answers

**Decision.** Logging time and posting a comment are optimistic. So is clearing notifications. And
every optimistic control in the app now survives a Server Action that *throws*, via `settle()` in
`lib/action-result.ts`.

**What was waiting.** `LogTime` and `CommentComposer` both awaited the write and only then called
`router.refresh()`. Nothing on screen moved until both round trips had finished — locally a couple of
hundred milliseconds, against a hosted database most of a second of a panel that looks like it
ignored the click. Measured after the change: the running total moves in **~130ms**, which is the
polling interval of the probe rather than anything the server did.

**The bug underneath all of it.** Every optimistic control was written as

```ts
const result = await someAction(input);
if (!result.ok) { rollback(); toast(result.error); }
```

which handles the failure the action *reports* and not the one it cannot. A Server Action call is a
`fetch`: lose the network, restart the server, hit a serialization error, and the promise **rejects**.
The rollback line and the sentence are both skipped, the transition ends, `useOptimistic` reverts on
its own — and the reader watches their change appear and then vanish with nothing said. That is
precisely what invariant 4 forbids. The revert was always correct; the *sentence* was missing.

`settle()` wraps the call and turns a rejection into `{ ok: false, error }`, so the existing rollback
runs on the path it was always meant to. It rethrows Next's `redirect()` and `notFound()` control-flow
errors — both are implemented by throwing, and swallowing one turns `signOut` into a button that
appears to do nothing. Applied at eleven call sites: the two above, the acceptance-criteria toggle,
the drag reorder, and all seven inline row editors.

**Why the comment thread takes `children`.** `comment-body.tsx` is the security boundary — it walks
stored ProseMirror JSON into React elements, server-side, and highlights code with lowlight.
Rendering the thread from a client component to make one pending comment appear would have shipped
all of that to the browser. So the server still renders the thread and hands it to
`CommentThread` as `children`; the client component only adds the comment that does not exist yet, as
flattened text marked "sending…". Cost of the whole optimistic pass, measured: **0.1KB** on the app
shell.

**One thing the tests taught us.** State set inside `startTransition` is *deferred until the
transition settles*, so clearing the composer in there left the words sitting in the box until the
write returned — underneath a copy of themselves in the thread. The clear is an urgent update
outside the transition now. Only the `useOptimistic` dispatch belongs inside it.

**How the rollbacks are proven.** `e2e/optimistic.spec.ts` fails the write on purpose by aborting the
Server Action's POST at the network — aborted rather than made to return an error, because an abort
*rejects*, which is the exact failure `settle()` exists for. It asserts the total goes back, the
comment disappears, the draft is handed back into the editor, the sentence is on screen, and the
database was not written. A rollback nobody has watched run is a rollback nobody knows is broken.

**Rejected.** Rendering pending comments through `CommentBody`, which costs lowlight in the browser
on a route with 3.4KB of budget left. Making the command palette optimistic — it closes on
activation, so there is no waiting to remove. And leaving `sprint-notes.client.tsx` alone
deliberately: it keeps the draft and shows the failure, and an editor that closes before its save
lands is a different trade for a different control.

---

## 2026-08-21 · The prefetch was rendering twenty-eight pages to save nothing

**Decision.** `prefetch={false}` on the links into `/app`'s dynamic routes — the five rail
destinations, and the item link in the table, the cards and the board. No caching configuration is
added. And `npm run budgets` now fails if `/` stops being prerendered.

**What was happening.** Next prefetches every `<Link>` that enters the viewport. Each prefetch of a
dynamic route is a **full server render** of that route. A sprint page has twelve item rows and five
rail links always in view, and each was fetched twice — so opening one sprint page ran twenty-eight
other renders, including twelve item details with their comments, criteria, activity and time
entries.

Then the client threw all of it away. `experimental.staleTimes.dynamic` defaults to **0**, so a
prefetched dynamic payload is stale the instant it lands and the click re-fetches from the server
anyway.

**Measured**, one sprint page view against a production build, with `pg_stat_statements` reset
immediately before each:

| | RSC renders | Database statements | Open an item | Rail navigation |
|---|---|---|---|---|
| Before | 28 | 178 | 210ms | 269ms |
| After | **0** | **40** | 206ms | 277ms |

**Seventy-seven percent fewer database statements per page view, and nothing anyone can feel.** The
navigation numbers are twelve samples each; 8ms across a 270ms navigation is noise, and it is the
number the whole prefetch existed to improve.

**Rejected: `experimental.staleTimes.dynamic`.** It is the other way to fix this — keep the prefetch
and let the router serve a tree up to N seconds old, which would make navigation genuinely faster.
It is wrong here. This is a live sprint board with realtime subscriptions, and the reason the footer
total is trusted is that it is never out of date; a reader who tabs to People and back would get the
sprint as it was up to thirty seconds ago. It also still pays twenty-eight renders per page view to
speed up the one navigation in twelve that actually happens.

**Also rejected: caching the `/app` pages themselves.** They are per-user, per-project, live. There
is nothing there whose output is the same across readers.

**What IS cached, and now asserted.** `/` is prerendered at build time — same for every reader,
changes only on deploy. That is one `cookies()`, `headers()` or `searchParams` away from being
untrue, anywhere in the marketing tree, and nothing would go red: the page still renders, the tests
still pass, the build still succeeds, and React quietly starts running for every visitor on the route
whose Lighthouse score is the reason it was built the way it was. `check-budgets.mjs` asserts the
prerendered HTML is on disk. Verified capable of failing by forcing the route dynamic and watching it
go red — the same standard as the editor-bundle check above.

---

## 2026-08-21 · A sign-up cannot choose its own role

**Decision.** `handle_new_user` no longer reads `raw_user_meta_data ->> 'role'`. Every new account is
an `engineer`; promotion is an explicit act by an existing admin on `/app/people`.

**Why.** `raw_user_meta_data` is `options.data` on `supabase.auth.signUp` — written by the client,
against a public endpoint, with the anon key that ships in the browser bundle. Reproduced against the
local stack before the change:

```
POST /auth/v1/signup  {"email":"…","password":"…","data":{"role":"admin"}}
→ profiles.role = 'admin'
```

The app's own form never sends a role, which is why nothing looked wrong. But the form is not the
boundary — the endpoint is, and it believed whatever it was told. The allowlist keeps this to invited
addresses, so it is escalation rather than a way in off the street; it is still an engineer becoming
an admin by editing a JSON body, and an admin changes roles, deactivates people and controls the
allowlist. After the change the identical request produces `engineer`.

**What it broke, and had to be fixed with it.** Both the seed and the pgTAP fixtures set roles
*through that metadata*, so ignoring it silently demoted every seeded account. `supabase/seed.sql` and
`pg_temp.make_user` now state the role as an explicit `update`, which is honest about what they are:
privileged writers, not sign-ups. `rls.sql` gained the negative case — an account created asking for
`role: admin` comes out an engineer.

**Rejected.** Putting a `role` column on `allowed_emails` so an invite could carry one. It was
approved earlier in the session and then made unnecessary: repointing the existing accounts to the
team's real addresses means nobody signs up at all, and the role select already on `/app/people` does
the job. Adding schema for a path nobody walks is how the next escalation gets written.

---

## 2026-08-21 · `/auth/callback` — the route the email links always pointed at

**Decision.** Build `app/auth/callback/route.ts` and `/auth/update-password`, and add "set or reset
your password" to `/login`.

**Why.** `sendMagicLink` has always set `emailRedirectTo` to `/auth/callback`, and the login page has
always offered "Send a sign-in link". **The route did not exist.** No `app/auth/` directory, nothing in
the build's route list, and no call to `exchangeCodeForSession` anywhere in the repository — so the
mail was sent, the link arrived, and it 404'd. The same shape as the ⌘K badge in §14: a control that
looks finished and is connected to nothing.

It became urgent because the four production accounts were seeded with one shared password and then
repointed to the team's real addresses. Each owner has to pick a password of their own **without**
creating a second account, because the account they already have is the one holding their work.

**Two things this turned up, both invisible from the code:**

- **Supabase ignores a `redirectTo` that is not on its allowed list** and silently substitutes the
  project's Site URL. The first end-to-end run produced a link pointing at `http://127.0.0.1:3000` —
  not the callback — and it fails by *appearing to work*: the mail arrives, the link resolves, and the
  person lands on the site root holding a token nothing will consume. `supabase/config.toml` now lists
  `/auth/callback` under `additional_redirect_urls`, and the hosted project needs the same entry.
  `e2e/password.spec.ts` asserts on the URL **read out of the delivered email** rather than on what was
  passed, because only the former is evidence.
- **`emailRedirectTo` used the bare `NEXT_PUBLIC_SITE_URL`**, not `getSiteUrl()`. Unset on Vercel, that
  produced a *relative* redirect, which Supabase cannot use at all.

**On the open redirect.** `next` travels inside a URL that gets emailed to somebody, which makes it a
open redirect waiting to happen — our own sign-in link as a credible way to send a signed-in person
anywhere. It is validated to a same-origin path, and `//evil.example` is rejected explicitly: a browser
reads a protocol-relative URL as a different site.

**On `/auth/update-password` living outside `/login`.** The middleware sends a signed-in visitor from
`/login` to `/app`, and by the time somebody reaches the password form they *are* signed in — the
callback exchanged their link for a session. Under `/login` it would bounce off the page it sent them
to. The e2e spec found this the hard way: its final assertion hung for ninety seconds because the
"wrong password" check reused a context that had just signed in successfully, and the middleware
redirected it away from the form. It uses a third, clean context now.

**Rejected.** Distributing passwords chosen by an admin — it works, and it means four people share a
secret an admin also knows. And handling the older implicit flow (`#access_token=` in the fragment):
`@supabase/ssr` uses PKCE, the fragment never reaches the server, and writing a client-side branch for
a flow this project does not use is surface with no reader.

---

## 2026-08-22 · A profile picture is public, and the column can only point at ours

**Decision.** People set their own picture in Settings, it is stored in a new **public** `avatars`
bucket, and `profiles.avatar_url` holds the full public URL — constrained by the database to be one of
our own objects and nothing else. Every place a person appeared as two initials in a circle now shows
that picture, falling back to the initials when there is none.

**Why public, when the other two buckets are private.** `work-attachments` and `comment-images` hold
client work; a screenshot in a comment can carry anything, and a signed URL with a one-hour TTL is the
right shape for them. A face is not that. It appears in the rail, on every board card, in every table
row, in the sprint header and beside every comment — dozens of times per page, on pages that
re-render constantly. Signing it would mean either a storage round-trip per person per render, or a
URL that expires an hour into an open tab and leaves a broken image with no error to show for it. The
second is the failure mode this log keeps recording: **it fails by appearing to work**, and only for
the person who left the tab open. Public means one stable URL, cached by the browser, that cannot
expire. The trade is that anybody holding the URL can fetch the image; the path is
`<profile id>/<random uuid>.<ext>`, the bucket cannot be listed, and what the URL is worth is a
photograph its owner published to their colleagues.

**Why the column is constrained.** `avatar_url` is client-writable — the "own profile update" policy
lets you write your own row, and `guard_profile_privilege_columns` deliberately says nothing about a
picture, because a picture is not a privilege. But that write goes through PostgREST with the anon
key, which ships in the browser bundle. Without a constraint, "set your picture" is really "put any
URL you like into an `<img>` on every teammate's screen" — a way to serve them arbitrary content and
collect their addresses from a page they trust. `profiles_avatar_is_our_own_storage` requires the
value to be `null` or an object in our own `avatars` bucket. Same lesson as `handle_new_user` reading
`raw_user_meta_data`: the form is not the boundary, the endpoint is.

**Why a new random path on every replacement.** Uploading over the same key would be less code and
would be wrong: the public URL would not change, and every browser holding the previous picture would
go on serving it. You would change your photograph, see the old one, and have no way to tell whether
the write failed. The old object is deleted *after* the profile is repointed, and that delete is best
effort — an orphan costs 20KB, a profile pointing at a deleted object costs a broken face everywhere.

**Why the browser resizes before it uploads.** A phone photograph is 3–5MB and would be downloaded in
full to draw a 20px circle on a board card. `createImageBitmap` + canvas centre-crops to 256px WebP,
about 20KB, with `imageOrientation: "from-image"` so portrait photographs do not arrive on their side.
The server cap of 2MB and the bucket's own limit are the boundary; the resize is the courtesy. If it
fails for any reason the original file is sent and the cap decides — a browser that cannot resize
should not be a browser that cannot set a picture.

**Why the initials are still rendered underneath.** `<PersonAvatar>` always draws the initials and
lays the `<img alt="">` over them. A picture that 404s, or a profile that never had one, shows
initials rather than a broken-image glyph — with no JavaScript involved, and no `onError` handler,
which is why the component works unchanged inside a Server Component and inside a client one. Half
the places a person appears are the second kind.

**Rejected.** *Signed URLs, for consistency with the other two buckets* — the expiry problem above.
*`next/image`* — the host is whichever Supabase project the environment points at, so `remotePatterns`
would have to be built at build time from an env var that differs between local and production, and
`npm run build` reads `.env.production.local`; the payoff would be optimising a 256px thumbnail the
browser already caches. `CommentImage` reached the same conclusion for the same reason. *Letting an
admin set someone else's picture* — role, capacity and access are administered on People because they
are decisions about a person; a picture is the one thing on a profile that belongs to its owner. An
admin can still delete an object, which is the moderation escape hatch the other two buckets have.

**Two things this turned up on the way, both pre-existing.**

- **`<Reveal>` was dropping `aria-labelledby`.** It takes an explicit prop list and does not spread a
  rest parameter, and TypeScript does not check JSX attributes whose names are not valid identifiers —
  every `aria-*` and `data-*` one. So `<Reveal as="section" aria-labelledby="team">` compiled, read as
  finished, and put nothing in the DOM: the `<section>` arrived with no accessible name, which means
  it is not exposed as a landmark at all. Settings and People had been doing this since they were
  written. `Reveal` declares and forwards `aria-labelledby` and `aria-label` now, and
  `e2e/avatar.spec.ts` finds the picture section by its landmark role rather than by a CSS path, so
  the label is asserted rather than assumed.
- **`e2e/password.spec.ts` had a race across workers.** Its `afterAll` sweeps `claim-%` addresses and
  `afterAll` runs once *per worker*, so the worker that finished the two fast tests deleted the slow
  test's account while it was still running. The symptom is not an error, it is silence: `/recover`
  on an address with no user returns 200 and sends nothing, precisely so the endpoint cannot be used
  to find out who works here — and the spec then fails at "no mail was sent", pointing at the mail
  server. The describe is `serial` now, which keeps the sweep's purpose and removes the race.

---

## 2026-08-22 · The seed is the Notion export, transcribed — not the design bundle

**Decision.** `supabase/seed.sql` is generated from the team's own Notion workspace export by
`scripts/import-notion-export.mjs`, and holds all of it: fifteen EVIM sprints (Week 3, November 2025,
through Week 17, August 2026), 104 work items, 275 acceptance criteria with their ticked state, 280
hours of logged effort, 104 attachments, and each sprint's notes. Converso joins as a fifth client
with one project, one sprint and its single task. The hand-transcribed Week 17 from
`design/project/Coditu App.dc.html` and the synthetic Week 16 are both gone.

**Why.** The bundle's Week 17 was a twelve-item paraphrase of a real fourteen-item sprint, with
statuses that had drifted, and Week 16 was nine rows of `Week 16 item N (synthetic history)`. Both
existed because the real data was not available yet. It is available now, and a delivery tool whose
whole credibility is its sums should not be seeded with a paraphrase of the work it is reporting on.

**What this cost.** Thirty-nine e2e specs failed at once, because twelve of them wrote `COD-140`
literally and the import renumbers every key — Week 17 now runs COD-229 to COD-242, since keys are
assigned in sprint order and Week 3 comes first. The keys now live in one `SEED` block in
`e2e/fixtures.ts`, named by the role each item plays in a test, so the next import touches one file.
`supabase/tests/seed.sql` asserts the export's real figures rather than the bundle's.

**Rejected.** *Keeping Week 16 and 17 as they were and importing only Weeks 3–15* — leaves the active
sprint, the one every screenshot and export is taken from, permanently two items short and wrong about
three statuses. *Renumbering so Week 17 keeps COD-140…151* — bends the data to fit the tests, which is
the wrong direction, and would have left the earlier sprints with keys chosen to avoid a collision.

---

## 2026-08-22 · Where the export is silent, the column stays NULL

**Decision.** Four columns are left NULL rather than filled with something plausible.

- **`work_items.estimate_minutes`, everywhere.** Notion records one number per item, "Hours Worked",
  and that is time spent. It becomes a `time_entries` row. There is no estimate in the source.
- **`sprints.starts_on` / `ends_on` for nine of fifteen sprints.** Six are evidenced: Week 17 by its
  item deadlines, Weeks 15 and 16 by stepping back from it in Monday-to-Sunday weeks, Week 3 by a
  screen recording filed as `20251106-…mp4` and deadlines on the 7th and 9th, Week 4 by a deadline of
  the 16th and a note dated the 13th, Week 7 by eight deadlines of 29/12/2025. The rest cannot be
  derived: Week 7 closes in December 2025 and Week 15 opens in August 2026, which is seven sprints
  across thirty-one weeks, so the sprints are demonstrably not weekly-contiguous and there is nothing
  to interpolate between.
- **`sprints.notes_author_id`, everywhere.** Notion does not record who wrote a sprint note. The app
  prints the author's first name beside the text, so a guess here is a guess printed under somebody's
  name.

**Why.** A NULL renders as "—", which reads as *not recorded*. A fabricated value reads as fact, and
this file already records several bugs whose whole character was that they failed by looking right.

**What it costs, visibly.** The sprint footer reads `17.5 / 0.0` and the burn-up target line sits at
zero, because nothing is estimated. That is accurate but uninformative, and the data layer currently
coerces `estimate_minutes ?? 0`, so the app cannot yet tell "no estimate" from "estimated zero".
Threading the null through `lib/data/sprint.ts`, the table, the cards, the CSV and the PDF so it
renders "—" is worth doing and is not part of this import.

**Rejected.** *Treating "Hours Worked" as the estimate* — the bundle did, and it is what produced the
46.0 figure the old seed asserted; `lib/import/notion.ts` has always mapped that column to
`time_entries`, which is right. *Spreading the nine undated sprints evenly between the anchored ones* —
fifteen date ranges that all look equally authoritative, nine of them invented.

---

## 2026-08-22 · Logged hours keep their day where one exists, and say so where it does not

**Decision.** Every item with hours becomes exactly one `time_entries` row, attributed to the person
the work was assigned to. `worked_on` is the item's own deadline where it has one, else the sprint's
last day; for the nine sprints with no window it is the day after the previous evidenced sprint closed
— the earliest day the work provably could have happened. Every imported entry carries a note saying
the exact day was never recorded.

**Why.** Notion holds one sprint-level total per item and no daily breakdown, so no per-day date
exists anywhere in the source — but `worked_on` is `not null`, and 183 of the 280 hours sit in sprints
with no window. Dropping them would have left Weeks 5, 6 and 8–13 reading 0.0 logged against real
work. The note is what keeps the date from being read as a record.

**Why the assignee, not the importer.** `lib/actions/import.ts` attributes to whoever clicks Commit,
because the `log own time` RLS policy will not let it do otherwise. The seed runs as the privileged
writer, so it can put the hours against the person who worked them, and the People view is right as a
result — Ahmed's 39.5 hours in Week 16 are his.

---

## 2026-08-22 · The export's credentials never reach the database

**Decision.** `scripts/import-notion-export.mjs` redacts secret-shaped strings from every string it
emits, refuses to write the file if any survive, and `supabase/tests/seed.sql` re-checks the database
itself. The Notion export is not committed.

**Why.** The export carries, in prose that otherwise belongs in the database: a SharePoint account and
password on the EVIM project page, an OpenAI key in the Week 5 note, an OpenRouter key in Week 6, and
a test login with "PLEASE KEEP SECRET" beside it in the Converso task. Sprint notes and project scope
are read by the whole team and go out in client exports. Two checks rather than one because a scrubber
that only runs on the paths its author thought of is not a scrubber.

**Also.** The Converso sprint is `planned`, not `active`. Its one task is "Not started" and the sprint
is a container invented to satisfy invariant 1 — but the deciding reason is that `/app/people` picks
load from *the first project it finds with an active sprint*, so a second active sprint anywhere makes
which one it shows a coin-toss. It showed Converso's empty load instead of Week 17's. Scoping that
page properly is a real fix and is not part of this import.

---

## 2026-08-22 · A streamed screen cannot be a 404, and the loading state is worth more

**Decision.** Every route segment under `/app` gets a `loading.tsx`. The consequence, accepted
knowingly: a `notFound()` raised by any page below one of those boundaries now returns **HTTP 200**
instead of 404. The two specs that asserted the status assert the security property directly
instead — that the other client's work is not rendered — plus the `<meta name="next-error">` marker
Next leaves on a streamed not-found.

**Why.** A `loading.tsx` is a `<Suspense fallback>`: Next flushes the shell and the fallback before
the page body runs. The status line is on the wire by then, and nothing can take it back. Verified
by removing the boundaries and watching `/app/projects/no-such-project` go back to 404.

The trade is one-sided. The 404 status bought nothing here: `/app` is `noindex, nofollow` and behind
auth, so no crawler ever sees it, and nothing monitors 404 rates. The loading state buys the thing
the team actually complained about — on a phone, on mobile latency, a tap into a dynamic route that
is deliberately **not** prefetched produced no feedback at all until the whole render returned.

**Rejected.** Dropping `loading.tsx` from `projects/[slug]` and `sprints/[number]` to keep the two
404s — those are the two slowest screens in the app and the two where a skeleton matters most, so
the fix would have removed the feature from precisely where it was needed. Also rejected: moving the
scope check into `generateMetadata` so it throws before the flush — Next streams metadata too, so it
would have been a race dressed up as a guarantee.

---

## 2026-08-22 · Skeleton rows are painted, not built

**Decision.** `.cd-skeleton-rows` draws a list of loading rows as four repeating background
gradients on **one** element, tiled every `--row-h`, with the block's height computed from
`--skeleton-rows`. A twelve-row table skeleton is one DOM node.

**Why.** A `<Suspense>` fallback is serialized into the flight payload of every page beneath its
boundary, and `/app` now has boundaries four deep. The first version drew each row out of three or
four `<span>`s, and the outermost fallback alone — forty-odd elements nobody ever sees on a leaf
route — measured at **+44KB per page view** in dev: `/app/import` went 77KB → 128KB, `/app/people`
109KB → 181KB, the sprint page 459KB → 641KB. That is roughly 1KB per element, and it was enough to
push hydration late enough that the e2e suite started failing on races that had never flaked.

After: 42 skeleton elements on the sprint page instead of 275, and in a **production** build the
whole of workstream A costs +1.4KB gzipped on `/app/import`, +1.2KB on `/app/people` and +2.0KB on
the sprint page — for loading states, an error boundary, a not-found boundary and the account menu.

**Rejected.** Fewer rows, or a lighter bar per row — the cost is per element, so halving it halves
nothing that matters. Also rejected: dropping the outer `loading.tsx` files to avoid the nesting,
which would have taken the loading state away from `/app` itself.

---

## 2026-08-22 · No SMTP, ever. Recovery is an admin handing over a temporary password

**Decision.** Coditu sends no email. `sendMagicLink` and `requestPasswordReset` are deleted, and with
them the two fallback forms that made `/login` four forms and three email fields. What replaces them:
an admin generates a temporary password on `/app/people`, reads it out, and
`profiles.must_set_password` stops the account being used for anything else until its owner has
chosen their own. The plaintext is generated server-side, returned once, shown once, and written to
no table, no log and no activity row.

**Why.** There is no mail transport this team can operate. Vercel's free tier allows two emails an
hour; Supabase's shared sender is rate-limited and its own documentation says it is not for
production. A recovery path that works four times a day is not a recovery path — it is a support
queue with extra steps, and it fails silently, which is the worst way for an auth path to fail.

**What this is, said plainly.** An admin setting another person's password **is account takeover of
that person**. No framing makes it not that. It is accepted because the alternative is the mail
dependency above, and because these same four people already administer each other's roles, access
and allowlist — the trust boundary was already there. What is limited is limited: the flag means a
takeover cannot be quiet, the flag is admin-only at the database (`guard_profile_privilege_columns`,
with positive and negative assertions in `rls.sql`), and the person being forced cannot clear it
except by actually setting a password.

**It also retires the shared seed password.** Four production accounts were created with `coditu` and
one of them is an admin. Until now the only way to replace those was an emailed link that did not
work. An admin can now hand each owner a temporary password and the account will insist on being
changed.

**Rejected.** SMTP — the reason above. A self-service "reset my password" — with no mail it can only
be an unauthenticated endpoint that changes a password, which is worse than the problem. Putting the
temporary password in a toast, an activity row, or the URL: all three persist or leak it. A
human-chosen temporary password: a guessable one, and it would arrive at the server from a form.

**One consequence, recorded rather than hidden.** `app/auth/callback/route.ts` stays — it costs
nothing, its open-redirect guard is written and tested, and it still serves the forced-change
redirect — but nothing in the application sends a link to it any more.

---

## 2026-08-23 · Web Push through `web-push`, and only for the kind that is actually produced

**Decision.** Push notifications are sent with the `web-push` package rather than hand-rolled on Web
Crypto, from `postComment` after its insert returns, for `kind = 'mention'` and nothing else. The
subscription store is `public.push_subscriptions`; the service worker is `public/sw.js` and does two
things — show a notification, and focus a window on click. No caching of any kind.

**Why a dependency, in a repository that is deliberately dependency-lean.** Sending a push by hand
means signing a VAPID JWT with ES256 over P-256, deriving a shared secret with ECDH against the
subscription's `p256dh`, running HKDF for a content-encryption key and a nonce, and encrypting the
payload as `aes128gcm` in RFC 8188's record framing. Every one of those steps fails the same way: the
push service **accepts** the request and the device shows nothing. Roughly 200 lines of cryptography
whose failure mode is silence is not a place to save a dependency.

**Why only `'mention'`.** The `kind` check constraint allows `'assigned'` and `'review_requested'`
and `lib/data/notifications.ts` types all three, but nothing in the schema or the application ever
inserts either. Delivery for a kind that is never produced is code with no way to know whether it
works. If the team wants those, that is a separate request with a producer attached.

**Why `postComment` and not a trigger or a queue.** The notification rows are written by
`sync_comment_mentions`, a `security definer` trigger, which has already run inside the same
transaction by the time the insert returns — so the rows exist and can be read back. Sending from
there rather than re-deriving the recipients means one answer to "who was mentioned", and it is the
same answer the app itself shows.

**What it must never do.** A failed push must never fail the write. Nothing in the send path throws,
the caller does not await a result it acts on, and a deployment with no VAPID keys — every local
checkout — sends nothing and reports nothing wrong.

**Rejected.** Offline caching in the service worker: this is a live sprint board with realtime
subscriptions, and the reason the footer total is trusted is that it is never out of date; a stale
cached shell is a worse bug than a slow one, and offline is a separate request with its own ADR. A
silent push: iOS revokes a subscription that receives one and shows nothing, so every `push` event
ends in `showNotification`, fallback copy included. Registering the service worker in the app shell:
it would put a worker on every device that will never receive anything and its bytes in a route
budget with 0.2KB left, so it registers on Settings, where a subscription is created.

---

## 2026-08-24 · Components are a table, chosen from a list, and they carry SharePoint's own icon

**Decision.** A new `public.components` table — one row per thing a project is made of — with
`work_items.component_id` pointing at it. A component belongs to a project, exactly like a sprint does.
`kind` is a two-value enum, `react` or `spfx`, shown as **React** and **Microsoft web part**. The
registry for MEINEvim is generated from the delivery repository by
`scripts/sync-evim-components.mjs` into `supabase/seeds/components.sql`, and each row carries the
`officeFabricIconFontName` from that web part's own SPFx manifest — the glyph SharePoint draws in its
"Add a web part" toolbox.

**The problem.** Almost every EVIM item is a change to one named thing, and until now that name lived
only inside `title`, typed by hand, spelled four ways across fifteen sprints. "What have we done to
the Newspart" was a text search that missed as often as it hit — and it is a question the client asks
on almost every call.

**Why a table, not an enum or a text column.** An enum needs a migration every time the team starts a
new web part, and the whole point is that the team can add one mid-sentence. A text column is what we
already had inside the title, with its spellings and its typos. A row can be renamed once and every
item that names it follows.

**Why the icon is stored verbatim.** `icon` holds `Page`, `News`, `OrganizationChart` — the Fluent
name out of the manifest, not a name of our own. It is a fact the delivery repository already states,
so keeping it in step is a string comparison rather than a fresh judgement every time. Coditu does not
ship the Fluent icon font: it is a webfont, these glyphs render on the sprint table, and that route has
110KB of budget with no headroom. The name is mapped to its nearest Lucide equivalent at the render
edge, in one table anyone can read. The shapes are not identical; the reading is.

**Why the seed is generated and not hand-written.** A list transcribed from another repository goes
stale silently — somebody adds a web part over there and the picker keeps offering yesterday's list,
which is the exact failure a picker exists to remove. `npm run components:check` fails when the two
have drifted and prints what is new, renamed, re-iconed or gone.

**Why `supabase/seeds/components.sql` and not the migration.** A migration runs *before* the seed on
`db reset`, so the project row it needs does not exist yet locally and the insert would be a silent
no-op on every fresh checkout. The file is one idempotent statement that opens no transaction, so it
is also what gets run by hand against the hosted project — the same way migrations are applied here.

**Why there is no delete.** No policy and no grant. A component holds the history of what happened to
it, and deleting one would blank the column on every item that named it. `is_archived` retires it from
the pickers and keeps the history. It is the same lesson as merging duplicate profiles rather than
deleting them.

**Why the picker is a listbox and not a `<select>`.** A native `<option>` cannot carry the toolbox
icon, which is the point of storing it, and cannot be filtered — and a project has forty of them. It
keeps everything a `<select>` gives for free: `role="listbox"`, `aria-selected`, arrow-key traversal,
Escape, focus returned to the trigger. The same component is the table cell's editor, the New item
dialog's field, and the sprint's component filter, so there is one implementation of all of it.

**Two things this deliberately did NOT change.** The **export contract** — CSV, Markdown and PDF are
byte-for-byte what `docs/04-EXPORT-SPEC.md` says, because the component is internal attribution and
the export is a client-facing contract; adding a column to it is the client's call, not ours. And the
**title of any existing item** — the web-part name still sits in 232 imported titles, and rewriting
them would be inventing history.

**Rejected.** A `text` column with an autocomplete over past values (the typos are the data, and they
would keep breeding). A global registry not scoped to a project (two clients can both have something
called "Calendar", and invariant 1 exists precisely so one cannot be read under the other's heading).
Making `component_id` NOT NULL (232 imported items have no honest answer, and "not attributed yet" is
a truthful state). Letting an engineer set it (it is a lead's call, like the type and the grouping
beside it — and the per-column guard had to be told, because that trigger is an allowlist written as a
denylist and a new column is writable until it is named there).

---

## 2026-08-24 · The imported work is attributed to components by title, and ambiguity means no attribution

**Decision.** `supabase/seeds/item-components.sql` fills `work_items.component_id` for the 103
imported MEINEvim items by matching phrases against their **titles**. It is hand-written, not
generated, because it is a judgement rather than a derived fact. 93 of 103 land; the other 10 are left
alone on purpose.

**Why it had to exist.** The registry shipped and every component read "no items yet", which is the
opposite of the point. Fifteen sprints of history sit in titles — "Fix: tabs with cards", "CR: Banner
Half-Image", "EVIM Quick Links Plus" — and a registry that starts empty is one nobody trusts enough to
start filling in.

**Three rules keep it honest.**

1. **It only fills a NULL.** A person's attribution, in the app or by hand, is never overwritten.
   Re-running it changes nothing, so a correction made in the UI is permanent.
2. **Phrases carry a priority**, so a specific name beats a generic one: "Banner Half-Image" is the
   Half Image web part and not the Banner; "Tabs with Cards" is Themen Kachel and not Tabs. Without
   that, the generic word would make each of those look ambiguous.
3. **Ambiguous means unattributed.** If two different components match at the winning priority, the
   item is left alone — it genuinely is about both. That is what leaves "CR: Instagram / LinkedIn
   Feed", "Responsiveness for Link Kachel, Tabs with Cards, Newspart" and "Add optional titles to all
   webparts" empty, which is the truthful answer for all three.

**Why it matches on title and not on item key.** The local seed and the hosted database assign
different `COD-` numbers to the same item — the import ran twice, against two databases, with two
sequences. A file of `update … where key = 'COD-187'` would attribute the wrong rows in production
while looking perfect locally. Titles are the same text in both.

**What it gets wrong, and how you would know.** It is a heuristic over prose. "Anniverseries" is
matched because somebody spelled it that way in Week 6; "Finder" maps to *EVIM Dokumentenbibliothek*
because that is what the folder ships as. Anything it gets wrong is one click to fix in the component
cell, and the fix survives every later run of this file.

---

## 2026-08-24 · An acceptance criterion holds a document, and `body` becomes its projection

**Decision.** `acceptance_criteria.body_json jsonb`, alongside the existing `body text`, which becomes
the flattened one-line reading of it. Criteria are written with the same TipTap editor the comment
thread uses — same allowlist, same renderer, same sanitiser, same storage bucket for the pictures.
Nothing migrates: a criterion written before today keeps its text and gains a document the first time
somebody edits it.

**Why.** A criterion is where "how will we know this is done" is written, and half the time the honest
answer is a screenshot with an arrow on it or the four lines of SCSS that have to end up in the file.
Those went into the thread instead, with the criterion saying "see comments".

**Why `body` stays, rather than being derived at read time.** The CSV and Markdown exports render
criteria as text and are a contract (`04-EXPORT-SPEC.md`). They keep reading one column and keep
producing the same bytes for every criterion that is a sentence. Newlines are collapsed on the way in,
because Markdown renders a criterion as one `- [ ] …` line and a stored newline would split it into a
list item and a stray paragraph. A picture flattens to `[image: alt]` rather than disappearing.

**Why the row stopped being one big button.** It was: the whole row toggled the tick. That cannot
survive a criterion containing a link and a picture — a click on the screenshot would tick the box, and
a button inside a button is `nested-interactive`. The tick is a `role="checkbox"` of its own now, the
body is content, and Edit/Remove sit at the end of the row. `item-detail.spec.ts` was updated to the
new contract rather than worked around.

**Who may write one.** Admin and lead, exactly as before — `guard_criteria_columns` now names
`body_json` as well as `body`, because that trigger is an allowlist written as a denylist and a new
column is writable by an assignee until it is named there. Ticking a box is still the assignee's and
the reviewer's.

**Rejected.** A separate `criterion_attachments` table (the document already holds the image node, and
two places to look is one too many). Replacing `body` with a read-time projection (it would change the
export's bytes on every criterion, for nothing). Letting an engineer rewrite a criterion (what a
criterion says is the definition of done; ticking it is a report against that definition).

---

## 2026-08-24 · The composer's toolbar, the link editor, and how big a pasted picture is

**Three fixes, one theme: the editor behaved differently from the way it looked.**

**Bold did nothing on an empty line.** Pressing a toolbar button moved focus out of the editor, and
that drops ProseMirror's stored marks — the "what I type next is bold" state an empty document has
instead of a range to mark. `focus()` in the command chain then restored the caret with the mark
already gone. `onMouseDown` is now prevented on every toolbar button, so focus never leaves.

**The link button opened `window.prompt`.** OS chrome in the middle of the screen, unstyled,
untranslatable, blocking the tab, and on a phone a system sheet covering the very text being linked.
It also could not show whether the selection was already a link, so "remove this link" had to be
spelled "clear the box". It is a popover anchored under the toolbar now: it accepts `coditu.com` and
stores `https://coditu.com`, turns a bare address into `mailto:`, inserts the URL as the link text when
nothing is selected, and has a Remove button. Anchored rather than portalled — it belongs to this
editor and the composer is not inside a scroll container that would clip it.

**A pasted screenshot is a thumbnail.** Images used to render at their natural width, capped only by
the column, so one 2400px screenshot pushed the conversation a full screen down. They are capped at
`clamp(88px, 22vw, 132px)` tall with the width following the picture, and open in a viewer built on
`DialogShell` — focus trap, scroll lock, focus return and the mobile sheet were all already solved
there. Portalled to `<body>`, because the thread renders inside the item dialog's `overflow: hidden`
panel and a `fixed` scrim rendered in place is clipped to the comment column. Escape is caught in the
capture phase so it closes the picture and leaves the item open.

**One accessibility fix rides along.** The editing surface now carries `role="textbox"` and
`aria-multiline`. A `contenteditable` div is a generic element to axe and `aria-label` on a generic
element is prohibited — the rule had never fired only because the existing audit types into the
composer before it runs, and an empty editor is the common state.

---

## 2026-08-25 · `app_settings` is where every tunable lives, and why nothing is a constant

**Decision.** A single-row `public.app_settings` table holds the hourly rate, the payout share
threshold, the effective-from sprint, the USD→EGP rate and its source, the image upload cap, and the
default weekly capacity. `lib/settings.ts` is the only thing that reads it, once per request through
React's `cache`. An admin edits every one of them from `/app/settings`.

**Who asked.** The team, 2026-08-24: *"nothing is hardcoded, everything that is a decision is editable
in the interface."* That instruction outranks convenience, and it has a sharp edge: a rate in a `const`
is a change request that needs a deploy, and this team deploys their own tool. Every number the thread
brief names — $12 an hour, 25%, 8 MB, 2400 minutes — is the **initial value of a setting**, not a
constant, and the migration's `default` is the only place those digits appear.

**Why one row.** A second row would immediately raise "which one is live?" and the honest answer would
be "whichever the query ordered first". `check (id = 1)` makes the question unaskable.

**Why every reader still carries the default.** The hosted database is behind local and always has
been. `lib/settings.ts` treats a missing table, a missing row and a missing column as one answer — use
the default, render the page — because a sprint page that 500s over an unreadable image cap is the
`sprints.notes_written_at` outage a second time. The defaults in TypeScript are byte-for-byte the
migration's, and changing one without the other is the bug this note exists to prevent.

**Rejected.** Per-project settings (these are decisions about Coditu, not about a client). Environment
variables (a deploy to change a rate is the thing being removed). `unstable_cache` / `'use cache'`
around the read (a settings row that goes stale across requests is worse than one query per render,
and nothing else in this repo uses either primitive — Next 16 has moved that ground more than once).

---

## 2026-08-25 · A work item's key names its project (§8.4), and a slug outlives its rename (§8.5)

**Asked and answered by the team, 2026-08-25.** Both were decision gates in the thread brief; neither
was resolved on our own judgement.

### The key prefix — per project

`work_items.key` defaulted to `'COD-' || nextval(work_item_key_seq)`: one global sequence, so every
project's items were `COD-nnn` whoever the client was. Now `projects.key_prefix` and
`projects.next_key_number` carry it, and `assign_work_item_key` derives both from the item's own sprint
— invariant 1, in a trigger.

**Existing keys are immutable.** They are in comments, in exports and in people's memories. So the
project owning the most `COD-` items keeps `COD` (MEINEvim, locally and in production), everybody else
takes a prefix derived from their slug, and each counter starts above the highest number that prefix
has ever issued — across every project, because `COD-243` belongs to Converso while `COD` belongs to
MEINEvim.

**Why a column and not a sequence per project.** A sequence per project is DDL at runtime. A column
advanced by `update … returning` takes a row lock, which is exactly the serialisation that makes ten
items created on planning morning impossible to collide. The trigger loops until the key is free, so a
counter that is behind — an import that stated its own keys, a restore — heals instead of failing on
the unique index with a message nobody can act on.

**`work_item_key_seq` stays.** The seed and `scripts/import-notion-export.mjs` both `setval` it and
`supabase/tests/seed.sql` asserts on it. It is no longer how a key is issued.

### The slug — keep the old one as a redirect

Every slug a project has ever had is kept in `project_slug_aliases`, and `getProjectBySlug` falls back
to it when the live lookup misses. A rename therefore breaks no bookmark, no pasted link and nobody's
address bar. The alias lookup only runs on the requests that would otherwise 404.

A live slug and an alias share one namespace, enforced by `guard_slug_namespace` on both tables — two
answers to "which project is `/app/projects/x`?" is the failure this feature would otherwise introduce.
Renaming *back* to a previous slug deletes the now-redundant alias rather than colliding with it.

**Rejected.** Refusing the rename outright (the name is the thing people get wrong on day one, and
making it permanent means archiving and recreating a project to fix a typo). Rewriting existing keys to
a new prefix (they are in exports a client has already read).

---

## 2026-08-25 · `order_index` is assigned by the database, not by a read-then-write

**Decision.** `work_items.order_index` and `acceptance_criteria.order_index` default to `-1`, which is
not a position, and `assign_order_index` replaces any negative value with `max + 1` under a row lock on
the parent sprint or item.

**Why.** Every caller did `select max(order_index)` and then inserted. That is a read-modify-write with
no lock in the middle, and planning day is precisely when ten items get created in one sitting — F4 of
the thread brief names it. The old default was `0`, which is a real position, so "I did not say" and
"put it first" were the same value and neither caller could express the other.

The lock is `for no key update`: the weakest one that still serialises two inserts against each other,
and it blocks neither readers nor an update to the sprint's own columns. A stated position is left
alone, which is what the seed and the Notion importer need — their numbering is the order somebody
chose.

**Measured, not assumed:** a four-row `insert … select` gets 14, 15, 16, 17, because a BEFORE ROW
trigger sees the rows the same statement inserted before it.

---

## 2026-08-25 · Creating a client or a project is a lead's call, not an admin's

**Decision.** `lib/actions/projects.ts` admits admin **and** lead, matching the `leads insert clients`
/ `leads insert projects` policies that have been in `20260820120600_rls.sql` since the first
migration.

**Why this is written down.** The thread brief asked for admin-only. The database has said
admin-or-lead from the start, and a lead who may open a sprint, create work items and reorder a
backlog but not the project those sprints belong to is a line nobody drew on purpose. Narrowing the
action while leaving the policy open would also put the rule in the one place a future reader does not
look. Correctness over the brief, recorded here as `CLAUDE.md` requires.

**Not widened.** An engineer still cannot. And archiving is used in place of the delete policy that
exists on the table: `projects.id` cascades to sprints, to items, and to the hours logged against them,
which are what an invoice was built from.

---

## 2026-08-25 · A document stores a path, not a signed URL (C1)

**The bug, first, because the decision only makes sense next to it.**
`uploadCommentImage` uploaded to the private `comment-images` bucket and returned a **signed URL with a
one-hour expiry**. The editor stored that string verbatim inside `body_json`. An hour later the image
was dead — permanently, because the document held the expired string — and nothing anywhere said so:
the `<img>` simply failed. Every screenshot posted to this app before today is already broken or on its
way there.

**Decision.** A document stores `/api/attachments/<profile>/<uuid>.<ext>`: a same-origin path that
never expires. `app/api/attachments/[...path]/route.ts` re-checks `is_active_member` on **every**
request, matches the path against the exact shape this app writes rather than sanitising it, names the
bucket as a constant so no request can pick another, and 307s to a five-minute signed URL.

**Why the allowlist did not have to change.** `isSafeImageSrc` has always accepted same-origin `/…`
paths. `lib/comments/schema.ts` is untouched, and `comment-body.tsx` is still the one place that walks
stored JSON.

**Why a redirect and not a stream.** The bytes go straight from storage to the browser instead of
through this server twice. On a hosted deployment that is the difference between an image and a bill.

**Caching.** `private, max-age=120` and `Vary: Cookie`, never `public` — a client's work screenshot
must not land in a shared CDN cache where the next reader gets it with no session. The browser TTL is
deliberately shorter than the signature's, so a cached redirect cannot outlive the URL it points at.

**The documents that already exist** are rewritten by `20260825093000_stable_image_refs.sql`:
idempotent, re-runnable, and a document it does not recognise is left byte-for-byte alone.

**Rejected.** Making the bucket public (a client's screenshots would be readable by URL for ever).
Re-signing at read time inside `comment-body.tsx` (it is a Server Component, so it *could* — and then
the security boundary would also be doing IO, which is the last place that belongs). A longer expiry
(one hour was already too short by definition; any finite number is).

---

## 2026-08-25 · Upload is a route handler, because `fetch` cannot report progress (C3)

**Decision.** `POST /api/uploads`, driven by `XMLHttpRequest` from the editor, replacing the Server
Action. A placeholder node goes into the document at the caret carrying a local preview of the file,
and fills as the bytes go.

**Why.** A Server Action call is a `fetch`, and no browser reports **upload** progress on one. The old
feedback was `uploading…` in the toolbar corner: it did not say which image, how far, or where the
picture would land, so an 8MB screenshot on a hotel connection looked exactly like a hang — which is
the moment somebody pastes it again and ends up with two.

**Why the placeholder is a node and not an overlay.** It is the picture, in the place it will occupy,
at its own aspect ratio, so nothing about the layout moves when it resolves. On failure it is removed
entirely — no broken image, no orphan — and the reason is said out loud. It can never be stored:
`parseHTML` returns nothing, `renderHTML` emits an empty div, and the composer refuses to submit while
one is present, with a sentence rather than a silent strip.

**The intrinsic size is read on the server**, out of the file's own header, because a client-supplied
dimension is a claim and a claim that drives layout can distort it. AVIF returns null rather than a
guess, and every reader tolerates null — every image posted before today has none.

**HEIC is refused by name**, with the iPhone setting that fixes it. Transcoding would pull a native
dependency into this app for a case iOS usually converts away on upload; "Images only — PNG, JPEG,
WebP, GIF or AVIF" is useless to somebody holding a phone that calls it a photo.

---

## 2026-08-25 · Done criteria sink at the render edge, never in `order_index` (D1)

**Decision.** The list's sort key is `(is_done, order_index)`, applied in the component. `order_index`
is never rewritten by a tick.

**Why.** Ticking a box must not rewrite somebody's manual ordering, and un-ticking has to return the
criterion to exactly the position it held before — which it does, trivially, because the position was
never touched. Writing the sort would make a tick a reorder, and a reorder is a lead's decision.

**The optimistic state sorts by the same key the server does**, or the row jumps once on tick and again
on refresh — which reads as the write having failed and then succeeded.

**Dragging across the done boundary is refused** with a sentence rather than silently reinterpreted:
the two groups are separate readings of one list, and dropping an undone criterion below a done one
would write an order the render-edge sort immediately undoes.

**The export order is `order_index`, always.** "Done last" is a reading affordance for the team; the
CSV, the Markdown and the client PDF are a contract and `docs/04-EXPORT-SPEC.md` is unchanged.

---

## 2026-08-25 · The earnings model, and why it does not break invariant 1 (E6)

Invariant 1 says nothing is global and no query may return an item outside the active project's scope.
Earnings aggregate **across** projects — a person's money is the sum of their shares in every sprint
they worked.

**The resolution:**

> The earnings model aggregates **sprint-level totals, never work items**. `/app/earnings` lists
> sprints and money; it does not list, link to, or leak a single item title, key, client name or
> component. Each sprint row is still scoped to its own project by construction. Invariant 1 is about
> items; this view never touches one.

`v_sprint_minutes` aggregates by `(sprint, person)` and `lib/data/earnings.ts` selects no `work_items`
column at all. If a design draft ever starts wanting to show "which items made this money", the answer
is no — that is the invariant talking.

**Money appears on exactly two screens**, `/app/earnings` and a card on `/app/settings`, and the
boundary is asserted twice: a rendered assertion over every shared screen on a sprint that *has* a
confirmed payout, and a source-level grep proving no client-facing file can reach a figure. The second
one is red-green checked. The link is in the account menu and the phone's More sheet and deliberately
**not** in the rail or the top bar — those are visible on every screen that gets shared.

**Rejected.** A per-person earnings page linked from People (People is a screen an admin shows somebody
while sitting next to them). Putting the hours-to-money conversion in the sprint header behind a role
check (a role check is a thing that can be got wrong once; not importing the module cannot).

---

## 2026-08-25 · A confirmed payout snapshots its rate, and is append-only (E3, E4)

**Decision.** `sprint_payouts` stores `total_minutes`, `hourly_rate_cents`, `pot_cents`,
`usd_egp_rate_micros` and `usd_egp_source` **at the moment of confirmation**, and none of them may ever
be updated. A later confirmation writes a new row and marks the old one superseded; the old row is
never rewritten and never deleted.

**Why.** A number a person has agreed to is a record, not a live calculation — the same principle as
`sprints.notes_written_at`. Somebody was paid against that figure. A confirmed sprint's EGP amount
moving overnight because the pound moved is the single most corrosive thing this feature could do.

**Enforced in the database, not in the action:** `guard_payout_immutable` refuses a change to any
column but `superseded_at`/`superseded_by`, and refuses to un-supersede. A partial unique index allows
at most one live payout per sprint, so two admins confirming at once means one of them loses and gets
a sentence rather than a Postgres error.

**When the minutes change afterwards** the confirmation goes stale **loudly** — a banner naming how
much moved — and keeps showing its own figures. It does not silently recompute. `updateTimeEntry` and
`deleteTimeEntry` revalidate `/app/earnings` in the same call, which is what makes the banner appear;
wiring that later would have left two features individually correct and jointly wrong.

**The live rate never blocks a render.** The stored value is the source of truth for rendering; the
fetch only ever updates it, daily at most, from `after()` once the response is on the wire. Deliberately
no `unstable_cache` and no `'use cache'`: nothing in this repo uses either, Next 16 has moved that
ground more than once, and a `revalidate`d fetch would leave a cold instance rendering with no rate at
all — the exact failure being designed out.

---

## 2026-08-25 · The assignee and the reviewer may rewrite a criterion's body (§8)

**Who asked, and in what words.** The team, 2026-08-24: *"everything important should be editable, we
are developers, don't lock anything as hardcoded."*

**Decision.** The set that may already tick a criterion — the assignee and the reviewer — may now say
what the box says. **Insert and delete stay with admin and lead**, so the shape of the scope is still a
lead's call; the wording of one line is not.

`guard_criteria_columns` no longer names `body` or `body_json`; it names `work_item_id` and
`order_index`, which are the two that move a criterion rather than edit it. The row policy is unchanged
and is what restricts an engineer to criteria on items they own or review — an unrelated engineer's
write still matches no row.

**Recorded here because it is an auth-model change**, and `CLAUDE.md` says to ask before making one.
The next reader will want to know who asked, which is the whole point of this entry.

**pgTAP both ways:** an assignee rewrites a body and cannot reorder or re-parent it; an engineer on
neither end of the item changes nothing.

---

## 2026-08-25 · The image viewer traverses the item (§8.1)

**Asked and answered by the team, 2026-08-25: in scope.**

Left/right arrows and a one-finger horizontal swipe move between every image in the item — criteria
screenshots and thread screenshots are one gallery, in document order — and a downward swipe closes.

**Pinch is deliberately untouched.** No `touch-action: none`, and a second finger abandons the swipe
tracker entirely. Zooming into a screenshot of somebody's SCSS is the most useful thing this viewer
does on a phone, and trapping the gesture to implement a worse version of it is a bad trade.

**The slide list is read out of the DOM**, not threaded through a React context. The thread is rendered
on the server — `comment-body.tsx` is the security boundary and stays there — so a context would
require every image to register itself on mount and would still be wrong for the frames before it did.
The DOM already holds the answer, in the right order, and it is correct the instant somebody clicks.

---

## 2026-08-25 · The ring keeps its number, and the track got a token of its own (D2)

**The brief said replace `3/5` with a ring. It also said: "Contrast on a grouping-tinted row… Recompute, do not assume."** So it was recomputed, and the recomputation changed the answer.

Measured, at the worst of four background layers (`--raised` and `--canvas`, each plain and under each grouping tint), in both themes:

| | light | dark |
|---|---|---|
| Track at `--hairline-strong` | **1.47:1** | **1.37:1** |
| Arc, blue stop `#2B57FF` | 4.44:1 | 3.25:1 |
| Arc, teal stop `#21E2C6` | **1.36:1** | 10.61:1 |

Two findings, and the second is the one that matters.

**The track was invisible.** A ring's track is a non-text graphical object, so the bar is WCAG 1.4.11 at 3:1, and 1.47:1 is not a track, it is a ring that reads as a floating arc. `--ring-track` is a new token computed for exactly this: 48% ink in light (**3.26:1**), 34% white in dark (**3.01:1**).

**The teal half of the gradient is invisible on a light surface, which is the default theme.** At 1.36:1 a mostly-complete ring's tail simply is not there for anybody who is not looking hard. `role="img"` and an `aria-label` cover a screen reader and do **nothing** for low vision.

**Decision: the count stays rendered as text beside the ring**, on the table, the board cards and the mobile cards. The ring is the at-a-glance shape; the number is the information. That makes the graphic supplementary rather than "required to understand the content", which is the 1.4.11 exception, and it is true rather than argued.

**This costs the sticky Task column about 18px, and the brief asked it not to spend that** ("it does not make the sticky Task column wider — measure"). The ring is 14px there rather than 17 to pay some of it back. `CLAUDE.md`'s rule is that on **correctness** correctness wins and it gets recorded, so this is the record. If the team would rather have the pixels, the change is one span in `sprint-table.client.tsx` — but they should read the 1.36:1 first.

**Not changed:** the gradient itself. `signal-gradient` is a brand asset and the design bundle wins on a colour. What it is *used for* is the thing that moved.

## 2026-08-24 · A cookie snapshot, so background work can reach the database

`after()` is the right place for the exchange-rate refresh and the brief says so: the page renders
from the stored value, and the fetch only ever updates it, once the response is already on the wire.
Next 16 then refuses the one thing that makes it work — `cookies()` inside the callback — and the
refusal is a thrown error inside a callback nobody is awaiting. Production had never once fetched a
rate. Every page was a 200; the EGP line simply said there wasn't one.

**Decided:** `createSnapshotClient()` in `lib/supabase/server.ts`. It reads the cookies eagerly, on the
request, and returns a client holding a plain array instead of the `cookies()` store. Built in the
component body, used in the callback. `setAll` is a deliberate no-op rather than a `try`/`catch`: a
response already sent has nowhere to put a refreshed session, and the middleware refreshes it on the
next request anyway.

**Rejected: the service-role client.** It would have worked in one line, and `lib/supabase/admin.ts`
says what it is for — the seed, and signing URLs for private buckets — with the sentence "anything else
that reaches for this is a policy that has not been written yet". A background refresh is a system
write, so the argument is not absurd; it is refused because the snapshot keeps the caller's own RLS
context and therefore needs no argument at all. Widening the admin client's remit to avoid reading a
cookie ten lines earlier is a bad trade, and the next person would inherit a precedent, not a fix.

**Rejected: dropping `after()` for a floating promise.** `postComment` already documents why: a promise
still running when the response is sent can be killed the moment it is — which works on every machine
you test it on, and not on Vercel.

The refresh itself moved to `lib/exchange-rate.ts` and takes both the client and the settings as
arguments. `lib/actions/earnings.ts` is `"use server"`, so every export in it is a Server Action, and a
Supabase client is not something an action's arguments can carry.

## 2026-08-24 · The depth bound belongs where a document leaves the server

`comment-body.tsx` has always stopped walking stored JSON at `MAX_DEPTH`, and that was enough for as
long as the renderer was the only thing that read a document. Making a comment editable ended that:
`item-detail.tsx` now hands `body_json` to a **client** component, and React serialises a client
component's props into the flight payload with a recursive `stringify`. A 3,000-level document — which
`jsonb` stores without complaint, and which anyone with a comment box can write — took the item page
down with `RangeError: Maximum call stack size exceeded`. A 500, not a badly-drawn comment.

**Decided:** `pruneToDepth` in `lib/comments/schema.ts`, applied in `lib/data/work-item.ts` to every
comment and criterion body as it is read. One bound, at the boundary, protecting every consumer —
renderer, serialiser, and the editor that opens with the stored document in it.

It is **iterative**, not recursive, because a recursive pruner would overflow the stack on exactly the
input it exists to survive. It also reduces `attrs` values to primitives: `attrs` is jsonb too, and
every attribute this schema reads — `href`, `src`, `alt`, `language`, `id`, `label`, `width`,
`height` — is a string, a number or a boolean. A nested object in there is not an attribute anyone
meant.

**Rejected: bounding it in the renderer only, and passing the raw document to the client.** That is
the state that produced the crash. **Rejected: refusing deep documents on write.** The write path
already bounds them; the documents that matter are the ones already in the table.

Nothing is lost: a document deeper than `MAX_DEPTH` was never rendered below that depth anyway. The
prune makes the stored shape agree with what the app has always shown.

## 2026-08-24 · Prevent `mousedown`, never `pointerdown`, to hold focus in the editor

A toolbar button must not steal focus from the editor, or ProseMirror drops its **stored marks** — the
"what I type next is bold" state that an empty document has instead of a range. Preventing the default
on `pointerdown` reads as the thorough version: one handler covering mouse, pen and touch.

Measured on both engines, tapping Bold:

| | events the button receives |
|---|---|
| mobile-chrome | `pointerdown`, `touchstart`, `click` |
| mobile-safari | `pointerdown`, `touchstart` — **no click, ever** |

**Decided:** prevent `mousedown` only. WebKit treats a default-prevented `pointerdown` as cancelling
the activation, so the click never arrives and the button does nothing at all on an iPhone — a worse
bug than the one the guard was added for, and silent, because every desktop browser still worked.
Preventing `mousedown` keeps focus and leaves `click` firing everywhere.

On a touch screen focus does leave the editor, and nothing portable can stop that. It does not matter:
the command chain re-focuses and *then* toggles, so the stored mark is set after the caret is back,
which is the state an empty document needs. Asserted on both phone engines, on an empty composer,
where the mark is the only thing there is to assert.

## 2026-08-21 · The status vocabulary is one shape, and `in_review` is `in_qa`

`work_item_status` was eight values in four grammatical shapes: adjectives (`draft`, `done`,
`blocked`), an idiom (`todo`), past-tense events (`dev_started`, `changes_requested`), a
prepositional state (`in_review`), and a readiness phrase (`ready_for_peer_review`). Four are
renamed so the set answers one question — *what condition is this in*:

| was | is | why |
|---|---|---|
| `todo` | `ready` | Scoped and waiting to be picked up. `todo` is an idiom, not a state, and nothing in it said what separated it from `draft`. |
| `dev_started` | `in_progress` | Named an event, not a condition — and hardcoded a discipline into a field that a lead or a reviewer also moves. |
| `ready_for_peer_review` | `in_peer_review` | Was the only pull-queue name in an otherwise active-state set, so `ready_for_` read as ambiguous against `in_review`. |
| `in_review` | `in_qa` | Said that a review was happening but not which one. It is the QA pass after peer review. |

`draft`, `changes_requested`, `blocked` and `done` are unchanged. `changes_requested` stays a
past-tense event on purpose: GitHub uses the term verbatim, and recognisability is worth more here
than a uniform shape.

**The display order is unchanged.** Only the names moved.

**Rejected: renaming `changes_requested` to `rework`, and the whole queue-name set** (`scoping`,
`building`, `peer_review`, `qa`). It reads better on a narrow board — `ready_for_peer_review` is the
widest chip in the table and is what forced `changes_requested` to render as the abbreviated
"changes req." — but it is a private vocabulary that has to be taught, and it moves furthest from the
approved design bundle for a gain that is mostly cosmetic.

**Rejected: numeric-prefixed values** (`10_draft`, `20_ready`) so display order falls out of the
value. It leaks a presentation concern into the domain value, and it cannot work here anyway: the
display order deliberately is not the lifecycle order — unstarted work sorts *after* work in review,
because the board answers "what needs attention", not "what happened".

**Deferred, not rejected: taking `blocked` out of the enum.** It is a flag over a state, not a
state. A blocked item is also mid-build or waiting on a reviewer, and storing `blocked` in the
status column destroys exactly the information needed to unblock it — which is also why the rank
function has to wedge it between `draft` and `done`, matching no workflow. The fix is a nullable
`blocked_reason`, with "blocked" derived from it. That changes the data model and needs its own
step, its own migration, and a backfill decision for existing `blocked` rows.

**The chip labels moved with the values.** `dev started` → `in progress`, `in review` → `in qa`;
`peer review`, `changes req.`, `draft`, `done` and `blocked` are untouched, and `todo` → `ready`.
This diverges from the approved design bundle, which renders "dev started" and "in review".
Deliberate: leaving `in_progress` on screen as "dev started" would trade one inconsistency for a
worse one, since the label is the only name most of the team ever reads. `STATUS_LABEL_CLIENT` is
unchanged except `in_qa → "In QA"` — clients never read an enum value, which is what kept the blast
radius of this entirely inside the team.

### What the rename does *not* reach, and what was done about it

`alter type … rename value` is metadata-only, and every dependent holding the value as a **parsed
expression** follows it. Verified against this schema before the migration was written — column
defaults, partial index predicates, view predicates and check constraints all follow. Two kinds do
not:

- **`work_item_status_rank` is an old-style SQL function.** Its body is stored as text and re-parsed
  on every call, so the instant the values are renamed every call raises `invalid input value for
  enum work_item_status`. Confirmed by reproducing it on a throwaway database. It is replaced in the
  same transaction as the rename — a separate migration would leave a window where the board cannot
  sort.
- **`activity.from_value` / `to_value` are plain `text`**, written by `log_work_item_change` as
  `old.status::text`. Nothing about renaming an enum can reach them, so the history would read
  "changed status from dev_started to in_progress" forever. Backfilled in the same migration, scoped
  to `field = 'status'` so a title that happens to contain the word is never touched.

`v_sprint_summary`'s per-status **column aliases** are the third case: the FILTER predicates inside
the view follow the rename, but the output column names are identifiers and do not, so the view
would have gone on exposing `todo_count` counting `status = 'ready'`. Renamed with
`alter view … rename column`, which keeps the grants and the `security_invoker` setting that a
drop-and-recreate would have had to restore.

### Retired values keep working in the two places they are still readable

- **URLs.** Filter state lives in the query string, so `?status=dev_started,todo` is in bookmarks and
  in anything anyone pasted. Validation drops unrecognised values and an empty filter means "show
  everything" — so an old link would not have errored, it would have quietly returned the whole
  sprint. `parseStatusFilter` in `lib/work-items.ts` maps the retired values forward and is used by
  both the server page and the filter bar, so one parser cannot drift from the other.
- **The Notion importer.** `STATUS_ALIASES` keeps `todo`, `dev started`, `ready for peer review` and
  `in review` as aliases pointing at the new values, so a board or a CSV exported before the rename
  still imports instead of flagging a column of unrecognised statuses.

### The test that had to change

`tests/status-order.test.ts` read `20260820120000_enums.sql` **by path** and regex-matched the enum
declaration and the rank function out of it. Migrations are append-only, so a rename lands in a new
file and that test would have gone on comparing TypeScript against the original SQL. It now folds
every migration in filename order — the `create type` establishes the members and each
`rename value` is replayed in place — and takes the rank function from the last migration that
defines one. It fails on an unknown rename rather than skipping it.

*(Written 2026-08-21 on the branch that carried the rename; landed 2026-08-24 with the
merge — see the status-vocabulary row in `06-PROGRESS.md`.)*

---

## 2026-08-25 · A client contact is a kind of account, not a fourth role

**Decision.** `profiles.account_kind` is a new enum, `('internal','client')`, defaulting to
`internal`. `'client'` is **not** added to `app_role`. `is_active_member()` and `auth_role()` gain
`and p.account_kind = 'internal'`, which is what actually closes the boundary.

**Why not a fourth role — the count, not the feeling.** Twenty-two call sites are written as a
denylist:

```
lib/actions/work-items.ts   13    lib/actions/components.ts     2
lib/actions/sprints.ts       2    lib/actions/projects.ts       1
lib/actions/import.ts        1    items/[key] + its @modal      2   (role !== "engineer" || involved)
```

Every one asks "is this person an engineer?" and treats every other answer as privileged. A fourth
enum value is *not an engineer*, so a client contact would have fallen through all twenty-two and
been able to reassign work items, create sprints and commit a Notion import. That is the same shape
as `guard_work_item_columns`, an allowlist written as a denylist, which this repository has had to
retrofit three times — `component_id`, `body_json`, `deleted_at`. The lesson from those was never
"remember to update the denylist". It was "stop adding values a denylist has to learn about".

`account_kind` is orthogonal and is never read as a negative. It is also the sixth column
`guard_profile_privilege_columns` names, because a contact who can set her own kind to `internal` is
the whole feature undone in one PATCH through PostgREST with the anon key.

**Why two function bodies instead of eleven policy edits.** There are eleven
`using (public.is_active_member())` read policies spread over six migrations. Editing each would work
today and rot tomorrow: the failure mode is the *twelfth* policy, written next month by somebody
following the pattern of the eleven, open to clients and indistinguishable from its neighbours. One
definition changed means every policy that exists — and every policy written afterwards — inherits
the right meaning without its author needing to know client accounts exist.

**Measured, not asserted.** With the client fixture in place and before the second migration,
`supabase/tests/rls.sql` reported **fifteen failures**: a client account read every work item, every
internal comment, every time entry, every activity row, every confirmed payout, the hourly rate, and
all six profiles. After it, 186 assertions pass. The suite is the evidence.

**One real bug fell out of writing the test first.** `is_admin_or_lead()` was
`select public.auth_role() in ('admin','lead')` — total while `auth_role()` was, and three-valued the
moment a client made it null. `null in (…)` is null, not false. RLS fails closed on null in both
`using` and `with check`, so nothing was exposed; plpgsql does not, and `if not
public.is_admin_or_lead() then raise` would have evaluated `not null` → null → never fired. No caller
was written that way yet. It is `coalesce(…, false)` now, because a function whose entire job is to
answer a security question should not be able to answer "maybe".

**One row given back deliberately.** Tightening `is_active_member()` took a client's own profile away
along with everyone else's, and `getClientContact()` has to render her name. `"own profile read"` is
a second permissive `select` policy scoped by primary key, so it can never return a second row.
Internal members keep reading the whole team through the existing policy.

**Rejected.** Adding `'client'` to `app_role` — the count above. A `client_users` table with no
`profiles` row — it would need a parallel identity, and `auth.users` already cascades to `profiles`.
Putting the kind in `app_metadata` for the middleware to read — a claim goes stale, and revocation
has to bite an already-open session; every check reads the database.

---

## 2026-08-25 · The client portal is its own route tree, and `getCurrentProfile()` answers for nobody else

**Decision.** `/client` is a separate segment with its own layout. `getCurrentProfile()` returns
**null** for a client contact; `getClientContact()` is a second function that answers only for one.
Neither ever answers for both.

**Why a second function instead of a flag.** A single `getProfile()` returning a discriminated union
would put the burden of remembering which kind came back on every one of its fifty-odd callers, and
the one that forgot would be a leak. Two functions cannot be confused: everything under
`lib/actions/**` calls the first and never the second; everything under `app/client/**` calls the
second and never the first.

Returning null from the first is what makes the twenty-two `role === "engineer"` denylist checks
**unreachable** rather than merely unfriendly — the caller has already bailed out before a role is
compared. One edit, in one place, that the twenty-third call site inherits for free.

**Why a separate tree and not a mode of `/app`.** Measured, not assumed. `app/app/layout.tsx` awaits
`listProjects`, `countUnreadNotifications`, `listActiveProfiles` and `listComponentsByProject` before
it renders anything. Hiding the results with CSS leaves them in the RSC payload, which is not a
boundary. And the app shell is at **116.2KB against a 110KB budget** already — a pre-existing
regression recorded in `06-PROGRESS.md`, and reason enough not to hang a second audience off it.

**What the browser test found before the fix existed.** A client account that typed `/app` did not
get bounced. It rendered the **internal shell** — rail, topbar, New-item control — and landed on
`/app/projects`, empty only because RLS returned no rows:

```
Expected pattern: /\/client$/
Received string:  "http://localhost:3000/app/projects"
```

An empty internal shell is still the internal shell. The SQL layer was already correct at that point
and it was not enough on its own, which is the argument for both layers.

**Redirected, not refused.** A client contact who follows a stale `/app` link is not an attacker.
`403` would be wrong and `/login` would be worse — her password works, so a sign-in form is a lie
that loops. Both layouts redirect to the other's home instead.

**Nothing is cached in a claim.** `getClientContact()` reads the database on every request. Putting
`account_kind` in `app_metadata` would be one fewer query and would keep a revoked contact signed in
until her token refreshed. For a revocation path that is the wrong trade, and it is the same reason
`middleware.ts` is described in its own header as a gate rather than the authorization model.

**Verified.** `npm run e2e` — 462 passed, 4 skipped, 0 failed, including five specs that assert a
client contact reaches no internal route, that `COD-`, `Log time` and `Earnings` appear nowhere in
the returned HTML, that `/api/attachments/*` refuses her, and that an admin's own path is unchanged.
Zero horizontal overflow at 320, 375, 390, 430 and 1280.

---

## 2026-08-25 · Client access is an intersection of four things, computed in one place

**Decision.** A client contact's access is the intersection of: the account is a client contact and
not revoked; the contact belongs to the company that owns the project; a live grant exists for that
project; and the grant carries the capability being asked for. `client_has_capability()` computes all
four, and every client-facing read calls it.

**One function, no contact parameter.** `client_has_capability(project_id, capability)` reads
`auth.uid()` and takes no "which contact" argument — deliberately. A function that took one would be
a way to ask about somebody else's access, and every caller would have to be trusted to pass its own
id. There is nothing to pass wrongly. It is `security definer` with `search_path = ''`, revoked from
`public` and `anon` and granted only to `authenticated`, because a definer function in `public` is
granted EXECUTE to PUBLIC by default — the trap `allowlist_claimed()` already documents.

**Capabilities are an enum, not text.** A typo becomes a type error at the point of writing rather
than a capability that stores cleanly and matches nothing. `lib/client-access.ts` mirrors it and
`tests/client-access.test.ts` reads the migration to prove they agree. The drift that would hurt is
an EXTRA capability in TypeScript: offered by the UI, unknown to the database, stored, never matched,
and indistinguishable from a toggle that does not work.

**Grants, not a `clients.client_user_id` column.** A company has more than one person who talks to
us, and a contact may be given some of that company's projects and not others. One column expresses
neither. `client_contacts` is keyed on the profile, so a person represents exactly one company —
somebody who works for two clients needs two accounts, which is honest rather than a join table
nobody can reason about.

**`guard_client_grant_company` is invariant 1 applied to access.** A grant may only name a project
belonging to the contact's own company, enforced by trigger with `23514`. Without it the whole model
rests on the application remembering, and "the admin picked the wrong row out of a dropdown" is a
cross-client data breach rather than a validation error. Same shape as
`guard_work_item_component_project`, for the same reason: the join between two tables is where scope
quietly gets lost.

**Revocation is stamped, never deleted**, at three independent levels — the contact's `status`, the
grant's `revoked_at`, and the profile's `is_active`. Each is sufficient on its own, and the test
asserts each separately, because "we revoked her but she could still see it" must not be reachable by
forgetting one of them. Nothing is cached in a claim, so revocation bites the very next request from
an already-open session; there is a pgTAP assertion that does exactly that, from inside a session
opened before the revocation.

**Hours, files and starting threads are in no preset.** Observer reads; Collaborator reads and
answers, and is a strict superset of Observer so "upgrade her" can never silently take something
away. `view_effort`, `view_attachments` and `start_questions` are explicit opt-ins: hours imply what
the work cost, files can carry anything, and a client who can open threads turns the portal into a
support inbox nobody agreed to staff. All three carry a "this reveals…" sentence shown beside the
toggle rather than behind a tooltip.

**One test corrected rather than one behaviour bent.** The first draft asserted that a contact
updating her own grant raises `42501`. It does not: a row-filtering policy denies by matching
nothing, so the statement succeeds and reports zero rows — which this repository already documents
elsewhere. Asserting a failure mode Postgres does not have would have been a test that passes for the
wrong reason. It now asserts that the stored capabilities did not move, checked from the owner's
session, which is the stronger claim anyway. The INSERT case genuinely does raise, because a
`with check` violation is an error rather than a filter, and it is still asserted that way.

---

## 2026-08-25 · The client read boundary is four functions, because RLS filters rows and not columns

**Decision.** Client-facing reads go through `client_projects()`, `client_components()`,
`client_component_work()` and `client_current_sprint()`. The base tables stay closed to clients
entirely.

**Why not a policy on `work_items`.** RLS filters ROWS. `work_items` carries `description`,
`highlight`, `assignee_id`, `reviewer_id`, `minutes_logged`, `grouping` and `key` in the same row as
the title. A policy permissive enough to show a client the title shows her every one of those, and
the only way back is a narrow `select` list that somebody has to remember on every query — a rule,
not a boundary. `highlight` in particular is the discuss-before-implementing note: written by
engineers, for engineers, about what is uncertain.

**No `select *`, ever, in any of them.** `select *` is how a column added next year becomes a leak
nobody wrote. Every column is named.

**Aggregates are computed inside the function, over client-visible rows only.** The failure this
prevents is the one a filter-at-the-render-edge design produces: the hidden row is gone from the list
and still counted in the total beside it. A client reading "3 pieces of work" against a list of one
has been told the other two exist. There is a pgTAP assertion whose whole job is that number.

**Hours are null, not zero, without `view_effort`.** Zero is a lie the UI would render as a fact. An
absent column would give the row two shapes and force every caller to know which one it got. Null
means "not shown", and the type stays one thing.

**Progress is items, not hours.** Sprint progress is published-items-done over published-items-total.
A percentage derived from hours would hand `view_effort` to anybody who can see a progress bar, which
is precisely the capability that was deliberately left out of both presets.

**Status is humanised in SQL.** The `case w.status when 'in_qa' then 'In QA'` lives in the function,
so the enum value never crosses the wire. `STATUS_LABEL_CLIENT` in `lib/work-items.ts` says the same
words for the PDF; the duplication is deliberate and small, and the alternative — shipping the raw
enum and mapping it in the browser — puts `in_peer_review` in a payload a client can read.

**A supplied project id is a request, not a claim.** The functions take `p_project_id` and re-derive
whether this session may read it. Another company's id returns an **empty set**, not an error:
distinguishing "not yours" from "does not exist" is a way to enumerate what exists.

**Publication is a column, not a convention**, and it is curated at the component and reused at the
item. Requiring a hand-written summary for every work item is fourteen pieces of writing a sprint,
and a feature that costs that much on a four-person team stops being used in week three — an unused
publication model publishes nothing, which is safe and useless. Reusing internal text wholesale is
cheap and wrong. So a component pays the cost once, enforced by a check constraint rather than by the
form, and an item falls back to its own title.

**One test taught the harness something.** The assertion "an engineer cannot publish their own item"
passed against a guard that never fired: pgTAP runs the file in one transaction, `now()` is the
transaction timestamp, and the engineer's `client_published_at = now()` wrote the identical value the
lead had written a statement earlier — so `is distinct from` was false and the guard correctly did
nothing. It asserts unpublishing now, which is both genuinely distinct and the sharper attack: it is
how a late piece of work disappears from a report a client is already reading.

---

## 2026-08-25 · The portal is Server Components all the way down, and it shows in the bytes

**Decision.** `/client`, `/client/projects/[slug]/components/[component]`, the cards, the progress
line and the not-found page are all Server Components. There is not one `"use client"` file in the
portal.

**Measured, against a production build.** `/client` ships **less JavaScript than `/login`** — its own
cost over the framework floor is **0 KB**. The internal sprint table's own cost is 408 KB by the same
probe. The portal is not "light for an app screen"; it is lighter than the lightest route this
application already had.

That is not restraint for its own sake. The app shell is 116.3 KB against a 110 KB budget and has
been since before this work — hanging a second audience off it would have made a failing number
worse, and the portal has nothing that needs a client island yet: no drag, no optimistic mutation, no
realtime, no command palette. When Questions arrives it will need exactly one, for the composer.

**`prefetch={false}` on every portal link.** These are authenticated dynamic routes; prefetching a
grid of component cards renders every one on the server to save a navigation that may never happen.
`07-FIELD-NOTES.md` records the measurement that made this a rule — twenty-eight wasted renders per
page view.

**Two bugs found by looking rather than by testing**, both invisible to every assertion that existed:

*The progress track was `--ring-track`* — `rgba(11,14,20,0.48)`. Correct for `progress-ring.tsx`,
where it is a thin circular stroke; catastrophic as a 6px full-width bar, where an empty track read
as a finished one. "0 of 3 done" sat underneath something that looked complete. It is `--hairline`
now, which is the token for a subtle horizontal rule.

*The fill was `bg-[var(--signal)]`* — and `--signal` is a `linear-gradient`, not a colour. Tailwind's
`bg-[…]` compiles to `background-color`, a gradient is not a valid `background-color`, the
declaration was dropped, and the fill painted **nothing**. Every bar was 100% track. The one other
use of `--signal` in this repository is `background-image` in `globals.css`, which is the tell. No
test could have caught either: both render, both are the right size, both have correct accessible
names. They were wrong in a way only a screenshot shows.

**`clip-path: inset()` rather than `transform: scaleX()`** for the fill. Scaling squeezes the whole
blue→teal gradient into whatever fraction is filled, so a bar at 10% shows the entire gradient in a
sliver and every bar looks alike. Clipping reveals a full-width gradient, so the colour at a given x
is the same on every bar and the line reads as the signal trace being drawn — which is the brand
motif doing actual work. It composites like a transform and interpolates for the transition.

**`app/client/not-found.tsx` exists so a client is never offered `/app`.** The internal one says "Go
to the current sprint" and links into a tree she cannot reach. Both pages give the **same** answer for
"not shared with you" and "does not exist", for the same reason: a message that distinguished them
would let anyone with one project's URL discover the shape of another's.

**A streamed screen is still not a 404**, exactly as recorded on 2026-08-22. `loading.tsx` flushes the
shell before the page body runs, so `notFound()` here returns 200. The portal specs assert the
security property and the `<meta name="next-error">` marker instead of the status — the remedy that
decision already named.

---

## 2026-08-25 · The invitation is a row, and it exists so the trigger has something trustworthy to read

**Decision.** `inviteClientContact` writes `client_invitations` **first**, then creates the auth
account. `handle_new_user` reads that row and creates the profile, the contact and every grant in one
transaction. `enforce_email_allowlist` accepts a pending unexpired invitation as well as an
`allowed_emails` row.

**Why the invitation is written before the account.** Because the other order has a window. If the
profile were created by the trigger and the contact row by the action afterwards, then between the
two the account exists, `account_kind` is `'internal'` by default, and `is_active_member()` is true
for it — a real interval in which a brand-new client account reads the entire database. It is short
and nobody would ever observe it, which is what makes it worth removing rather than accepting. In
this order a failure leaves a pending invitation and no account: visible on the screen, withdrawable,
harmless.

**Why the kind cannot come from the request.**
`20260821180000_role_is_not_client_supplied.sql` is the precedent — `handle_new_user` read `role`
from `raw_user_meta_data`, which is `options.data` on a public endpoint taking the anon key, and
anybody on the allowlist could POST themselves admin. `account_kind` has identical exposure and a
larger blast radius in the other direction. There are pgTAP assertions for the crafted sign-up
(`"role":"admin"`, `"account_kind":"internal"`, a supplied `client_id`) and for the sharper case: an
**invited** address claiming `"account_kind":"internal"` is still a client, because the invitation is
the only source.

**Everything fails toward less.** No invitation → internal, which is how every teammate signs up. An
**expired** invitation → no contact and no grant, asserted separately, because an expiry that
silently still works is not an expiry.

**No email, and the UI says so in words.** `docs/05-DECISIONS.md` (2026-08-22) is categorical. The
form carries "No email is sent — this application has no mail transport. You will be given a password
once, to pass on yourself." The password is returned once, held in component state, copied by a
button, dismissed explicitly rather than on a timer — a panel that vanishes mid-copy is worse than
one that has to be closed. It is stored in no table, no log and no activity row, and a pgTAP-adjacent
assertion in the e2e suite greps the invitation row for it.

**No optimistic update on this screen, and that is not an oversight.** Everywhere else a mutation
shows immediately and rolls back on failure, because the cost of being briefly wrong is a row that
flickers. Here the cost is an admin believing they revoked somebody's access when they did not.
Invariant 4 asks for a rollback path and a visible error; the honest reading for access changes is
not to make the claim early.

**A lead reads, an admin writes.** The same split the email allowlist and role changes already use. A
lead runs delivery and can create clients and projects; deciding what leaves the company is not a
delivery decision. An engineer gets `notFound()` — and, more importantly, is not shown a nav item
that would 404, which is why `NavItem` gained `visibleTo` and both the rail and the phone's overflow
sheet now read the same predicate rather than each filtering for itself.

**Withdrawal stamps three things and deletes nothing** — the contact's status, every live grant, and
nothing else. The account survives, so she signs in and sees "your access is still being set up",
which is honest. Deleting the contact would take her name off her own messages, and
`client_messages.author_id` is `on delete restrict` precisely so that cannot happen by accident.
Withdrawing an **unclaimed invitation** is the one real delete in the feature: nothing happened,
nobody signed in, there is no message with a name on it, and leaving it would show an address that
can still open an account as though it cannot.

---

## 2026-08-25 · Client questions are their own tables, and their own read model

**Decision.** `client_threads`, `client_messages`, `client_thread_reads`. Not a flag on `comments`.
Existing comments are untouched and unmigrated.

**Why not a flag.** An `is_client_visible boolean` on `comments` would put one column between fifteen
sprints of implementation argument and a client's screen, and every query written afterwards would
have to remember the filter. The failure mode is not dramatic — it is a `select` in a feature
eighteen months from now that forgets, and nobody notices because the page looks right to the
internal person testing it. Separate tables leave nothing to remember, and a query here that forgets
a filter returns client messages to a client, which is what it is for.

Existing comments were also written under an expectation of privacy. Nothing here changes that
retrospectively.

**The document is the same document.** `body_json` is the ProseMirror shape `comments` already uses,
validated by `lib/comments/schema.ts` and rendered by `comment-body.tsx` — the walker with ten
hostile-document specs against it. Writing a second renderer would have been writing a second thing
to attack. `body_text` is derived on the server from the same parsed document, exactly as
`postComment` does it.

**The composer is a textarea, not TipTap.** A client answering "the second one, please" does not need
a formatting toolbar, and ProseMirror would take the portal from **0 KB of its own JavaScript** to
well over a hundred. The message is still stored as a proper document, built from plain paragraphs,
so upgrading later is a component swap rather than a migration.

**State follows the reply.** A client answering makes it `waiting_coditu`; one of us answering makes
it `waiting_client`. **Resolving stays manual and stays with Coditu** — whether an answer was
sufficient is a judgement, not an event — and a reply to a resolved thread reopens it, because
somebody had more to say. This is the one thing in this brief the repository could not decide for
itself; it is recorded here as reversible.

**Read and reply are separate capabilities**, and the screen honours the split with a sentence rather
than a box that fails on submit: "You can follow this conversation but not reply to it."

**The read model had to become RPCs, and the reason is worth keeping.** These tables have no
internal-only columns, so ordinary `.from()` selects with RLS were right — and the first version
returned an **empty list** to a client with a question waiting. The list also needs the component and
project a thread is about, and a client cannot read those base tables at all; `!inner` on a join that
returns nothing drops the parent row. No error, no 403, just nothing. The pgTAP suite stayed green
because the SQL was never wrong. **A client-safe table is not a client-safe query** — the moment a
query joins outward it inherits the strictest policy it touches, and `!inner` makes that silent. In
`07-FIELD-NOTES.md`.

**`can_write_client_thread` is asked once.** The page takes `canReply` from the same predicate the
INSERT policy uses rather than re-deriving it from her capability array. Two answers to one question
eventually disagree, and the disagreement is either a composer drawn for somebody the database then
refuses, or one hidden from somebody it would have allowed.

**Marking a thread read is an action, not a render side effect.** A GET that writes is a GET a
prefetch, a crawler or a link preview can fire, and this repository has already measured a prefetch
rendering twenty-eight dynamic routes nobody visited.

## 2026-08-25 · Realtime gets a websocket and a token, not the whole Supabase client

The app shell had been over its own JS budget since before the client-portal brief — 116.5 KB against
110 KB — and the workspace redesign adds a sidebar, a command surface, a block editor, presence,
sort and filter panels and saved views to it. Paying the budget down first was the only order that
leaves the gate meaning anything.

**One chunk was 65 KB gzipped of the 116.5, and it was `@supabase/supabase-js`.** The browser used it
for exactly two things: read the session JWT out of a cookie, and open a websocket. To do that it
built `SupabaseClient` — auth-js, postgrest-js, storage-js, functions-js — because `createClient` has
no narrower shape. `@supabase/supabase-js` does not export `RealtimeClient`; it inlines it. So there
was no import to narrow, only a dependency to replace.

**`@supabase/realtime-js` is the websocket half on its own,** already present as a transitive
dependency at the same version, so promoting it to a direct one dedupes rather than duplicates (one
entry in the lock file — worth checking, because two copies of a websocket client in one bundle would
have been a worse outcome than the problem).

**The token comes from `/api/realtime-token`,** a route handler that returns the caller's own access
token. That is the part worth arguing rather than asserting: `@supabase/ssr` deliberately does not set
`httpOnly` on the auth cookie, because `createBrowserClient` has to read it from `document.cookie`.
Every line of JavaScript on the page could already see this token. The endpoint returns the same
string, to the same session, derived from the same cookie — so it is not an escalation, it is the same
read performed 65 KB more cheaply. It returns **`expiresAt` and nothing else besides the token**, and
specifically never the refresh token, which is the credential that outlives the tab. There is an
assertion for exactly that, and one for the anonymous 401, and one for `no-store` on both.

`getSession()` rather than `getUser()`, deliberately: nothing is being authorized here. The response
is the caller's own token echoed back, a forged cookie earns a forged token that realtime rejects on
its own, and `getUser()` would put a network round trip on every reconnect for no decision.

**The construction is copied from `supabase-js` verbatim, and that is not laziness.**

```js
realtimeUrl = new URL("realtime/v1", baseUrl);
realtimeUrl.protocol = realtimeUrl.protocol.replace("http", "ws");
new RealtimeClient(realtimeUrl.href, { params: { apikey }, accessToken })
```

Every clause fails silently if it is wrong. Omit `apikey` and the socket connects and delivers
nothing. Omit the `http`→`ws` swap and it never connects. And `setAuth` is still awaited **before**
`subscribe`, even though `accessToken` is supplied — supabase-js sets the initial token explicitly for
the same reason, and this repository has already paid for that race once: realtime validates a filter
with `has_column_privilege(claims->>'role', …)`, so a channel that joins as `anon` is told "invalid
column for filter sprint_id" and then sits there, connected and receiving nothing. Local timing won
that race every time; production lost it every time.

**One socket instead of two.** Every `createClient()` call built its own `RealtimeClient`, so a sprint
page with an item open held two websockets to the same server. A module-level client multiplexes both
topics over one connection, which is what realtime-js is for. It disconnects itself when its last
channel is removed and reconnects when the next subscribes, so nothing has to ref-count it — and
`removeChannel` still sends `phx_leave`, which is what the teardown spec watches for.

**`lib/supabase/client.ts` is deleted.** It was the only browser-side Supabase client and nothing
imports it any more. Removing it makes the saving structural rather than incidental: there is no
longer a module through which `@supabase/ssr` can reach a browser bundle at all.

**Measured: 116.5 KB → 68.3 KB own, a 48.2 KB saving.** The §5 total came down with it, 256.5 KB →
208.3 KB against a 220 KB budget, so both numbers pass for the first time. That leaves 41.7 KB of
headroom for the six client surfaces the redesign adds.

**What proves it works, because the failure mode is silence.** `e2e/palette-realtime.spec.ts` watches
the wire: it waits for the server's `Subscribed to PostgreSQL` system frame — not the `phx_reply` that
merely acknowledges the topic — makes a write outside the browser, and asserts it reaches the table.
A board that never updates looks exactly like a board where nothing has happened, so this was never
going to be verified by looking at it.

## 2026-08-25 · A story is about several components, and the picker sends one decision

Ticking three components is **one** decision. A control that dismisses itself after each tick turns it
into three, each with its own round trip, its own optimistic update and its own chance to be
interrupted half way — and it makes "add the Newspart as well" a different gesture from "these three",
which it is not.

So `ComponentMultiPicker` accumulates while it is open and sends the whole set on the way out.
`CellPopover` gained an `onClose` for it, and that callback is deliberately hung off **close**, not off
the pick handler: Escape is how a keyboard user finishes, and a commit that only fired on a click
would silently discard their work. There is an assertion that closes with Escape for exactly that
reason.

**`onClose` is in `close`'s dependency array rather than held in a ref.** A ref keeps `close`
referentially stable and lets the Escape and outside-click effects subscribe once — but it also lets
`close` call a **stale** callback, and for a panel whose whole job is accumulating state that is the
one thing it must not do. Re-subscribing two listeners on a keystroke is cheap; sending last
keystroke's selection is not.

**The action takes the whole set and computes the difference.** Not delete-then-insert: clearing first
would write a `cleared` and a `set` row into `activity` for every component that did not actually
change, so re-ticking a box nobody touched would fill an item's history with events that never
happened. It also does not report "nothing was lost" when the additions landed and the removals did
not — it says *"Some of that saved and some did not"*, because the other sentence would be false.

**The tick box is drawn, not a real `<input type="checkbox">`.** The row is already a listbox option
and `aria-selected` announces its state; a nested checkbox would be a second, contradictory
announcement of the same fact. `aria-multiselectable` on the listbox is what tells a screen reader
that ticking is additive.

### `Match any` and `Match all`

`?component=link-kachel,newspart&match=all`. The distinction earns its place on the responsiveness
work: *Link Kachel OR Tabs with Cards* is forty items across the project's history, *Link Kachel AND
Tabs with Cards* is the three that touch both, and those are different questions.

**`any` is the widening default, and an unrecognised `match` is `any`.** A filter that quietly narrows
hides work; one that shows too much is merely unhelpful. A link written before this parameter existed
has no `match` at all, which is the same case.

**The toggle only appears once two components are selected.** A pair of buttons offering to intersect
one component with nothing is a control that cannot do anything, which is worse than no control.

Slugs, not ids, so the URL says what it is looking at — and validated twice: shape-checked by
`parseComponentFilter`, then resolved against **this project's** registry, so a hand-edited string
naming another client's component resolves to nothing rather than to something.

## 2026-08-25 · A toolbar and blur-to-save cannot both be right

`work_items.description` and `work_items.highlight` were multi-line plain text in a textarea, and
`03-APP-SPEC.md` said *"Clicking away **saves**"*. That was the correct rule for a textarea: there is
nothing to click except away, so blur is unambiguously "I have finished".

They are block documents now, edited with the universal editor — and the editor has a toolbar.
**Pressing Bold blurs the contenteditable.** Kept as it was, clicking Bold would have committed the
document to the server, then clicking Italic would have committed it again, each time with the text
half-formatted, once per round trip. The rule that protected a half-written paragraph would have
become the thing generating garbage.

So these fields get explicit **Save** and **Cancel**, alongside `⌘⏎` and Escape. That is not a new
pattern: `criteria-list.client.tsx` met the same constraint when criteria became documents and
answered it the same way, so the two writing surfaces keep one set of habits rather than two.

**What is preserved is the property blur-to-save existed for**: nothing is silently discarded. Escape
reverts explicitly, the draft survives until the reader chooses, and a failed save keeps the document
in the editor with the reason said out loud.

**And what was nearly lost.** The first version of this change simply dropped `onBlur` and offered
only `⌘⏎`. Typecheck passed, lint passed, and the screen looked right — a reader who clicked away
would have been stuck in an editor with no visible way out. `e2e/editable.spec.ts` caught it, because
it asserts the write rather than the appearance: *"an emptied description is null, not an empty
string"* went from passing to finding `"temporary"` still in the column.

Legacy text converts on read rather than being rewritten. `documentFromText` turns single newlines
into hard breaks — 58 imported descriptions are requirement lists, and collapsing them made one
unreadable paragraph once before — and takes a `starsAreCallouts` option that only the sprint notes
pass, because a `**wrapped**` paragraph was the notes' convention and a description never used it. It
has `highlight`, a column of its own.

## History is captured by a trigger, and a restore cannot rewind it

**Decided 2026-08-25, W4a.**

Revisions are written by an `after` trigger on the five document surfaces, not by the Server Actions
that save them. Four actions write documents today and there will be more; each one would have to
remember, and the one that forgets loses history silently and permanently. A trigger also catches the
writes no action makes — a migration, a hand-applied fix in the SQL editor, the importer — which are
exactly the changes nobody can otherwise account for. The price is that a trigger knows what changed
and not why; `restored_from` is the one piece of intent that matters and it arrives through a
transaction-local setting.

`document_revisions` grants `authenticated` nothing but `select`, and carries no insert, update or
delete policy. **The append-only guarantee is what is absent, not a guard that raises** — a guard has
to be written correctly and can be got round by a path its author did not consider; a privilege that
was never granted cannot. It follows that a restore adds a version rather than rewinding the table,
because rewinding is not an operation the schema offers. Restoring v2 over v5 produces v6.

*Rejected:* writing revisions in the actions, for the reason above. *Rejected:* a `before delete`
guard trigger instead of withheld privileges — weaker, and it invites an exception.

## `restore_document_revision` is `security invoker`, alone among our functions

**Decided 2026-08-25, W4a.**

Almost every function in this schema is `security definer`. This one must not be. Who may restore a
document is exactly who may write it, and that rule already exists — in the policies on `work_items`,
`sprints`, `acceptance_criteria` and `comments`, and in `guard_work_item_columns`. A definer function
would state it a second time, in a `case` over five surfaces, and the second copy is the one that
goes stale.

The first draft did exactly that, and got it wrong in a way that mattered: it required admin-or-lead
for the three story-level surfaces and let *any* active member restore a criterion body — including
on a story they cannot edit. As an invoker function the question does not arise. `supabase/tests/revisions.sql`
pins both halves, and the refusal it observes comes from the column guard, naming the column, rather
than from anything restated here.

*The catch, recorded because it is not obvious:* RLS refuses a write by matching no rows rather than
by raising, so the function checks `row_count` and raises `42501` itself. Without that a denied
restore reports success.

## Idempotency is a column with a unique index, not a claims table

**Decided 2026-08-25, W4b.** This departs from `coditu-implementation-prompt.md` §5.4, which
specified a general `write_idempotency (key, profile_id, action, result)` table: claim the key, do
the write, record the result.

That shape is right when the write is not a single insert. Here it is, and the table costs three
things:

**Three round trips where there is one** — claim, insert, complete — against a composer whose own
source says it is already tuned, and that a comment appearing half a second later is a regression
paid for by the person writing.

**A state that a unique index does not have.** A claim written and a write that then fails leaves a
row saying "in flight" for ever, so the honest retry is refused until a sweep clears it. That means a
TTL job, which means a thing that can be down, which means a failure mode where nobody can post. The
key and the row are written by one statement here, so either both exist or neither does.

**An answer to a question nobody asked.** `result jsonb` exists to replay what the first attempt
returned. Both writes involved return `{ ok: true }`.

*Rejected:* the claims table, for the reasons above. *Rejected:* a globally unique key — see
`02-DATA-MODEL.md`; scoping it to the writer costs nothing and removes the question. *Kept from the
brief:* the state machine in §7 and the rule that a draft is never cleared on failure.

Revisit this if a future write needs idempotency across more than one statement, or needs to replay a
non-trivial result. Neither is true of anything shipped.

## Version history is one timeline per story, and a diff of the flattened text

**Decided 2026-08-25, W4c.**

The design's version list reads *"v4 added the code block, v3 rewrote the highlight, v2 added
criteria 4 and 5, v1 created from the Notion import"* — so a version is something that happened **to
the story**, not to `work_items.description`. Somebody asking what changed on the 19th does not know
which column held it, and making them pick a column first asks them to already know the answer.
`document_revisions.work_item_id` is written by the capture trigger for exactly this, so the timeline
is one indexed read rather than a five-way union.

**Reading is per story; restoring stays per surface.** "Restore the story to the 19th" would have to
decide what to do about the four documents that did not change that day, and every answer surprises
somebody. Each entry restores its own document — the operation the database offers, and the only one
with an unambiguous meaning.

**The diff is over `plain_text`, not the two documents.** A block-tree diff has to decide whether a
paragraph that moved and gained a word is a move plus an edit or a delete plus an insert, and every
answer is wrong for some document. The consequence is stated rather than hidden: a change that only
alters formatting produces no diff lines, and the entry says "formatting only" instead of rendering
an empty box that reads like a bug. The version is real either way — the trigger compares the
document, not the text.

*Rejected:* installing `jsdiff` — fifty lines here, against a shell budget that took all of W1 to get
under. *Rejected:* word-level diffing inside a changed line — a real improvement nobody has asked for,
and adding it later changes nothing outside `lib/diff.ts`.

## The bin shows where something was, never what it said

**Decided 2026-08-25, W4d.**

`trash_list()` returns a withdrawn comment as `Comment on COD-241` plus its project, sprint and
timestamp. Its `body_text` is not in the projection at all — not hidden by the page, absent from what
the page is given.

A withdrawn comment keeps its tombstone in the thread and its words reach nobody, including its
author. A trash screen that printed them would quietly redefine what "withdraw" means, and the person
who withdrew it would have no way of knowing.

**A lead can see one and cannot restore it.** The permission matrix gives a lead restore rights, and
they have them for stories. For comments the governing policy is `edit own comment` — author or admin
— and widening trash to match the matrix would mean widening that policy, which would also let a lead
rewrite anybody's comment. Same rule as `restore_document_revision`: who may restore is who may
write, decided in one place. The row says *"only its author or an admin"* rather than hiding.

## `access_events` is deferred from W4 to W9

**Decided 2026-08-25, W4d.** §5.3 places an `access_events` audit table in this phase. It is deferred
to W9, where People & Access provides both its writers and its only reader.

Building it now means a table with no writer, no reader and no test that can fail, sitting unused for
five phases and going stale against the screen it is eventually for. Nothing is lost by waiting: it
is purely additive and depends on nothing built here. Nothing is gained by hurrying: no code shipped
in W4 through W8 would write to it.

*This is a scheduling change, not a scope cut.* `access_events` remains in the plan.

## Presence channels are private, and RLS is what authorizes a join

**Decided 2026-08-25, W5a.** The plan made this phase's first task a question rather than a decision:
does this Supabase expose `realtime.messages` RLS — private channels authorized in SQL — or must
channels stay token-authenticated and carry nothing RLS would otherwise protect?

Measured against realtime **v2.112.6** and `@supabase/realtime-js` **2.112.3**: `realtime.messages`
exists, partitioned by day, with `relrowsecurity = true` and **zero policies** — so a private channel
was denied to everyone, because RLS with no policy denies. `authenticated` holds the grants, and the
client supports `config: { private: true }`. So the answer is yes, and the only missing piece was the
policy. **This answer is a property of those versions**, and a hosted project on an older realtime
would not have it; check before assuming it holds elsewhere.

**The check is `is_active_member()`, not per-entity.** A topic-scoped policy — "you may join
`presence:sprint:X` if you can read sprint X" — looks stricter and is not: `sprints`, `work_items`
and `comments` are all gated on `is_active_member()` and nothing narrower, so per-entity scoping
would do a lookup to reach the answer we already have, and give the visibility rule a second home.
What it does exclude is the thing that matters — `account_kind = 'internal'`, so no client contact
and no `anon` can join.

**Every private topic begins `coditu:`.** Without a prefix the policy would authorize *any* private
topic, including one an attacker chose, turning the workspace into a general-purpose message bus for
anybody with a session. The prefix is not a secret and is not security by itself; it is what makes
the policy answerable.

*A limit worth writing down:* a browser test can prove presence works, and presence works just as
well with `private: false`, which bypasses these policies entirely. So no end-to-end test can prove
the policy is enforced. `rls.sql` pins the policies' shape instead — they exist, they require
`is_active_member()`, they are confined to the prefix — and `e2e/presence.spec.ts` asserts the client
really does ask for `private: true` on a prefixed topic. Two halves, neither sufficient alone.

## "Editing the criteria" is a presence field, not a broadcast channel

**Decided 2026-08-25, W5b.** §8 of the plan gives typing its own channel —
`typing:{entityType}:{entityId}`, broadcast, throttled to one event every 3 seconds and expiring
after 5 seconds of silence. Presence already carries a `surface` field, so the indicator is a second
`track` on the channel that is already open.

Broadcast plus a throttle plus an expiry is the right shape for a **per-keystroke** typing indicator,
where events arrive faster than anybody can read them and a stale one has to time out. That is not
what this is. "Is editing the criteria" changes when an editor opens or closes — a handful of times in
a session — and it expires correctly on its own, because presence state dies with the socket. Adding
a channel, a throttle and a 5-second timer to carry that would be three moving parts, each with a
failure mode, for a fact presence already transmits.

`useAnnounceSurface` claims a surface for as long as an editor is mounted. Claims are a **stack**
rather than a value, because two editors can be open at once — start a comment, then click into a
criterion — and with a single value, closing the first would clear the indicator while the second was
still open.

*Per-keystroke typing is deliberately not built.* If it ever is, broadcast and a throttle are what it
needs, and this decision does not stand in its way.

*What crosses the wire is a name* — `criteria`, `description`, `comment` — never content.
`e2e/presence.spec.ts` types into a criterion with the frames captured and asserts the text is in
none of them, while also asserting that `criteria` **is** there, so the check is known to be capable
of failing.

## The presence surface is an external store, not provider state

**Decided 2026-08-25, W5b.** `PresenceSurfaceProvider` wraps the whole item body so any editor inside
can announce itself without five layers of prop threading. It holds its claims in a **ref with a
subscription**, read through `useSyncExternalStore`, rather than in `useState`.

Provider state re-renders the entire subtree, which here is the thread, the criteria, the fields and
the composer — to change one word in a caption. That is wasteful, and it broke something concrete:
the thread owns the `useOptimistic` comment, and a re-render arriving from above during the
composer's rollback transition left the optimistic entry stuck on `sending…`. `e2e/optimistic.spec.ts`
caught it.

With a store, only the presence stack re-renders. The rest of the story is untouched, so nothing else
can be disturbed by somebody opening an editor.

*Rejected:* passing a callback down through the tree — five props on components that know nothing
about realtime. *Rejected:* provider state — see above.

## The story's viewer stack includes you; the sprint's does not

**Decided 2026-08-25, W5b.** The design's viewer list marks the reader `Mohamed Tamer (you) —
viewing`, and its sprint header does not show you at all. Both are right, and for different reasons.

On the sprint, you know you are there, and a face of your own on every screen is one avatar of
permanent noise. On one story the stack answers a different question — *is anybody in here with me,
before I rewrite this description?* — and your own face is what makes the others countable at a
glance.

## `/app` is the workspace home; `/app/sprint` is the entrance to the sprint

**Decided 2026-08-25, W6a.** The design puts a workspace home at `/app` and navigates to a flat
`/app/sprint`. This application's canonical sprint URL is project-scoped and stays that way.

So `/app` renders Home, and `/app/sprint` is a server route that resolves the active sprint and
redirects to its real address. It is an entrance rather than an address: what lands in the address
bar is the shareable URL that names its project, which is invariant 1 expressed in the URL.

That also solves a problem the rail had: the navigation is a client component with no idea which
project has an active sprint, and teaching it would mean loading the project list into the shell on
every page. A fixed link to a route that knows the answer costs nothing until somebody clicks it.

The old redirect survives as the fallback it always should have been — with nothing active anywhere,
`/app/sprint` goes to the projects list rather than rendering an empty sprint page.

*Consequence to remember:* any link that meant "the current sprint" and pointed at `/app` now points
at Home. Two did — the error page and the not-found page — and the marketing site's two links to
`/app` correctly still mean "open the app".

## The sidebar's width is the viewport, not a hover and not a preference

**Decided 2026-08-25, W6b.** The design measures three bands and this now matches them exactly:
**≥1180px** a 268px sidebar with labels, **768–1179** a 64px icon rail, **<768** gone, with the bottom
bar in its place.

It used to be 72px that expanded to 240px on hover or on click-to-pin. Three things were wrong with
that, and width-as-the-only-input fixes all three:

- **Hover is not an input everybody has.** `rail.client.tsx` said so itself — the rail is hidden below
  `md` *because* a touch screen cannot open it — and a tablet at 800px has no hover either, so it got
  permanently unlabelled icons with no way to read them.
- **A preference should not be needed to read your own navigation.** Pinning was discoverable only by
  finding a button whose purpose was not obvious, and until you found it every label was invisible on
  a 1440px screen with room to spare.
- **Hover-to-expand moves the page under the pointer.** Reaching for Projects widened the rail and
  reflowed the content out from under the cursor.

The collapse control survives at ≥1180 only, where collapsing changes something. Its stored key was
**renamed** `coditu.rail.pinned` → `coditu.rail.collapsed`, because the flag's meaning inverted:
reusing the old key would have read every existing pin as a collapse and shut the sidebar for exactly
the people who had liked it open.

## The sidebar's two states are hand-written CSS, not Tailwind variants

**Decided 2026-08-25, W6b.** `min-[1180px]:data-[collapsed]:w-[…]` and
`min-[1180px]:group-data-[collapsed]/rail:opacity-0` **compile to nothing** in this setup. The class
names sit on the element, every static check passes, and the sidebar simply never changes state —
because the base class still applies, one of the two states looks perfectly correct.

So the two rules live in `globals.css`, keyed on a `data-collapsed` attribute React sets. No variant
stacking, no named group, nothing to compile wrongly, and a selector anybody can read.

*Also decided:* widths are CSS rather than a `useMediaQuery`, so the server renders the right sidebar
at every viewport with no hydration mismatch and no jump. JavaScript contributes the preference, not
the layout.

## Breadcrumbs wait for the sidebar to take over project switching

**Decided 2026-08-25, W6c.** `lib/breadcrumbs.ts` and `components/app/breadcrumbs.client.tsx` are
written and tested. The trail is **not mounted**, and that is the decision rather than an omission.

Measured at 1400px with it in the topbar: `Coditu` 22px, `MEINEvim` 73px, `Sprint — Week 17` 68px,
`COD-241` 40px — every crumb truncated, including a six-letter word.

The cause is not styling. The topbar already carries the **project switcher**, which names the same
project and the same sprint as crumbs two and three. Two controls saying one thing, and neither
fitting. The design has no such problem because its topbar has no switcher: project spaces live in
its sidebar, leaving the bar for breadcrumbs, presence, save state, search and New.

So the order of work is: the sidebar takes over project switching, the switcher leaves the topbar,
and the trail mounts into the room that makes. Mounting it early would ship a bar where the workspace
is twenty-two pixels wide, which is worse than no trail.

*What is done and proved:* every route this application has is asserted in
`tests/breadcrumbs.test.ts` — names not slugs, the last crumb inert, the slug as a fallback rather
than a gap, and nothing at all outside `/app`. Mounting is one line.

*Also settled in W6c:* ⌘K needed no work. The palette and its `Meta+K`/`Control+K` binding already
existed in `topbar.client.tsx`, with `aria-keyshortcuts` on the trigger.

## Project spaces are the sidebar's tree, and closed sprints are not in it

**Decided 2026-08-25, W6d.** The design's sidebar has a `Project spaces` section: every project as a
disclosure, its sprints and its component registry beneath. That is what lets the topbar stop
carrying a switcher, so it is a prerequisite for breadcrumbs rather than decoration on the way to
them.

Three things the prototype could not decide for us, because it had four toy projects and three toy
sprints:

- **Closed sprints are not in the tree.** MEINEvim has fifteen sprints and fourteen of them are
  closed. Listing them all would put a year of finished weeks in a 268px column, permanently, above
  the thing you came for. The tree lists sprints that are still `planned` or `active` — normally one
  — and the project's own row links to the page that has every one of them. `MAX_SPRINTS = 5` is the
  pathological case, and when it bites the tree says `All sprints · N` rather than truncating
  quietly.
- **The state chip is a state, not a sprint name.** Both alternatives were tried in a browser first.
  Naming the active sprint reads well for MEINEvim — `Week 17` — and then Converso's sprint is called
  *Converso review*, which crushes the project's name to `Converso das…`. Naming only the *active*
  one made the chip read `no sprint` directly above a row listing the sprint Converso has. So the
  chip is `active` / `planned` / `no sprint`, derived from the sprints this schema already has —
  never from the `status` column the prototype implies and `projects` does not have. It hides
  entirely while the space is open, where the rows beneath say it better and the name needs the 48px.
- **There is no Notes row**, though the design draws one. Sprint notes are a panel *inside* a sprint
  page with no address of their own; a row pointing at the sprint and calling itself Notes is a
  second name for the link directly above it.

*Two smaller calls, both about not lying to a screen reader.* The tree is `display: none` below
`--rail-wide` and while collapsed, rather than the `opacity: 0` the nav labels use — a label fades
because its icon survives and still needs a name, and a tree at 64px has no icon representation at
all. And `aria-current="page"` stays exactly one, which is a spec here: the nav owns it, and a space
row that *is* the open page gets `aria-current="true"` — the current item in this set, which is what
a tree row means and does not make the sidebar claim to be in two places.

*The disclosure's default is the URL, not a preference:* the project you are looking at is open and
the rest are shut, which is right on the server's first render with no storage at all. A space
somebody actually toggles is remembered per project from then on, under `coditu.space.<slug>`.

## Favourites and recents are deferred to W7, and not invented here

**Decided 2026-08-25, W6d.** The design's sidebar has three sections. This ships one of them. The
other two are deferred deliberately, and the reason is not effort.

**Favourites cannot be built correctly yet, because one of its three kinds does not exist.** The
prototype favourites are `Week 17 · peer review`, `COD-140` and `EVIM components` — a saved filter
view, a work item and a component registry. **Saved views are W7.** Building the table now means
either a schema that can hold two of the three kinds and needs migrating the moment W7 lands, or
inventing what a saved view is from a chip in a prototype. Both are worse than waiting one phase.

**Recents cannot be derived from anything this database records.** Every table here records a
*write* — a comment, a time entry, a revision. "Recently visited" is a read, and this application
deliberately stores no reads: `access_events` is the only table that would, and it is itself deferred
to W9 where People & Access gives it both a writer and a reader. Deriving recents from writes would
produce *recently edited*, which is a different list — it would never contain the payout page or a
component registry, which is half of what the design's recents are for.

So neither is faked with the prototype's sample data, and neither section is rendered empty. An empty
`Favourites` header is furniture that promises a feature; no header promises nothing.

*Order when they land:* favourites with W7's saved views, since that is what unblocks the schema —
one table keyed by `(profile_id, kind, target_id)`, with the star control on each favouritable
surface. Recents alongside W9's `access_events`, reading the same stream rather than opening a second
one. *This is a scheduling decision, not a scope cut.* Both remain in the plan.

## The switcher leaves the topbar, the trail arrives, and the search box moves to `xl`

**Decided 2026-08-25, W6e.** This settles *Breadcrumbs wait for the sidebar to take over project
switching* above. Project spaces shipped in W6d, so `components/app/project-switcher.client.tsx` is
**deleted** — nothing else imported it — and `<Breadcrumbs>` is mounted in its place.

The same four crumbs W6c measured at 1400px, re-measured with the switcher gone:

```
              W6c        W6e
Coditu        22px  →    37px   full
MEINEvim      73px  →   128px   full   (and it is "MEINEvim components" now)
Sprint — …    68px  →   104px   full
COD-241       40px  →    58px   full
```

Nothing is clipped, at 1024, 1180 or 1440, and `e2e/navigation.spec.ts` asserts that by measuring
`scrollWidth` against `clientWidth` on every crumb rather than by looking at it.

**What is left of the switcher is `activeProject` / `activeSprint`.** Export and New item still have
to know what is open; they derive it from the URL exactly as the switcher did, so removing the control
removed no behaviour.

### The search box moved from `sm` to `xl`, and the number is arithmetic rather than the ladder

Mounting the trail was not enough on its own. The ⌘K box is `max-w-[420px] flex-1` with the default
`min-width: auto`, which means it holds its whole placeholder and **the trail gives way instead** —
measured at 1024px with the switcher already gone: every crumb clipped, `Coditu` at 24px. The same bar
W6c refused to ship, arrived at from the other direction.

Two changes, both stated rather than automatic:

- `min-w-[140px]` replaces `min-width: auto`, which reverses who gives way: the placeholder ellipses
  first, and the trail keeps its natural width.
- The box appears at **`xl`** rather than `sm`. The bar's own arithmetic: the deepest route's trail is
  415px, the right-hand cluster 303, padding and gaps 79, and above 1180 the sidebar takes 268 — so a
  box with a usable minimum needs **1205px** before the trail starts losing letters. At `sm` it cost
  the trail exactly 20px at 1180 and clipped all four crumbs. Below `xl` the icon beside it is search,
  which is the same dialog and the same ⌘K.

### `lg` is where the trail starts, and that too is measured

Forced on at each width, on the deepest route:

```
1024   Coditu 37   MEINEvim components 128   nothing clipped
 900   Coditu 35   MEINEvim components 122   every crumb clipped
 768   Coditu 16   MEINEvim components  54   every crumb clipped
 390   Coditu 37   MEINEvim components   8   unreadable
```

Below `lg` the page's own `h1` says which screen and the sprint and item headers name their project,
so nothing is lost except the trail itself.

*The consequence to accept, stated plainly:* **below 768 there is no one-tap project switch any more.**
The sidebar is gone there and the trail is hidden, so switching is More → Projects → the project,
which is one tap more than the switcher was. That is what the design does, the destination is in the
overflow sheet already, and every screen still names its own project. If it proves annoying, project
spaces belong in the More sheet — not the switcher back in the bar.

*One thing that is now two rather than one:* `aria-current="page"` appears in the rail **and** on the
trail's last crumb. That is the ARIA breadcrumb pattern and it is correct — each navigation landmark
marks its own current item — but the W6 verification line reads "exactly one `aria-current='page'`"
and it should be read as *one per navigation*. The rail's own count is still asserted, scoped to
`aside`, by `e2e/rail.spec.ts`.

## The sort stack lives in the URL, and it is four keys wide

**Decided 2026-08-26, W7a/W7b.** `?sort=deadline:asc,status:desc`, read by `lib/sprint-sort.ts` and
applied **on the server** before the rows reach any component.

*Why the server:* the sprint is one query and all of it is already in memory, so the comparator costs
nothing there — and the table, the board and the stacked cards then receive the same order. Sorting
inside `sprint-table.client.tsx` would have sorted the table and left the cards below it in a
different order at the same URL, which is the sort of thing nobody notices until a phone screenshot
disagrees with a laptop.

*Why four keys:* legibility, not arithmetic. The header draws a numbered badge per key and a reader
has to be able to hold the sentence — "by deadline, then status, then assignee, then grouping" is
already the edge of it. It also bounds what a hand-edited `?sort=` can ask for.

*Unrecognised columns are dropped, never guessed*, exactly like `parseStatusFilter`: there is no sort
a wrong word could safely mean, and a stale link must not quietly reorder somebody's sprint.

### Missing is not a value, so it does not reverse

The prototype sorts nulls with a `"￿"` sentinel. That puts them last ascending and **first**
descending, so reversing a sort by deadline fills the top of the sprint with the stories that have no
deadline. Here `missing` is a flag compared *before* the direction is applied, so a row without a
deadline, an assignee, a reviewer, a grouping or a component stays at the bottom whichever way the
column points. Nobody sorts a column to find the rows that do not have it.

Same reasoning for **0/0 criteria**: a story with no acceptance criteria has no progress to compare,
which is not the same as 0% and must not sort as the least-finished work in the sprint. It is
missing.

`status` sorts by `STATUS_DISPLAY_ORDER` — the "what needs attention" order the board, the report and
the exports already use. Alphabetically, `blocked` would open the sprint and `in_progress` would sit
in the middle. `key` sorts by its **number**, because `COD-10` is not between `COD-1` and `COD-9`.

### A sort and a manual order cannot both be true

Drag-to-reorder writes `order_index`. While a sort is applied, what the reader sees does not come
from `order_index` — so a drag would write a position nothing on screen reflects, and the row would
jump back the moment the sort was cleared. That reads as a lost edit.

So sorting **pauses** the drag: no handles, no `DndContext`, and a line in the table saying why, with
`back to manual order` beside it. Said where the handles used to be rather than in a tooltip on a
control that is no longer there.

### The headers are `<button>`s because shift-click on a link opens a window

Not a preference. Shift-clicking an anchor is a browser binding — open in a new window — and it
cannot be prevented, so a link could never carry the stacking gesture the design asks for. Plain
click cycles the primary column `asc → desc → cleared`; shift-click appends, flips, then removes.

A plain click on a column already *in* the stack promotes it to the only sort, ascending. It does not
resume the cycle from wherever that column happened to sit, because then the same click would mean
different things depending on a stack the reader may not have open.

`aria-sort` goes on the **primary** column only: the attribute takes one value and a table has one
sort direction as far as the accessibility tree is concerned. A key further down says its position in
the button's own accessible name — *"Status, sorted ascending — 2 of 2"* — which is also what the
numbered badge beside it means.

### The click that has not landed yet is remembered

`router.replace` on a dynamic route is a server round trip, so the `sort` prop only changes when the
new render arrives. Clicking Deadline and then shift-clicking Status a moment later computed the
second toggle from an **empty** stack and silently dropped the deadline key — the faster somebody
built a sort, the more of it they lost. Found in a browser; no unit test could see it.

The table keeps the stack the last click *asked* for and toggles from that, reconciled during render
when the URL catches up. It is only ever the input to the next toggle: the headers and the rows both
still come from the server's `sort`, so nothing on screen is optimistic and there is nothing to roll
back.

## The other five filters live in a panel, and people are named by their initials

**Decided 2026-08-26, W7c.** Type, assignee, reviewer, grouping and free text join the status chips
and the component picker. `lib/sprint-filters.ts` owns the vocabulary and **one** predicate, because a
row the table shows and the footer's sum excludes is the bug this screen is judged on.

*Why a panel rather than more chips:* status is already eight chips and the component picker is a
control; four more dimensions inline wrap the toolbar to three rows at 1180px and push the table below
the fold. The design draws a `Filter` button with a count, and `DialogShell` is a centred dialog above
`md` and a **bottom sheet below it** — so the phone behaviour the plan's verification asks for costs
nothing.

*Why the text box is in the panel and not the bar:* ⌘K is how you *find* a story; `?q=` is how you
narrow the table you are already looking at. Two search boxes six inches apart meaning different
things is worse than one extra click. It is **submitted, not typed** — a URL write per keystroke is a
server render per keystroke, and the back button would hold every prefix of what somebody typed.

### `?assignee=MT` filters by initials, and says so

`profiles.initials` carries no unique constraint, so `MT` is not a person — it is two letters that may
in principle belong to two people. Rather than pretend otherwise, the filter **is** by initials: it
matches everybody whose initials are `MT`, which is exactly what the URL says and what the avatars in
the table show. A profile id would be unambiguous and unreadable, and a link nobody can read is a link
nobody pastes.

Initials belonging to nobody are kept rather than dropped: they match nothing, the table goes empty,
and that is visibly wrong — which is the right way round. The failure worth preventing is the
opposite one, a filter that quietly matches *more* than it says.

`none` is reserved and means the seat is empty. "What has no reviewer" is a question about a sprint.

*Free text is terms, not a phrase:* every word has to appear somewhere in the title or the
description, in any order. `kachel height` is a real search somebody types and a substring match on
the whole phrase finds nothing.

### An empty table has to explain itself

The table could already be emptied by the status and component filters and said nothing — a header
row, a sum of nothing, and no explanation, which reads as a broken page. Free text makes that state
easy to reach, so the design's empty state is built now: what happened, how many are in the sprint,
and a way back.

`clear the filters` clears every parameter that can **hide** a row and deliberately not `sort`, which
reorders and never hides. Clearing somebody's sort while saying "filters" would be doing something it
did not say.

## `DialogShell` portals to `document.body`, because `fixed` is not fixed

**Decided 2026-08-26, W7c.** `position: fixed` resolves against the nearest ancestor carrying a
`filter`, a `transform`, `backdrop-filter`, `contain` or a `will-change` naming one of them — not
against the viewport. `<Reveal>` sets **both** a transform and `filter: blur(0px)`, and `blur(0px)` is
a filter *value* rather than `none`, so that containing block survives the animation and never goes
away.

Mounting the filter panel inside the revealed toolbar therefore produced a scrim of **1046×65 pinned
to the filter bar** instead of one covering the screen. It rendered, it had `role="dialog"`, an
`aria-label` and a focus trap, axe was happy, and on screen it was a grey stripe. Every static check
passed.

Fixed in the primitive rather than at the call site: a modal that an ancestor can clip is always
wrong, whoever mounts it. `cell-popover.client.tsx` already portals for the same class of reason —
escaping the table's own scroll box — so this is the house answer applied one level up. Guarded by
`useMounted()` so the portal is never attempted on the server.

Verified against every dialog in the app: 198 specs across `new-item`, `export`, `components`,
`item-detail`, `trash`, `team`, `settings`, `mobile` and `a11y`, on three devices.

## A saved view stores the question, and the question is a query string

**Decided 2026-08-26, W7d.** `saved_views` per §5.5, and `spec` is a flat record of the parameters
the URL already carries — `status`, `component`, `match`, `type`, `assignee`, `reviewer`, `grouping`,
`q`, `sort`, `view`, `density`. Applying a view is a navigation; saving one is
`specFromSearch(location.search)`.

*Why not a shape of its own:* a saved view could re-express all of that as its own object, and then
there are two vocabularies to keep in step, two parsers, and a migration every time a filter is added.
As it is, a filter added later is saved and restored the day it is added, by adding one word to
`VIEW_PARAMS`.

*Never a row set — and the allowlist is what guarantees it, not a convention.* There is no key that
could hold a list of work items, so a view cannot be a stale snapshot of twelve stories and cannot
leak a row somebody may not read. What a view returns is recomputed by the same filters and the same
RLS as a URL typed by hand.

*Validated on read as well as on write*, because rows outlive the code that wrote them: a value
retired by a later rename, a key removed from the allowlist, a spec edited straight into the database.
An unusable spec opens the unfiltered sprint rather than throwing — a recoverable disappointment
beats a screen nobody can get past.

### Invariant 1 is a composite foreign key, not a trigger

A view belongs to a project and may also name a sprint. If it does, that sprint must belong to the
same project — otherwise a Nile view could point at EVIM's Week 17, which is the shape of leak
invariant 1 exists to prevent.

`sprints` gained `unique (id, project_id)` — redundant on its own — so `(sprint_id, project_id)` has
something to reference. A trigger could check the same thing; a foreign key cannot be forgotten.

### Who may change one: the owner, or an admin

The same rule as `edit own comment`, and for the same reason. A shared view sits in everybody's menu,
and an admin has to be able to take one down without waiting for its author to come back from leave.
Widening it further would let a lead rename somebody's private view, which is not a delivery decision.

There is no `if (owner_id === me)` in the actions. The policy already says it, so a write that is not
allowed matches **no row** — and the action reports that rather than re-deciding it.

*Saving twice under one name is an overwrite*, and the button says `Update “…”` before it is pressed.
The alternative is an error somebody resolves by inventing `Peer review queue 2`.

### `name_key`, because PostgREST cannot upsert onto an expression

The uniqueness rule is one name per person per project, case- and padding-insensitive. Expressed as a
unique index on `lower(btrim(name))` it is correct and **unusable**: PostgREST's `on_conflict` takes
column names, and an expression comes back as `42703 column "lower" does not exist` — which surfaces
in the UI as "that view could not be saved" and looks like a policy problem. A stored generated column
holds the same fold and can be named.

### The view control is a panel, not the dropdown the design draws

A `position: absolute` dropdown in the toolbar is trapped for the same reason the filter panel's scrim
was: `<Reveal>` sets a transform, which creates a stacking context, and `z-50` inside one cannot paint
above a *sibling* context later in the document — the table. The menu opened underneath the table.

`DialogShell` is already portalled and is already what the Filter control beside it opens, so the
toolbar's controls now open the same kind of surface — and it is a sheet on a phone, where a dropdown
would have been unusable anyway.

## The projects list filters on the server, and by a state no column holds

**Decided 2026-08-26, W8a.** `?q=evim&state=active,planned&archived=1`, read on the server, with the
rows that survive being the rows that render. The controls are the only JavaScript on the screen.

That is the **opposite** of the sprint table's split, and deliberately so. A sprint board re-sorts,
re-tints and re-sums a live table between renders, so its predicate has to be in the browser. A
project list is a page you arrive at, read once and click out of. It also matters beyond taste: §5's
total budget had **0.3 KB** of headroom after W7, so a screen that could ship no row-rendering
JavaScript should ship none. Measured after: **219.4 / 220**.

### The state is `active` / `planned` / `no sprint`, and it is derived

W6d settled this for the sidebar and W8a extends it to a *filter*: the design's `active` / `planning`
/ `paused` is a column `projects` does not have, and `paused` in particular is a statement about an
engagement — that a client has stopped paying attention — that no query can know. So:

- **active** — a sprint is running
- **planned** — no sprint is running, but one is scheduled
- **no sprint** — every sprint is closed, or there are none

`?state=paused` narrows by the states that *are* named rather than guessing at a fourth, which is the
same rule the status filter has had since W7: an unrecognised value is dropped, never approximated,
because an empty filter means "show everything" and quietly widening a shared link is worse than
showing nothing.

**The rule now lives in `lib/projects.ts`,** used by both the sidebar's chip and this list's. Two
copies would be two chances for the chip on `/app/projects` to disagree with the one six pixels to
its left in the sidebar, on the same screen, about the same project.

### Archived projects are rows in this list, not a list underneath it

They were a separate `Archived` section inside the admin panel, with their own shape and their own
restore button — which meant the search and the state chips could not see them, and an archived
project was somewhere else rather than somewhere later. It is one list behind `?archived=1` now, the
row carries an `archived` chip, and the row's own control restores it.

`is_archived` is deliberately **not** one of the state chips even though it is the only status column
`projects` actually has. It answers a different question: not "what is happening here" but "is this
still ours to look at".

*Found by moving it:* the admin panel's header counted `projects.length` as "live", and the moment
this page started passing it a list that included archived projects it read `5 live` with one of the
five archived. It takes two numbers now, because counting was the only thing it ever did with the
lists.

### `Recent activity` is bounded by days, and the column's name is the honest part

The obvious implementation — order every activity row by date, take the newest few hundred, group by
project — is wrong invisibly: a quiet project whose last event falls outside the window renders as
though nothing has ever happened on it. A window of **30 days** cannot do that. It can only ever mean
"nothing in the last thirty days", which is what the column is called and what the empty cell says.

`describeActivity` moved out of `item-detail.tsx` into `lib/activity.ts` for the same reason the state
rule moved: the wording is the only part of an activity row a reader ever sees, so two copies would be
two chances for this list to describe an event differently from the item it happened on.

## The project page's two columns start at 1400px, measured

**Decided 2026-08-26, W8b.** The design puts a 320px column beside the main one from 1180. That
number cannot survive here, because at 1180 the app's own sidebar has just widened to 268px — so the
page has 912, and a 320px aside would leave the sprint manager 568.

Forced on and measured, counting elements whose `scrollWidth` exceeds their `clientWidth`:

```
1280   main 606   many clipped — `Sprint — Week 16` renders 37px of the 119 it needs
1320   main 644   14 clipped
1360   main 683    7 clipped
1400   main 721    nothing clipped
```

So `min-[1400px]`, which keeps both columns on the 1440 laptop this team uses and stacks them below.
`xl` was the first attempt and shipped a sprint list whose names were fragments — the same failure
W6c refused to ship in the topbar, in a different place. `2xl` would have been the safe standard
choice and would have given the two columns up at exactly the width they work at.

*Verified the way `07-FIELD-NOTES.md` says an arbitrary variant has to be:* the served stylesheet
contains the `1400px` rule, and `e2e/project-home.spec.ts` asserts the computed
`grid-template-columns` on both sides of it. A variant that compiles to nothing leaves the class on
the element and every static check green.

## What earns the project page's right-hand column

**Decided 2026-08-26, W8b.** Four panels, and the rule for what goes in them is that they are about
the project rather than *in* it: the **views saved against it**, **who is on it**, **how much of it a
client can see**, and **what happened last**. Everything in the main column is the work itself.

- **Team is read from the seats on the work** — the assignees and reviewers on its items — because
  there is no membership table and inventing one would create a list somebody has to keep in step
  with reality. The empty state says exactly that rather than "no team".
- **Client access is a count and what it allows, never an address.** An outside person's name and
  email do not belong on a screen that gets shown in a stand-up; `/app/clients` is the screen that
  exists to manage them. A revoked grant is not access — `revoked_at is null` is the whole filter,
  and it matches the policy the portal itself reads through.
- **Saved views became possible one phase ago**, and this is the second place they surface. A view
  saved against a sprint goes to that sprint; one saved against the project follows whichever is
  running. Neither invents an address the reader cannot get back to, and a view whose sprint is gone
  is inert and says why.
- **The design's fifth panel, project pages, is not built.** There is no project-scoped document
  route to put in it, and a panel of links to nothing is furniture. Same reasoning as W6d's missing
  Notes row.

*Two different bounds on the same table, deliberately:* `listProjectOverviews` bounds activity by
**30 days**, because the list is asking "has anything happened lately" and a count-bound scan would
render a quiet project as though nothing ever had. This panel bounds by **count**, because "the last
few things" is a count by definition. The headings say which — `Recent activity` and `Latest
activity`.

## Favourites are private, and a pointer rather than a copy

**Decided 2026-08-26, W8c.** This closes the deferral W6d recorded. The design's three favourites are
a saved filter view, a work item and a component registry; saved views did not exist until W7, so
building the table then would have meant a schema that could hold two of its three kinds. It holds
all three now.

### Three columns, not one `target_id`

The obvious shape is `(kind, target_id)` and it is wrong here for the same reason `saved_views` chose
a composite foreign key over a trigger: a polymorphic id **cannot have a foreign key**, so deleting a
story would leave a favourite pointing at nothing and the sidebar would draw a row that goes nowhere.
Nobody would find out until they clicked it.

Three nullable columns, each with a real `on delete cascade`, and a check that exactly one is set.
Adding a fourth kind is one column, one FK and one term in the check — more typing than a polymorphic
id, and it cannot rot. pgTAP asserts both halves of the check and the cascade.

### Private, which is stricter than saved views

A favourite is readable, writable and deletable by exactly one person. Not shared, not visible to a
lead, not adjustable by an admin. That is deliberately stricter than `saved_views`, which has a shared
mode: a shared view is a team artefact, a favourite is furniture in one person's room, and there is no
operational reason for anybody else to see or move it. The negative pgTAP assertions are the point —
an admin's `select` returns nothing and their `delete` matches no row.

No `update` policy and no `update` grant. A favourite has nothing to change; it is inserted or deleted.

### The star is one component, on three surfaces

Item detail, component page, and the saved-view menu. One component rather than three near-identical
buttons, because three is three chances for the story's star to behave differently from the
component's. In the view menu it sits **outside** the `view.mine` branch that guards share and remove:
a shared view somebody else made is exactly the kind of thing worth keeping at the top of your own
sidebar.

### The links are resolved on the server, and the budget is why

`favouriteLinks` turns a starred row into an address — including the case that only shows up later, a
view with no sprint of its own following whichever one is running. Doing that in the sidebar component
put `lib/favourites` into the browser bundle and the app shell's §5 **total** to **220.4 of 220**. The
shell resolves them now and the client renders a finished list: **220.2**.

*Which is still 0.2 KB over §5's stated total, and this is the second phase running in which that
number has been the binding one.* The gate CI enforces is the route's **own** code — 80.2 of 110, with
30 KB of room — because 140 KB of the total is a framework floor this codebase cannot move. The known
lever is the one W1 measured and left on the list: the item-detail route shares the sprint page's
chunk group, worth **8.7 KB**. That is a phase of its own, not a line in this one.

## The chunk split W1 parked does not exist any more; two static imports did

**Decided 2026-08-26, W8d.** W1 measured 8.7 KB of item-detail code in the sprint page's chunk group
and left it on the list with a cause: a parallel route's `@modal` slot contributes its client
references to the segment even when the slot renders `null`. Going back for it, that is **no longer
true** on Next 16 / Turbopack.

Settled by stubbing the modal slot's page to `return null`, so nothing in the segment imported
`ItemDetailBody`, and rebuilding:

```
with the modal's item import   220.2 KB gz, 17 chunks
with it stubbed out            220.3 KB gz, 17 chunks
```

No change. Turbopack co-locates modules from sibling routes and the sprint page needs its half of the
shared chunk, so **route structure is not the lever**. The W1 note is corrected in
`07-FIELD-NOTES.md` rather than left to be re-derived.

**What was actually costing bytes was two static imports.** The topbar imported the export and
new-item dialogs at the top of the file and rendered them `{open ? … : null}` — the code on every
page, the markup on none. `next/dynamic` on both:

```
own    80.2 → 75.7 KB / 110
total  220.2 → 215.7 KB / 220 §5
```

So §5's total is **4.3 KB under** rather than 0.2 over, and W9 has room to work in.

The **command palette is deliberately not one of them.** It is the ⌘K surface, and a shortcut whose
first press starts a download instead of opening a dialog is a worse thing than 14 KB.

*The general rule this leaves behind:* a client component that renders something conditionally should
import it conditionally. `{open ? <Heavy /> : null}` with `import { Heavy }` at the top of the file
ships `Heavy` to every page that renders the parent.

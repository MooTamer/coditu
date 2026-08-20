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

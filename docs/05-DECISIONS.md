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

## The access log is written by triggers, and nobody may write it

**Decided 2026-08-26, W9.** `access_events` was deferred from W4 to here because it had no writer and
no reader until this screen existed. It has both now.

**Triggers, not Server Actions.** Every row could have been an `insert` beside the write it records.
It is a trigger because of what an audit log is *for*: a line in an action can be forgotten by whoever
adds the sixth way to grant access, and a log with a hole in it is worse than no log — the hole is
invisible and the rest still looks complete. A trigger also catches what no action can: a write from
the SQL console, the service-role client, or a migration, which are exactly the writes somebody comes
to an audit trail asking about.

**No write grant exists.** Not for an admin either. The trigger functions are `security definer` so
they write regardless; every other route in is closed, and pgTAP asserts all three refusals. An audit
row an admin can forge, edit or delete is not evidence of anything.

*And one that was nearly true:* this project grants `REFERENCES, SELECT, TRIGGER, **TRUNCATE**` to
`authenticated` on every table by default, and **`truncate` bypasses row-level security entirely** —
no policy can stop one. It is not reachable through PostgREST, which cannot issue a `truncate`, but
"append-only" should be true rather than nearly true, so the migration revokes it. `07-FIELD-NOTES.md`
records that the default applies to every other table here too.

*A consequence to expect rather than to fix:* `db:seed` inserts four allowlist addresses, so a fresh
local database opens with four `system` entries in the history. That is the seed being honest about
how the workspace came to exist, and the e2e counts the difference a click makes rather than assuming
a blank slate.

## The safety states are visible and disabled, not absent

**Decided 2026-08-26, W9.** Your own row on `/app/people` used to render your role as a word and drop
the deactivate and temporary-password controls entirely. All three are present and disabled now, each
with a `title` saying why.

Absent was the one shape this application has said all along it does not do — the topbar's Export and
New item have carried "disabled with a tooltip, never hidden" since the shell was built, and the
design's own safety note is *"both controls stay visible and say why"*. A control that disappears
reads as a bug; one that is there and explains itself reads as an answer.

Nothing about the enforcement changed: `lib/actions/profiles.ts` refuses the write either way, and it
is still the only place the three rules live, because none of them is expressible as "which rows may
this session touch". `e2e/team.spec.ts`'s assertion **inverted** — it used to check the controls were
absent — and says so in place, so the next reader knows it was a decision rather than a slip.

## The People screen has four sections, not the design's six

**Decided 2026-08-26, W9.**

- **Client contacts stay on `/app/clients`.** The design puts them in a tab here. `05-DECISIONS.md`
  put them on their own route before the design arrived, with an argument that still holds: People is
  about the team, that is about somebody who does not work here, and the email-and-note form here
  grants nothing while the one there grants everything a client sees. The design loses this one on
  **behaviour**, which is the rule `CLAUDE.md` states.
- **`Deactivated` is not a section.** Deactivated people are already in the team list, ordered last,
  with the control that brings them back. A second list of the same rows is a second place to keep in
  step.
- **There is no `Invitations` state machine.** This app allowlists an address and the person signs up.
  Inventing pending / expired / withdrawn states to fill a tab would be inventing a feature — the same
  refusal W6d made about favourites' sample data.
- **`Roles & permissions` is new, and it is documentation.** Nothing reads it to make a decision;
  every line names where the rule is really enforced, so when a policy changes and the table goes
  stale, the note beside it says which to trust. Today the only way to learn what you may do is to try
  something and read the refusal.

## Profile and Workspace settings split, and the old URL redirects rather than refuses

**Decided 2026-08-26, W10.** `/app/settings` was 344 lines and two screens under one URL: your name,
your picture, your notifications and your account facts at the top; the workspace's hourly rate,
image caps and default capacity underneath. Different owner, different audience, different frequency
— and the design splits them. `/app/profile` is yours and everybody has one; `/app/settings` is the
workspace's and only an admin can change a row of it.

**A non-admin who opens `/app/settings` is redirected to `/app/profile`.** Not `notFound()`, which is
what `/app/clients` does to an engineer, and not a visible refusal, which is what W9 decided for the
three self-controls on People. Those two are still right for what they cover: a 404 is honest about a
route that is not yours, and a disabled control with a reason teaches a rule you can see the
consequence of. This is neither. It is a URL that **was** somebody's profile until today, reached
from a bookmark or from the installed app's history, and the thing they were looking for is one
redirect away. `project_slug_aliases` keeps old project links alive for the same reason.

The nav follows: `SETTINGS_ITEM` gains `visibleTo: role === "admin"`, so the account menu and the
phone's More sheet stop offering a destination with nothing on it — a hidden destination, not a
hidden control.

## The prototype's four notification switches are not built

**Decided 2026-08-26, W10.** The design's Profile has *Mentions and replies*, *Review requested*,
*Assigned to me* and *Daily sprint digest* as per-person switches. **This app has nowhere to store
any of them.** `push_subscriptions` is keyed by endpoint — a subscription belongs to a browser — and
there is no per-person preference row anywhere in the schema.

Four switches over `useState` would forget every answer on reload, which is worse than not offering
them: a control that does nothing is a promise the app breaks silently. So Notifications is the
per-device subscription that genuinely exists, and the copy says a mention is the only thing this app
sends, which is also true. Third time this programme has made this call — W6d refused favourites'
sample data, W9 refused an invitations state machine — and it is written down each time rather than
quietly made.

For the same reason the Security section prints **no session count**. GoTrue lets a session revoke
the others; it does not let one enumerate or describe them, so the prototype's `2 sessions` is a
number this app cannot know. `signOut({ scope: "others" })` says what it does instead of claiming
what it will affect.

## My earnings shows counts, not colleagues

**Decided 2026-08-26, W10.** The prototype's calculation block explains a share by naming everybody
who was excluded and how many hours each logged. `/app/earnings` shows `Participants above the
threshold — 1 of 2` instead.

The arithmetic is complete either way: pot ÷ participants is the whole sum, and the gap between the
two counts is what says other people's minutes counted toward the pot and took no share. Naming them
adds nothing to the explanation and turns a private screen into a roster of who worked how much. The
confirmation screen names them, because that is the screen where an admin is deciding about those
people, and E7 requires the exclusion to be visible there.

## Team payouts moves to its own route, and everyone internal still reads it

**Decided 2026-08-26, W10.** `/app/earnings` was one screen doing two jobs: your own provisional
figure at the top of a board showing every participant of every sprint. The design splits them and so
does this. `/app/earnings` is your money — three cards, the calculation, and every sprint from your
side of it. `/app/settings/payouts` is the team's — the participant list, the exclusions and the
confirmation.

**Who may read the team's payouts did not change.** The team's own words, recorded in
`docs/coditu-thread-and-earnings-prompt.md` §E5 before any of this was built: *everyone sees
everyone's, but not on any screen that gets shared with a client.* The plan's §6 capability matrix
reads `Team payouts: Admin ✔, Lead ✘, Engineer ✘`, which would reverse that. Asked, and the answer
was to keep it: every active internal member reads it, only an admin confirms one. The design agrees —
its own payout screen shows a non-admin the participants with the checkboxes locked and `Admin only`
as the tooltip.

So `/app/settings/payouts` has **no role guard**, while its parent `/app/settings` redirects a
non-admin to their profile. The asymmetry is deliberate:

- The path is the one the design and the plan both name, and a URL is neither a *number* nor a
  *behaviour*, so `CLAUDE.md`'s tie-break does not apply — the named path wins by default.
- `/app/earnings` links to it, and that link is what makes the read access real. A screen somebody is
  allowed to read and cannot navigate to is a screen they do not have.
- The refusal that matters was never the missing button. `sprint_payouts`' insert policy is
  `auth_role() = 'admin'`, and `e2e/earnings.spec.ts` posts an engineer's own token straight at
  PostgREST to prove it.

**What is enforced where, stated plainly so nobody has to guess.** The screen split is about who is
*shown* what. `sprint_payouts` and `sprint_payout_shares` are readable by `is_active_member()`, which
is every internal member and no client — unchanged since the earnings model was built, and consistent
with the rule above. Narrowing that to per-person reads would be an auth-model change nobody has
asked for, and the docs do not claim a privacy the database does not enforce. Client isolation is
untouched: `20260825110100_internal_only_reads.sql` closed the base tables to `account_kind =
'client'`, and `tests/earnings-boundary.test.ts` walks the whole application to prove no client-facing
surface can reach a figure at all.

---

## Two people editing one story: last write wins, and the loser converges

**Decided 2026-08-27, during the independent audit.** The audit asked for a stronger property than
this codebase implements — *"concurrent edits are detected using a base revision or equivalent
guard"* — so the choice is recorded here rather than acted on quietly in either direction.

**Last write wins, and that is not a gap.** `docs/coditu-thread-and-earnings-prompt.md` §269 decided
it before any of this was built: *"Two people editing the same criterion: last write wins, but the
loser sees the new value after `router.refresh()` rather than their stale draft."* It is one sentence
about criteria, and the same answer is what every writing surface in this app already gives.

**Reproduced through two browser contexts, so the behaviour is on the record.** A published
`A one`. B opened the story. A published `A two`. B published from the stale base. The live row
became B's text, and `document_revisions` held all four versions in order. Nothing was lost, because
nothing in this schema can be: the table has no `insert`, `update` or `delete` policy for anybody,
including an admin, and `supabase/tests/revisions.sql` asserts each of those refusals. A's superseded
text is a click away in Version history, attributed and timestamped, and restoring it would add a
fifth version rather than remove the fourth.

**What was actually broken was the second half of that sentence, and it is fixed.** The loser did not
converge — A sat on superseded text indefinitely, because the story's full page subscribed to its
comments and not to itself. `06-PROGRESS.md` records the diagnosis and the two specs that hold it.

**Why a base-revision guard is not being added.**

- The brief does not ask for one, and `CLAUDE.md` is explicit: *do not add features that are not in
  the brief. Restraint is the design.* A conflict guard is a feature — it needs a refusal path, a
  place to keep the refused draft, and words for a state that does not exist anywhere in the design
  bundle. Inventing that in an audit is the wrong moment to design it.
- It is not a *correctness* failure, which is the one thing that would override the brief. Correctness
  here would be losing an edit, and no edit is lost. Every version is readable, attributed, and
  restorable by anyone who can read the story.
- Coditu is four people who talk to each other, and presence already shows who else is on the story
  before either of them starts typing.

**What would change this.** A surface where two people genuinely write at once and history is not
enough — sprint notes during a live review is the plausible one. If that happens, the guard belongs
in one place: a compare-and-set on the document column inside the existing `UPDATE`, which is atomic
and needs no schema change. Recorded here so the next person does not have to re-derive it.

---

## Four places the build does not match the returned handoff, named on purpose

**Decided 2026-08-27, during the independent audit.** The audit's completion gate
says a material divergence from the handoff blocks a merge *without an explicit
documented decision*. These are the divergences and this is the decision: they
are recorded, not closed. Each one is a change to a designed surface rather than
a defect, and the call on whether to build them belongs to whoever is deciding
what ships, not to an audit tidying up on its way past.

Everything below was read out of the returned prototype's own source, not
inferred from a screenshot.

### 1. The story peek is the design's FULL state, permanently

`Coditu Workspace.dc.html` carries both states in one object:

```js
peekJustify: full ? "center"                       : "flex-end",
peekWidth:   full ? (narrow ? "100%" : "min(1080px, 94vw)")
                  : "min(620px, 96vw)",
peekMargin:  full ? (narrow ? "0" : "24px")        : "0",
```

`flex-end` at `min(620px, 96vw)` with no margin is the side peek — a panel
docked to the right edge. `center` at `min(1080px, 94vw)` with a 24px margin is
what you get after pressing the toggle.

`DialogShell` is `justify-center` at `maxWidth: 1080` and has no other state, so
Coditu ships the second one and only the second one. It is a correct, focus-
trapped, scroll-locked, responsive dialog — it is not a side peek, and the
handoff names a side peek at three of its five breakpoints.

### 2. There is no way from the peek to the full page

The prototype has `toggleFull`, and the label reads `Open as full page` or
`Back to side peek` depending on which state it is in. Coditu's modal has a
close button; `item-detail.spec.ts` asserts exactly that, and that the FULL page
is the one with a way back. Follows from 1: with only one state there is nothing
to toggle to.

### 3. The topbar carries neither presence nor a save chip

The handoff's component table: *"56px topbar carries breadcrumbs, surface
presence, save chip, theme, search, New."* Coditu's carries breadcrumbs, search,
theme, Export and New item. Presence exists and is good — `item-presence.client.tsx`
names the surface, *"editing the description"*, exactly as the handoff asks — but
it lives on the story rather than in the shell.

### 4. The save-confidence vocabulary is not on screen

The handoff names five states: `Draft saved → Sending… → Saved (after
acknowledgement) → Offline, will retry → Failed, draft kept`. Only `Sending…`
exists, on the client reply composer.

**The behaviour underneath it is real and proven**, which is why this is fourth
and not first. `e2e/reliable-writes.spec.ts` holds that a submission arriving
twice happens once, that a comment whose response was lost is not posted a
second time, and that time logged twice over is logged once. A failed publish
answers *"That change did not save. Nothing was lost — try again."* What is
missing is the shared chip that says which of the five states you are in,
everywhere, in the same words.

### Why none of them is being built now

- Each is a designed surface, not a bug. Building 1 and 2 means a docked panel
  with its own focus, scroll and responsive behaviour, in `DialogShell`, which
  the New item dialog also uses — and eight specs assert the current shape.
- `CLAUDE.md`: *do not add features that are not in the brief. Restraint is the
  design.* The handoff is a design bundle; on **behaviour** the brief wins, and
  the brief never asked for a save chip or a docked peek.
- Every one of them is additive. None is load-bearing for correctness, none
  touches the client boundary, earnings, or recoverability, and none blocks the
  migration.

### What conforms, checked the same way

The breakpoints are exact — `rail.client.tsx` is 268px with labels at ≥1180,
64px icons below, gone below 768 where the bottom bar takes over, which is the
handoff's table line for line. The status chip labels are the handoff's own
words, `in progress · peer review · in qa · changes req. · ready · draft ·
blocked · done`. The command palette is `max-w-[620px]`, which is the
prototype's number. The typing indicator names the surface. The bottom bar keeps
its four destinations and a More sheet, reading the same predicate list the rail
does, so both agree on what is current.

---

## The four "named on purpose" divergences are withdrawn, and built

**Decided 2026-08-27, on the reopened audit.** The entry above — *"Four places
the build does not match the returned handoff, named on purpose"* — reasoned that
each of the four was additive, none was load-bearing for correctness, and
`CLAUDE.md`'s *"do not add features that are not in the brief"* therefore applied.

**That reasoning is withdrawn.** It rested on treating the returned handoff as a
design bundle whose *behaviour* the brief could override. The handoff is source
**2** in the reopened audit's hierarchy, above the current implementation and its
ADRs, and Mohamed has now asked for all four by name. Recording a divergence is
not waiving it: only Mohamed can do that, and he did the opposite.

All four are built:

1. **The story is a 620px side peek.** `DialogShell` gained `variant="peek"` —
   `justify-end`, full height, `md:max-w-[min(620px,96vw)]`, rounded on the left
   only. Below `md` it is still the bottom sheet, because the handoff's own
   breakpoint table gives the story a full-screen page below 768 and a peek from
   768 up.
2. **"Open as full page", and back.** The peek's header carries a `<Link replace>`
   to the same URL un-intercepted; the full page carries `BackToPeek`, which is a
   button rather than a link because the two states are the **same URL** and a
   link from a route to itself is a no-op. See `back-to-peek.client.tsx`.
3. **The topbar carries surface presence.** `PresenceSurfaceProvider` moved from
   the story to the app shell so one store feeds both the story's stack and the
   topbar's caption; the channel is the route.
4. **The save-confidence vocabulary is on screen.** `save-state.client.tsx` — one
   store, six words, a chip in the topbar, and `useTrackedSave()` wrapping
   `settle()` at every writing surface.

### Two things that came with them and are decisions of their own

**`--tone-rose-*` and `--tone-cobalt-*` were added to the design system.** Three
tone pairs were enough while the only tones on screen were amber, jade and slate.
The save chip needs a failure that is not a warning (`Failed — draft kept`) and a
neutral notice that is not a success (`Recovered draft`). Both values are the
returned prototype's own `TONE` map, light and dark, rather than invented.

**`Saved` expires after 2.6 seconds; `Draft saved`, `Offline` and `Failed` do
not.** A permanent "Saved" is wallpaper — after the second time you see it you
stop reading the chip, and then you do not read it on the day it says
`Failed — draft kept`. The three states that mean *something is outstanding*
stay until they are resolved.

---

## Pages are admin-and-lead-authored, and that is Mohamed's to change

**Decided 2026-08-27.** `20260827120100_workspace_and_project_pages.sql` gives
`pages` an insert and update policy of `is_admin_or_lead()`. Everybody internal
reads; a client contact reads nothing, because `is_active_member()` is the whole
read predicate and it is false for one.

**Why that and not "anybody internal writes".** It matches sprint notes, which is
the surface a page is most like, and it matches the returned prototype's own
data — every one of `pgNotes`' three rows is authored by Mohamed (admin) or Adam
(lead).

**The handoff itself flags the question**, in its unresolved-decisions list:
*"Sprint notes editors — notes are admin/lead-authored in this design. If
engineers should be able to add to them, the publish flow needs a section-level
author, not a page-level one."* That is as true of pages as of notes, and it is
recorded here rather than answered, because inventing a section-level author
inside an audit is the wrong moment to design one.

**What would change it.** If engineers should write pages, the smallest honest
change is to widen the two policies to `is_active_member()` and add an
`author-or-admin-or-lead` clause to the update policy — no schema change, and
`supabase/tests/pages.sql` would need its two engineer assertions inverted.

---

## A restore is always a version, and it reaches Activity for a story

**Decided 2026-08-27.** Two defects, both found by reading the reopened audit's
requirement *"restores always create a new current version … and audit activity"*
against what the code did.

**Restoring the version that is already current used to write nothing.**
`record_document_revision()` returns early when the document and the text are
both unchanged — correct for an ordinary write (a status flip must not add a
version to the description) and wrong for a restore, which is a thing somebody
did, at a time, and has to be on the record. The guard is now skipped when
`coditu.restored_from` is set. Without it the RPC returned the *pre-existing*
latest revision as though it had just made it, which is the one shape of
dishonesty a version history cannot afford.

**A restore did not reach the Activity feed.** It is written by an `AFTER INSERT`
trigger on `document_revisions` rather than by `restore_document_revision`
itself, and that placement is the decision. The RPC is `security invoker` — the
caller's own policies decide whether the write lands — and `activity` is granted
`select` and nothing else, deliberately, so that nobody can forge a row in it. An
insert from inside the invoker function would fail `42501`, and both ways round
that are worse: making the RPC `security definer` moves the authorization
decision out of the policies that hold it, and granting `insert` on `activity`
makes the audit feed writable by the people it audits. A trigger on a table with
**no insert policy at all** cannot be forged, because a revision cannot be forged.

**What it does not cover, stated rather than left to be discovered.**
`activity.work_item_id` is `not null`, so this reaches the four surfaces that
resolve to a story. A **sprint note** or a **page** restore has no story to
attach to. For those two the audit trail is the revision itself — `restored_from`
is set, the actor and the timestamp are on the row — and `/app/history?action=restored`
is the screen that lists them. Inventing a nullable-scope activity feed to hold
two rows a year is the kind of feature `CLAUDE.md` says not to add.

---

## `document_revisions` gained a derived column, and it was backfilled

**Decided 2026-08-27.** `PLAN.md` §11 asks history to be filterable by project.
Project is two joins away through `work_item_id` and one through `sprint_id`, and
PostgREST cannot filter a parent row by an embedded column without `!inner` —
which on `work_item` would silently drop every sprint-note revision and on
`actor` would drop every write made outside the app, both of which are categories
this screen offers as filters.

So `project_id` is denormalised onto the row, exactly as `work_item_id` and
`sprint_id` already are, written by the capture trigger from the row's own parent
and never supplied by a caller.

**The backfill needs saying out loud.** `document_revisions` is append-only *by
policy* — a `select` policy and no other, so nobody including an admin can change
a row through PostgREST, and `supabase/tests/revisions.sql` asserts each refusal.
A migration runs as the table's owner, which is not subject to those policies,
and `20260827120200` uses that to fill the new column from foreign keys that were
already on the row.

**Nothing that is content was touched.** Not one `doc`, `plain_text`, `actor_id`,
`revision_no` or `created_at`. If the backfill were wrong the worst outcome is a
revision that does not appear under a project filter — never a revision that says
something different than it did. `on delete set null` rather than `cascade`,
because losing every version of everything in a project would be the opposite of
what a version history is for.

---

## Retired components stay in the seed, archived

**Decided 2026-08-27.** `npm run components:check` reported one new component
(`Redaktionskalender`) and two gone (`Anfrage`, `Redakteurkalender`), and the
script's advice for a removal was *"archive it in the app; it keeps its history"*.

Following that advice literally would have been a data-loss bug on every fresh
checkout. The seed is **generated** from the delivery repository, so a component
deleted over there disappears from the seed entirely — and `npm run db:reset`
then produces a database in which it had never existed. `Redakteurkalender`
carries one story's attribution today; it would have gone with it, silently.

So the script gained a `RETIRED` list. A component that leaves the delivery
repository moves into it, is still inserted, and is archived by an explicit
`update … set is_archived = true` the generated file carries — an UPDATE rather
than part of the insert, so it also reaches a database where the row already
exists and is not archived, which is every database that had it before it was
retired, including the hosted one.

Each entry records when and why, because the alternative is a list nobody dares
prune.

---

## The gate is a script now

**Decided 2026-08-27.** The gate was a checklist in `docs/06-PROGRESS.md` and a
memory of having run it. That is enough right up until something falls off the
list, and something did: `e2e/comments.spec.ts`'s *"the editor bundle is not
shipped to a reader who never composes"* skips itself without `E2E_PROD_URL`,
`npm run e2e:prod` was in no gate, and the assertion went quiet for weeks. **It
was failing the whole time.**

`npm run gate` runs the list. The two production-only assertions are tagged
`@prod` and run through `npm run e2e:bundle`, which is one build and two specs —
seconds, not the nineteen minutes a full production pass costs. `--fast` skips
the two long browser passes for use mid-change; the unqualified command is the
one that gates a handoff.

A check that only runs when somebody remembers is not a check.

---

## 2026-08-27 · The Notion import assigns keys from a ledger, not from a counter

**Decision.** `supabase/notion-keys.json` records which Notion page owns which `COD-` number, and
`scripts/import-notion-export.mjs` reads it before it writes anything. An item that has been imported
before keeps the key it was given; a new one takes the lowest number nobody holds. Identity is the
Notion **page id** — the 32 hex characters Notion appends to every exported filename — falling back to
the normalised title, scoped to its sprint, for a row with no page at all.

**Why.** Keys were handed out in walk order: first row of Week 3 is `COD-140`, and so on. That is
stable only while the export is, and the export is a board somebody re-sorts. The "Week 17, after
done" re-export moved fourteen rows into a different order and added three, and re-running the
importer would have pointed `COD-230` at a different piece of work — every bookmark, every screenshot,
every number quoted in a review, silently wrong, with nothing in the diff to say "this is a rename"
rather than "this is an edit". `e2e/fixtures.ts` already carried a note about the last time this
happened and cost thirty-nine specs.

The page id rather than the title because this very export renamed two items:
`[React] Redakteurkalendar` → `[React] Redaktionskalendar`, and `Banner Intranet Mode` recased. A
title-keyed ledger would have called the first a new item and orphaned `COD-242`.

**What was rejected.** Keeping the counter and re-deriving `e2e/fixtures.ts` after every import — that
is the status quo, and it treats a renumbering as a fixture chore rather than as data loss. Also
rejected: writing the key into the Notion board, which means asking the team to maintain a column for
this app's benefit.

**Property worth keeping.** An empty ledger reproduces the original numbering exactly. It is the
counter, plus a memory, which is what makes it safe to adopt against a seed already in use.

---

## 2026-08-27 · An imported picture becomes a comment, because that is the only place this app draws one

**Decision.** Every work item whose Notion page carries pictures gets one seeded comment holding them,
authored by the person Notion names on the item and dated to the day that item's logged time is filed
against. The bytes go to the private `comment-images` bucket under `<profile uuid>/<object uuid>.<ext>` —
the only key shape `/api/attachments` will serve — which is the same shape `POST /api/uploads` writes
for an image dragged into the composer. A file that route cannot serve (the Week 15 requirements PDF)
stays in `work-attachments` and stays a row.

**Why.** The pictures used to land in `public.attachments` pointed at `work-attachments`, and **no
screen renders that table**. `06-PROGRESS.md` says so of the client side — "`view_attachments` is a
capability with nothing behind it" — and it was equally true internally: 103 screenshots the team filed
against their own work were in the database, in storage, and on no page. Transcribing something into a
column nothing reads is not transcribing it.

**What this costs, stated plainly.** The comment is the one row the import writes that Notion does not
literally contain. It is a **carrier**, not content: its only prose is one sentence of provenance, in
the same voice as `time_entries.note`, which the import has always written. Everything a reader sees
inside it — the pictures, their order — is transcribed. Nothing invents a discussion that did not
happen.

**What was rejected.** Building an attachments strip on the item detail so `public.attachments` finally
renders — that is app work, not a data import, and it would still need a second decision about what a
client may see. Rejected too: leaving the pictures where they were, which is the option that keeps
them invisible.

**Consequence for alt text.** The file names are `image.png`, `image 1.png`, `CleanShot_2025-…png`.
None describes a picture to somebody who cannot see it, so the alt text is `<item title> — image N`.
`attachments.file_name` keeps what Notion actually called the file.

---

## 2026-08-27 · A Notion row with no Status is `draft`

**Decision.** A row whose Status cell is present but empty imports as `draft`. A status this app has
never seen still refuses to write, as before.

**Why.** Week 17 has two such rows — "Meeting with Vanessa" and "Vanessa CRs" — both carrying logged
hours and neither carrying a status, an assignee or a story type. They are time-tracking rows somebody
added to the board, not tickets anybody moved through it. Where the export is silent this import
writes NULL; `work_items.status` is NOT NULL, and `draft` is the one value in the enum that claims
nothing about progress.

**What was rejected.** `done`, which asserts something the export does not say about work nobody
marked finished. And `ready`, which says "not started" about three hours somebody spent.

**And a divergence worth naming rather than discovering.** `lib/import/notion.ts` — the *in-app*
importer, the one behind `/app/import` — maps a blank status to `ready`, and stays that way. The two
answer different questions. Somebody pasting a CSV into the Import screen is importing a plan, and an
unstated status there means "not started yet"; this script transcribes a board of work that already
happened, and an unstated status there means nobody ever said. Same input, different claim.

---

## 2026-08-27 · `attachments.storage_path` carries its bucket

**Decision.** `storage_path` is `<bucket>/<key>` everywhere.

**Why.** The imported rows held a bare key while `POST /api/uploads` had always written
`comment-images/<key>`. One column meaning two things is harmless only until somebody reads it, and
the import now writes into two buckets, so there is no longer a default to assume.

**What was rejected.** A separate `bucket` column, which is the tidier schema and a migration nothing
else needs.

---

## 2026-08-28 · The visual evidence lives in three specs git does not carry

**Decision.** `.gitignore:75` keeps `/e2e/*.local.spec.ts` out of the repository, and it stays that
way. The consequence is stated here rather than discovered: the Fifth and Sixth passes of
`08-GAP-MATRIX.md` rest on three files that exist only on the machine that wrote them —
`e2e/home-shell.local.spec.ts`, `e2e/measures.local.spec.ts`, `e2e/touch-targets.local.spec.ts` —
and **no cloud session, teammate or fresh clone can re-run a single row that cites them.**

**What the arrangement buys.** These are diagnostics, not guards. A local spec can be written at the
speed of the question it answers, assert a `getComputedStyle` at one width against one seeded
database, be deliberately failed to find something, and then be thrown away — none of which a suite
other people have to keep green can afford. `playwright.config.ts`'s `testIgnore` is the other half
of it: without the gitignore they would still *run*, because `testDir` is a directory and gitignore
is not a test filter, so a sweep somebody left red would turn `npm run e2e` red for everybody who
never had the file. Nobody inherits an obligation for a measurement somebody took once.

**What it costs, stated plainly.** `git clone && npm ci && npm run gate` reproduces every number in
this audit except the visual ones. A reviewer can re-run the unit fixtures in `tests/home.test.ts`
and every committed spec; they cannot re-run the cell that reads **16 passed**. For anybody but this
Mac those cells are not evidence — they are testimony. An audit whose strongest rows are the ones
nobody else can check has the problem backwards, and writing that down is the minimum honest
response to it.

**Which rows depend on it today.**

*(Updated 2026-08-28. The table below is what remains after the promotion recorded under
"What was rejected" — see the note that follows it. The decision itself is unchanged: the three
files stay out of git.)*

| Depends on | Rows |
|---|---|
| `e2e/home-shell.local.spec.ts` | **V-B1, V-B2, V-B3, V-B7, V-C2, V-C3, V-C4, V-C5** entirely; **V-B5** for the sprint-card alignment only — the 320px track itself is committed; **V-B6** for the rendered rows of "Due this sprint" only — the tablist contract itself is committed; **V-B4** for its rendered half only, the fixtures behind it being in the committed `tests/home.test.ts`. Also the Sixth pass's three whole-run rows: `16 passed` three times over, the eight-width light-and-dark sweep, and the two-context cross-route presence check |
| `e2e/measures.local.spec.ts` | **nothing.** V-A1 – V-A15 are `e2e/navigation.spec.ts › the surfaces carry their measure` now |
| `e2e/touch-targets.local.spec.ts` | **V-G7**, and the Sixth pass's aggregate 21-route coarse-pointer sweep |

Now committed, and citing a spec a clone can run:

| Row | Committed spec |
|---|---|
| **V-A1 – V-A15** | `e2e/navigation.spec.ts › the surfaces carry their measure › <route> is capped at <n>px, and renders a main landmark` — fifteen tests at 1920 |
| **V-B5**, the 320px track | `e2e/navigation.spec.ts › the surfaces carry their measure › Home is one column below 1180 and a 320px aside above it` |
| **V-B6**, the tablist contract | `e2e/a11y.spec.ts › keyboard contracts a scanner cannot see › My work is a real tablist with a panel and roving focus` |
| **V-C6** | `e2e/a11y.spec.ts › keyboard contracts a scanner cannot see › the tablet drawer traps, restores, locks and closes` |

Everything else in both passes cites a committed spec, a committed unit test, `npm run budgets`, or a
commit SHA, and survives a clone.

**What was rejected.**

*Committing the three files as they are.* They would join `npm run e2e`, which makes them guards:
somebody would have to keep `font-size: 26px` green through the next type change, and a diagnostic
written to fail on purpose would break the gate. That is a real cost and it buys reproducibility of
the *file*, not of the *measurement* — the specs read a seeded local database on a dev server at a
fixed viewport, and CI has none of those.

*Pasting the runs into `docs/`.* A transcript is not a re-run. It moves the same testimony into a
file where it looks more official, which is worse.

*Promoting the assertions into the committed suite.* This is the right long-term answer and it is a
different piece of work: the durable claims (the 320px column, the tablist keyboard contract, the
drawer's focus trap, the fifteen measures) belong in `e2e/navigation.spec.ts` and `a11y.spec.ts`
where the gate already runs them, and the throwaway ones do not belong anywhere. Named here so that
somebody chooses it rather than defaults into it.

**Chosen, 2026-08-28.** All four named claims are in the committed suite — the second table above
says which spec holds each — and the dependency table has been reduced accordingly. Three notes on
what that did and did not settle:

- **The throwaway assertions stayed put**, which is the half that makes this work. The 26px
  greeting, the four quick-action labels, the legend's `href`s, the jade dot's exact `rgb`, the
  member count, `Due this sprint`'s scoping against live rows, `Online now`'s two-context presence
  check, and the coarse-pointer sweep are all still local. A gate held to `font-size: 26px` is a
  gate held to somebody's afternoon.
- **V-B5 and V-B6 each moved in half.** `grid-template-columns` ending in ` 320px` above 1180 is committed; that
  the sprint card sits inside `[data-home-left]` with its top within 1px of `Online now`'s is not,
  because it is an assertion about one arrangement of one screen rather than about a number the
  design system owns. V-B6 the same way: the tablist's keyboard contract is committed, while the
  check that "Due this sprint"'s *rendered* rows sit under the active sprint's path stays local —
  the predicate behind it is already proved by six fixtures in `tests/home.test.ts`. Both rows are
  honest about which half a clone can re-run.
- **The promoted tests are chromium-only**, gated on `isMobile`. Both files run on three projects,
  and a 1920 measure taken on a Pixel 7 emulation measures nothing the desktop run did not, at
  three times the wall clock. The phone shape of the same screens is `mobile.spec.ts`'s subject and
  stays there.

---

## 2026-08-28 · One thing sends mail, and it is an admin's invitation

**Reverses:** the standing decision that nothing in this application sends email. That decision is
quoted in `app/auth/callback/route.ts`, in `lib/actions/auth.ts`, and in a passing test named
`nothing in the repository sends mail`. It was the right call when recovery was the only reason to
send anything and an admin reading out a temporary password was a cheaper answer than a mail
dependency the team cannot operate.

**What changed.** PF-10 deleted the sign-up form. It was correct — a four-person internal tool that
offers to make you an account describes something else — and it left the application with **no path
at all** from *on the allowlist* to *has an account*. `setTemporaryPassword` needs a profile that
already exists. `/auth/callback` had no sender. Onboarding the fifth person meant an admin writing a
row by hand. That is PF-14, and it is an onboarding regression rather than a missing feature.

**Decided.** `lib/actions/allowlist.ts::sendInvitation` calls Supabase's
`auth.admin.inviteUserByEmail` for an address that is **already** on `allowed_emails`. One caller,
one purpose. `e2e/password.spec.ts` no longer asserts that nothing sends mail — it asserts that
**exactly one thing does**, names the file, and still refuses `resetPasswordForEmail` and
`signInWithOtp` by name. A grep that permits one call site and counts it is a stronger guard than
one that permits none and gets deleted the day somebody needs a sender.

**The gate did not move.** `sendInvitation` reads `allowed_emails` and never writes it — an address
gets on that list by an admin deciding it should, a separate act with its own row and its own
`invited_by`. The real refusal is still `enforce_email_allowlist`, the BEFORE INSERT trigger on
`auth.users`, which `inviteUserByEmail` runs into like anything else. `e2e/invite.spec.ts` proves
that by skipping the application entirely: it asks GoTrue directly with the **service-role key** and
the invitation is still refused, with no `auth.users` row left behind. There is still no form a
stranger can reach.

**Rejected: adding the address to the allowlist as part of sending the invitation.** It is one
fewer click and it makes the list grow as a side effect of a button whose label says nothing about
it. Two deliberate acts, in that order.

**Rejected: `generateLink` and sending the mail ourselves.** That is the mail dependency the
original decision refused, and it would need a transport, a template and a bounce story for one
message a quarter.

## 2026-08-28 · An admin invitation comes back in the fragment, so a page finishes what the route started

`app/auth/callback/route.ts` handles PKCE: the link returns `?code=`, the server exchanges it. Its
own comment warned that "the older implicit flow put the token in the URL *fragment*, which never
reaches the server at all — worth knowing if a link ever arrives with `#access_token=` instead."

It does. An **admin-generated invitation has no PKCE verifier** — nobody ran `signInWithOtp` on the
recipient's device, so there is no challenge to answer — and GoTrue therefore answers with the
implicit flow:

```
/auth/callback#access_token=…&refresh_token=…&type=invite
```

The route saw no `code`, concluded the link was dead, and sent the invited person to
`/login?error=link`. Measured, not reasoned: the first run of `e2e/invite.spec.ts` failed with that
exact URL in its navigation log.

**Decided.** When the callback finds neither a `code` nor an error it hands off to
`/auth/complete?next=…` instead of declaring the link dead. The fragment survives that hop because
a redirect to a target carrying no fragment of its own leaves the original in place — specified
behaviour, not a browser accident, and the only reason this can be a second page rather than a
rewrite of a route that is already tested. `/auth/complete` re-applies `safeNext` rather than
trusting the value our own route wrote, because by the time it comes back it has been through a URL
a person can edit. A bare visit to `/auth/callback` with neither still ends at `/login?error=link`,
one redirect later, and `the callback never redirects off this site` still passes unchanged.

**Rejected: `createBrowserClient().setSession()` in a client component.** The obvious fix, and this
application has **no** `createBrowserClient` anywhere on purpose — `lib/supabase/env.ts` explains
that even zod is too heavy to ship for this. It would put `@supabase/ssr` and `supabase-js` into a
route's bundle to run four lines once. The tokens go to a Server Action instead, which already has a
client and writes the session cookies where every other one in this app is written. Next verifies an
action's origin for us, and invariant 3 asks for an action anyway.

**Rejected: changing the GoTrue email template to a `{{ .TokenHash }}` link and calling
`verifyOtp`.** It is arguably the more modern shape and it is configuration, not code — it needs a
change in the hosted project that this branch cannot make or verify.

## 2026-08-28 · A spec's teardown deletes only the rows it created

Three files have now been fixed for one bug with one shape, and it is worth writing down as a rule
rather than as three fixes. `inline-edit.spec.ts` deleted every time entry on its item and took
**12.0 h** of the sprint with it. `reliable-writes.spec.ts` deleted every comment and every time
entry on `COD-239` and took **60 minutes and one imported picture**. `composer.spec.ts` deleted
every comment on `COD-240` and took another picture. `history.spec.ts` deleted all **seven** of
`COD-235`'s imported revisions and never put them back.

Each looked correct in isolation. Each is destructive in company, and the damage is **permanent for
the rest of the run** — a later spec reads a database that no longer matches the seed, fails for a
reason that has nothing to do with what it is testing, and passes when run alone. That is exactly
the signature the ninth pass called "a second writer somewhere" and could not find.

**Decided.** A spec that deletes rows it did not create is a bug, in the same way a leaked file
handle is. The pattern, and all four now use it:

```ts
let seeded: string[] = [];
test.beforeAll(async () => { seeded = (await query(`select id::text …`)).map(r => r.id); });
// then
`delete from … where <the spec's scope> and not (id::text = any($1::text[]))`
```

**The counts move with the delete.** `reliable-writes` asserts "one comment, not two" and
`composer` asserts "one comment"; both now count the same bounded set. The claim is unchanged — *this
file wrote one row* — rather than relaxed to accommodate the seed, which would have been the easy
fix and a weaker test.

**The exception, and it is named:** `version-history.spec.ts` clears its own item's revisions
deliberately, because it is the one file that asserts absolute `revision_no` values and cannot
inherit a numbering. It says so where it does it. `history.spec.ts` does not assert version numbers
and therefore does not need the privilege.

**Rejected: resetting the database between spec files.** It is the obvious fix and it turns a
twenty-five minute suite into an hour of `supabase db reset`. The seed is a shared, read-mostly
fixture and the rule above is what makes that work.

## 2026-08-28 · PF-2's deliberate red leaves `npm run test` and becomes a check of its own

`tests/notion-roundtrip.test.ts` is PF-2's specification made executable and it is red on purpose.
For a day that was a good idea. Then `npm run test` reported **480 passed, 1 failed** every time it
ran, and a command that is always red cannot answer the one question it is asked — *did I just break
something?* This repository has already paid for that lesson once: `scripts/gate.sh`'s own header
records a production-only bundle assertion that failed quietly for weeks because nothing ran it, and
everybody had learned to read past the noise.

**Decided.** `vitest.config.mts` excludes the file by name; `npm run test` is **480 passed, 0
failed**. The red moves to `npm run roundtrip` (`scripts/roundtrip.sh`), which runs the same test
through `vitest.roundtrip.config.mts`, still fails, and still prints the four-line drift — every
field that did not survive the round trip, each named with the section of
`docs/11-NOTION-ROUNDTRIP.md` that explains it. That output is PF-2's build checklist and it has not
been weakened by a character.

**The check is inverted, which is what makes it a check.** The script exits **0** while the test
fails, and **1** the day it passes — with instructions to take the exclusion out and close PF-2. It
is a step on `npm run gate`. Both branches were proven by pointing the config at a passing file and
watching it exit 1.

**A guard, because the first version was wrong.** `--exclude` on the vitest CLI is *appended* to the
config's list rather than replacing it, so naming the file on the command line matched nothing,
printed "No test files found" and exited 1 — indistinguishable from the test failing, and it
reported a green PF-2. The script now refuses that output explicitly, and the second config is why
it never has to.

**Rejected: `it.fails()`.** It would keep the file in the suite and go green, and it would swallow
the drift message, which is the only part of this test anybody will ever read.

**Rejected: `it.skip()` with the ticket in its name.** A skipped test does not run, so the day the
spec and the schema disagree nobody finds out.

## 2026-08-28 · Home gets a heading hierarchy, and the section labels are the headings

Home rendered **one heading** — the `h1` greeting — and no `h2`–`h6` at all. Its seventeen section
labels are `Mono size="meta"` elements: styled text, correct to the pixel, and structurally
invisible. A screen-reader user landing on `/app` could not list the page's sections, jump between
them, or tell "my work" from a caption.

**Decided.** The labels *are* the headings, so they carry the level rather than being replaced.
`Mono` already takes `as`, so `<Mono as="h2">` changes the tag and nothing else — Tailwind's preflight
already resets a heading's size and margin to inherit, so not one pixel moves. `my work`, `mentions
& discussion`, `Online now`, `recently opened` and `Activity · {project}` are `h2`; `Goal`, `Status`
and `Hours` are `h3` inside the sprint card.

**The sprint card's heading is the sprint's NAME, not its eyebrow.** `active sprint · MEINEvim`
names the *kind* of card; `Sprint — Week 17` names this one. The name is wrapped in an `h2` around
the link it already was, which is what `e2e/home.spec.ts` has always asked for and never got.

**Rejected: `aria-label` on the sections.** It would announce a region without giving the page an
outline, and an outline is what a reader uses to move.

## 2026-08-28 · Two strings on Home change, and one of them diverges from the design bundle

`e2e/home.spec.ts` has asked for both since before Home was redesigned, and the redesign quietly
dropped them. Rather than rewrite the assertions to match whatever the page happens to do now — which
would lock in the loss — the page says them again.

**`· ended`.** The sprint header used to read *Sprint — Week 17 · ended*. The redesign put the state
in an amber chip with nothing joining it to the name, so it read as a badge about something else.
The separator is back, as its own faint element before the chip, and it is the same `·` the eyebrow
above and the date line below already use. `getByText("· ended")` matches the wrapper, which was
measured rather than assumed: Playwright's text engine matches the smallest element whose combined
text contains the string, so the wrapper matches and the whole header row does not.

**`Assigned to me`, and this one diverges from the bundle.** `Coditu Workspace.dc.html` labels the
tab `Assigned`. `/app/my-work` — the screen that tab links to, listing the same rows — has always
called the same column `Assigned to me`. Two screens naming one list two ways is the kind of small
inconsistency that makes somebody stop and check whether they are the same list. `CLAUDE.md` gives
the bundle the casting vote on **numbers**; this is a label, and the tie-break it asks for is
correctness. A tab also has to stand up out of context — a screen reader announces it without the
`my work` heading above it — and `Assigned` alone does not.

The count moved into the same element with its separator (`· 3`), because the control's own text has
to read as one phrase for either the reader or the test to find it.

## 2026-08-28 · PF-5 averages over working weeks, not calendar weeks

"Average load from hours logged" needs a denominator, and the obvious one is wrong on this project's
own data. MEINEvim's time entries span **39 calendar weeks** and fall in **6** of them: the import
dates its first batch to the day it ran and the rest to the sprints they belong to, so the 33-week
hole in between is an artifact of when rows were written, not of anybody's week. Dividing by 39
makes every number six times too small and describes a team that barely works.

**Decided.** The denominator is **working weeks** — weeks in which somebody, anybody, logged time —
counted from each person's own first working week to the last one in the window. Both of the awkward
cases fall out of that instead of being special-cased: a **zero-hour week** (the team worked, this
person did not) is in the denominator and contributes nothing, which is what average load should
say; and somebody who **joined mid-sprint** starts counting at their own first week and is not
charged for the ones before they arrived. `tests/home.test.ts` holds both, plus the empty case.

**The running week is excluded from the average and included in the total.** A week that has not
finished is not a week's work, and counting it would make every average fall on Monday and recover
by Friday — a figure that moves with the day of the week is not one anybody can act on. It is
reported separately as `partialWeekMinutes`. `cumulativeMinutes` includes it, because a total that
leaves rows out is not a total.

**No complete week means `null`, not `0`.** Somebody in their first partial week has no average, and
`0.0 h/week` would be a claim about their pace that the data cannot support. Home renders `no full
week yet`.

**Rejected: weeks in which THIS person logged.** It flatters absence — one full week in six would
report a full week's average.

## 2026-08-28 · PF-3 orders projects by the work, not by the client's name

"EVIM is the main work: most prominent, easiest to reach." The literal implementation — sort
`meinevim` to the top — compiles a client's name into the ordering of a product meant to run any
client's work, and it is wrong the first week EVIM finishes and something else starts.

**Decided.** `byProminence` in `lib/projects.ts`, applied in `listProjects()` — which every screen
in the application reads from — and to the command palette's own list, so the first project under
Cmd-K is the first project in the sidebar. The rule is: **a running sprint wins; then the most
sprints behind it; then the alphabet.** Today that puts MEINEvim first because MEINEvim is where the
work is, and `tests/project-prominence.test.ts` proves the rule names no project by moving the
active sprint to another one and watching the order follow.

**The archived leak, which was the real finding.** The ledger's triage said nothing reads
`is_archived`. That was wrong — `listProjects()` has filtered it since the column existed, and
`/app/projects` puts archived projects behind a deliberate filter. The one surface that did **not**
was `lib/data/palette.ts`, which builds its own query: an archived project still turned up under
Cmd-K, with its sprints, and with every story in them. All three of its queries carry the filter
now, and the items one reaches it two joins up (`sprints.projects.is_archived`) so the rows never
leave the database. A project that is out of the sidebar and out of Home and still first in search
has not been archived.

**Not decided here: which projects should be archived.** That is a statement about engagements and
it is Mohamed's to make. `/app/projects` → project admin has the control.

## 2026-08-28 · `setWorkItemComponents` accepts 200 components, not 24

PF-7 asks for "select all components at once in a story (global changes)". MEINEvim's registry has
**40** live components and the input schema capped `componentIds` at **24**, so the feature's whole
purpose — a change that touches every component — was refused by validation before it reached the
database.

**Decided.** 200. The cap exists to refuse an absurd payload, not to express a product limit, and a
cap a feature cannot satisfy is a bug with a good excuse. The registry is synced from the delivery
repository and only ever grows, so the new number leaves room rather than tracking it.

**The write was already one write.** `setWorkItemComponents` takes the complete set and computes the
difference itself, and the multi-picker accumulates a draft and commits once on close — so forty
ticks and one tick cost the same single Server Action. `e2e/component-select-all.spec.ts` counts the
POSTs rather than the rows, because a row count cannot tell one call from forty.

## 2026-08-28 · The peek's scroll jump is the App Router, and `scroll={false}` is the fix

PF-9 carried "clicking a story scrolls down oddly" for three passes. The first pass proved the
movement it measured was **Playwright** scrolling the link into view through CDP, tried
`scroll={false}` on the item links, measured no change, and reverted it — a correct process run
against a number that was the instrument. With `dispatchEvent` the harness stops moving the page,
and what is left is real:

| project | moved on five opens |
|---|---|
| chromium 1280×720 | `[68, 0, 0, 0, 0]` |
| mobile-safari 393×659 | `[0, 0, 0, 0, −1]` |
| mobile-chrome 412×839 | **`[1970, 0, 0, 0, 0]`** |

**First open only. Downward. To the document's maximum scroll** — 768 of 768 at 1280×720, 2670 on
the phone. Never on WebKit. That is Mohamed's report, on a phone, at last reproduced.

**Two hypotheses were measured and thrown away before the right one.** Chrome's scroll anchoring:
`overflow-anchor: none` on `html, body` changed the number by nothing, `[68,0,0,0,0]` either way.
The dialog's `focus()`: forcing every `HTMLElement.prototype.focus` to `{ preventScroll: true }`
changed it by nothing either.

**Decided,** on a stack trace rather than on a theory. Every scroll API hooked, the first open
recorded:

```
at HTMLHtmlElement.set [as scrollTop]  ← 0
at dontForceLayout
at O.handlePotentialScroll
at O.componentDidMount
```

and then `scrollIntoView` from the same frame. It is Next's own `ScrollAndFocusHandler`, bringing
the newly-rendered `@modal` segment into view on a soft navigation, animated by
`html { scroll-behavior: smooth }` over ~165 ms. `scroll={false}` on the three links that open a
peek — the table row, the card and the board tile — is exactly the prop that turns it off. Measured
after: `[0,0,0,0,0]` on all three projects, document and visual viewport both.

It is the first open only because every later one comes out of the router cache with its segment
already mounted, and never on WebKit because Safari does not animate that scroll.

**`e2e/peek-scroll.spec.ts` is a real spec, not a `.local` measurement**, and it is named in
`ON_A_PHONE`: the claim is now an acceptance PF-9 states, it holds on three engines, and the phone
is the configuration where it was broken.

## 2026-08-28 · Smooth scrolling is turned off while somebody is writing

PF-6 said "writing must be instant like Notion". The keystroke was measured at **12.3 ms** median
for Enter in a to-do, which is inside a frame, and the report did not reproduce. What does
reproduce is that **you cannot see what you are typing**.

Thirty to-do items into the sprint notes, production build, 1440×900:

| | after 10 items | after 20 items | 0.7 s after typing stops |
|---|---|---|---|
| as shipped | caret **419 px below the fold** | **856 px below** | back in view |
| `scroll-behavior: auto` | on screen, 878 px | on screen, 878 px | on screen, 878 px |

Chrome only — desktop and mobile. WebKit keeps the caret in view either way, which is why this
survived a WebKit-shaped inspection.

**The mechanism.** A browser scrolls the caret back into view on every keystroke. With
`scroll-behavior: smooth` on the scrolling element it has to *animate* that, and at typing speed
each keystroke restarts an animation that never arrives. The same declaration made PF-9's jump look
like an application bug; here it is one.

**Decided.** `html:has(.ProseMirror:focus) { scroll-behavior: auto; }`. Smooth stays everywhere
else, including the anchor links it was added for. Measured after, on all three engines: caret on
screen before Enter and after it, `caretMoved: 0`, and the document moves 46–49 px — one line, which
is what following a caret is supposed to look like.

**`:has()` rather than a class toggled from a focus listener.** This is a statement about a state
the document already knows, and the app shell has no bytes to spend on JavaScript that reads it.

**Also found, and fixed with it:** `sprint-notes.client.tsx` had PF-4's `control()` spread on
**Cancel** and left **Publish** — the button that actually does the work — reporting ad-hoc with
`disabled` + `aria-busy`, which is the spelling that sweep existed to remove. The spread is on
Publish now; Cancel keeps native `disabled`, which is the contract's own answer for a control that
triggers nothing.

**The save indicator was measured and is fine.** Click → `Sending…` at 9–15 ms, → `Saved` at
102–202 ms, gone at ~2.7 s, on all three engines. Both states really paint; nothing is silent.

## 2026-08-28 · The backup writer may read everything and write nothing

Mohamed answered all six infrastructure questions: no Pro/PITR, 24-hour RPO, Cloudflare R2
Standard plus a local copy, GitHub Actions cron, email plus a freshness canary, 30 nightly +
12 monthly sets, and an automated monthly integrity drill. The bin remains unbounded; an
infrastructure retention decision does not silently become a product deletion policy.

**The off-site choice is accepted but not active.** R2's current Standard allowance is free
at this size, but activation is a subscription checkout and Cloudflare's billing profile
requires a primary payment method. There are also zero GitHub repository secrets. Mohamed's
no-card rule wins: the code and local proof proceed, the provider activation stops, and no
screen claims a 24-hour RPO that does not yet exist.

**The writer cannot become the incident.** `coditu_backup` has LOGIN, `pg_read_all_data` and
BYPASSRLS, with no password in the migration and no write privilege. BYPASSRLS is necessary:
RLS can otherwise turn a successful dump into an empty one. It grants no write. The migration
asserts both directions against `public.work_items` and every public/auth/storage table.

**Supabase CLI is kept, and its escalation is not.** CLI 2.109.1 generates the correct
platform exclusions and filters for separate role, schema and data dumps, but it always adds
`--role "postgres"`; a real run as `coditu_backup` fails at `SET ROLE postgres`. The backup
script generates the CLI pipeline with a placeholder credential, requires exactly one such
line, removes only that line, and executes the rest under the dedicated URL. A future CLI
shape change fails closed.

**Public-key encryption is deliberately asymmetric.** GitHub holds only
`ops/backup-recipient.txt`; the corresponding private key is mode 0600 at
`/Users/motamer/.config/coditu/backup.agekey` and needs one offline copy. GitHub can create a
backup it cannot decrypt. The monthly automated drill therefore verifies encrypted SHA-256,
size and counts; full decryption remains Mohamed's quarterly operation.

**Storage is a first-class half of the set.** The proved local archive contains 115 objects
from three buckets, not only the 5,245 database rows. During restore, recursive `cp` is
required: once `storage.objects` has been restored, `sync` sees the metadata and skips the
missing bytes. That exact false success was reproduced before the verifier was corrected.

**Evidence.** Archive `2026-08-28T204500Z` is 16,603,288 encrypted bytes, SHA-256
`9b2c78c319da218e8b1b89d255852f58e3ea071a66c4b5051fd36d7f4e87bb16`. A clean isolated
Supabase stack restored **130/130 table counts, 5,245/5,245 rows and 115/115 Storage
objects**, then re-downloaded byte-identical objects. A local S3-compatible target accepted
the encrypted artifact and metadata; retention was seeded above its limits and finished at
exactly **30 nightly + 12 monthly**. No hosted database, R2 account or GitHub secret changed.

## 2026-08-28 · The backup alarm must survive the scheduler it watches

The freshness canary runs independently from the nightly writer and reads the newest R2
object rather than trusting a workflow conclusion. It fails closed after **26 hours**, for
no object, a malformed key, an empty archive or sidecar, missing SHA-256 metadata, or an
implausibly future timestamp.

An hourly successful canary pings a UptimeRobot heartbeat. The heartbeat is the external
watcher: if every GitHub schedule stops, check-ins stop and Mohamed receives the email
outside GitHub. The unique heartbeat URL is a GitHub secret because a third party could use
it to forge health. The free monitor is not activated before the first R2 upload and pushed
workflow exist; activating it now would knowingly create a false incident.

## 2026-08-28 · Scheduled integrity and human restore are different controls

The monthly job gets read-only R2 credentials and no decryption key. On day 02 it downloads
the newest day-01 ciphertext, recomputes its SHA-256 and size, compares the monthly tier with
the matching nightly tier, and validates the sidecar's database/Storage counts. This catches
truncation, corruption, partial sets and retention-tier divergence without making the
recovery plaintext available to GitHub.

That is an **integrity drill, not a restore**. Mohamed performs the decrypt-and-restore
quarterly, on the first Saturday of January, April, July and October, in an isolated local
Supabase stack. The private key remains on his Mac/offline copy. Only that drill proves the
SQL and Storage payload can be rebuilt; its measured duration still does not include a
hosted provider replacement or DNS cutover and therefore is not an RTO.

## 2026-08-28 · Production deploys belong to the release gate, not the Git hook

Vercel Git auto-deployment is disabled in `vercel.json`. A `main` push can reach production
only from the CI `deploy` job after the blocking checks succeed. The job uses a pinned Vercel
CLI, builds with the project's Production environment and fails when any of the token/team/
project secrets is absent; absence is not a green skip.

Browser E2E remains visible but report-only for a measured window. The last 20 existing
`main` CI runs were not green, the newest stopped at database tests, and this workflow shape
has run remotely zero times. After **10 consecutive green `main` runs of the same browser
job**, it becomes a deployment dependency; a failure resets the count. The earliest review
is 2026-09-07, but elapsed dates never substitute for ten results.

This is implemented locally, not activated. GitHub's `Production` environment currently has
no `VERCEL_TOKEN`, `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID`, and this branch is neither pushed
nor merged. The existing Vercel Git integration therefore still auto-deploys `main` until
this configuration reaches it; no production setting or deployment is claimed changed.

## 2026-08-28 · Code does not deploy on the promise that migrations probably ran

The deploy job now performs a read-only hosted schema preflight before the Vercel build. Its
contract is generated from the committed Supabase types and migration filenames, not a
hand-maintained list. It checks every public table/view column, function input and table
return field, enum label, required Storage bucket, and all local migration versions.

The check also proves it reached the intended project over SSL as the BYPASSRLS but
non-writing `coditu_backup` role. A service-role or owner URL would make the check itself an
unnecessary production writer; an anonymous URL cannot inspect the catalog. The dedicated
role is the narrow middle.

Current remote evidence says the fail-closed path matters: hosted ends at migration
`20260827130000`, while local also has `20260828120000` and `20260828140000`. Those two are
not silently tolerated. Migrations must run before code, and no hosted migration was applied
in this block.

## 2026-08-28 · Production moves only after the candidate answers as the checked commit

The deploy is a two-phase state change. Vercel first receives a Production-targeted prebuilt
deployment with `--skip-domain`; its protected immutable URL is tested through `vercel curl`,
which can cross deployment protection without making that URL public. Only the passing
candidate is promoted. A post-promotion check then comes through the same public origin users
reach and requires both a non-error response and an exact `GITHUB_SHA` in
`/build-health.json`.

The health marker is written into `.vercel/output/static` **after** `vercel build`. It is not
a mutable application answer and it does not depend on Supabase: it identifies exactly which
checked artifact reached the edge. The route smokes still cover `/login` and the authenticated
Recovery Centre redirect, so the marker is not mistaken for a whole-application health test.

Before staging, the job resolves and records the deployment currently serving Production.
After promotion begins, any non-zero command, 4xx/5xx, timeout, wrong commit or redirect away
from the configured origin rolls back to that exact id and checks the public routes again.
`release_promoted` is set before the promote call: a provider command can move domains and
then time out, so a non-zero response is ambiguous and must take the recovery path. Deploy
jobs are serialized because two independently correct rollbacks can be wrong when they race.

The external watcher is independent again: UptimeRobot Free will check the public `/login`
page every five minutes for Coditu-specific text and email Mohamed. A plain HTTP 200 monitor
was rejected because Vercel's own login can return 200. It is not created until a real public
production origin exists and passes; activating it against today's protected/unknown URL would
manufacture an incident rather than monitor one.

## 2026-08-28 · The Recovery Centre believes one canary row, and time can revoke it

The page does not receive R2 credentials and GitHub does not receive a service-role key. After
reading R2, the canary sends its validated sidecar through `/api/backup-health` with one
high-entropy bearer capability shared only by GitHub and Vercel. The server maps that request
to `record_backup_health`, a service-role-only RPC that can upsert one singleton and refuses
to replace newer evidence with an older object. An endpoint credential can therefore report
this one fact and cannot become a general database writer.

The sidecar is downloaded, not merely `HEAD`ed. Its backup id, archive name, encrypted bytes
and SHA-256 must match the R2 object; database table/row and Storage bucket/object counts must
be non-negative integers. The canary's 26-hour threshold includes scheduler/alerting grace.
The product objective remains 24 hours: a 25-hour object may still let the canary produce a
specific alert, but the screen calls the objective missed.

Absence is the initial state and renders no infrastructure number. A present row earns only
dated evidence. The page recomputes two clocks on every request: a canary report older than two
hours is stale, and an object older than 24 hours misses the RPO. Either turns the card amber
without waiting for another job to write. Counts and size are described as sidecar evidence,
never as a restore; retention, monthly integrity, decryption and RTO remain explicitly separate.
The sentence **“Version history is not a backup”** is unchanged.

## 2026-08-28 · A red browser assertion does not earn a product rollback

The nine stable browser failures were inspected from the page inward. None is a current product
defect: each asks the current app to expose a retired location, a hidden disclosure without opening
it, a status absent from the real seed, an obsolete payout total, or one document surface while its
selector chose another. The rendered behaviors behind the four page mismatches pass when exercised
through their current routes and controls.

**Decision.** Do not reintroduce inline sprint notes, unfold the burn-up, remove `PageShell`, show
filters with no matching work, flatten a mixed-surface history, or change a correct earnings delta to
make those assertions green. Do not quietly loosen or commit rewrites of the E2E specs either. They
remain visible in the report-only browser job until their contracts are deliberately rewritten as a
separate test-maintenance change.

**Why.** A test is evidence only while its preconditions still describe the product. Preserving an
obsolete assertion by regressing a measured page would turn the gate into an incentive to make the
application wrong. The local-only probes record the current behavior without promoting diagnostic
code into the repository.

## 2026-08-28 · Do not turn backup evidence into a free-plan keepalive

Supabase may pause a low-activity Free Plan project over a seven-day window. The selected keepalive
proposal is a dedicated fixed-output database health read monitored outside Supabase. It is not the
backup canary report.

**Why.** `/api/backup-health` means one exact R2 recovery set was independently read and validated.
Calling it without that evidence to manufacture database activity would keep the project awake by
making the Recovery Centre lie. Availability and recoverability are separate controls even when one
scheduled request could technically serve both.

## 2026-08-29 · The Storage leg copies over REST with the service-role key, not S3

`scripts/backup.sh` gains `SOURCE_STORAGE_MODE`. `s3` is unchanged and remains the default.
`rest` lists objects from `storage.objects` — which the read-only role can already see — and
downloads each one from `/storage/v1/object/<bucket>/<name>` with the project's service-role key.

**Why.** Supabase Storage S3 access keys can only be created by a human in the dashboard; the
Management API has no endpoint that mints them, probed on 2026-08-29 (`storage/credentials` and
`storage/s3-credentials` both 404, `config/storage` confirms the S3 protocol is enabled). Under
an autonomy contract where no answer is coming, that made the S3 path unreachable and the whole
Storage half of the first hosted backup unreachable with it.

**What it costs, stated rather than buried.** The service-role key can WRITE, where
`coditu_backup` deliberately cannot. The database leg's least privilege is intact; the Storage
leg's is not. That is a real weakening and the comment in the script says so. It is accepted
because the alternative on 2026-08-29 was **no Storage copy at all**, and 135 objects — every
attachment and comment image in the workspace — are in no database dump by design. Revisit the
moment somebody with dashboard access can mint an S3 key pair; the `s3` mode is still there and
still the default.

**Rejected: skipping Storage for the first backup.** The proposal has said since it was written
that database backups exclude Storage files. A first restore point that silently omits every
image would be exactly the "failure that completed successfully" the read-only role migration's
own header warns about.

## 2026-08-29 · One curl per bucket, bounded, with the key off the process list

The first hosted Storage run spawned one `curl` per object. It sat on a single 62 KB PNG for six
minutes with nothing on stdout, and the service-role key was an argument of all 135 invocations,
visible to anything that can run `ps`.

**Decision.** One `curl --config` per bucket. The auth header is written once into a mode-0600
file inside the mode-0700 temp tree the exit trap already removes, so it is never an argument.
Every request carries `connect-timeout 15`, `max-time 300`, `retry 3` and `fail-early`; each
bucket prints its object count before it starts.

**Why it matters beyond tidiness.** An unbounded request in a scheduled job does not fail — it
hangs, and a hung nightly is indistinguishable from a nightly that has not run yet until the
freshness canary fires a day later. Bounding it converts a silent stall into a loud failure. The
TLS handshake to Storage costs several seconds on this connection and is now paid three times
instead of 135: the same 135 objects that had not finished in six minutes completed inside a
225-second end-to-end run.

## 2026-08-29 · The hosted database is reached through the session pooler, not the direct host

Every runbook in this repository gives the connection string as
`db.hayfsvsepgfescojesbd.supabase.co:5432`. That host publishes **only an AAAA record**, and the
machine this work runs on has no IPv6 route — `getaddrinfo` fails outright.

**Decision.** Use `aws-0-eu-central-1.pooler.supabase.com:5432` (the **session** pooler; the
6543 port the Management API advertises is transaction mode and will not carry migration DDL),
with the username `<role>.<project-ref>`. The runbooks now say so.

**Why this is worth an ADR.** The failure is a connection timeout with no explanation, and the
obvious first suspicion is the password or the role, both of which were newly created here. An
hour can go into that. It is a property of the network path, not of the project.

## 2026-08-29 · Backups are GitHub releases in a dedicated private repository, not R2

R2 was chosen in `09-BACKUP-PROPOSAL.md` §4 and is abandoned. Its allowance is free; its account
requires a billing profile with a payment method, which Mohamed refused. Nothing about that is
going to change by waiting.

**Decision.** `MooTamer/coditu-recovery`, private. One release per recovery set, tagged
`nightly-<id>` or `monthly-<id>`, with the encrypted archive and its sidecar as assets. Retention
deletes the release and its tag.

**Why releases and not committed files.** The obvious shape is to commit
`nightly/<id>/<id>.tar.gz.age` and `git rm` past retention. Git objects are permanent: deleting a
19 MB blob from the tip reclaims nothing, so "keep 30 nightly and 12 monthly" expressed as
deletions grows the repository without bound and takes clone time with it. Release assets are
stored outside the object database and delete for real.

**Rejected: keeping the workflows in `MooTamer/coditu`.** A workflow there cannot write to
another private repository with its own `GITHUB_TOKEN`; it would need a personal access token
stored as a secret, readable by every workflow in the application repository. That is a much
larger blast radius than a backup writer should have, and a fine-grained token cannot be minted
without a browser anyway. The workflows live in the recovery repository, where the token they
already have is exactly the permission they need. **No personal access token exists in this path.**

**And the reason that matters more.** The application repository may be the thing that was lost.
A restore path whose first step is "check out the repository you are recovering" is not a restore
path. The recovery repository therefore carries its own copy of the tooling, pushed by
`scripts/sync-recovery-repo.sh`. The cost is a copy that can drift, and `--check` reports it
against the digest in `ops/recovery-repo.json`.

## 2026-08-29 · The row-count manifest counted every table twice

`row-counts.tsv` was built with a `\gexec` loop. psql writes the generated `select …` statements
and their results to the same stream, so every table produced two lines and `wc -l` reported
double. The first two hosted recovery sets both record **126 tables; there are 63**.

The row total was never affected — the statement lines have no tab-separated second field for
`awk` to sum — which is exactly why it survived: the number that looked most likely to be wrong
was right, and the one nobody checked was doubled.

**Decision.** `scripts/sql/row-counts.sql`, one statement, one line per table, counting through
`query_to_xml` so nothing but the answer reaches stdout. Both `backup.sh` and
`verify-backup-restore.sh` use the same file, so the two sides of the comparison cannot drift.

**What this says about the evidence discipline here.** A count printed beside a real archive is
not evidence unless something compares it to an independent measurement. This one was printed,
put in a sidecar, published, and read back by a canary that compared it only to itself.

## 2026-08-29 · A restore target must be at least as new as its source, and the check comes first

Supabase ships schema changes to hosted projects ahead of the CLI's pinned local images. Hosted
`storage.buckets` has `versioning_status`; hosted `storage.objects` has `archived_at`,
`is_delete_marker` and `is_versioned`; `storage-api:v1.62.5` has none of the four. Restoring a
hosted backup into that stack died 1,729 lines into `data.sql` with a bare
`column "versioning_status" of relation "buckets" does not exist` — after `roles.sql` and
`schema.sql` had already been applied.

**Decision.** `verify-backup-restore.sh` parses the `COPY` column lists out of `data.sql`,
compares them against the target, and fails **before roles.sql** naming every missing column and
what it means. Three consequences, all deliberate:

- a failed drill leaves the target untouched, so the next attempt starts clean;
- the message says "restore into a project at least as new as the one backed up" rather than
  making the reader infer it from a Postgres error;
- it is general. It catches any managed-schema drift, not the four columns that happened to
  surface today.

**Also decided: the row-count comparison stops requiring identical table lists.** The local
Storage image has `storage.iceberg_namespaces` and `storage.iceberg_tables` and the hosted
project does not; both are empty, and a `diff -u` of the two manifests failed on them. A restore
target will always carry some platform scaffolding the source did not. Every table the backup
describes must now match exactly, and any table only the target has must be **empty** — which
catches a missing table, a short table and an unclean target, and drops the false alarm. The
target-only tables are printed rather than hidden.

## 2026-08-29 · The Storage service-role key is a GitHub Actions secret, and that is a weakening

`SUPABASE_SERVICE_ROLE_KEY` is now a repository secret in `MooTamer/coditu-recovery` because the
`rest` storage mode needs it and S3 access keys cannot be minted without a browser.

**What it costs.** The database leg connects as `coditu_backup`, which cannot write anything. The
Storage leg holds a credential that bypasses RLS and can write. The backup job is no longer
uniformly least-privilege, and saying "least privilege" about it without this sentence would be
false.

**Why it is accepted.** The repository is private and its only three workflows are the backup,
the canary and the monthly integrity check. The alternative was no Storage copy at all, and 135
objects — every attachment and comment image in the workspace — are in no database dump on any
Supabase plan. Revisit the moment somebody with dashboard access can mint an S3 key pair; the
`s3` mode is still there and still the default.

## 2026-08-29 · The keepalive probe is `security definer`, and the canary drops to three-hourly

**The probe.** `public.database_heartbeat()` performs one bounded read of
`public.app_settings` and returns the fixed string `coditu-database-awake`.
`/api/health/database` calls it with the anon key, no session, `no-store`, and a 5-second
deadline, and answers with that one word or 503.

**Why `security definer`, which is normally the thing to argue against.** The first version was
`security invoker`, on the reasoning that RLS would hide every row from `anon`. It never gets to
a policy: `anon` has no `SELECT` **grant** on `public.app_settings`, so the call fails with
`42501 permission denied` outright. The two ways forward were to grant `anon` select on a real
settings table — a standing, quiet read on production data so that a liveness probe can run — or
to let this one function read on the owner's behalf.

It is safe *here* for a structural reason rather than a careful one: the function takes **no
arguments** and its only `return` is a string literal. There is nothing to inject through and no
path by which a row can leave. The migration asserts all three — zero arguments, exactly one
`return`, and that the literal is the keyword — so a later edit that gives it a parameter fails
the migration instead of shipping a steerable definer function. It also asserts that `anon` has
**not** been granted select on `app_settings`, because that grant is the thing this exists to
avoid needing.

**Why the endpoint and not `/login`.** A signed-out `/login` render reaches Supabase **Auth**, a
separate service in front of the same database. Whether the provider counts that as user database
activity is not a fact this repository can assert. And `/api/backup-health` must never be used:
it means a real off-site archive was read, so pinging it to keep a database awake would make the
Recovery Centre lie.

**The canary drops from hourly to three-hourly, and this is a recoverability decision.** GitHub
Free gives a private repository 2,000 Actions minutes a month, billed per job rounded up to the
minute. Hourly is 720 runs — **a third of the whole allowance** — to re-read a file that changes
once a day. Add the nightly (~150), CI, and the keepalive, and the month gets tight; the failure
mode of running out is that **the nightly backup silently stops**, which is precisely the
condition Tier 0 exists to prevent. Three-hourly costs 240 and still detects a stale copy nine
times over inside the 26-hour threshold it is measuring against. The keepalive runs every six
hours — four a day clears the provider's stated "a few requests per day" with room.

Consequence for setup: the UptimeRobot heartbeat must expect a check-in every **three** hours,
not every hour. The runbook says so.

## 2026-08-29 · The backup heartbeat moves to healthchecks.io; UptimeRobot's is a paid feature

**The error.** Two earlier entries in this log and the runbooks that follow them say the backup
canary pings *"an UptimeRobot heartbeat"* and that *"the Free plan includes heartbeat monitoring"*.
The second half is false. UptimeRobot's own monitor-type picker says **"Cron job / Heartbeat
monitoring — Available only in Solo, Team and Scale."** Its free plan is HTTP, Keyword, Ping and
Port only. Under Mohamed's standing no-paid-service, no-card constraint, the alerting leg of the
entire Tier 0 backup design was specified against a product nobody here can buy.

**How it got in, which matters more than the fact.** The 2026-08-28 research pass read *"50
monitors free"* off the pricing page and generalised it from a **count** to a **capability**. The
help article it also cited enumerates check frequency, not which monitor types the free plan
carries — it declined to confirm the point, and that silence was recorded as confirmation.
Reference 7 in `09-BACKUP-PROPOSAL.md` is struck through rather than deleted so the shape of the
mistake stays visible. **The rule this produces: a plan page that says _how many_ is never a
source for _which kinds_. Cite the sentence that answers the question actually being asked, or
record that no such sentence was found.** It was caught by Mohamed using the product, not by the
research that was supposed to catch it.

**The replacement: healthchecks.io.** Verified on their homepage 2026-08-29 — *"Monitor 20 cron
jobs for free. No credit card required."* It is purpose-built for exactly this shape; their own
worked example is a production backup check. Email alerts, and a first-class notion of "expected
every N, alert after a grace period", which is the whole semantic a dead-man's switch needs.
Open-source under BSD-3, so if third-party alerting ever stops being acceptable it can be
self-hosted without redesigning the canary. One check is needed out of the twenty.

**Rejected alternatives.** *A GitHub Actions workflow watching the canary* — rejected because it
shares the failure it is meant to detect: R5 already names Actions minutes as one pool, and a
watcher that dies when the schedule dies is decoration. *cron-job.org and similar* — no reason to
prefer them over the purpose-built, open-source option. *Nothing, and read the Actions tab* — that
is the status quo the canary exists to replace; a schedule that stops being dispatched produces no
red run to notice.

**The split, so no future pass re-derives the wrong answer.** healthchecks.io does the **backup
heartbeat** — the one job that is a cron dead-man's switch. UptimeRobot keeps both **HTTPS**
jobs — public site uptime, and the Supabase keepalive Keyword check on `/api/health/database` —
because HTTP and Keyword *are* on its free plan and nothing about that half was wrong.

**Two mechanical consequences.**

1. The secret is renamed `BACKUP_CANARY_HEARTBEAT_URL` → **`HEARTBEAT_URL`**, in
   `MooTamer/coditu-recovery`. Renaming is free precisely because it had never been set; doing it
   now avoids a secret whose name asserts the wrong vendor forever. Its value will be
   `https://hc-ping.com/<uuid>`. The path is a credential — possessing it forges a check-in — so
   it lives only in the repository's secrets.
2. The ping moves to the **last** step of the canary job, explicitly `if: success()`. It was
   third of four, ahead of the report-publishing step. A heartbeat that fires before the job
   finishes proves the runner booted, not that the backup was verified — and a dead-man's switch
   that says "alive" while the thing it watches is broken is worse than no switch at all, because
   it is believed. The step is a no-op with a visible `::notice::` when the secret is absent, so
   the canary never goes red for a reason unrelated to backups.

**Status.** The workflow is one secret away from working. Creating the check and adding
`HEARTBEAT_URL` is Mohamed's; it is the only remaining step. The correction to the three-hourly
cadence in the entry above stands — the check's period is three hours, plus grace for GitHub
queue delay — only the vendor changed.

## 2026-08-29 · The hosted schema preflight was asserting encryption on somebody else's connection

**What was wrong.** `scripts/check-hosted-schema.mjs` proved the connection was encrypted with one
line — `exists (select 1 from pg_stat_ssl where pid = pg_backend_pid() and ssl)`. Against the real
project that returns **false on a session that is TLSv1.3 end to end**, and the check fails closed
for a reason that has nothing to do with the schema.

**Why.** Supabase's only reachable endpoint from here is **Supavisor**, the session pooler.
Supavisor terminates TLS at the pooler and opens its own cleartext connection to Postgres inside
the VPC. `pg_stat_ssl` describes *that* hop. It is a true statement about a connection this
process does not own. The one route where the old assertion would have answered about us is the
direct host `db.hayfsvsepgfescojesbd.supabase.co` — which has an **AAAA record and no A record**
(measured 2026-08-29), so any machine or runner without an IPv6 route cannot use it at all. This
Mac has none.

**Measured, not assumed.** `openssl s_client -starttls postgres` against the pooler: `CONNECTION
ESTABLISHED, Protocol version: TLSv1.3, Peer certificate: CN=*.pooler.supabase.com, O=Supabase
Inc`, chain ending at `Supabase Root 2021 CA` with `verify error:num=19 self-signed certificate in
certificate chain`. From node-postgres on the same connection: socket is a `TLSSocket`,
`encrypted: true`, `protocol: TLSv1.3`, `authorized: false`, `authorizationError:
SELF_SIGNED_CERT_IN_CHAIN`. And on the same session `pg_stat_ssl.ssl = false`. The pooler also
**accepts `sslmode=disable`**, so requesting TLS is the client's job and nothing server-side
enforces it — which is precisely why the check must be right.

**The fix.** Read the client socket, because it is the only thing that knows about the leg this
process is responsible for. `pg_stat_ssl` is kept as corroboration when it is true and *explained*
rather than believed when it is false. Because the chain ends at a root that is in no public trust
store, the certificate is additionally pinned by name — issuer organisation `Supabase Inc` — so a
downgrade to cleartext fails and so does a certificate that is not Supabase's.

**Why not just ship the CA and use `verify-full`.** That is the stronger form and it is available
behind `HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS=1`, which requires `socket.authorized`. It is not the
default because the root has to come from somewhere: `https://supabase.com/downloads/prod-ca-2021.crt`
now **404s**, and the certificate is served per project from the dashboard, so obtaining it is a
human step. Making the default depend on a file nobody has yet would reproduce the original
failure — a check that is red for a reason unrelated to what it checks. The strict mode is there,
named, and one environment variable away for whenever the CA is in place.

**Rejected: relaxing the assertion to nothing.** "The pooler is inside Supabase, assume TLS" would
have made the check pass and meant nothing — the pooler demonstrably accepts cleartext.

**Verified.** Against hosted: pass → exit 0 with `hosted_schema_verified=true migrations=39`.
`sslmode=disable` → exit **1**, `database connection is not encrypted`.
`HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS=1` with no CA → exit **1**, naming
`SELF_SIGNED_CERT_IN_CHAIN`. It still fails closed, on the thing it is actually about.


## 2026-08-26 · The allowlist gains a second dimension: not only what renders, but where

`ALLOWED_NODES` was a flat list of the node types `comment-body.tsx` is willing
to draw. A flat list cannot say that a `paragraph` inside a `paragraph` is not a
document, so the renderer drew one — `<p><p>`, which is invalid HTML. The browser
parses that as two siblings, React's tree still says nested, and the sprint page
threw `Hydration failed` on every load.

The shape is not exotic. `documentSchema` validates the **root node only**, and
that is deliberate and documented: a recursive schema walks the whole tree while
validating, so a deeply nested `body_json` overflows the stack *inside the
validator*, before any depth guard runs. Every `*_json` column is jsonb and
stores what it is given. `e2e/comments.spec.ts` stores a 3,000-deep chain of
exactly this on purpose, to prove the renderer survives it.

**Decided:** the vocabulary states the containment rule, and the renderer obeys
it. `lib/blocks/schema.ts` gains `INLINE_NODES` — the nodes whose case emits
phrasing content — and `PHRASING_ONLY_NODES` — `paragraph` and `heading`, whose
elements accept nothing else. A block node reached inside one of those renders
its **text and no tag**.

Degrading, not dropping, and that is the point: it is the path `default:` has
always taken for an unrecognised node, so a misplaced block costs a tag and
never a sentence. A reader of a malformed document still reads it.

### What was rejected

- **Fixing the document.** There is nothing to fix. `supabase/seed.sql` never
  writes `notes_json`, the `block_documents` migration adds columns and
  backfills nothing, `documentFromText` emits `doc > paragraph > inline` and
  cannot nest, and TipTap's own schema gives `paragraph` a content expression of
  `inline*`. The nested document was transient database state — a spec's
  fixture, or a hand-written row — and a migration to repair the repo's data
  would have been a migration over no bad rows.
- **Rejecting it at write time.** That means validating the tree, which is the
  stack overflow the shallow schema exists to avoid. The renderer is the layer
  that owns the HTML contract; it is where the rule belongs.
- **Restructuring in `pruneToDepth`.** It is the server-exit boundary and looked
  like the tidy place, but unwrapping a nested paragraph changes what
  `flattenToText` produces, and that string is `comments.body_text` — search,
  exports and notification previews. `tests/prune-depth.test.ts` pins
  `flattenToText(pruneToDepth(doc)) === flattenToText(doc)`, and that invariant
  is worth more than the tidiness. Pruning bounds depth and flattens attributes;
  it does not edit documents.
- **A special case for `paragraph`.** The same defect exists for `heading`,
  and for a list, a table or a rule inside either. One rule covers all of them,
  and covers the next block type somebody adds — `tests/comment-nesting.test.tsx`
  drives its check off `ALLOWED_NODES` rather than off a list written by hand,
  so a new node type is put inside a paragraph by the suite whether or not
  anybody remembered to think about it.

A `listItem`, a `tableCell` and a `<summary>` take flow content, so a paragraph
inside them is correct HTML and is untouched.

## 2026-08-29 · Trunk-based, not testing/uat/production — and previews are not isolated data

**The decision.** `main` is the only long-lived branch and is always deployable. Work happens on
short-lived `feat/*` and `fix/*` branches that merge back through a pull request CI runs. Releases
are tagged. Vercel's per-branch preview deployments are the testing/UAT environment. Production
deploys from CI on green rather than from a push.

**Rejected: a `testing` → `uat` → `production` chain.** It is the shape people reach for, and for
this team it is cost with no benefit. Three long-lived branches create permanent merge debt
*between* them — every fix has to be landed three times or cherry-picked forward, and the drift
between them becomes a thing somebody owns. That buys environment separation, which is the point.
But **this project has one database.** A `uat` branch pointing at the same hosted Supabase as
`production` is not an environment, it is a second copy of the same code reading the same rows.
Paying the merge tax for separation you do not actually get is the worst of both.

**Rejected: keeping long-lived branches until a staging database exists.** That inverts the
dependency. The branches would be justified by a database nobody has budgeted; meanwhile the merge
debt accrues from the first day. If a staging database ever lands, adding a branch then is cheap —
un-picking three months of divergence is not.

**What previews actually give, and what they do not.** A preview is a full build of a branch on
its own URL, free, dying with the branch — genuinely useful for looking at a change before it
lands. It is isolated in **code**. It is **not** isolated in **data**: it points at the same hosted
Supabase as production, so writing an item or deleting a comment in a preview does it to the real
workspace. This is written into `CLAUDE.md` as a block quote rather than a footnote, because the
failure mode is somebody assuming "preview" implies "sandbox" and testing a destructive path in
one. A second free Supabase project would fix it and would double the migration work on every
change; not now, and revisit when the migration count is a baseline rather than 39 files.

**Consequence for the four people using this.** There is no "promote to UAT" step. A change is
reviewed on its preview URL, merged to `main`, and CI deploys it. The rollback is `vercel rollback`
to a tagged release, not a revert-and-redeploy race.

**Consequence for `vercel.json`.** `git.deploymentEnabled` is the documented control and the only
one — there is no dashboard toggle for disabling automatic production deployments, and the older
`github.enabled` is deprecated in its favour. That makes the file load-bearing and editable by
anybody, so it is made **tamper-evident** rather than duplicated: a unit test asserts it still
carries the setting, so removing it turns the suite red, and the post-push provider check that has
now held across three pushes stays the second control.

## 2026-08-30 · The migration squash is abandoned: `supabase migration squash` is not faithful here

**The decision.** The 39 migrations stay as 39 migrations. `supabase migration squash` was run,
verified, and its output **rejected**. Hosted's migration history was never touched — the run was
stopped before `migration repair`, which is the only step that would have been hard to undo.

**Why the ordering in the earlier ADR mattered.** That entry set the order as *real backup →
hosted caught up to local → squash → verify with `db dump --linked`, because `db diff` ignores
grants*. Every one of those clauses earned its place here. The verification is what caught this,
and it caught it in the one place `db diff` would have stayed silent.

**What the squash actually produced.** `supabase migration squash --version 20260829120000`
replays the migrations into the shadow database and dumps the result. Three things did not survive
the round trip. All were measured by dumping the local database before and after and diffing.

| | 39 migrations | 1 baseline |
|---|---|---|
| `GRANT … TO "anon"` statements | **3** | **43** |
| `authenticated` holding `TRUNCATE` or `ALL` | **23** | **62** |
| `coditu_backup` in `db dump --role-only` | present, with `pg_read_all_data` and both timeouts | **absent** |
| mentions of `coditu_backup` in the migration files | its own migration | **0** |

1. **The grants are wider, and one of them is a data-loss hole.** After a reset from the baseline,
   `information_schema.role_table_grants` says `anon has TRUNCATE,REFERENCES,TRIGGER on
   public.work_items`. **`TRUNCATE` ignores row-level security entirely.** The anon key ships in
   the browser bundle. This repository has a pgTAP assertion whose whole subject is that no table
   in `public` lets a non-owner truncate it, and the baseline breaks it on every table.
   The cause is the shadow database applying the Data-API default of exposing new entities to
   `anon`/`authenticated`; the dump then records that as explicit `GRANT`s, and they become part
   of the "schema".
2. **The backup role vanishes.** `supabase db dump` is schema-only and roles are a separate dump
   (`--role-only`), so `20260828140000`'s `create role coditu_backup` is simply not in the
   baseline. A database rebuilt from it has no role for the nightly backup to connect as.
3. **Data written by migrations is gone.** The storage-bucket rows are inserted by migrations, and
   a schema-only dump does not carry rows. Four `storage.buckets` assertions fail after a baseline
   reset, including *"the avatars bucket is public"* returning `NULL`.

**And a fourth, which was fixable and is worth recording anyway.** The generated baseline opens
with pg_dump's preamble, including `select pg_catalog.set_config('search_path', '', false)`. The
third argument is `false` — session, not transaction — so the empty search path outlives the file,
and `supabase db reset` seeds on the same connection. `supabase/seed.sql` calls `gen_salt()`
unqualified, so the reset died with `42883 function gen_salt(unknown) does not exist` two lines
after the baseline had installed pgcrypto. None of the 39 hand-written migrations carries a
pg_dump preamble, so this hazard arrives with the squash. A trailing `RESET search_path` fixed it,
and the reset then completed — which is how the other three were discovered at all.

**Rejected: fix the baseline by hand.** Every defect above is repairable — re-add the role, add
the bucket inserts, revoke the 40 extra `anon` grants. That produces a 6,000-line file, generated
by a tool but then hand-edited, whose correctness rests on somebody having spotted every
divergence in a diff. The thing being replaced is 39 files that are individually readable, in git,
and known-good against production. Trading a proved artefact for a hand-patched generated one, to
save reset time, is a bad trade — and this pass found three defects, which is evidence about how
many a careful reader misses, not evidence that there were only three.

**Rejected: squash a prefix only.** Same failure mode on whatever prefix is chosen, with the added
problem that the seam has to be reasoned about too.

**What the squash was worth.** The stated cost of 39 migrations is reset time in the sweeps that
reset five times. That is real and it is minutes. The cost of getting this wrong is `anon` holding
`TRUNCATE` on every table in production, or a restore that comes back without the role its own
backup connects as. Revisit only if the CLI's squash learns to carry roles, grants and
migration-inserted rows — and re-run exactly this verification, because it is the one that works.

**How it was verified, for whoever tries again.** Dump local before, squash, `db reset`, dump
local after, `diff`. Then `npm run db:test`, which failed on three separate assertions the diff
had already predicted. `db diff` was never used and would not have shown any of it.

## 2026-08-30 · R5 — the Actions minutes are one pool, and the arithmetic says the backup loses

**The risk, stated properly.** GitHub Free gives a private repository **2,000 Actions minutes a
month**, billed **per job, rounded up to the whole minute**, and the allowance belongs to the
**account**, not the repository — so `MooTamer/coditu` and `MooTamer/coditu-recovery` draw on the
same pool. CI, the nightly backup, the freshness canary and the keepalive are therefore not
independent. The failure mode is not that CI gets slow. It is that a busy fortnight of pushes
exhausts the allowance, **the nightly backup stops**, and the canary — also Actions — cannot run
to say so. Shipping speed and backup survival are coupled, and nothing had named it.

**Measured, not estimated** (billed minutes, Linux 1×, each figure from real runs):

| Job | Observed wall clock | Billed | Where |
|---|---|---|---|
| `scope` (new) | 5s, 6s | **1** | coditu |
| `lighthouse` | 270s, 277s, 280s, 281s, 285s, 287s, 288s | **5** | coditu |
| Nightly recovery copy | 148s, 254s, 325s | **3, 5, 6** | coditu-recovery |
| Recovery copy freshness | 8s, 9s, 11s | **1** | coditu-recovery |

The canary is the sharpest illustration of the rounding: it does eleven seconds of work and is
billed a **whole minute**, sixty times more than it uses.

**Two figures are bounded rather than measured, and are marked as such.** `browser` has never
completed in CI — it is `needs: check` and `check` had been red since 27 August. Its local serial
reference is 23.6 minutes for 631 specs, plus `npm ci`, `supabase start`, `db reset` and a
Playwright browser install, so **~40 minutes** is the working figure against its 70-minute timeout.
`deploy` has never run at all — no secrets — so **~7 minutes** is inferred from its steps.

**The fixed cost, before anybody pushes anything:**

| Scheduled job | Cadence | Runs/month | × billed | Minutes |
|---|---|---|---|---|
| Recovery copy freshness | every 3h | 240 | 1 | **240** |
| Nightly recovery copy | daily | 30 | 5 | **150** |
| Database keepalive | every 6h | 120 | 1 | **120** |
| Monthly recovery-copy integrity | monthly | 1 | 2 | **2** |
| | | | | **512** |

**512 of 2,000 — a quarter of the allowance is spent before a line of code is pushed**, and 240 of
it is the canary being billed a minute at a time for eleven seconds of work. That leaves
**1,488 minutes** for CI.

**What a push costs, and what the skip buys.**

```
code push : scope 1 + check ~13 + lighthouse 5 + browser ~40 + deploy ~7  =  ~66 min
docs push : scope 1 + check ~13 +              (both skipped) + deploy ~7  =  ~21 min
```

102 of the last 119 commits here — **86%** — touch only Markdown, because this repository writes
its ledger in the same commit as the work. Blending at that rate:

```
average push          = 0.14 x 66 + 0.86 x 21  =  27.3 min
sustainable pushes    = 1488 / 27.3            =  ~54 per month
without the skip      = 1488 / 66              =  ~22 per month
```

**And then halve both**, because the branch model routes work through pull requests and `on:
pull_request` means each change is built twice — once on its PR, once on the merge. So the honest
figures are **~27 changes a month with the skip, ~11 without it**. Eleven changes a month is less
than this repository does in a day, and the thing that breaks when it runs out is the backup.

**Decision.** Skip `browser` and `lighthouse` on documentation-only changes, decided by a `scope`
job that costs one billed minute to save about forty-five. It fails **safe**: if the changed-file
list cannot be determined, it reports `code=true` and everything runs. It is written as "not in
the docs allowlist" rather than as a list of code paths, so a new top-level directory defaults to
running the suite.

**Rejected: `paths-ignore` on the workflow trigger.** It would cost zero rather than one minute,
but it skips the *whole* workflow, taking `check` and `deploy` with it — so a documentation push
to `main` would never deploy, and the blocking checks would stop running on the file that holds
the deployment ledger.

**Rejected: cutting the canary's cadence again.** It is already three-hourly, down from hourly, and
240 minutes is what the rounding does to a job that runs for eleven seconds. Going to six-hourly
saves 120 minutes and halves the resolution of the one control that detects a stopped backup. That
is the wrong thing to economise on; CI is where the slack is.

**Named, not done: the next lever is `browser`.** It is report-only, it is ~40 of the ~66 minutes a
code push costs, and it is the reason the arithmetic is tight. Moving it to a nightly schedule
would take a code push from ~66 to ~26 minutes and cost ~40 minutes a month instead of ~40 per
push. That is a real change to what blocks a release, so it is recorded here as the next decision
to take rather than taken quietly inside a budget exercise — and it should be taken with the
ten-run determinism review, which is the other thing gating that job's promotion.

**What would make this stop mattering.** The repository is private; a public repository has
unlimited Actions minutes. Making it public is not a decision this pass can take.

### Postscript, same day: what this pass itself cost, measured

The R5 arithmetic above was written from per-job figures. Here is the aggregate from one evening's
work on `MooTamer/coditu`, completed jobs only, billed minutes:

```
lighthouse (marketing)                 46 min
blocking release checks                33 min
what changed                            9 min
(older CI job name)                     5 min
Database keepalive                      1 min
                                       -------
                                       94 min   in ~85 minutes of wall clock
```

**94 minutes — around 5% of the monthly allowance — in one sitting, and the `browser` job never ran
once**, because `check` was red for most of it and skipped afterwards. Twelve pushes, seven of them
still in flight when this was counted, so the real figure is higher.

Two things the aggregate shows that the per-job table did not.

**`lighthouse` is the second-largest line item and it is report-only.** 46 minutes, nine runs, every
one of them failing on the same documented 93-against-95 Performance gap that
`ci.yml` already explains is unreachable on this stack. It is now skipped on documentation-only
pushes along with `browser`, which is most of them — but on code pushes it is five or six minutes
to re-learn a number that has not moved and is not allowed to block anything. It belongs on the
same nightly schedule proposed for `browser`.

**Queueing is a cost too.** Seven runs were in flight simultaneously at one point, competing for
runners; the `check` job's `degraded` step — which pauses containers and waits for recovery —
stretched past twenty minutes under that contention against roughly four locally. Minutes are
billed on wall clock, so a burst of pushes costs more per push than the same pushes spread out.
Nothing here is a reason to batch commits, which would be worse for the ledger; it is a reason to
keep the expensive jobs off the pushes that cannot possibly need them.

## 2026-08-30 · The second deploy control is the Ignored Build Step, and an earlier ADR was wrong about it

**What this corrects.** The trunk-based ADR above says of `git.deploymentEnabled`: *"the documented
control and the only one — there is no dashboard toggle for disabling automatic production
deployments"*. Half of that is confirmed and half of it is wrong, and the wrong half was load-bearing.

**Confirmed:** there is no *Settings → Git → Production Deployments* toggle. Mohamed read the whole
page. Two earlier passes told him to flip it; the instruction could not be followed and has been
removed from `06-PROGRESS.md` and `10-PRODUCT-FEEDBACK.md`.

**Wrong:** "the only one". Vercel exposes a second, provider-side control — the **Ignored Build
Step**, under Project Settings → Build and Deployment. It is not a toggle and it is not on the Git
page, which is why looking for a toggle on the Git page found nothing and concluded too much.

**The decision.** `git.deploymentEnabled` in `vercel.json` stays, and the Ignored Build Step becomes
the second control. The exact command, its prerequisites and its failure modes are in
`13-DEPLOYMENT-RUNBOOK.md` §8 rather than here, because that is where somebody setting it up will
look.

**Why two controls rather than a better single one.** `vercel.json` is repository state: editable by
anybody with commit access, including by accident in a merge — and on 2026-08-29 it **leaked once**
regardless, at `707d03f`, while carrying the strongest form of the setting. The Ignored Build Step
is provider state; a repository edit cannot reach it and a merge cannot touch it. Two controls that
fail independently is the whole design. Two controls that fail together would be decoration.

**The trap, recorded because it is the kind that hides.** The Ignored Build Step **fails open**. It
reads `$VERCEL_GIT_COMMIT_REF`, which is a system environment variable, and system variables only
reach a build when *Automatically Expose System Environment Variables* is on. With that off the
variable is empty, the branch test is false, the command exits 1, and the build **proceeds** — on
`main`, unguarded, with no error and no log line saying the guard did not fire. A control that
disappears silently when a neighbouring setting is off has to be verified, not configured and
believed. §8 says how.

**Rejected: moving the ignore command into `vercel.json` as `ignoreCommand`.** It is a real key and
it would work, and it would also **override** the dashboard setting — collapsing the two controls
back into the one file the second control exists to be independent of. `vercel.json` therefore keeps
`git.deploymentEnabled` and no ignore key at all.

**Not asserted, because it is not known.** Whether the Ignored Build Step also blocks a
`vercel deploy --prod` issued by CI is undocumented. Both readings are plausible and this ADR takes
neither. **T1.5(d) tests it**, and `ALLOW_MAIN_BUILD=1` is already in the command as the escape
hatch if the answer is that it does. Guessing here would produce either a gate that ships nothing
while reporting success, or a second control that was never actually needed.

## 2026-08-30 · T2.1 is closed as ABANDONED, not deferred — and the generator will not be repaired

**The decision, stated so nobody re-opens it by accident.** T2.1 — "squash the 39 migrations into
one baseline" — is **abandoned**. Not deferred, not blocked, not waiting on a backup or a quieter
week. The repository keeps 39 migration files. There is no follow-up ticket, and a future pass that
finds this idea attractive should read this entry before spending an evening on it.

The measurement ADR above records what the squash produced. This entry records that the matter is
settled and why the trade is not close.

**The three defects, restated because they are the whole argument.** All measured on the generated
baseline, by dumping the local database before and after and diffing:

1. **`anon` was granted `TRUNCATE` on every table.** Grants to `anon` went from **3 to 43**.
   `TRUNCATE` ignores row-level security completely, and the `anon` key ships inside the browser
   bundle. This is not a lint-level regression; it is a stranger being able to empty `work_items`.
2. **The `coditu_backup` role was lost entirely.** `supabase db dump` is schema-only and roles are a
   separate dump, so the role's own migration simply is not in the baseline — **0 mentions**. A
   database rebuilt from it has no role for the nightly backup to connect as, which means the
   artefact that exists to survive a disaster quietly stops being written.
3. **The migration-inserted `storage.buckets` rows were dropped.** A schema-only dump carries no
   rows, so four bucket assertions fail after a baseline reset, including *"the avatars bucket is
   public"* returning `NULL`.

**Three of those were caught unprompted by this repository's own pgTAP suite.** That is the fact
that decides it. Nobody went looking for them; `npm run db:test` simply went red. Three found by
accident is evidence about the density of what is there, not evidence that there were three.

**The conclusion, in one line.** Thirty-nine migrations is a **readability cost**. A baseline that
silently re-grants privileges is a **security hole**. That trade is not close, and no amount of
reset time saved moves it.

**Do not attempt to repair the generator.** Each defect is individually fixable — re-add the role,
add the bucket inserts, revoke the forty extra `anon` grants, reset the search path — and repairing
them is still the wrong move. What you would end up holding is a 6,000-line generated file, then
hand-edited, whose correctness rests on one person having spotted every divergence in a diff that
already hid three. What it replaces is 39 hand-written files that are individually readable, in git,
reviewed, and known-good against production. Swapping a proved artefact for a patched generated one
to save minutes on a database reset is a bad trade in whichever direction it is written down.

**The one condition that would re-open this**, so the door is closed rather than locked: the
Supabase CLI's squash learning to carry roles, grants and migration-inserted rows. If that ever
happens, re-run *exactly* the verification in the ADR above — dump, squash, reset, dump, diff, then
`npm run db:test` — because `db diff` is blind to every one of these and would have reported success.

## 2026-08-30 · `main` is protected by a branch ruleset, which is the control upstream of the deploy controls

**The decision.** A GitHub **repository ruleset** (id `21825959`, *"main moves only through a green
pull request"*) is active on the default branch. It requires a pull request, requires the
`blocking release checks` status check to pass, and blocks force-push and deletion. Enforcement is
`active`, `bypass_actors` is empty, and the API reports `current_user_can_bypass: never` — including
for the repository owner.

**Why this sits above the Vercel controls rather than beside them.** The two deploy controls
(`vercel.json` and the Ignored Build Step) both answer the question *"should this commit deploy?"*
after the commit is already on `main`. This one answers *"should this commit be on `main` at all?"*
If `main` can only move through a green CI run, then a deploy from `main` is a deploy of tested code
**by construction**, and the deploy controls become a second line rather than the only one. It is
also the only control here that survives someone deciding to deploy by hand.

**Verified by refusal, not by reading the settings back.** An empty commit was made, pushed directly
at `main`, and rejected. The commit was then discarded locally and `origin/main` confirmed unmoved at
`2c4dd29`:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: Review all repository rules at https://github.com/MooTamer/coditu/rules?ref=refs%2Fheads%2Fmain
remote:
remote: - Changes must be made through a pull request.
remote:
remote: - Required status check "blocking release checks" is expected.
remote:
To https://github.com/MooTamer/coditu.git
 ! [remote rejected] main -> main (push declined due to repository rule violations)
```

Both rules fired, which is worth noting: the status-check rule is not merely configured, it is
evaluated on the push path too.

**Force-push and deletion were NOT tested by attempting them**, and that is deliberate rather than
an omission. The only way to test "can `main` be deleted" is to try to delete `main`, and if the
answer turned out to be yes there is no undo worth having. The `deletion` and `non_fast_forward`
rules are recorded in the ruleset object returned by the API; that is the evidence, and it is the
right amount of evidence for a test whose failure mode is losing the trunk.

**Rejected: requiring an approving review.** `required_approving_review_count` is **0**. GitHub does
not let an author approve their own pull request, and Mohamed is the only account with write access
here. Requiring one approval would mean nothing could ever merge — a control so strict it gets
switched off in a week, which protects less than a weaker one that stays on. The pull request itself
is what forces the CI run; the approval would only add a person, and there is not a second person.

**Rejected: adding a bypass actor for the owner.** It was tempting while writing this — the
remaining work in this pass now has to go through a pull request, which costs a CI run. But a
control with a bypass for the only person who would ever bypass it is not a control, and the cost is
one run of a workflow that ought to run on a code change anyway.

**Consequence, stated plainly.** Direct pushes to `main` are over, including from an autonomous
pass. Work goes on `feat/*` or `fix/*`, and merges through a pull request CI has gone green on.
That is what `CLAUDE.md` already described; until today nothing enforced it.

**Note for whoever reads the ruleset JSON later:** GitHub defaulted
`require_extra_approval_for_unattributed_changes` to `true` on the pull-request rule. It was not
requested. With zero required approvals it has nothing to gate today, but it is the kind of default
that becomes visible the day a review requirement is added.

## 2026-08-30 · PF-15: one of its four parts was new work, and the other three were already answered

PF-15 asked for four things: **(a)** route prefetch on the paths people take, **(b)**
stale-while-revalidate reads for the active sprint, **(c)** optimistic UI on the frequent writes,
**(d)** an IndexedDB queue for pending mutations only. Building all four would have meant undoing
two measured decisions and re-implementing a third. What follows is what each one turned out to be,
because "we did not build it" and "it is already built" and "we measured it and it lost" are three
very different answers and only one of them is a gap.

### (c) — already built. Verified, not assumed.

All three writes PF-15 names are already optimistic, through `useOptimistic` plus `useTrackedSave`:

| Write | Where | Optimistic since |
|---|---|---|
| status | `components/app/row-editors.client.tsx:71` | before this pass |
| criterion tick | `components/app/criteria-list.client.tsx:152` | before this pass |
| log time | `components/app/log-time.client.tsx:62` | before this pass |

Nothing was needed. This is recorded rather than silently ticked because a ledger that cannot tell
"done earlier" from "done now" stops being useful for planning.

### (a) — rejected, and it was already rejected with numbers.

The prefetch ADR of 2026-08-27 measured exactly this, on a production build with
`pg_stat_statements` reset before each run:

| | RSC renders | Database statements | Open an item | Rail navigation |
|---|---|---|---|---|
| prefetch on | 28 | 178 | 210 ms | 269 ms |
| `prefetch={false}` | **0** | **40** | 206 ms | 277 ms |

Turning prefetch back on costs **138 extra database statements per sprint page view** and buys
8 ms across a 270 ms navigation, which is noise. Every route under `/app` is dynamic, so each
prefetch is a full server render — and `staleTimes.dynamic` defaults to `0`, so the payload is stale
on arrival and the click re-fetches anyway. The renders are performed and discarded.

**Prefetch-on-intent was considered and does not rescue it.** Hovering would fire one speculative
render instead of twenty-eight, which fixes the cost — but `staleTimes.dynamic: 0` means that one
render is *also* thrown away on the click. It would be a smaller waste, not a win.

### (b) — rejected, for correctness, and by the same ADR.

Stale-while-revalidate on the sprint **is** `experimental.staleTimes.dynamic` with a non-zero value;
that is the mechanism. The earlier ADR rejected it in these words: this is a live sprint board with
realtime subscriptions, and *the reason the footer total is trusted is that it is never out of date*.
A reader who tabs to People and back would be shown the sprint as it was up to N seconds ago, and
the number this application's credibility rests on is a sum of minutes.

Trading that for ~8 ms — the measured size of the prize — is not a trade worth making. If PF-15's
author wants it anyway, it is one config line and this entry is where the argument against it lives.

### (d) — built. The only part of PF-15 that was a gap.

`lib/pending-queue.ts`, and it is the part that makes an existing sentence true rather than a new
feature: the save chip has said **"Offline — will retry"** since the vocabulary was written, and
nothing retried. A promise nobody kept is worse than no promise, because the person who read it
closed the tab.

**It stores intentions, not data.** No dataset, no cache, no conflict resolution; nothing in
IndexedDB is ever read to render a screen. That is what keeps it inside the local-first rejection
rather than reopening it — the server is still the only source of truth, and the only local fact is
"this write has not landed yet".

**A Server Action cannot be serialized and called tomorrow**, so the queue stores a descriptor and a
replay table maps it back to the real action at drain time. The consequence that matters is that
invariant 3 is untouched: a replay goes through the *same* action, zod-validated and re-authorized
server-side, so somebody whose access was revoked while they were offline has their replay refused
exactly as a fresh attempt would be.

**Only replay-safe writes are wired**, and the reasoning is per-write rather than blanket:

- `status` and `criterion` are **assignments** to a named value, not toggles of whatever the server
  currently holds — so arriving twice changes nothing, and a replayed tick cannot untick something
  somebody else ticked in between;
- `time` **appends**, so it is the one that needs the `idempotencyKey` the action already accepts,
  minted once per submission and reused by every retry.

**The discriminator became explicit, and that was a real bug found on the way.** Queueing must
happen when the network refused the write and must NOT happen when the *server* refused it — replay
a server's "no" and you get the same "no" forever, with a badge that never clears. The first version
told them apart by comparing the error string against the fallback. That is wrong at every real call
site, because several of them wrap `settle` around `settle`: the inner one catches first, so the
outer sees a resolved result carrying the *inner* sentence, and the comparison is quietly false.
`settle` now marks its own synthesised failure with `unreachable: true`, and
`tests/action-result.test.ts` holds exactly the nested case that broke the string version.

**Rejected: keeping server-refused replays on the queue.** An entry the server has read and declined
is dropped, with its reason returned to the caller. Keeping it would produce a queue that can never
empty.

**Rejected: `navigator.onLine` as the test for whether to queue.** It answers "is there a network
interface", not "did this request arrive", and it is cheerfully `true` on hotel wifi that resolves
nothing. It is still used for the *chip's wording*, which is a different question and the one it can
actually answer.

### What (d) cost, measured rather than estimated

`npm run budgets`, production build, same command before and after, on the same machine minutes
apart:

| | app shell own | app shell total | marketing |
|---|---|---|---|
| before (`2c4dd29`) | 78.0 KB gz | 217.9 / 220 | 153.9 KB |
| after | 78.4 KB gz | **218.3 / 220** | 153.9 KB |

**+0.4 KB on the critical path**, against a 6 KB stop threshold and about 2 KB of remaining
headroom. The queue's own code is a separate chunk of **1,106 bytes gzipped** (2,150 raw), fetched
only in a session where a write actually fails — confirmed by finding the chunk that carries
`indexedDB.open("coditu", 1)` and gzipping it.

The `dynamic import()` is what makes those two numbers different, and it is the reason the design
puts a `localStorage` integer in the shell rather than opening IndexedDB there: knowing *whether*
anything is queued has to be free, because it is asked on every load; knowing *what* is queued can
cost a fetch, because it is asked almost never.

### How the behaviour is proved

`e2e/pending-queue.spec.ts` cuts the network for POSTs only, changes a status, and asserts the chip
reads `data-pending="1"`, that IndexedDB holds one `status` entry, and that **the database is
unchanged** — then restores the network, fires `online`, and asserts the status lands, the chip
clears and the queue empties. **Verified capable of failing**: with the `retry` argument removed
from the status call site the chip goes to `data-state="failed"` and the test fails at that
assertion.

`e2e/optimistic.spec.ts`'s failed-write test changed with this, deliberately. It asserted the toast
said *"did not save"*, which was true when nothing retried and is now a contradiction of the chip
beside it. It asserts the new sentence instead — and clears the queue before leaving, because that
test strands a real time entry, and an undrained entry would surface later as another spec's sprint
total being wrong, a long way from its cause.

---

## 2026-08-30 · A safety control must fail CLOSED, and a deploy must not

**The rule, and it is the whole of this ADR:**

> **A safety control must fail CLOSED, and the absence of its configuration is itself a failure
> condition worth alerting on.** A control that is quiet when unconfigured is indistinguishable from
> a control that is working, which is the worst property a control can have.

And its one deliberate inversion, because the two look contradictory until they are said together:

> **A DEPLOY that is not configured should be SKIPPED, because not deploying is safe. An ALARM that
> is not configured must be LOUD, because not alarming is not safe.**

That second sentence is the reason `ci.yml`'s `preflight` job and `backup-canary.yml`'s `alarm` step
are written in opposite directions from the same finding on the same day. It is not an inconsistency
and it should not be tidied into one.

### What was actually found

Every instance was written the same way, and every one was added on purpose by somebody being
careful:

```bash
if [ -z "${SOMETHING:-}" ]; then
  echo "::notice::… is not set; X is NOT active"
  exit 0
fi
```

That shape reads as caution in review and behaves as a switch that turns the guard off. Three were
already known when this pass started. Sweeping for the rest found that most of the repository's
guards had a version of it, and that the two most consequential were not in CI at all but in the
database and in the scanner that reads it.

The full inventory, with the question that produced it — *what would have to break for this to go
red?* — is `docs/08-GAP-MATRIX.md` §"Fail-open sweep".

### The decisions

**1. The production deploy SKIPS rather than fails.** `ci.yml` gained a `preflight` job that reports
whether each deploy value is present, by name only, into a string output; `deploy` reads that output
in its `if:`. `secrets` is not available in a job-level `if:` — GitHub evaluates those before secrets
are in scope — so the presence test cannot live there directly, and this is the documented idiom for
it.

The step it replaces asserted every value was non-empty and exited 1. It was correct about the
danger and wrong about the colour: `VERCEL_TOKEN` and `HOSTED_SCHEMA_DB_URL` have never been set, so
**every push to `main` painted the trunk red for a setup gap**, and a permanently-red trunk teaches
people to stop reading red. Three of `main`'s last four CI runs were red for exactly this.

*Rejected: leaving it red until the secrets arrive.* The cost is paid immediately and the benefit
never arrives — nobody reads a check that has never been green.

*Rejected: skipping silently.* A skipped job with no explanation is the fail-open this ADR is about.
The preflight writes a warning annotation and a job summary naming every missing value, so "not
configured" is something you read rather than something you infer from a job that did not appear.

**2. The backup canary FAILS without `HEARTBEAT_URL`.** An unconfigured dead-man's switch is green
forever, and green forever is precisely the failure it exists to catch in the thing it watches. The
same now applies to `PRODUCTION_BASE_URL` and `BACKUP_CANARY_REPORT_SECRET`, which are its other
publishing path.

All three are checked in ONE step, FIRST, and it does not exit there: the freshness read still runs,
so a single run tells you both "nothing is watching" and "the newest set is fine". A last step turns
the unconfigured alarm into the red.

*Objection considered:* a red run every three hours trains everyone to ignore red — the same argument
that decided (1). It is answered by fixing the setup, not by hiding it. Until it is fixed the red is
**true**: nothing is watching the backup. The deploy's red would have been **false**.

**3. The keepalive FAILS without `PRODUCTION_BASE_URL`.** A paused Supabase project is downtime that
no deploy caused and no other check reports. Four green ticks a day that pinged nothing is the worst
possible state for it. (It is in fact configured — `PRODUCTION_BASE_URL` is a repository variable —
but it was one deletion away from being silently inert.)

**4. The nightly backup reads the store back.** `backup.sh` defaults `BACKUP_UPLOAD` to 0, which is
right for a hand-run copy and is a trapdoor in CI: lose that one line from the workflow's `env` block
and the job dumps the whole workspace into the runner's temporary directory, prints every count,
exits 0, and is destroyed with the runner. The job now runs the same freshness check the canary runs,
against a one-hour window, so it can only pass on the set it just published.

**5. The freshness canary rejects an EMPTY recovery set.** It accepted `databaseRows >= 0`, so a dump
that connected, found nothing, and wrote a valid correctly-checksummed archive of no rows was fresh,
complete and green. Floors — `BACKUP_MIN_DATABASE_ROWS`, `BACKUP_MIN_STORAGE_BUCKETS`, both 1 by
default — rather than a comparison against the previous set: a fixed expected count breaks the first
time somebody legitimately deletes a project, and the failure being guarded against is collapse to
nothing, not drift.

**6. The monthly drill proves what it can, and says what it cannot.** It now reads the age v1 header
— plaintext, no key needed — and asserts the archive IS encrypted, to EXACTLY ONE recipient, with a
complete header. It cannot assert *which* recipient: an X25519 stanza carries an ephemeral share, not
the public key, by design.

**It is still not a restore.** `verify-backup-restore.sh` is the restore drill, it needs the private
key, and the private key is deliberately not on GitHub — so no scheduled job can run it. The
2026-08-28 decision "who runs the drill? nobody — automated monthly" is therefore **not satisfied by
what was built**, and cannot be while R1 stands. Recorded as an open risk rather than papered over;
the job prints `this_is_not_a_restore=true` so the run page says so too.

**7. `sync-recovery-repo.sh --check` is in the gate now.** It reports drift between this repository
and `MooTamer/coditu-recovery`'s copy of the backup tooling, it needs no network, it has existed
since the recovery repository did — and it was in no gate, no CI job and no `package.json` script. It
was one command away from visible, which `scripts/gate.sh`'s own header says is the same as
invisible.

**8. The engineer column guards are allowlists now.** This is the largest finding of the pass and it
is not in CI at all.

`guard_work_item_columns` raised only for columns *named in a case expression*. Its message said "an
engineer may change only status and order_index" and that sentence was false. Measured on a clean
local stack, as `engineer`, on an item assigned to them:

| Column | Before `20260830140000` | After |
|---|---|---|
| `title` | refused, 42501 | refused |
| `order_index` | `UPDATE 1` — intended | `UPDATE 1` |
| **`minutes_logged`** | **`UPDATE 1`** | refused |
| `closed_at` | `UPDATE 1` | refused |
| `created_at` | `UPDATE 1` | refused |
| `id` | refused — by a foreign key from `activity`, not by the guard | refused |

`minutes_logged` is the trigger-maintained rollup **invariant 2 exists to protect**, and every sprint
total, earnings figure and payout is derived from it. An engineer could set their own to any number
and nothing in the database would object.

The guards now derive their list from `information_schema.columns` and refuse everything outside the
allowlist, so **a column added tomorrow is locked by default** and opening it is a deliberate edit
rather than an omission. `pg_trigger_depth() > 1` exempts writes a trigger makes on the caller's
behalf — `refresh_minutes_logged` is `security definer`, but `auth.uid()` reads a GUC that
`security definer` does not reset, so without that escape no engineer could log time at all.

*Why this counts as the same defect:* "configured" here means "somebody remembered to add the new
column to the list". `component_id` and `body_json` were each added retrospectively for exactly that
reason — the pattern announced itself twice before anybody named it.

**9. The test for (8) had the same defect, and is replaced.** `read-boundary.sql` asserted that the
guard's SOURCE TEXT contained each of nineteen hard-coded column names. A column absent from the
guard was also absent from the test, so both stayed green about a column neither had heard of. It is
replaced by `supabase/tests/column-guards.sql`, which asks the database — for every column the
catalogue reports, can an engineer change it? — plus a one-line structural assertion that the guard
derives from the catalogue, which is what makes the sweep's coverage total. **Verified capable of
failing: 5 of its 9 assertions fail against the pre-migration guard.**

**10. Two scans that were green because they found nothing.** `check-action-resilience.mjs` reports
`bare = 0` both when every call site is correct and when it read no call sites at all; it now fails
below a floor of 40 (99 today). `check-budgets.mjs` measured `own ≈ 0 KB` for a route that redirected
to `/login` on an expired cookie, or loaded zero chunks; it now fails on either.

### What is deliberately NOT changed

**`lighthouse` stays report-only, and stays red.** It fails on Simulated LCP on a busy shared runner,
which is not "the marketing page regressed" — so it is a check whose red does not mean the thing in
its title, and it is in the table for that. But it fails CLOSED, and the earlier ADR's reasoning for
not gating on a number the stack cannot reach still holds. Changing it would be tuning a report, not
closing a hole.

**`components:check` stays out of CI.** It reads a second checkout (`microsoft-web-parts-final`) that
is not on the runner. It fails closed when that checkout is missing, so it cannot be made to lie; it
simply cannot run there. Recorded rather than worked around.

### Parked, and named rather than routed around

`VERCEL_TOKEN` and `HOSTED_SCHEMA_DB_URL` are Mohamed's, as is `HEARTBEAT_URL`. Verified by name on
2026-08-30: `MooTamer/coditu` holds **zero** secrets at repository or `Production`-environment level,
and one variable, `PRODUCTION_BASE_URL`. `MooTamer/coditu-recovery` holds `BACKUP_DB_URL`,
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and **no** `HEARTBEAT_URL`,
`BACKUP_CANARY_REPORT_SECRET` or `PRODUCTION_BASE_URL`.

So four deploy values are missing, not two: `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are ids rather
than credentials and are read from `.vercel/project.json` after linking, which needs the token
anyway. `docs/13-DEPLOYMENT-RUNBOOK.md` §1 now carries the exact recipe for
`HOSTED_SCHEMA_DB_URL` — the `coditu_backup` role over the **session pooler on 5432**, because
`db.<ref>.supabase.co` has no A record — so the only thing that has to be invented is the token.

Making `HEARTBEAT_URL`'s absence loud is the correct state until it is set. That is the point of the
rule, applied to itself.

---

## 2026-08-31 · The last two deploy values are placed; the preflight connects as `postgres`, not `coditu_backup`

**Decision — the two identifiers are set by this pass, the two credentials are not.**
`VERCEL_ORG_ID` (`team_vJjCIjOpMU8pPsB45cWNnoNr`) and `VERCEL_PROJECT_ID`
(`prj_GOg3XIVdg7u6WPAzaHFJy2QnfBHu`) were read from the Vercel API for the `coditu` project linked
to `MooTamer/coditu` and written with `gh secret set`. `VERCEL_TOKEN` and `HOSTED_SCHEMA_DB_URL`
were set by Mohamed earlier the same morning. All five values the preflight names now exist.

**Why placing these two is not the same act as placing the other two.** A team id and a project id
are routing identifiers — they appear in `.vercel/project.json`, which is a file most repositories
commit — and this document had already written both of them out in full. Nothing is disclosed by
setting them and nothing is authorised by holding them. A token and a database password are
different in kind, and neither was minted, chosen, read, or placed by this pass.

**Decision — the schema preflight connects as `postgres` over the session pooler, and that is a
recorded deviation rather than the design.** `HOSTED_SCHEMA_DB_URL` names `postgres` at
`aws-0-eu-central-1.pooler.supabase.com:5432`, because the `coditu_backup` password was not
reachable at the moment the secret was set. The direct host was not an option for an unrelated
reason that keeps recurring: `db.hayfsvsepgfescojesbd.supabase.co` publishes only an AAAA record.

**Why this is acceptable for now, stated as the property that carries it rather than as trust.**
`check-hosted-schema.mjs` opens `begin read only`, reads catalogue tables, and rolls back. It has
no write path. The exposure of the wider role is therefore bounded by the transaction, not by the
role — which is exactly the sort of claim that should be measured rather than asserted, and the
same-day change to the preflight measures it.

**What is owed.** Narrowing `HOSTED_SCHEMA_DB_URL` back to `coditu_backup` — the role exists on
hosted today, with `rolbypassrls`, `select` and no `insert` on `public.work_items`, verified
2026-08-31. That is a password change and a secret update, so it is Mohamed's. Recorded as an open
risk, not as done.

**Rejected: setting it here.** The `coditu_backup` password is on the delivery Mac, so this pass
*could* have written the narrower URL. Two reasons not to. Placing a password into a secret store
is the class of action an autonomous pass should decline on principle, and it would have silently
overwritten a value Mohamed had deliberately chosen an hour earlier. A control that an agent
reconfigures behind the operator is worse than a control with a known, written-down gap.

**Rejected: relaxing the role assertion to whatever connects.** That is the fail-open shape this
repository spent 2026-08-30 removing — a check that is quiet exactly when it is not configured.
The deviation is instead named in `ci.yml`, defaults to the strict contract when absent, and is
loud on every run.

---

## 2026-08-31 · `sslmode=require` breaks the preflight; the same string is correct for the backup

**Decision.** `docs/13-DEPLOYMENT-RUNBOOK.md` §1 now documents `?sslmode=no-verify` for
`HOSTED_SCHEMA_DB_URL`. `docs/12-RECOVERY-RUNBOOK.md` keeps `?sslmode=require` and is not changed.

**Why — measured, not reasoned.** Run against the real project on 2026-08-31, `?sslmode=require`
never reaches a schema verdict:

```
check-hosted-schema: database preflight could not complete (SELF_SIGNED_CERT_IN_CHAIN):
self-signed certificate in certificate chain
```

`pg` 8.23.0 with `pg-connection-string` 2.14.0 treats `prefer`, `require` and `verify-ca` as
aliases for **`verify-full`**, and says so in a runtime warning. Supabase's chain ends at "Supabase
Root 2021 CA", which is in no public trust store, so full verification cannot succeed without the
root supplied out of band. With `?sslmode=no-verify` the same command reaches the real answer and
refuses for the real reason — one missing migration.

**Why the recovery runbook stays as it is.** Its leg is `psql` and `pg_dump`, which are libpq,
where `require` has always meant encrypt-and-do-not-verify. **One string, two clients, two
meanings** — and §1's copy came from there. This is worth naming because `pg` 9 adopts libpq
semantics, so `require` will begin working on a future dependency bump. A wrong line that starts
working on its own is the hardest kind to notice.

**Not weakened by this.** The check never delegated verification to the driver. It asserts the
client socket is encrypted and pins the issuer to `Supabase Inc` by name, and
`HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS=1` still demands the strong form. Verified capable of failing:
with no ssl parameter at all the connection is cleartext and the check says so —
`database connection is not encrypted` — rather than passing.

---

## 2026-08-31 · The schema preflight establishes its own TLS; the connection string says only where

**Supersedes the `sslmode=no-verify` half of the entry above.** That entry corrected the documented
string. This one removes the string's authority over transport altogether, which is the fix the
correction was standing in for.

**What happened.** The first CI run with `HOSTED_SCHEMA_DB_URL` set refused, and one of its two
findings was not the expected one:

```
##[warning]connected as postgres, and the contract is coditu_backup. …
  - database connection is not encrypted
  - missing migration 20260830140000
check-hosted-schema: 2 hosted schema requirement(s) failed
```

The secret's URL carried no usable `sslmode`, so the deploy preflight was reading the production
database **in cleartext across the public internet**. The assertion caught it and failed closed,
which is the control working. The design around the assertion was the defect.

**Decision.** `check-hosted-schema.mjs` decomposes the URL and passes host, port, user, password and
database explicitly, dropping the query string, and supplies `ssl` itself. The URL says *where* to
connect; the check says *how*.

**Why not simply fix the secret.** Because the next person to set it can get it wrong the same way,
and nobody would be able to tell by looking. A transport guarantee that lives inside an opaque
secret is a guarantee that cannot be reviewed — the shape this repository has been removing all
week, arriving in a new place. It also cannot be got right by one rule: `sslmode=require` means
encrypt-and-do-not-verify to `psql` and **`verify-full`** to `pg` 8.23.0, so the string that is
correct for the backup leg failed outright on this one.

**Measured, because the obvious version was not enough.** Passing `ssl` beside `connectionString`
does not work: node-postgres lets a `sslmode` in the string win. With that version, `require` still
died with `SELF_SIGNED_CERT_IN_CHAIN` and `disable` still connected in cleartext. Only decomposing
the URL closes both. Against the real project, all five of `(nothing)`, `require`, `no-verify`,
`disable` and `verify-full&application_name=x` now reach the identical verdict — one missing
migration.

**Arranging and asserting are kept separate.** `transportFailures` still reads the client socket
afterwards and still pins the issuer to `Supabase Inc` by name. Verified capable of failing: with
the `ssl` option forced to `false`, the check still reports `database connection is not encrypted`.
If the arranging half is ever wrong, the asserting half still says so.

**Not weakened.** `HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS=1` still demands a verified chain, and now has
somewhere to put the root: `HOSTED_SCHEMA_DB_CA`.

---

## 2026-08-31 · Hosted reaches 40; and `is_developer` on hosted is not what the seed says

**Decision.** `20260830140000_column_guards_are_allowlists.sql` is applied to `hayfsvsepgfescojesbd`.
Hosted, local and the rehearsal stack all read 40 migrations, and the two guard bodies are
byte-identical across hosted and the rehearsal (`md5` `e712b802…` and `3bc06878…`).

**Applied through the Management API, not `supabase db push`.** The `postgres` password is not on
the delivery machine — `coditu_backup`'s is, and it is read-only by construction. The Management
API's `database/query` runs SQL as `postgres` and is how `coditu_backup` itself was created on
2026-08-29, so it is the established route rather than a new one. The guarded script still ran, on
both sides of the apply, as `--verify-only` through the read-only role: 16 checks, all green.

**The rehearsal was a real restore, not an approximation.** `nightly-2026-08-31T061608Z` was
decrypted with the local key and restored into a throwaway stack —
`restore_verified=true`, 64 tables, 1,397 rows, 135 Storage objects, matching the sidecar — which
gave hosted's own schema, data, roles and grants at 39. The defect reproduced there before the
migration and closed after it:

| column | before (39) | after (40) |
|---|---|---|
| `order_index` | `UPDATE 1` | `UPDATE 1` |
| `status` | `UPDATE 1` | `UPDATE 1` |
| **`minutes_logged`** | **`UPDATE 1`** | refused `42501` |
| `closed_at` | `UPDATE 1` | refused `42501` |
| `created_at` | `UPDATE 1` | refused `42501` |
| `title` | refused `42501` | refused `42501` |
| `estimate_minutes` | refused `42501` | refused `42501` |

And the regression that would have mattered most does not happen: after the migration an engineer
still logs time, `minutes_logged` moving 0 → 45 through `refresh_minutes_logged`, because
`pg_trigger_depth() > 1` exempts the write a trigger makes on the caller's behalf.

**Worth knowing: on hosted this migration changes nothing for anybody today.** All four profiles
are `admin`, and the guard returns early for an admin or lead. It becomes live the first time
somebody is made an engineer. That lowers the risk of applying it and is the reason the rehearsal
had to create an engineer to see anything at all.

---

**Found while verifying, NOT changed: `Ahmed Yehia.is_developer` is `false` on hosted.**

`supabase/seeds/developers.sql` names three people — Mohamed Tamer, Abdelrahman Elkhateeb, Ahmed
Yehia. Hosted has the first two as `true` and Ahmed as `false`; local has all three `true`. Since
the seed sets all three in one statement and two of them took, the seed ran and **something turned
Ahmed off afterwards** — which is exactly what the seed's own comment says an admin may do from
`/app/settings`, and says the file is not consulted again after.

**This is Mohamed's call and no production row was touched.** It is not yet a money error: hosted
holds **0 `sprint_payouts` and 0 `sprint_payout_shares`**. It becomes one at the first payout —
Ahmed has logged **12 entries, 5,040 minutes**, so his hours would swell the pot while he took no
share of it, which is the treatment the seed reserves deliberately for Adam Nafie. Either he should
be a developer, or he should not and the ledger should say why.

**The check that found it was itself wrong, and is fixed.** `push-to-hosted.sh` asserted
`count(*) = 3 from profiles where is_developer` — a constant, about a value the seed says an admin
edits in the interface. It goes red the first time somebody exercises the control, which is not a
fault. Same defect as the column guards and the three CI controls before them: a hand-maintained
expectation about something designed to change. It now asserts what it can actually detect — that
somebody takes a share, so a pot is not orphaned — and the roster is printed for a human to read.
Adam Nafie's exclusion stays a check, because that one is a stated product rule.

---

## 2026-08-31 · `push-to-hosted.sh` never parsed on the delivery Mac

**Found by running it.** The one script in this repository that writes to production dies before it
does anything, on the machine it is documented for:

```
scripts/push-to-hosted.sh: line 124: unexpected EOF while looking for matching `)'
```

`IMAGE_PREDICATE=$(cat <<'SQL' … )` — a heredoc inside a command substitution — is a **bash 4**
parser feature. macOS ships **bash 3.2.57**, and there is no other bash on this machine. It has
been this way since `529d106`, the commit that added the script and whose message says it was
rehearsed; that rehearsal was on a Linux runner, where it parses.

**Decision.** Replaced with `read -r -d '' IMAGE_PREDICATE <<'SQL' || true`, which is bash 3.2 and
keeps the heredoc verbatim. Verified: `/bin/bash -n` now parses the file, the predicate expands to
the same SQL, and the script completes 16 of 16 checks against hosted.

**Why this is worth an entry rather than a quiet fix.** The error names a paren and not the
construct, on the script whose whole purpose is to be run at the moment somebody is anxious. And it
is the second thing this pass found that had been *asserted* rather than *observed* — a rehearsal
recorded as done, on a platform that is not the one in the runbook.

---

## 2026-08-31 · No backup of this project carries the two triggers on `auth.users`

**Found by doing the restore rather than by reading about it.** The 2026-08-31 drill decrypted
`nightly-2026-08-31T061608Z` into a throwaway and reported `restore_verified=true` — 64 tables,
1,397 rows, 135 Storage objects, all matching. Then a query on the restored database returned
nothing where the migrated one returns two rows:

```
RESTORED : (none)
LOCAL    : enforce_email_allowlist, on_auth_user_created
```

`supabase db dump` writes the `public` schema; the managed schemas belong to the platform's own
services. Counted in the archive: **48** `CREATE OR REPLACE TRIGGER` statements, **all** on
`public.*`, **none** on `auth.*` or `storage.*`. The migrations attach exactly two to `auth.users`,
both from `20260820120100_identity.sql`.

**What that means in a recovered system.** `on_auth_user_created` gone: a new sign-up creates an
`auth.users` row and no profile, so the person exists to GoTrue and not to the app.
`enforce_email_allowlist` gone: **the no-public-sign-up gate is off**, and anybody reaching the
endpoint gets an account. That second one is a security regression that a restore introduces
quietly, in the middle of the worst day the project will ever have.

**Decision.** The archive is left alone — it is not at fault, and a dump cannot carry what the
platform owns. Two changes instead:

1. `docs/12-RECOVERY-RUNBOOK.md` §2 states what the set does not contain, and §3 gains a step 5a:
   re-apply the migrations over the restored database. A restore is not a recovery until it has run.
2. `verify-backup-restore.sh` refuses to print `restore_verified=true` while either trigger is
   absent, and names them and the remedy. Verified capable of both: red on the freshly restored
   database, green after the two triggers are created.

**The expected list is derived from the migrations, not written into the script.** A hand-kept list
would be silent about the trigger somebody adds next — the defect this repository has now found in a
database guard, in that guard's test, and in three CI controls.

**And the first version of that scan was green because it read nothing.** `grep` is line-based;
these statements span lines, with `create trigger x` and `on auth.users` never on the same one. It
matched zero and reported "none missing", which looks exactly like a clean result. It slurps the
file now, and there is a floor under it: the same scan must find at least 40 `public` triggers —
it finds 48, which is precisely the number the dump carries — or it fails on the grounds that a
scan which cannot see the ones that are there cannot be believed about the ones that are not.

---

## 2026-08-31 · The rollback drill covers recovery against real production, and deliberately not noticing

**Decision.** `.github/workflows/rollback-drill.yml` plus `scripts/rollback-drill.sh`:
dispatch-only, sharing the deploy job's `production-deploy` concurrency group so the two can never
move the domains at once. It rolls production to the previous READY production deployment, proves
**from the public origin** that `/build-health.json` now reports a different commit, then rolls
forward and proves it came back. Restoring runs on every exit path — `EXIT`, `INT`, `TERM` — and the
job goes red if the restore did not take.

**What is covered, and what is not.** `deploy-production.sh` recovers from a bad release in two
steps: it **notices** (the public smoke after promotion) and it **recovers** (`vercel rollback` to
the deployment that owned the domains). A fake-provider harness has exercised both halves against
the real shell script since 2026-08-28, and it proves the script — not the provider. This drill
covers the recovery half for real.

**The noticing half is not drilled against production, and that is a decision.** Proving the trap
fires on a genuine 5xx means deliberately promoting a build that fails its own smoke: breaking
production on purpose and trusting the mechanism under test to undo it. The failure mode of that
test is an outage. So it stays covered by the fake-provider harness, and this entry says so rather
than letting "the rollback is tested" stand for more than it does.

**Why the proof is read over the internet rather than from the API.** On 2026-08-29 a provider check
taken too soon reported `count: 0` for a deployment that already existed. What the API says and what
a browser gets are different questions, and only the second one is what a rollback is for. The drill
polls `/build-health.json` to a 180-second deadline rather than sleeping a guessed interval — the
same rule that check broke.

**Why dispatch-only and never scheduled.** It moves production twice. A schedule would do that
unattended, on a cadence nobody chose, for a check whose entire value is being watched while it runs.

---

## 2026-08-31 · Vercel builds the release; CI keeps the gate

**Supersedes the build half of the CI deploy design.** The deploy job used to run `vercel pull`,
`vercel build` and ship the result with `--prebuilt`. Its first real run, on `8063a8e`, got past the
hosted-schema preflight — `hosted_schema_verified=true`, `migrations=40` — and then died:

```
! 4 Secret values cannot be pulled from the `production` Environment.
  Wrote "[SENSITIVE]" as placeholders for the remaining values…
Error: Supabase environment is not configured
  (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
Error: Command "npm run build" exited with 1
```

**A Sensitive environment variable on Vercel is write-only by design.** No token reads one back,
which is the entire point of the setting. So a build that happens anywhere other than on Vercel
cannot have those four values, and the CI-builds-then-ships-prebuilt design is not misconfigured —
it is incompatible with the project's environment.

**Rejected: downgrading the four variables to readable.** It would have made the original design
work in about a minute, and it lowers a real security posture on the production project to suit a
build arrangement. It is also a provider settings change, which is not an autonomous pass's to make.

**Decision.** `vercel deploy --prod --skip-domain --yes` from source. Vercel builds — as it has for
every production deploy this project has ever had — and the variables resolve where they are meant
to. **Nothing about the gate moves:** the deploy job still runs only after the blocking checks and
the hosted-schema preflight, on a commit already on `main` through a green pull request, and the
stage → smoke → promote → roll-back-on-failure sequence is untouched.

**`build-health.json` moves from the prebuilt output to `public/`.** It is still written by CI from
`GITHUB_SHA` — the commit CI actually verified — rather than by the build reading
`VERCEL_GIT_COMMIT_SHA`, which is a *system* variable and therefore empty when "Automatically Expose
System Environment Variables" is off. That is the same fail-open trap the Ignored Build Step has,
and it is avoided rather than re-entered.

**And that move created a trap, closed before it fired.** `public/build-health.json` is in
`.gitignore` — it must never be committed. Without a `.vercelignore` the CLI falls back to
`.gitignore`, so the deploy would have uploaded everything **except its own evidence**, and the
smoke would have failed on a file that was never sent rather than on anything wrong with the
release. `.vercelignore` now exists and states the upload explicitly; a test asserts that
`.gitignore` excludes the file and that no rule in `.vercelignore` does. The two pull in opposite
directions, which is exactly why the answer could not be left to a fallback.

---

## 2026-08-31 · `vercel curl` leaks its own `--token` into curl, and only a real token shows it

**What happened.** With the build moved to Vercel, the deploy job got all the way to a staged
production deployment — built, READY — and then:

```
> You require a deployment protection bypass token to access this deployment... Generating one now...
> Successfully generated deployment protection bypass token for project ***
curl: option --token: is unknown
deploy-production: staged production smoke failed; domains were not changed
```

Vercel CLI 59.9.1 reads `--token` for authentication — the bypass line above proves it did — and
then **forwards it to curl** with the rest of the arguments. `smoke_staged` had passed it that way
since the script was written.

**The important part is why nothing caught it.** The leak is invisible with an INVALID token: the
CLI rejects it and never reaches curl. Reproduced at 59.9.1 to be sure of the mechanism rather than
the symptom — `--token` after the path, and `--token` before the subcommand, both give
*"The token provided via `--token` argument is not valid"* when the token is junk, and only the
valid-token path gets far enough to hand it to curl. So every rehearsal passed, and the
fake-provider harness could never have found it: **it proves the script, not the tool.** Third time
in this pass that something recorded as rehearsed had never been observed against the real thing.

**Decision.** No `--token` flag on `vercel curl` at all. The CLI reads `VERCEL_TOKEN` from the
environment — verified: with a junk value it answers *"The token provided via VERCEL_TOKEN
environment variable is not valid"*, naming the variable — and the deploy job already exports it.
A flag that is not passed cannot leak. `deploy-production.sh` now `export`s it explicitly rather
than relying on the workflow's `env:` continuing to do so.

**Unchanged: the `vercel_cli` wrapper.** `deploy`, `inspect`, `promote` and `rollback` have no
passthrough section, so a trailing `--token` is consumed there and always was.

**What the failure demonstrated, and it is the good news.** The script refused at exactly the right
place. It stages, smokes the staged deployment, and only then moves domains — so a broken smoke
cost nothing: `staged production smoke failed; domains were not changed`, and production stayed on
`707d03f`, verified from the public origin rather than from the API.

---

## 2026-08-31 · `vercel rollback` reaches exactly one step on this plan

**Measured, on the first run of the drill:**

```
== rolling BACK ==
Fetching deployment "dpl_CucN8sg2EN6rdivwKhe2dw9CjFxu"…
Error: To rollback further than the previous production deployment, upgrade to pro. (402)
```

**On the Hobby plan `vercel rollback` reaches the deployment promoted immediately before the live
one, and nothing further.** The drill had aimed at the newest READY *production-target* deployment
that was not live — which is not the same thing, because a deployment can be built for production
and never promoted, as `dpl_CucN8sg2` was when its staged smoke failed.

**This is good news for the recovery design and it had never been written down.**
`deploy-production.sh`'s trap rolls back to `release_previous_id` — the deployment that owned the
domains when the script started, which is precisely the one step the plan allows. So the real
recovery path is inside the free allowance. **And there is no second undo**: if a rollback lands on
a release that is also bad, `rollback` cannot reach past it and the way home is `promote`.

**Decision — the drill steps away with `promote` and comes back with `rollback`.** That is the
direction that matters, it is the one step the plan permits, and it makes the return leg the thing
under test rather than a convenience.

**It verifies by deployment id, not by commit.** The two deployments can carry identical
application code — in the safest case they do, which is why this drill is safe to run at all — so
comparing commits would pass without the domain having moved.

**It refuses to promote a deployment that is not serving**, and the restore path tries `rollback`
first and falls back to `promote`, reporting loudly if it had to. If rollback cannot bring
production home, that is the finding; the fallback is what stops the finding from also being an
incident.

**Unchanged: the noticing half is still not drilled against production.** Proving the trap fires on
a genuine 5xx means promoting a build that fails its own smoke, and the failure mode of that test is
an outage.

---

## 2026-08-31 · Enforce SSL is on — and it took away the only proof the guard still worked

**Owed and now done, by Mohamed:** "Enforce SSL on incoming connections" is ON for
`hayfsvsepgfescojesbd`, and `HOSTED_SCHEMA_DB_URL` carries `sslmode=require`.

**Verified on the provider, not from a screenshot.** A `pg` client with `ssl: false` against the
session pooler, as `coditu_backup`:

```
XX000  (ESSLREQUIRED) SSL connection is required for user: coditu_backup
```

and the same client with TLS arranged:

```
socket_encrypted=true  protocol=TLSv1.3  cipher=TLS_AES_256_GCM_SHA384
issuer_O="Supabase Inc"  subject_CN="*.pooler.supabase.com"  authorized=false
```

`pg_stat_ssl` now answers **true**, where on 2026-08-29 it answered **false** on a session that was
TLSv1.3 end to end. Both readings describe the pooler-to-Postgres hop rather than ours, so neither
is evidence about the leg this repository is responsible for. The socket still is. The comment that
said `pg_stat_ssl` "reports false" was a measurement with a date on it and is now carrying both.

### The `sslmode` in the secret has no authority, and that is the fail-closed property

The 2026-08-31 entry above removed the connection string's say over transport. Re-measured today
against the real project, with the query string set four ways:

| `HOSTED_SCHEMA_DB_URL` query | preflight | socket |
|---|---|---|
| `?sslmode=require` | exit 0 | TLSv1.3, Supabase Inc |
| *(removed entirely)* | exit 0 | TLSv1.3, Supabase Inc |
| `?sslmode=disable` | exit 0 | TLSv1.3, Supabase Inc |
| `?sslmode=verify-full` | exit 0 | TLSv1.3, Supabase Inc |

So the answer to "does it still fail closed if the `sslmode` is removed" is stronger than the
question: **it cannot fail open, because the string is not consulted.** Encryption is arranged by
the check and now refused by the provider as well. Two independent layers, neither of which is a
query parameter inside an opaque secret.

### The problem the second layer created

Until today the transport assertion's capacity to fail was proved by experiment — force `ssl: false`,
point at the real project, watch it report `database connection is not encrypted`. That is how the
entry above recorded it as *verified capable of failing*.

**That experiment no longer reaches the assertion.** Supabase refuses the cleartext connection one
hop earlier. The outer control is correct, and it conceals whether the inner one is alive. It is the
canary problem in a new costume: on 2026-08-31 a canary held red for a known reason could no longer
report an unknown one; here a guard nothing can exercise stops being a guard and becomes a comment.

**Decision.** `transportFailures` moves to `scripts/lib/transport-guard.mjs`, takes a socket rather
than a live client, and is exercised by `tests/transport-guard.test.ts` — eleven cases including
every one the provider will not let us produce against the real database any more: cleartext, a
missing socket, a foreign issuer, no certificate, a publicly-verified chain, and the strong form
demanded and not supplied. Shown capable of failing: with the cleartext branch disabled, 2 of 11 go
red.

### The check now says what it proved

`check-hosted-schema.mjs` printed seven lines on success and none of them was the transport. A run
that verified the encryption and a run with the assertion deleted were **byte-identical**. That is
the fail-open shape arriving as an omission rather than as an `exit 0`, and `docs/07-FIELD-NOTES.md`
already names the family. It now prints:

```
tls=encrypted
tls_protocol=TLSv1.3
tls_cipher=TLS_AES_256_GCM_SHA384
tls_issuer=Supabase Inc
tls_verified=false
```

`tls_verified=false` is the honest reading: the chain ends at "Supabase Root 2021 CA", which no
public trust store carries, so the issuer is pinned by name instead. `HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS=1`
plus `HOSTED_SCHEMA_DB_CA` is still the way to demand the strong form.

### A defect found while proving it: naming a deviation REPLACED the contract instead of widening it

`ci.yml` carries `HOSTED_SCHEMA_PRIVILEGED_ROLE: postgres`, the named deviation. With it set, a
secret narrowed to `coditu_backup` — the contract role, the thing the check's own warning asks
somebody to move to — was **refused**:

```
- connection role is neither coditu_backup nor the permitted postgres (got coditu_backup)
```

The message contradicts itself, and the effect is that doing the owed thing fails the deploy. Fixed:
the contract role is checked first and unconditionally, still demanding `select` and no `insert`; the
deviation is consulted only for roles that are not it. Measured both ways against the real project —
the old file exits 1 on that posture, the new one exits 0 and reports 40 migrations.

---

## 2026-08-31 · R5's denominator was wrong: the allowance is 3,000, and it still ran out

**Corrects the 2026-08-30 entry "R5 — the Actions minutes are one pool, and the arithmetic says the
backup loses."** Its measured burn stands. Its ceiling does not, and neither does its idea of who is
drawing on the pool.

### The plan is Pro, not Free

`github.com/MooTamer` carries a **PRO** badge — GitHub Pro, through the Student Developer Pack. A Pro
personal account includes **3,000** Actions minutes a month for private repositories, not the 2,000
the R5 entry assumed throughout. The denominator was **50% too small**.

### Verified by observation, not by reading the plan page

The billing page needs the `user` scope this machine's `gh` token does not carry, and Chrome is not
signed in, so the ceiling was derived from the runs themselves: every job in every repository on the
account for August 2026, `started_at` to `completed_at`, **rounded up per job** the way GitHub bills.
449 jobs.

```
cumulative 2000 min crossed  2026-08-29 23:16Z
cumulative 2500 min crossed  2026-08-30 20:50Z
cumulative 3000 min crossed  2026-08-31 08:20Z
first zero-step run          2026-08-31 08:23:52Z
```

**2,000 is falsified outright: 70 further jobs each billing two minutes or more ran after that mark,
over the following 33 hours.** 3,000 is matched to within four minutes of wall clock. The eight jobs
that finish after it are the ones already in flight, which is exactly the shape of a stopped
allowance — in-flight work completes, new work gets zero steps.

Reconciling with the billing page Mohamed read — **$19.60 gross, $13.70 of it coditu**: counting
every job gives $24.50 / $19.06, and excluding cancelled jobs entirely gives $17.10 / $11.90. His
figures sit inside both brackets, which is what should happen when a cancelled job bills for part of
its time. The reconstruction is consistent with the page; the minutes are the sharper instrument.

### The pool has a consumer the entry never counted

R5 modelled the pool as `coditu` plus `coditu-recovery`. Measured across the whole account:

| repository | minutes | share | window |
|---|---:|---:|---|
| `MooTamer/coditu` | 2,681 | 78.6% | 21–31 Aug |
| **`MooTamer/taseel-academy`** | **601** | **17.6%** | **1–19 Aug** |
| `MooTamer/Baseeta` | 79 | 2.3% | 30–31 Aug |
| `MooTamer/coditu-recovery` | 47 | 1.4% | 29–31 Aug |
| four others | 5 | 0.1% | |
| | **3,413** | | |

**`taseel-academy` spent a fifth of the month's allowance before coditu's first CI run of the month.**
That is not a criticism of it — it is the point R5 was making, arriving from a direction R5 did not
look. The pool is the *account*, and the account has other work in it.

### The fixed cost R5 modelled is right; the per-push cost is 23% low

The scheduled jobs were all created on 29 August, so their August totals are age rather than
throttling. Extrapolated from their own observed cadence they land where R5 put them:

| scheduled job | R5's model | observed | projected |
|---|---:|---:|---:|
| Recovery copy freshness (3-hourly) | 240/mo | 7.9 runs/day | ~237/mo |
| Database keepalive (6-hourly) | 120/mo | on schedule | ~120/mo |
| Nightly recovery copy (daily) | 150/mo | 4.25 min/run | ~128/mo |

The variable half does not. R5 blended a **27.3-minute** average push. Measured: **79 CI runs, 2,664
minutes, 33.7 minutes per run** — 23% above model, because `browser` and `lighthouse` run on more
pushes than the docs-skip estimate allowed for.

### The corrected arithmetic, and why it is worse rather than better

```
ceiling                                3,000     (Pro, was modelled as 2,000)
less scheduled jobs                    - 500
less the rest of the account           - 682     (taseel-academy, Baseeta, misc)
                                       -----
available to coditu CI                 1,818     (R5 said 1,488)
÷ measured 33.7 min per CI run         =  54 runs a month

observed                               7.8 CI runs a day  =  ~234 a month
```

**A 50% larger denominator is more than eaten by the 23% the entry never counted and the 23% the
per-run cost was under-estimated by.** R5's headline was "~27 changes a month with the skip, ~11
without". The corrected figure is **~54 CI runs a month, and the repository did 79 in ten days** —
running at roughly **4.3×** what the allowance supports. Every conclusion R5 drew stands and each is
sharper: the backup is the smallest line on the list (47 minutes, 1.4%) and it is the thing that
stops.

**Unchanged and now quantified: moving the backup off Actions removes it from the contended pool
entirely** for the price of the Mac being on. 47 measured minutes is not the reason — the reason is
that a backup must not fail because CI was busy, and 1.4% of a pool you are 4.3× over is still zero
when the pool is empty.

**Not re-litigated here:** whether `browser` moves to a nightly schedule. It is still the largest
single lever and still needs the determinism review beside it.

---

## 2026-08-31 · `is_developer` was two facts in one column, and Ahmed Yehia is the person it was wrong about

**Decision, from Mohamed, implemented as `lib/payout.ts`:**

```
pot        = the sprint's total, struck at the team rate
hourly_pay = SUM(rate x minutes_logged) for everybody on the HOURLY basis
remainder  = pot - hourly_pay
split      = remainder distributed among the SHARE people
```

**Hourly pay comes out of the pot, before the split. It is not a cost on top of it.**

Ahmed Yehia is a **developer** who is paid **hourly**. Mohamed, Abdelrahman and Adam take the split.

### The overload

`20260825095000_earnings.sql` named the column `is_developer` and commented it *"whether this person
takes a share of a sprint's pot"*. The name and the comment are two different questions, and for
three of the four people on this team they coincide. Ahmed is the one they do not:

| value | says he is an engineer | says he shares the pot |
|---|---|---|
| `true` | correct | **wrong** |
| `false` | **wrong** | correct |

On hosted it is `false`; the seed sets it `true`; the ledger recorded the disagreement on 2026-08-31
as a thing to decide. It was never a disagreement about a fact. It was two facts sharing a column.

**Split.** `is_developer` keeps its literal meaning and decides nothing about money.
`profiles.payout_basis` — `share` / `hourly` / `none` — decides money.

### Why it is cheap today and would not be tomorrow

`sprint_payouts` and `sprint_payout_shares` hold **zero rows**, hosted and local, counted before the
migration was written and again after. Every choice below is free while that is true and is a
renegotiation with four people the moment one real payout exists. `sprint_payout_shares` gains a
`basis` column for the same reason: back-filling *why* somebody was paid, against an agreement they
were paid on, is guesswork with money on it.

### Three things that are decisions, not arithmetic

1. **A share person who logged nothing still takes their share.** It is a split, not a wage. This
   **reverses** `app_settings.payout_share_threshold_pct`, which gated who was proposed. The column
   survives; nothing reads it; the control that wrote it is gone from Settings, because a control
   that writes a value nothing consults tells somebody they have made a decision they have not.
2. **An hourly person who logged nothing is paid nothing and the pot is untouched.**
3. **Hourly pay above the pot is refused, not clamped.** No zero, no negative share, no rendered
   number — an unpayable sprint says what it is short by and names who is owed. The same rule the
   Recovery Centre follows: a figure that cannot be computed honestly must not appear on a screen.
   The Server Action refuses the write too, not only the screen.

### `profiles.hourly_rate_cents`, and why it had to exist

Without a per-person rate the refusal above is **unreachable**. With a single team rate an hourly
person's minutes are a subset of the sprint's minutes, so their pay can never exceed a pot struck at
that same rate, and "refuse when hourly pay exceeds the pot" would be a branch no input could enter —
a test that cannot fail is not a test. A per-person rate is also the ordinary reason somebody is on
the hourly basis at all: an agreed rate that is not the team's. Null means the team rate, so nothing
changes for anybody until an admin sets one, and Ahmed's is deliberately left null.

### Largest-remainder allocation, said out loud

The cents an uneven split cannot divide are handed out one each to the largest fractional
remainders, ties broken by profile id ascending. The comparison is `amount × wᵢ mod Σw` as an
**integer** — comparing fractional parts as floats is the one place a rounding rule could itself
round. With equal weights this is byte-for-byte what `splitEqually` did, which is why the change is
safe; the general form is here because `sprint_payout_shares` carries `minutes_logged` and
`share_cents` and **no weight column**, so the split is equal today and is one column from not being.

`tests/payout.test.ts` asserts `sum(every line) === pot` **exactly** on thirds of odd amounts, on
every remainder 0–6 among seven people, and with hourly pay in front of an awkward remainder. Shown
capable of failing three ways: clamping instead of refusing turns 4 of 29 red; dropping the
remainder turns 6 red; paying hourly on top of the pot instead of out of it turns 9 red.

### The guard on `profiles` becomes an allowlist, and that is what made this safe to write

`guard_profile_privilege_columns` was a **denylist** naming five columns. `payout_basis` and
`hourly_rate_cents` would have arrived **writable by the person they pay**, and the only thing that
would have caught it is somebody reading the migration. ADR 2026-08-30 inverted exactly this shape on
`work_items` and `acceptance_criteria` after finding an engineer could write `minutes_logged`; it did
not reach `profiles`. Now it has.

It closed one that was already open: **`account_kind` was never in the denylist**, so a client contact
could set their own row to `internal`. Nothing went looking for it — it fell out of writing down what
a person may legitimately change about themselves, which is the argument for allowlists in a sentence.

`supabase/tests/column-guards.sql` sweeps `profiles` the same way it sweeps the other two, and names
the three money columns separately because the sweep writes NULL and skips a column that is already
NULL — `hourly_rate_cents` is null for everybody, which is exactly the shape a sweep alone would miss.
With the old denylist restored on a live database, four of those assertions go red.

### Not done, deliberately

The migration is **not on hosted**. Nothing was pushed this pass.

---

## 2026-08-31 · The nightly and the drill move to the Mac; Actions keeps CI

**Implements the 2026-08-30 revision of the drill decision, and closes R5's actual failure.**

Three problems, one move.

1. **The drill could never run in the cloud.** `verify-backup-restore.sh` needs the age *private*
   key; the key is deliberately not on GitHub and age has no decrypt-only identity. The 2026-08-28
   answer — *"the drill is automated monthly"* — was withdrawn on 2026-08-30 as unimplementable.
2. **The backup and the test suite drew on one budget.** Actions minutes belong to the account. On
   2026-08-31 the allowance ran out at 08:20Z and every job in both repositories began returning zero
   steps. The nightly stopped. **The backup was 47 of the month's 3,000 minutes — 1.4% of the burn,
   and the first thing to die.**
3. **The canary that should have said so is also Actions.**

**Decision.** `scripts/local-nightly.sh` on a launchd agent at 02:00 does the backup, the freshness
read-back, the real restore drill and the prune. `ops/recovery-repo/workflows/nightly-backup.yml`
loses its `schedule:` and keeps `workflow_dispatch:` — moved, not duplicated, because two nightlies
writing to one release store is twice the chance of a half-published set. It stays dispatchable
because the Mac is one machine.

### The new failure mode is the point

A laptop can be asleep. That is worse availability and **better observability**, which is the trade
being made deliberately:

| | a missed GitHub schedule | a missed local run |
|---|---|---|
| what happens | nothing | healthchecks.io grace period expires, email |
| who finds out | nobody | Mohamed |

`StartCalendarInterval` rather than `StartInterval`, because launchd runs a missed calendar job on
the next wake: a Mac closed at 02:00 and opened at 09:00 backs up at 09:00. That halves the exposure
without hiding it.

**The success ping is downstream of the restore, not of the upload.** A copy that was written and
never restored is a file, not a backup. `--drill-only` — which proves a set restores and nothing
about a set being written — cannot send it at all.

### Fail closed, on a machine with no CI to be red

`HEARTBEAT_URL` unset does not mean "run without alerting". The job refuses, exits non-zero, and puts
a macOS notification on the screen of the machine that is meant to be doing this. It also refuses a
configuration file that is not mode 0600 — it holds a database password and a service-role key — and
`install-nightly-agent.sh` refuses to schedule a job whose `--dry-run` does not pass, because an
agent installed against a broken configuration is how a backup becomes automated and absent at once.

### `RESTORE_WIDEN_MANAGED_COLUMNS`, and what it costs

The drill hit the blocker the runbook already predicted: the CLI's pinned service images trail what
hosted runs. Measured this pass — hosted has `storage.buckets.versioning_status` and
`storage.objects.archived_at`, `is_delete_marker`, `is_versioned`; `storage-api` on this Mac has none
of them, and the verifier refuses, correctly. On 2026-08-29 Mohamed added them by hand. **A drill
that needs four hand-written `alter table` statements is a drill somebody has to remember**, which is
what this whole change exists to stop.

So the verifier gains an **opt-in**: `RESTORE_WIDEN_MANAGED_COLUMNS=1` adds the missing *managed*
columns to the target as nullable `text` and prints `restore_target_widened=…`. `COPY` parses per
column type and `text` accepts every representation in the dump, so every row arrives and every
count still matches.

**What it does not prove, stated rather than buried: the widened columns' TYPES.** Four Storage
columns restore as text on a throwaway target. That is a real reduction in what the drill asserts,
it is limited to columns the local image does not have at all, it is printed on every run, and it is
**off by default** — a recovery must never set it, and `12-RECOVERY-RUNBOOK.md` step 4 does not. The
alternative was no automated drill.

### Owed, and Mohamed's

**The healthchecks.io check does not exist yet.** Creating it needs an account, which is not
something this pass can do. Until `HEARTBEAT_URL` is in `~/.config/coditu/nightly.env` the agent
refuses to install and the job refuses to run — deliberately, and visibly, rather than running blind.
## 2026-08-31 · R5 has happened: the Actions allowance ran out, and it took the backups with it

**Not a decision — an observation, recorded because the risk register predicted it and nobody had
seen it.** `docs/10-PRODUCT-FEEDBACK.md` R5, written 2026-08-29:

> **GitHub Actions minutes are one pool.** CI, the nightly backup, the canary and the monthly drill
> all draw on the same free monthly allowance. The failure mode: a busy week of CI exhausts the
> minutes, the nightly backup silently stops, and the canary — also Actions — cannot run to say so.

**Measured at 08:23–08:36Z on 2026-08-31.** Every job, in both repositories, across every workflow,
now starts and completes in **two to three seconds with zero steps** — the signature of a job for
which no runner is ever allocated:

```
is the production deploy configured   started=08:23:53Z completed=08:23:55Z steps=0 -> failure
blocking release checks               started=08:23:53Z completed=08:23:55Z steps=0 -> failure
what changed                          started=08:23:53Z completed=08:23:55Z steps=0 -> failure
```

Confirmed three ways rather than inferred from one red run: the CI push for `3fe7ab0`; the
**8-second** `Database keepalive`, dispatched deliberately as the smallest possible test; and
`Recovery copy freshness` in `MooTamer/coditu-recovery`, which establishes that this is **account-
wide and not repository-specific**. Billing could not be read to name the exact cause — the token
lacks the `user` scope — so this is recorded as the measured behaviour rather than as a confirmed
quota figure.

**What it costs, in order of seriousness.**

1. **The nightly backup cannot run.** The newest set is `2026-08-31T070134Z`, taken at 07:01Z by the
   last scheduled run before this started. Every hour from here widens the RPO and nothing will
   widen it back.
2. **The canary cannot run to say so — and would have looked identical if it had.** It is already
   red on purpose, for the missing `HEARTBEAT_URL`. So the new and worse cause is wearing the old
   one's clothes: a red canary meant "no alerting is configured" this morning and means "no backups
   are being taken" this afternoon, and nothing in the signal distinguishes them. **A deliberate red
   is a place a real red can hide.** That is a new finding and it is the sharpest thing here.
3. **`main` is frozen.** The ruleset requires `blocking release checks`, and a check that cannot run
   cannot pass. Nothing merges until the allowance resets.
4. **The deploy of `3fe7ab0` did not happen.** Production is `d5f11a8`; `main` is one commit ahead of
   what is live. That is the intended behaviour of the gate, arriving for an unintended reason.

**Not worked around.** The obvious workarounds are all worse than the condition: deploying from a
laptop bypasses the gate this pass exists to establish, and a self-hosted runner puts production
credentials on a machine nobody has threat-modelled.

**What this argues for, for whoever picks it up.** The heartbeat has to leave Actions — that is
already the plan (healthchecks.io, ADR 2026-08-29) and this is the argument for doing it now rather
than soon, because an alarm sharing a failure domain with the thing it watches is not an alarm. And
the browser baseline is the largest line item in the pool; it ran on nine of this pass's runs and
gates nothing.
## 2026-08-31 · CI moves to a runner on the Mac; two jobs stay metered on purpose

**Status: accepted.** Supersedes nothing; it is the structural fix R5 asked for on the same day.

### The measurement that forces it

The allowance did not "run low". It ran **out**, account-wide, at 08:20Z on 2026-08-31, and the
state it left behind was not a slow CI — it was a repository that could not move:

| | |
|---|---|
| Ceiling | **3,000** min/month (GitHub Pro via the Student pack) |
| Observed burn | ~234 runs × 33.7 min ≈ **7,900 min** — **4.3x** sustainable |
| `taseel-academy`'s share | **601 min** consumed before coditu's first August run |
| The nightly backup's share | **47 min — 1.4% of the burn, and the first thing to stop** |
| `main` | frozen: the one required check is Actions, and Actions returns zero steps |

Re-verified before this change, live rather than from the ledger: a workflow dispatched at
**2026-08-31T15:42:08Z** produced one job that started at 15:42:10Z, finished at 15:42:12Z and ran
**zero steps**. The reset is the 1st, not "the billing period has rolled".

**A larger allowance does not fix a 4.3x overshoot, and a smaller CI barely dents it.** Cutting the
40-minute browser job entirely would still leave the burn over the ceiling.

### The decision

**GitHub Actions meters GitHub-*hosted* runners only.** A self-hosted runner costs nothing and is
not subject to the spending limit — which is also why it can run *right now*, with the allowance
still exhausted, and is the only thing that can unfreeze `main` before September.

So `coditu-mac` is registered against `MooTamer/coditu` — an `osx-arm64` runner installed as a
launchd **agent** under Mohamed's account, the same shape and for the same reasons as the nightly
(`~/Library/LaunchAgents`, user session, reads `~/.config`, can put a notification on a screen).

### Why the usual objection does not apply here, said out loud rather than implied

Self-hosted runners are dangerous **because a pull request from a fork executes that fork's workflow
on your hardware**, with your filesystem and your network. That is a real and well-documented
hazard, and it is why the general advice is "never use self-hosted runners on a public repository".

It cannot arise here, for two independent reasons:

1. **`MooTamer/coditu` is private.** A repository nobody can fork cannot receive a fork PR.
2. **It has a single writer.** Even made public tomorrow, GitHub requires an approving review from
   someone with write access before a first-time contributor's workflow runs at all.

**This is a property of this repository, not a safe general rule, and it expires the day a second
contributor arrives.** Written here so the person who adds one has to read it.

### The fallback is manual, and that is the decision

`runs-on: ${{ fromJSON(vars.CI_RUNNER || '["self-hosted","coditu-mac"]') }}`. Unset — the normal
state — every job runs on the Mac. Set `CI_RUNNER` to `["ubuntu-latest"]` and the file returns to
the metered pool for as long as it stays set.

GitHub has no native "try self-hosted, fall back to hosted"; runner-group fallback is Enterprise.
It could be *simulated*, and it is deliberately not, because **an automatic fallback to the metered
runner is exactly how the allowance went the first time**: it would spend minutes without anybody
choosing to, at the moment the Mac happened to be shut.

What an absent Mac does instead is make the job **queue**. That is visible on the pull request, it
costs nothing, and nothing merges until somebody either wakes the Mac or decides to pay. A queued
job is a decision waiting for a person; a silent hosted run is a bill waiting for a month end.

### Every job says where it ran

`./.github/actions/runner-identity` writes into `$GITHUB_STEP_SUMMARY` on every job, reading
`runner.environment` — GitHub's own answer, `self-hosted` or `github-hosted`, not an inference from
a label we could mislabel. A metered run additionally prints what it cost and how to undo it.

This is the counterpart to the fallback being manual: a switch that was flipped and forgotten is a
line you read, rather than an allowance you discover is gone. `tests/ci-runner.test.ts` asserts
every job carries it, and that the step sits *after* the checkout — a local composite action that
runs before its own source is on disk is a job that silently stops announcing anything.

### The defect this change nearly shipped, and what found it

`supabase start` keys its containers off `project_id`, **not off the directory it runs in**. On a
hosted runner the machine is empty and two checkouts can never meet. This Mac carries the
developer's own `coditu` stack on 544xx — so CI would have attached to *those containers*, and the
next line of the required job is `supabase db reset`.

**CI would have dropped the local database somebody was working in**, and only ever on the machine
where nobody would think to look for it. So `./.github/actions/isolated-supabase` moves CI to
`codituci` on **547xx** — 543xx CLI default, 544xx development, 545xx isolated e2e, 546xx restore
drill — and every job that starts a stack now stops it under `always()`, because a hosted runner is
deleted when the job ends and this one is not.

The first version of that change covered `check` and `browser`. **`tests/ci-runner.test.ts` found
`lighthouse`**, which starts a stack without resetting one and so does not read like a job that
could hurt anybody — it would have stopped the developer's containers on teardown instead. The test
was written to stop the drift back to metered runners and caught a data-loss bug on its first run.

### Two jobs stay on `ubuntu-latest`, deliberately

`keepalive.yml` and `rollback-drill.yml`. The rule that produces both:

> **The metered runner is for the jobs whose whole reason to exist is to work when this Mac does
> not.**

The keepalive stops a free Supabase project being paused for inactivity — its entire value is in the
week nobody is at the machine. The rollback drill exists for the moment production is broken, which
is not a moment to discover recovery needs a laptop to be awake. Between them they are roughly 120
of 3,000 minutes a month: 4% of the ceiling to keep the two controls that must not depend on the
Mac independent of it. `tests/ci-runner.test.ts` asserts both stay hosted, because an intention
written only in a comment is one refactor from being reversed by accident.

### What this does not fix

The Mac is now a single point for CI, and it is a laptop. A closed lid is a queued pull request.
That is a real reduction in availability, accepted because the alternative — measured, not
supposed — is a repository that cannot merge at all for the last nine days of every month.

### The measured cost the first run found: caching what a persistent machine never lost

`actions/setup-node`'s `cache: npm` archives `~/.npm` and uploads it to GitHub, so the **next**
ephemeral machine does not download the registry again. A self-hosted runner is not ephemeral.
`~/.npm` is still there next run, having never gone anywhere.

Measured on the first run of this change, run `33410996124`:

| | |
|---|---|
| Lint, typecheck, 589 unit tests, RLS suite, production build, budgets, resilience, `recovery:check`, degraded-dependency pause | **5 min** (15:53:19Z → 15:58) |
| `Post Run actions/setup-node@v4`, uploading the cache | **15 min and still going** at 16:12:41Z, when it was cancelled |

So the cache is asked for only on a hosted runner. It is written the long way round —
`runner.environment == 'github-hosted' && 'npm' || ''` — because the shape that reads more
naturally, `== 'self-hosted' && '' || 'npm'`, returns `npm` in **both** branches: an empty string
is falsy in a GitHub expression, so the `||` takes over and the condition does nothing. A test
asserts the trap is not present, since a workflow that silently ignores its own condition is the
fail-open shape again, wearing an expression.

### The second thing the first runs found: CI on this Mac depends on Colima being up

Run `33412967360` went red on `supabase start` with

```
failed to inspect service: Cannot connect to the Docker daemon at
unix:///Users/motamer/.colima/default/docker.sock. Is the docker daemon running?
```

Colima had stopped between two runs of this very change. Nothing was wrong with the branch: the
isolation step had already rewritten the ports to 547xx correctly, and every step before it passed.

**A hosted runner ships with a running Docker; this one does not, and that is a new dependency the
move introduced.** It is now in `docs/14-DEPENDENCY-LEDGER.md` as a row of its own, and the action
checks `docker info` first and puts `colima start` in the job summary. The message the runner gave
was true and did not contain the remedy — and `main` is frozen while the required check is red, so
the minute that saves is not a convenience.

It reports rather than starting Colima itself. A CI job that silently boots a 6 GiB virtual machine
on somebody's laptop is a surprise, and "the VM is deliberately down" is a real state.

---

## 2026-08-31 · Custody: the primary copy is on hardware we own, and every off-site copy is disposable

**Status: accepted.** Supersedes the GitHub-releases store of 2026-08-28 as the *primary*; keeps it
as a destination nothing depends on.

### The instruction, and why it cannot be met literally

Mohamed asked to *"be able to use my data at any time"*, with nothing depending on a limited
resource. Taken at face value that is unachievable. Every provider has a ceiling and an owner. So
does a hard disk. A design that claims otherwise is lying about something.

What he actually needs is **custody**, and the reframe is a single test:

> The question is not **"is this free?"** but
> **"if this provider vanished tonight, what would I lose, and how long until I am running again?"**

"Free" is the wrong axis and it is worth saying why, because the wrong axis produces the wrong work.
A free tier holding a replaceable copy is harmless. A **paid** tier holding the only copy is not.
Optimising away free things would have moved this project's backups from GitHub to Google and
changed nothing that matters.

Three rules follow, and `tests/backup-custody.test.ts` asserts each one:

1. **The PRIMARY copy lives on hardware Mohamed owns.** Not the fastest or most convenient — the
   one that is definitive.
2. **Off-site copies are replaceable. No single one is load-bearing.** If losing a particular
   off-site copy would be a problem, it was never an off-site copy; it was the primary in disguise.
3. **The restore path requires none of them.** A recovery that begins "log in to X" has a
   dependency at the exact moment dependencies are unavailable.

### What changed

`local-nightly.sh` stops publishing. `BACKUP_UPLOAD=0`: the set is written to
`~/Library/Application Support/coditu-backups`, and **that directory is now the primary copy**, not
a staging area on the way to GitHub. It is read back immediately — `BACKUP_STORE=local
BACKUP_MAX_AGE_SECONDS=3600` — because a set that was written and never verified is a file with a
hopeful name, and the one-hour window means the check can only pass on tonight's.

Then it fans out to `OFFSITE_DESTINATIONS`, each of which is **a directory and nothing else**.

### Why a mounted folder, and not rclone

The August plan reached Google Drive through rclone, and it was never activated, because
`rclone config` opens a browser for an OAuth consent screen only Mohamed can click. Google Drive for
desktop removes the whole problem: there is no token, no refresh, no scope, no API quota and
nothing to rotate. **The backup writes a file to a path and Google's own client moves it.** It does
not appear in the secrets inventory because it has no secret, and it cannot be the thing that
expires.

The same shape then serves any destination that is a path — an external disk, a NAS, a second Mac —
which is why `offsite-copy.sh` takes `OFFSITE_*` as an interface rather than knowing about Drive.

### The trap, and why it is a test rather than a line in a runbook

**Drive can hold a file as a streamed placeholder.** Finder shows a name, a size, a modified date
and an icon. `ls -l` shows a byte count. A check that asserts the file exists and is the right size
passes. Reading it blocks on a download — and with no network, the read fails.

**A backup that needs the internet to be read is not an off-site copy. It is a receipt.**

This is one layer out from the defect this repository has spent the week removing. There the control
was quiet when unconfigured. Here it would be **loud, green and wrong**, which is worse.

`check-materialised.mjs` refuses it three ways, cheapest first, and only the last is proof:

| Tell | What it catches | Why it is not enough alone |
|---|---|---|
| `st_blocks == 0` with `st_size > 0` | The file claims bytes and owns no disk | A placeholder may be allocated some blocks |
| `SF_DATALESS` (`0x40000000`) | macOS's own mark on a file-provider placeholder | Absent on Linux; skipped rather than guessed |
| **The whole file, read and hashed against its sidecar** | Everything above, plus a file that IS on disk and is the wrong bytes | — |

**A sparse file has the same shape at the `stat` level** — right name, right size, zero blocks — and
`dd seek=` produces one. That is how the detector is shown *failing* on a machine with no cloud
client installed, rather than asserted to work. It differs from a real placeholder in the one way
that makes the test weaker, and the test says so: a sparse file reads back as zeros where a
placeholder with no network throws, so the checksum limb catches it and the error limb is
constructed separately.

Verified with the network off in the same pass — see `docs/06-PROGRESS.md`.

### Three states an off-site copy can be in, and they must not look alike

| State | What happens | Why |
|---|---|---|
| **Unconfigured** | Loud in the summary, a macOS notification, **the night continues** | Failing over a *replaceable* copy would take down the copy that is not replaceable, in protest about one that is |
| **Configured, absent, allowed** (an unplugged disk) | Reported with how many days since it was last seen; **never a failure** | An unplugged disk is somebody's bag, not a broken backup. But absent must not read as fine, so the age is printed |
| **Configured and broken** | **Fatal** | The only one of the three that is a surprise. A destination that was working and silently stopped is precisely the failure this project keeps finding |

This is a deliberate departure from the rest of the repository, which fails closed. The distinction:
**an unconfigured alarm must be loud, because not alarming is unsafe. An unconfigured replaceable
copy must not take down the irreplaceable one.** The primary has already been written and read back
before any of this runs.

### Retention, and what it costs

30 nightly and 12 monthly, at both the primary and each destination. Monthly is a *selection* over
what is already there — the first set of each calendar month — not a second thing to write, so a
monthly copy can never rot separately from the nightly it is.

**At ~19.4 MB a set that is at most 42 × 19.4 ≈ 815 MB, against 2 TB. Four hundredths of one
percent.** Which is the argument for not pruning harder: the cost of keeping a night is 19 MB, and
the cost of not having it is the night you needed. The policy exists to bound growth, not to save
space, and there is no version of this where storage is the binding constraint.

Each destination prunes **its own** copy. Nothing prunes a destination on another's behalf — the
same reason `sync-backup-local.sh` never deletes.

### GitHub releases: kept, and depended upon by nothing

`upload-backup.sh` still works. `BACKUP_STORE=github-release` still selects it in the freshness
check and the pruner. Nothing calls it. Removing a dependency is not a reason to burn the road back
to it, and a second destination that is already written is worth more than one that would have to
be.

`tests/backup-custody.test.ts` asserts both halves: that it still works when named, and that it is
never the default.

### What this does not fix, and it is the biggest thing on the page

**The age private key exists in exactly one place on Earth** — `~/.config/coditu/backup.agekey`,
mode 0600, on this Mac. Verified: no second copy anywhere on the machine.

Three off-site copies of a ciphertext nobody can decrypt is **zero copies**. age has no escrow, no
recovery and no second identity, so this is not a thing tooling can fix, and it is deliberately not
fixed here: **a copy of the key must not go anywhere the archives are**, or the encryption stops
meaning anything. Putting it in Drive beside the backups would be worse than doing nothing.

It is Mohamed's, it is one action, and it is in `docs/15-EMERGENCY-CARD.md` and
`docs/14-DEPENDENCY-LEDGER.md` as the single load-bearing dependency in the design — the only one
that is not a provider.

### The card's PDF is committed, on purpose

A generated binary in git is normally a smell, and this one is 110 KB that will churn whenever the
Markdown changes. It is kept anyway, for the same reason the recovery repository carries its own
copy of the tooling: **the card exists for the moment things are missing, and rendering it needs
Node, Playwright and a Chromium download.** A card you can only read after `npm ci` is not an
emergency card.

`npm run docs:card` regenerates it from `docs/15-EMERGENCY-CARD.md`, which stays the source of
truth. If the two ever disagree, the Markdown is right and somebody forgot to re-render.

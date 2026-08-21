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

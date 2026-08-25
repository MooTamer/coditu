# 07 — Field notes

**Things this repository has already learned the hard way.** Every entry below cost somebody real
time, and none of them is derivable from the code by reading it.

This file exists because that knowledge used to live in one laptop's private assistant memory, where
a cloud session, a new developer, and the next agent could not reach it. It is checked in so all of
them can.

## How to use it

- **Read it before debugging anything that smells environmental** — a test that fails differently on
  each run, a build that cannot find the seeded users, a 502 from the auth API, a status code that is
  200 when it should be 404.
- **Append to it.** One `###` entry per fact: what is true, why it matters, and what to do about it.
  Newest at the bottom of its section. Date anything time-sensitive.
- **Correct it in place** when something stops being true, and say so — a stale note is worse than no
  note, because it is trusted.
- Keep entries short enough to read in a hurry and specific enough to act on. A fact with no
  consequence attached is a comment, not a field note.

---

## Environment and verification

### `npm run build` points at production
`next build` sets `NODE_ENV=production`, and Next loads **`.env.production.local` ahead of
`.env.local`**. This repo keeps the hosted project's credentials in `.env.production.local`, so a bare
`npm run build` produces a bundle wired to **production** — and `NEXT_PUBLIC_*` is inlined at build
time, so nothing set at `next start` can undo it.

It presents as *"That email and password do not match."* Nothing errors; the app simply cannot find the
seeded users. Injected `sb-127-auth-token` cookies are ignored outright (a production build expects
`sb-hayfsvsepgfescojesbd-auth-token`), `getUser()` short-circuits with no network call, and `/app`
redirects to `/login` in ~3ms — which looks exactly like a tripped circuit breaker.

Build through `scripts/with-prod-server.sh`, or export first:

```bash
set -a; . ./.env.local; set +a; npm run build
```

Confirm which database a build is wired to before debugging anything else:

```bash
grep -rhao "127\.0\.0\.1:54421" .next/server | head -1   # local
grep -rlao "hayfsvsepgfescojesbd" .next/server | head -1  # production
```

### Kong caches the database after a reset
`supabase db reset` restarts the Postgres container and `supabase_kong_coditu` keeps routing to the old
upstream. `/auth/v1/health` answers **502** and the whole e2e suite fails at sign-in — which reads as a
broken auth service rather than a stale proxy.

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54421/auth/v1/health   # want 200
docker restart supabase_kong_coditu && sleep 8                                 # the fix
```

### Degrade Supabase with `docker pause`, never `docker stop`
`scripts/check-degraded-dependency.mjs` proves the circuit breaker by pausing Kong. A **paused**
container keeps its listening socket, so the kernel completes the handshake and nothing ever answers —
the failure that actually hurts. A **stopped** one refuses the connection in a millisecond and proves
nothing. Always `docker unpause` defensively at the start as well as in `finally`.

The obvious alternative fails *by passing*: starting the server with `NEXT_PUBLIC_SUPABASE_URL`
overridden does nothing, because Next inlined the URL at build time.

### The e2e suite shares one local database
`e2e/fixtures.ts` connects every spec to the single local stack on ports 544xx. Specs coordinate with a
pg advisory lock (`sprintTotals: "read" | "write"`), but that lock only covers specs in the same run.
A second session — another worktree, another agent, a stray `next dev` — running its own suite against
the same database produces failures that look exactly like regressions in your code.

Before trusting an e2e failure: `ps aux | grep playwright`, then re-run the failing spec alone or at
`--workers=1`. Contention shows up as *different* specs failing each run; a real regression fails the
same one every time.

**And a third case that looks like neither: the suite leaves the seed changed.** `item-detail.spec.ts`
→ *"tapping the words opens the editor and does not tick the box"* reads
`getByRole("checkbox").first()`. On the seeded database COD-231's three criteria are all unticked, so
the first one is unticked and the assertion holds. A previous run that ticked two of them and did not
put them back makes **done sink**, so `.first()` is now a *ticked* criterion and the test fails on all
three engines, in isolation, repeatably — which is exactly what a real regression looks like. It cost
a full diagnosis on 2026-08-25.

So the check is three-way, in this order, and the last one is cheap:

1. different specs each run → the machine
2. same spec, passes alone → contention
3. same spec, fails alone → **`npm run db:reset`, then run it again.** Only if it still fails is it
   the code.

Any spec that reads a seeded row by POSITION rather than by name has this failure mode latent in it.

### `auditA11y` at a phone WIDTH is not an audit at a phone POINTER

`criteria.spec.ts` → *"it works on a phone, and axe finds nothing while editing"*
sets a 390px viewport in the **chromium** project and then runs `auditA11y`. It
reports seven `target-size` violations on the editor toolbar:

```
target-size @ button[aria-label="Bold"]
target-size @ button[aria-label="Italic"]
…
```

**They are invented.** Those buttons reach 44px through
`@media (pointer: coarse)` in `app/globals.css`, and chromium reports
`pointer: fine` however narrow the viewport is — the note above about measuring
touch targets, arriving through axe instead of through a hand-rolled measurement.
`auditA11y` includes `wcag22aa`, which is where `target-size` lives, and it does
not replay the coarse rules. `e2e/mobile.spec.ts` → *"every toolbar target clears
44px on a coarse pointer"* asserts the real property in the `mobile-chrome` and
`mobile-safari` projects, and passes.

Confirmed pre-existing on 2026-08-25 by stashing a working tree and re-running
against the parent commit: same seven, same buttons.

**Two ways out, and the second is better.** Either replay the coarse rules into
an injected `<style>` before auditing, or move the assertion into a project that
actually has a coarse pointer — the second needs no harness at all and audits
what a phone really renders.

It hides in a full run: `criteria.spec.ts` is `serial`, so when anything earlier
in the describe fails this one is reported as "did not run" rather than as a
failure. Absence from a red summary is not evidence it passed.

### A pgTAP file that counts rows in an append-only table must build its own fixture

`document_revisions` accumulates, and the e2e suite writes documents. So the
revision count of any SEEDED story is whatever the last browser run left it at,
and an assertion like

```sql
select is((select count(*) from public.document_revisions
            where entity_id = '…231'), 1, '…');
```

is asserting the history of the test suite. It is the "suite leaves the seed
changed" trap in a nastier form than reading a row by position: it passes on a
fresh database, passes again on the run right after a reset, and fails only on
the runs that follow a browser run — so it reads as flakiness rather than as the
deterministic thing it is.

`supabase/tests/revisions.sql` creates its own work item and criterion inside the
transaction, so numbering starts at 1 by construction and `rollback` removes it.
Any future test that counts rows in an append-only table should do the same.

The first draft of that file did use COD-231 and passed — purely because the
suite happens to edit a different story's description. That is luck, not a
design.

### `supabase test db` reports `Failed: 0` for a file that errored

A SQL error in a pgTAP file does not fail the run in the way you expect. This:

```
supabase/tests/rls.sql ... ok      <- it says ok
Tests: 260 Failed: 0               <- and no failures
Parse errors: Bad plan.  You planned 262 tests but ran 260.
```

was `select like(...)` — pgTAP's LIKE assertion is **`alike()`**; `like()` does
not exist. The statement raised, psql aborted the rest of the transaction, and
the error went to stderr where pg_prove does not read it. Every assertion that
had already run still emitted its `ok` line, so the counts look healthy.

**The plan count is the only thing that catches it.** `select plan(N)` at the top
of each file is not bookkeeping — it is the assertion that the file ran to the
end. Never adjust the number to match what ran; find out why the missing ones
did not.

The tell is `Bad plan` or `Non-zero exit status: 3` next to `Failed: 0`. When you
see it, run the file straight through psql to get the real error:

```bash
docker exec -i supabase_db_coditu psql -U postgres -d postgres -f - < supabase/tests/rls.sql
```

(pgtap lives in `extensions` and each test file creates it, so running a snippet
in a bare psql session gets `function plan(integer) does not exist` — that is the
session, not the database.)

### A working feature is not evidence that its policy is enforced

Presence on the sprint header works. It works identically with
`config: { private: false }`, which skips `realtime.messages` RLS altogether. So
`e2e/presence.spec.ts` → *"two people on the same sprint can see each other"*
would stay green if somebody removed the policies, removed the prefix, or set
`private: false` — the feature is not the guarantee.

The shape of the problem is general: **when a security control is a gate the
happy path never touches, the happy path cannot test it.** Look for a test that
fails when the control is removed. If there isn't one and there cannot be one,
say so and pin the control's shape directly, as `supabase/tests/read-boundary.sql`
does for the client RPC projections and `rls.sql` now does for these two
policies.

Concretely, for realtime: assert the policies exist, that they name
`is_active_member()`, and that they are confined to the `coditu:` topic prefix —
plus a browser assertion that the client really sends `"private":true`. Neither
half is sufficient alone.

### Adding a panel to a page changes every test that reads text from it

W4c put a version history panel on the item page. It renders each revision's
text as diff lines, so the story's writing is now on that page **twice** — once
live, once as history. Four specs that had nothing to do with version history
broke on strict mode:

```
getByText("WITHDRAWNSENTINEL") resolved to 3 elements:
  1) <p …>WITHDRAWNSENTINEL</p>
  2) <div …>+ added: WITHDRAWNSENTINEL</div>
  3) <div …>+ added: WITHDRAWNSENTINEL</div>
```

They were not run in W4c — the specs run then were the new one plus a11y and
navigation — so the breakage was found two phases later, along with a real leak
underneath it (below). **After adding anything that renders existing content in
a new place, run the specs for that PAGE, not just for the feature.** For the
item page that is `item-detail`, `criteria`, `composer` and `editable`.

The fix in each is `.first()` on the live copy, with a comment saying why there
is more than one.

### `document_revisions` cascades for stories and not for comments

`entity_id` is a plain uuid addressing five different tables, so it can carry a
foreign key to none of them. `work_item_id` and `sprint_id` DO have one, which is
why purging a story already removed its whole history — and why nobody noticed
that purging a **comment** did not.

A withdrawn comment's words are supposed to reach no one, including its author.
They stayed in `document_revisions` and the history panel went on rendering
them, on a story any internal member could open, permanently, behind a
confirmation that had just said "removes the comment permanently".

Both sides are fixed and both are needed. `purge_deleted` deletes the comment's
revisions explicitly, **before** the comment, so a half-failure leaves a comment
in the bin rather than a vanished comment with readable words.
`lib/data/revisions.ts` shows a comment's revisions only while that comment is
present and standing — written as an ALLOWLIST, because the first attempt asked
"which are withdrawn" and missed the case that actually leaked: a comment that no
longer exists at all.

Criteria are deliberately not treated this way: a removed criterion's history is
a legitimate record of what the work asked for. Withdrawing a comment is
specifically the act of taking words back.

### A context provider above `useOptimistic` can strand the optimistic state

W5b added `PresenceSurfaceProvider` around the whole item body so an editor
anywhere inside could announce which surface it was on. It held the surface in
`useState`, so opening the composer re-rendered everything under the provider —
including the thread, which owns the `useOptimistic` comment.

`e2e/optimistic.spec.ts` → *"a failed post gives the draft back rather than
losing it"* then failed with the optimistic entry stuck on `sending…` for ever.
The composer's rollback runs inside a transition, and a re-render arriving from
a provider above it left the optimistic entry in place instead of reverting.

**A provider that wraps a subtree containing optimistic state must not hold
frequently-changing state.** `useSyncExternalStore` is the fix and is better
anyway: claims live in a ref, and only the one component that reads the value
re-renders. Nothing else in the tree is touched, so nothing else can be
disturbed.

The tell is an optimistic placeholder that never resolves while the write itself
plainly finished — the error toast appeared, the draft came back, and only
`sending…` was wrong. Confirmed as caused-by-this-change with `git stash`: the
test passed on the parent, failed with the change, and passed again with a
single `useAnnounceSurface` call neutralised.

### Two `string` parameters is a type system that cannot help you

`getSprint(projectId: string, number: number)` takes a project **ID**. The
workspace home passed a **slug**. It typechecks perfectly, lints clean, and
fails at the database with:

```
22P02  invalid input syntax for type uuid: "meinevim"
```

which the app renders as its error boundary — *"This screen did not load."* No
unit test caught it, because the failure is a real query against a real
database; nothing but opening the page would have.

Two lessons, and the second is the general one:

- **`getSprint` and friends take ids, not slugs.** `getProjectBySlug` is the one
  that takes a slug, and its name says so. Check the parameter name, not the
  type.
- **The green gate does not open a page.** `lint`, `typecheck` and `test` all
  passed on a page that threw on every single load. `06-PROGRESS.md` has said
  "the green gate never opens a page" since W0; this is the clearest instance
  of it yet, and it was found because somebody insisted on looking in a browser.

Two more defects surfaced in the same look and neither is visible to a test that
does not read the rendering: `StatusChipDot` already prints its label, so
printing `STATUS_LABEL` beside it rendered *"in progress in progress 3"*; and
`daysRemaining` clamps at zero, so a sprint that ended two days ago read
*"0 days left"*.

**Signing in to the browser without typing a password:** mint a token against the
local auth API and set the cookie, exactly as `e2e/fixtures.ts` does.

```bash
curl -s -X POST "http://127.0.0.1:54421/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"mohamed@coditu.com","password":"coditu"}'
```

then `document.cookie = "sb-127-auth-token=base64-" + btoa(JSON.stringify({access_token, refresh_token, expires_at, expires_in: 3600, token_type: "bearer"}))`.
The cookie name's `127` is the first label of the Supabase URL, not a typo.

### A loaded machine fails the suite as timeouts
The suite is ~6 minutes at 12 workers on an idle machine. Under load (a browser, a VM, another build)
the same run takes 30+ and fails 20 tests, all of them `Test timeout of 30000ms exceeded` — including
`page.waitForTimeout(120)`, which is the tell. Check `uptime`; above a load average of ~10, run
`npx playwright test --workers=3` instead of diagnosing.

Related: never edit source files while a suite is running. Every save invalidates the dev server's
chunks, and the cascade looks like twenty unrelated failures.

### The dev server must be warm before a parallel run
Twelve workers hitting an uncompiled route at once exceeds the 30s navigation timeout and the failures
cascade. `curl` the main routes first (`/`, `/login`, `/app`, `/app/my-work`, `/app/people`,
`/app/import`, `/app/projects`) or run one cheap spec before the suite.

---

## The hosted project

### Production migrations are pushed by hand
`npm run db:migrate` is `supabase migration up` — **local only**. Nothing in the repo, CI, or the Vercel
deploy pushes a migration to `hayfsvsepgfescojesbd`. Schema and code travel separately and arrive in
whatever order they arrive; on 2026-08-21 that took production down (`sprints.notes_written_at` shipped
ahead of its migration, `42703` on every sprint page), and by 2026-08-22 production was four migrations
behind — including the fix for a sign-up handing itself `role: admin`.

Applying them is the user's own terminal (the CLI on this machine is logged into a different account
and gets `403`; a cloud session has no token at all, and the Supabase MCP server needs an interactive
OAuth round trip it cannot run):

```bash
supabase link --project-ref hayfsvsepgfescojesbd && supabase db push
```

**Prefer `scripts/push-to-hosted.sh`** — the same push, with the before-and-after numbers taken
automatically and sixteen assertions on the result. It exists because the list in `06-PROGRESS.md`
has two steps whose failure is silent, and a checklist read at the end of a long day is the wrong
shape for those. Rehearsed 2026-08-24 against a bare-Postgres copy stood up at production's exact
migration state; all eight migrations, all three seeds, all sixteen checks.

**Never `supabase db push --include-seed`.** It runs `supabase/seed.sql`, whose accounts are created
with `crypt('coditu', …)` — see "The seed password reached production" below, which is what that flag
did once already. The three files under `supabase/seeds/` are a different thing and are safe; the
script runs them individually through `psql` for exactly this reason.

### `supabase db push` swallows `raise notice`
A migration that reports what it did through `raise notice` reports it to nobody: the CLI prints
`Applying migration …` and its own JSON summary, and the server's notices are not in either. Measured
directly — `20260825093000_stable_image_refs.sql` raises
`stable image refs: % comments, % criteria rewritten`, and `grep -c 'stable image refs' push.log`
returns **0**.

This matters more than it sounds, because a well-written data migration is idempotent, so **the number
is gone the moment it runs** — a second run correctly finds nothing left to do and reports zero. If a
migration rewrites rows and you want to know how many, **count them yourself before you push**, with
the same predicate the migration uses. `scripts/push-to-hosted.sh` does that and cross-checks the
notice if it ever does appear.

**Checking what production actually has**, read-only, with the service-role key:
a column — `GET /rest/v1/<table>?select=<col>&limit=1`, `400` means missing; a bucket —
`GET /storage/v1/bucket`. **A function: do not probe with `{}`.** PostgREST answers `PGRST202` both
when the function is absent and when it exists with different arguments — the two responses are
byte-identical. Call it with its real named arguments and no-op values instead.

### The Supabase SQL editor discards open transactions
It runs the editor contents as one request on a pooled connection, so a script that opens `begin;` and
never commits is rolled back when the request ends — and it looks like it worked, because the `select`
at the bottom runs *inside* the transaction and the grid shows exactly the state you wanted. Put
`commit;` in the script, and verify with a separate execution afterwards.

### Production accounts are the team's real Gmail addresses; local is deliberately not
The hosted project's four profiles are on real addresses (`mohamedtamer200200@gmail.com`,
`elkhateebabdelrahman10@gmail.com`, `ahmed.yehia4431@gmail.com`, `adamnafie@gmail.com`), all `admin`.
**Local must stay on `@coditu.com` / `coditu`** — `e2e/fixtures.ts`, `scripts/check-budgets.mjs` and
`scripts/check-degraded-dependency.mjs` all sign in that way. Never apply the repoint locally.

Abdelrahman's address is `elkhateebabdelrahman10@gmail.com` — inviting the version without the `10`
gives him a second profile and splits his hours.

### The seed password reached production
`supabase/seed.sql` creates its accounts with `crypt('coditu', …)` and the ledger records that the seed
**was** run against the hosted project, so production carried four accounts whose password was
`coditu`, one an admin. Repointing them to real addresses does not fix it — the password travels with
the account. Rotation is a dashboard step (Auth → Users) and is **not** something to verify by signing
in. If a hosted project is ever seeded again, substitute real passwords first.

### Local and production item keys diverged
The Notion export carries no item keys — Coditu assigns them — so the two databases numbered the same
104 items differently: **local `COD-140…COD-243`** (Week 17 is COD-229…242), **production
`COD-152…COD-255`** (Week 17 is COD-241…254). Same order, different offset.

**Consequence:** any data fix keyed on `COD-nnn` attributes the wrong rows in production while looking
perfect locally. Match on something stable — the title — instead. `supabase/seeds/item-components.sql`
is built this way for exactly this reason.

---

## Database

### Deleting a profile cascades its work
Ten foreign keys reference `public.profiles`. A delete **removes** rows in `time_entries`, `comments`,
`comment_mentions`, `notifications`, `attachments`, and blanks `activity.actor_id`,
`work_items.assignee_id`, `work_items.reviewer_id`, `sprints.notes_author_id`,
`allowed_emails.invited_by`.

The People page only reports assigned items and logged hours, so an account showing `0 assigned / 0.0
logged` can still own comments and activity — that happened on 2026-08-21. **Merge duplicates, never
delete them**: repoint all ten columns, guard the delete with a count across every referencing table,
and raise rather than proceed. `comment_mentions` and `notifications` carry per-(parent, profile)
uniqueness, so move only what will not collide.

### A column guard is an allowlist written as a denylist
`guard_work_item_columns` and `guard_criteria_columns` both raise when an engineer changes a column
*named in a list*. So **a new column is silently writable by an engineer until somebody adds it
there.** `component_id` and `body_json` were each added for that reason and not because anybody asked.
Check both guards whenever you add a column to `work_items` or `acceptance_criteria`.

### An AFTER DELETE trigger that writes a row about its parent breaks the cascade

`record_component_tag_activity` logs an untag into `activity`. Deleting a work
item cascades to `work_item_components`, so the trigger fired with the parent
already gone:

```
insert or update on table "activity" violates foreign key constraint
DETAIL:  Key (work_item_id)=(d22501ae…) is not present in table "work_items".
```

The whole DELETE aborts, so for an hour **nothing could delete a work item** —
not the Server Action, not psql, not the e2e cleanup. It surfaced as a spec
failing in `afterEach`, which is to say as a spec about components failing for a
reason that had nothing to do with components.

The guard is one line — skip the write when the parent is gone:

```sql
if not exists (select 1 from public.work_items w where w.id = old.work_item_id) then
  return null;
end if;
```

**The shape is general: any AFTER DELETE trigger that INSERTs a row referencing
the deleted row's parent has this bug**, and it is invisible until something
deletes a parent. Note which triggers do NOT have it and why —
`refresh_component_mirror` runs on the same table and the same event, and is fine
only because it issues an UPDATE that matches zero rows, and an UPDATE matching
nothing is not an error. That is luck, not design, so it is worth checking
rather than assuming.

### Renaming an enum value does not reach SQL functions
`alter type … rename value` is metadata-only; column defaults, index predicates, view predicates and
check constraints follow it. Two things do not: an old-style `language sql` function stores its body as
text and re-parses it on every call (`work_item_status_rank` must be `create or replace`d in the same
transaction), and `activity.from_value` / `to_value` are plain `text` that keep the retired spellings
forever unless backfilled. A view's FILTER predicates follow the rename but its output **column
aliases** do not — fix with `alter view … rename column`, which preserves grants and
`security_invoker`.

### `storage.objects` refuses a direct SQL delete
A statement-level `BEFORE DELETE` trigger (`protect_objects_delete`) raises `42501` unless the session
GUC `storage.allow_delete_query` is `'true'`. pgTAP must set it (`set local …`) to exercise the RLS
policy underneath; e2e cleanup cannot delete rows at all and has to call
`DELETE /storage/v1/object/<bucket>/<key>` with the service-role key.

### Notifications come from a trigger
Rows in `public.notifications` are written by `sync_comment_mentions`, a `security definer` trigger on
`comments`. `lib/actions/notifications.ts` looks like the place and is not — it only marks rows read.
Anything that must happen when a notification is created hooks into `postComment` *after* its insert
returns (the trigger has already run in the same transaction), or is a second trigger. Also: the `kind`
constraint allows `'assigned'` and `'review_requested'`, but only `'mention'` is ever inserted.

---

## App behaviour

### `router.refresh()` cancels a pending `push()`
`refresh()` re-fetches the CURRENT route. Issued right after `router.push(path)`, before the push has
committed, it cancels the navigation — the action succeeds, the toast fires, and the reader is left
where they started. After a Server Action that already calls `revalidatePath`, just `push`.

### A Server Action can reject, and your rollback never runs
`const result = await action(); if (!result.ok) rollback()` handles the failure the action *reports*
and not the one it cannot: the call is a `fetch`, and a lost network or a restarted server makes the
promise **reject**. Both the rollback and the message are skipped, `useOptimistic` reverts on its own,
and the change appears and vanishes with nothing said. Wrap every call in `settle()`
(`lib/action-result.ts`), which rethrows `redirect()`/`notFound()` first.

Related: state set inside `startTransition` is deferred until the transition settles — only the
`useOptimistic` dispatch belongs in there; urgent UI resets go before it.

### Signing out revokes every session
`supabase.auth.signOut()` defaults to `scope: "global"`. In a parallel suite sharing one account, one
sign-out logs out eight other workers mid-assertion — and they report whatever they were looking for as
missing, not as "signed out". Any spec that signs out creates its own throwaway account
(`createThrowawayAccount()`).

### `loading.tsx` changed the whole suite
Four measured consequences of a `loading.tsx` in every `/app` segment:

1. **The suite needs a hydration wait.** A streamed boundary hydrates *after* load, so `page.goto`
   returns real markup with no handlers. `e2e/fixtures.ts` wraps every `goto` and waits for a
   `__reactFiber$` key on `<main>`.
2. **`notFound()` returns 200.** The shell is flushed before the page body runs. Assert the rendered
   not-found content and the `next-error` meta marker, never the status.
3. **A fallback rides in the flight payload of every page beneath it** — ~1KB per element in dev.
   Skeletons paint rows with repeating gradients rather than one element per row.
4. **A dev-only hydration mismatch**, ~10 in 60 loads under six workers against `next dev`, 0 in 60
   against a production build.

### Prefetch renders dynamic routes
`<Link>` prefetches on viewport entry, and for a dynamic route each prefetch is a full server render
that `staleTimes.dynamic: 0` throws away. Measured: one sprint page view was 28 RSC renders and 178
database statements with prefetch on, 0 and 40 with `prefetch={false}` — and navigation timings were
unchanged. Use `prefetch={false}` on links into authenticated dynamic routes.

### Coditu opens light, not dark
`next-themes` runs `defaultTheme="light"` with `enableSystem={false}`, reversing the 2026-08-20 ADR
after the team used it. Never reach the alternate palette in a test by clicking a button labelled
"Switch to light theme" — that label names the theme you are *leaving*, so it points the wrong way when
the default changes. Set `localStorage.theme` before load and assert the class.

### A fixed overlay inside the item dialog needs a portal
The item dialog's panel is `overflow: hidden`, so a `position: fixed` scrim rendered inside it is
clipped to whatever column it sits in — a "full screen" image viewer opens inside a 300px box.
Portal to `document.body` (`CellPopover`, `CommentImage`). And Escape must be caught in the **capture**
phase and stopped there, or one press closes the inner thing *and* the dialog behind it.

### `data-autofocus` in a cell popover only works once positioned
The popover renders at `visibility: hidden` until it has measured a position, and `focus()` on a hidden
element is a no-op that reports nothing. Focus must wait for `position` — which means depending on it,
which means a ref to claim focus once per opening (a scroll re-positions constantly).

### A toolbar button steals ProseMirror's stored marks
Pressing a toolbar button moves focus out of the editor, and that drops the stored marks — the "what I
type next is bold" state an empty document has instead of a range. `focus()` in the command chain puts
the caret back with the mark already gone, so the button appears dead until there are words to select.
`onMouseDown={(e) => e.preventDefault()}` on every toolbar button.

### `contenteditable` + `aria-label` is an axe violation while empty
A `contenteditable` div is a *generic* element to axe, and `aria-label` on a generic element is
prohibited — but the rule only fires when the element has no text content, which is why an editor
audited after typing looks clean. Give the editing surface `role="textbox"` and `aria-multiline`.

---

## Domain

### The status vocabulary — the rename DID land, and this note was wrong twice
**Corrected 2026-08-25 (second correction).** The first correction said the rename was not in this
repository. It is. `supabase/migrations/20260825100000_rename_work_item_statuses.sql` is on `main`,
and on a freshly reset local database:

```
enum_range(null::work_item_status)
→ {draft,ready,in_progress,in_peer_review,in_qa,changes_requested,done,blocked}
```

`parseStatusFilter`, which the first correction said "does not exist", is `lib/work-items.ts`, and it
carries `RETIRED_STATUSES` mapping `todo → ready`, `dev_started → in_progress`,
`ready_for_peer_review → in_peer_review`, `in_review → in_qa` forward, because an unrecognised
`?status=` value would quietly widen the filter to the whole sprint rather than error, and those links
are in bookmarks.

**Why the first correction was reasonable and still wrong.** It read
`20260820120000_enums.sql`, found the original eight values, and concluded. A later `alter type …
rename value` is invisible to the file that declares the enum — you have to fold every migration in
order, which is what `tests/status-order.test.ts` now does. **Verify a vocabulary against the live
`enum_range`, never against the migration that created it.**

`STATUS_ALIASES` in `lib/import/notion.ts` is a separate, still-correct thing: it maps *Notion's*
spellings onto these values at import time.

**Still outstanding: `blocked` is not a status, it is a flag over one.** A blocked item is also
mid-build or waiting on a reviewer, and storing `blocked` in the status column destroys the state
needed to unblock it. The fix is a nullable `blocked_reason` with "blocked" derived from it; deferred,
and it needs a backfill decision for existing rows.

### The component registry is a copy of the EVIM repo
`public.components` for MEINEvim is generated from `../microsoft-web-parts-final`: one row per SPFx
solution, named by its manifest's `preconfiguredEntries[0].title.default` and carrying that entry's
`officeFabricIconFontName`, plus one per feature in the React app's own registry. 41 rows as of
2026-08-24, 34 with icons.

**Check it every so often** — a copy of another repo goes stale silently, and a picker offering
yesterday's list is the exact failure it exists to remove:

```bash
npm run components:check   # exits 1 if stale, and prints what is new, renamed, re-iconed or gone
npm run components:sync    # rewrites supabase/seeds/components.sql
```

The script only ever **adds**. A rename or a changed icon over there is reported as drift, not written,
because renaming a component in Coditu moves an item's history and that is a decision for the app. The
icon is stored verbatim and mapped to a Lucide glyph in `components/coditu/component-icon.tsx`; an
unmapped name falls back to the kind's glyph rather than rendering nothing.

The folder name is not the product name: `ButtonLinkPlus` ships as *EVIM Button Link*, `Tabs with
Cards` as *EVIM Themen Kachel*, `Finder` as *EVIM Dokumentenbibliothek*.

### Ten imported items have no component on purpose
`supabase/seeds/item-components.sql` attributes the imported work by matching phrases against titles.
93 of 103 land. The other ten matched **two different components at the same priority** — "CR:
Instagram / LinkedIn Feed", "Responsiveness for Link Kachel, Tabs with Cards, Newspart", "Add optional
titles to all webparts" — and a wrong attribution would poison the per-component history the column
exists to provide. The file only ever fills a NULL, so a correction made in the app is permanent.

---

## Git

### Both append-only docs conflict, and "theirs" deletes the reasoning
`docs/05-DECISIONS.md` and `docs/06-PROGRESS.md` are append-only logs. Resolve a conflict by keeping
**both** sides' entries, never by taking one — a "theirs" resolution silently deletes everything below
it.

### Two sessions can write the same migration number
Git merges two differently-named files without a murmur; the collision only bites at
`supabase db push`, which refuses a file sorting earlier than what the remote already holds. **Check
migration filename ordering by hand after any merge involving two parallel sessions**, and renumber
while it is still unpushed — that is the only cheap moment.

### `git pull --rebase` drops merge commits
It replays commits onto their own parent and walks straight back into conflicts a merge commit had
already settled. `git rebase --abort` restores everything (a rebase runs on a detached HEAD, so the
branch never moved). After any merge whose resolution matters, prefer `git pull --ff-only`.

---

## Verification without Docker

### The whole database layer can be verified on a bare Postgres
`npm run db:test` is `supabase test db`, which needs the Docker stack. On a machine or a container
with no Docker daemon — a cloud session, a locked-down CI box — the database half of the gate is still
reachable, and it is worth an hour to set up because it is most of the gate:

```bash
apt-get install -y postgresql-16-pgtap        # pgTAP is the only real dependency
initdb -D "$PGDIR" -U postgres --auth=trust   # as an unprivileged user; initdb refuses root
pg_ctl -D "$PGDIR" -o '-p 54422' -w start
```

Then a **bootstrap** creating the pieces the migrations actually reference — and it is a short list,
which is the surprising part. `grep -rhoE '\b(auth|storage|realtime|extensions)\.[a-z_]+' supabase/migrations/`
returns exactly six: `auth.uid`, `auth.users`, `auth.sign`, `storage.buckets`, `storage.objects`,
`storage.foldername`. Plus the roles (`anon`, `authenticated`, `service_role`, `authenticator`), the
`extensions` schema, and the `supabase_realtime` publication. With those in place **every migration
applies in order, the seed loads, and `supabase/tests/*.sql` runs through `psql` with the same TAP
output `supabase test db` prints.**

What this does NOT give you: PostgREST, so no `PGRST204` and no e2e; GoTrue, so nothing can sign in;
storage's HTTP API, so an upload cannot be exercised end to end. Those are the parts a browser needs,
and a browser needs the stack.

### `alter database postgres` in a bootstrap script configures the wrong database
`supabase-shim.sql` set the search_path with `alter database postgres set search_path = …`, which is
correct exactly once — when the database really is called `postgres`, as the walkthrough above happens
to make it. Load the shim into any other database (a rehearsal copy stood up at production's migration
state, a second cluster) and the statement succeeds while configuring a database you are not connected
to. **Nothing fails until `supabase/seed.sql` reaches `gen_salt('bf')`**, which lives in `extensions`
and is suddenly not on the path — 1,900 lines in, with the projects and work items already inserted
and everything after them missing.

`alter database` takes a name and not an expression, so the fix is a `do` block with
`format('alter database %I …', current_database())`. Fixed 2026-08-24; the note stays because the
shape is general — a bootstrap script that names a database is a bootstrap script that works once.

### `supabase/seed.sql` needs the current migration set, not an older one
It ends with `select public.rebalance_project_keys();`, which arrives in
`20260825091000_project_keys_and_slugs.sql`. That is correct for `db reset` (migrations, then seed) and
it means the seed **cannot** be loaded onto a database held at an older migration state. To rehearse
against production's state, comment that one line out for the rehearsal copy — do not stub the
function, or the migration under test will replace a fake and you will have proved nothing.

### Finding out what is actually in a chunk

`npm run budgets` names the six biggest chunks of a route that is over, but content-hashed filenames
say nothing about what is inside them. Two greps answer it without a bundle analyzer, and both work on
the production build that is already on disk:

```bash
# which library — package paths survive minification in import specifiers and error strings
grep -oE "@supabase/[a-z-]+|@tiptap/[a-z-]+|dnd-kit|lowlight|prosemirror-[a-z]+" \
  .next/static/chunks/<hash>.js | sort | uniq -c | sort -rn

# which of OUR components — pick a string literal that only one file contains
grep -c "Half an hour more" .next/static/chunks/<hash>.js   # log-time.client.tsx
```

The second is the useful one and it needs a *distinctive* literal — user-facing copy works, identifier
names do not, because they are mangled. `grep -oE '"[A-Z][a-z][^"]{12,40}"' <file>` over the source
finds candidates.

This is how the sprint page was shown to be shipping `log-time.client.tsx`, which only the item
detail renders: one chunk contained both the sprint table's strings and `"Half an hour more"`. A
parallel route's `@modal` slot contributes its client references to the segment's chunk group even
on a render where the slot returns `null`.

### Two imports that look free and cost 60KB each

Both were found by `npm run budgets` on the same afternoon, both in client
components, and neither is visible at the call site. The app shell went 69KB →
184KB, and getting back under 110 took untangling them one at a time.

**`CommentBody` pulls in lowlight.** It highlights code blocks server-side with
every common language, so importing it into a `"use client"` file ships the whole
highlighter: **+114KB**. `criteria-list.client.tsx` had already met this and says
so in its own header — *"the bodies are rendered ON THE SERVER and handed down"* —
and the fix is always the same shape: render the body in a Server Component and
pass it down as a `ReactNode` prop.

**`lib/blocks/schema.ts` used to pull in zod.** A client component that only
wanted `isEmptyDocument` got the validator too: **+63KB**. Split now —
`lib/blocks/schema.ts` is the pure vocabulary with a hand-written shallow node
parser, `lib/blocks/validate.ts` holds the zod `documentSchema` and is imported
only by Server Actions. `lib/supabase/env.ts` made the same split years earlier
and explains why in its header.

**The general rule:** a module reachable from the browser must not import a
validation library or a syntax highlighter, and neither dependency is visible in
the import that drags it in. `import { isEmptyDocument }` says nothing about zod.
The tell is a route's own KB jumping by ~60 in one commit; the technique for
finding which chunk is the note above about grepping built chunks — zod is
identifiable by `invalid_type` / `too_small`, lowlight by its language names.

### `@supabase/supabase-js` does not export `RealtimeClient`

It inlines it. `sideEffects` on the package is narrow enough that tree-shaking *should* work, but
there is nothing to shake: `dist/index.mjs` exports `createClient`, `SupabaseClient` and the error
classes, and nothing else. Realtime without auth-js means depending on `@supabase/realtime-js`
directly — it is already in the tree as a transitive dependency, so promote it at the **same version
range** as `supabase-js` and check `package-lock.json` afterwards for a single entry. Two copies of a
websocket client in one bundle is worse than the 65 KB it was meant to save.

### `supabase gen types` needs Docker even with `--db-url`
It spins up `postgres-meta` in a container regardless, so `npm run db:types` fails with
`failed to connect to the docker API` even when it is pointed straight at a running Postgres. On a
Docker-less machine `lib/supabase/database.types.ts` has to be hand-edited, and the generator's own
conventions matter if the next `db:types` is not going to produce a large spurious diff:

- Keys are **alphabetical** within `Row`, `Insert` and `Update`, and tables are alphabetical too.
- A column is optional in `Insert` when it is nullable **or has a default** — so a `not null` column
  with no default becomes *required*, and every caller then has to supply it. That is why
  `work_items.key` was given `default ''` rather than having its default dropped: a BEFORE INSERT
  trigger fills it either way, but the generator cannot see the trigger.
- Every foreign key produces a `Relationships` entry **per referenced relation**, including the views
  — a `profile_id` reference generates one for `profiles` and one for `v_person_load`.

### `next build` is a real check, and it runs anywhere
It type-checks, resolves every route, and catches a server/client boundary error that `tsc` will not.
It needs the public env vars to be *present*, not correct:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=any-string-over-twenty-chars \
npm run build
```

Read the field note above about `.env.production.local` before doing this on a machine that has one.

---

## The editor and its images

### A `blob:` URL must never reach `body_json`
An in-flight upload is rendered from `URL.createObjectURL(file)`, which exists in one tab and dies with
it. Store one and it is a permanently broken image for everybody including its author on their next
reload — the same class of bug as the expiring signed URL, arrived at from the other direction.

Three things stop it and all three are load-bearing: the placeholder node's `parseHTML` returns nothing
so it can never come back off a clipboard, its `renderHTML` emits an empty div so a document serialised
by mistake carries no URL, and both the composer and the criteria editor refuse to submit while
`hasPendingUpload(doc)` is true. The draft restore strips them too, because a draft written mid-upload
outlives the tab that made it.

### `fetch` does not report upload progress, and never has
Only `XMLHttpRequest` fires `upload.onprogress`. A Server Action call is a `fetch`, so any upload that
goes through one can show a spinner and nothing better. That is the entire reason `/api/uploads` is a
route handler; it is not a preference.

Cap the reported percentage at **99** until the response lands. The last percent belongs to the server
answering, and a bar sitting at 100 while nothing happens reads as a hang.

### The 16px rule does not reach the editor, because it is not an input
`app/globals.css`'s coarse-pointer block names `input, select, textarea`. The rich-text surface is a
`contenteditable` **div**, so it matched nothing — and `.coditu-prose p` re-declared 14px. iOS Safari
auto-zooms any focusable **editable element** under 16px, `contenteditable` included, and does not zoom
back out: tapping into the composer on an iPhone left the reader at 1.4x with the sheet off the side of
the screen. Which is exactly the failure that block exists to prevent, arriving through the one element
it does not match.

The fix names `.coditu-prose` explicitly, and it is safe to scope it that way because
`comment-body.tsx` renders a stored comment with its own classes — how a thread READS on a phone is
untouched, only what you type into is raised. Asserted as a computed style in `mobile.spec.ts`, because
the whole class of bug is a rule that looks like it applies and does not.

### Toolbar buttons need `onPointerDown` as well as `onMouseDown`
The existing note about stored marks is right and incomplete: a synthetic mouse event is **not
guaranteed** on a touch screen. Safari fires it after a delay and some Android keyboards not at all, so
on a phone the stored mark was lost before `onMouseDown` ever ran. Prevent both, and set
`touch-action: manipulation` so the double-tap-to-zoom delay does not make the toolbar feel dead.

---

### Hand-written demo data breaks specs you did not touch

Setting up a screenshot by writing straight into the seeded database — attributing seven Week 17
items to components, publishing three components — broke `components.spec.ts` twenty minutes later,
in a run whose diff contained none of those files. The spec filters the sprint by
`?component=evim-themen-kachel` and counts rows; the demo SQL had changed which items carry which
component. `npm run db:reset` and it was 11/11 again.

The shared-database note above is about two *runs* colliding. This is the same hazard from a
different direction: a **person** setting up a demo is another writer on the one seeded database, and
the damage surfaces somewhere unrelated, later, looking like a regression in whatever is being worked
on at the time.

Use a spec fixture that creates its own rows under a recognisable prefix and deletes them afterwards
(`e2e/client-*.local.ts` uses `portal-e2e-%`), or `db:reset` immediately after looking. Do not leave
hand-written rows in the seed.

### Two spec files cannot share one fixture

`test.describe.configure({ mode: "serial" })` orders tests **within a file**. Playwright still runs
different files in different workers at the same time, and `beforeAll`/`afterAll` run once per
worker — so two spec files calling the same `setupFixture()`/`teardownFixture()` delete each other's
rows mid-assertion. It presents as an assertion failing on data that was definitely there, and it
moves between runs.

Serial mode does not fix it and cannot. Give each file its own rows —
`client-boundary.spec.ts` uses `boundary@portal-e2e.test`, `client-portal.spec.ts` uses
`cara@portal-e2e.test` — so the fix does not depend on scheduling.

### The suite's failures move between runs, and three is not a regression

Two consecutive full runs on the same commit failed **different** specs — first
`criteria`/`mobile`, then `my-work-import`/`mobile`/`motion` — and every one of them passed when run
alone. That is the loaded-machine and shared-database pattern already recorded above, not a fault in
whatever changed.

The check that distinguishes them is cheap and should always be made before believing a red suite:
re-run the named specs **in isolation**. If they pass, the suite is telling you about the machine. If
they fail, they are telling you about the code.

## Regexes and character classes

### A hyphen between two escapes is a RANGE, and it is silent
`/[\s -\\%?#]/` looks like "whitespace, space, hyphen, backslash, percent, question mark, hash". It is
whitespace **plus every character from space (0x20) to backslash (0x5C)** — which includes every digit,
every uppercase letter, `/` and `-`. A path-traversal guard written that way rejects every valid input
and looks like it is working, because rejecting things is what a guard does.

Write the range out: `/[\s\u0000-\u001F\u007F\\%?#]/`. And keep the escapes as escapes — a literal
control character in a source file makes `grep` call it a binary file, makes the diff unreadable, and
makes review impossible.

Both `lib/attachments.ts` and `components/app/rich-text-editor.client.tsx` had this, and the second one
(`/[\s -]/` in `normaliseHref`) would have refused every hyphenated domain.


---

## Next 16, and the things that fail by doing nothing

### `after()` cannot touch `cookies()` — and the failure is invisible
`app/app/earnings/page.tsx` refreshed the exchange rate in `after()`, calling `refreshExchangeRate()`,
which called `getAppSettings()` and `createClient()`. Both read `cookies()`. Next 16 refuses that:

```
Route /app/earnings used `cookies()` inside `after()`. This is not supported.
```

**The callback throws and the work never happens.** The page is a 200 either way, because it renders
from the stored rate — which is the design — so the only symptom was that
`app_settings.usd_egp_rate_micros` stayed `null` in production for as long as the feature had existed,
and every EGP figure read "no exchange rate yet". No test caught it; nothing on screen was wrong. It
was found in the deployment's own runtime logs, by looking.

The fix is `createSnapshotClient()` in `lib/supabase/server.ts`: read the cookies **eagerly, on the
request**, and hand the callback a client that carries a plain array instead of the store. Build it in
the component body, use it in the callback. Same anon key, same RLS — only *when* the cookies are read
changes. `refreshStoredRate` in `lib/exchange-rate.ts` takes the settings as an argument for the same
reason, and lives outside `lib/actions/earnings.ts` because that file is `"use server"` and a Supabase
client is not something a Server Action's arguments can carry.

**The general rule:** anything inside `after()` must be handed its request state, not go looking for
it. If a background callback appears to do nothing, check the runtime logs before checking the logic.

### TipTap v3 does not re-render on a transaction
`useEditor` defaults `shouldRerenderOnTransaction: false`, and its own types call the `true` case
"legacy behavior that will be removed". So `editor.isActive("bold")` read in the render body is
evaluated **once, at mount, and never again**: every button in the composer toolbar was frozen at
"off" for the life of the editor, and `aria-pressed` told a screen reader the same lie.

It looked fine, because pressing Bold still *worked* — the command ran, the text came out bold. Only
the indicator was dead. Nothing caught it until a spec asserted `aria-pressed` on an **empty**
composer, where the indicator is the only feedback there is.

Use `useEditorState({ editor, selector })`, which re-renders only when a selected value changes.

### WebKit cancels the click when you `preventDefault()` a `pointerdown`
Measured on both engines, tapping a toolbar button:

```
mobile-chrome   pointerdown, touchstart, click
mobile-safari   pointerdown, touchstart           ← no click, ever
```

`preventDefault()` on `pointerdown` looks like the thorough way to keep focus in the editor for both
mice and fingers. On WebKit it cancels the activation outright, so the button does nothing at all on
an iPhone — a worse bug than the one it was added for, and silent, because every desktop browser kept
working. **Prevent `mousedown` instead**: it keeps focus, and `click` still fires everywhere.

---

## CSS that looks like it applies

### A media query adds no specificity, so source order decides
The coarse-pointer block raised the editor to 16px with
`.coditu-prose p { font-size: max(16px, 1em) }`. It never took effect: `.coditu-prose p` is declared
again **later in the same file** at 14px, at equal specificity, and `@media` contributes nothing to
specificity. The later rule won, the fix shipped with the bug still in it, and the commit message said
it was fixed.

Only a computed-style assertion found it (`e2e/mobile.spec.ts`). The rule now lives at the **end** of
`app/globals.css` with a comment saying it must stay there.

**If a rule looks right and does nothing, check what is declared after it before checking anything
else.**

### A sticky header obscures whatever the browser scrolls into view
Opening the criterion editor on an iPhone left **21px of a 74px** editing surface reachable; the rest
was behind the `position: sticky` top bar. The browser had scrolled it "into view" correctly — it
measures the viewport, not what is painted over it.

`axe` names this precisely: `target-size … partially obscured`, which is the rare accessibility failure
that is also a plain usability failure. The fix is `scroll-margin-top` on the editing surface plus
`scrollIntoView({ block: "nearest" })` — "nearest" so it moves by exactly the height of the thing in
the way, and not at all when it is already clear.

---

## Tests that could only ever be red, or only ever green

Four of these turned up in one afternoon. Each one had been written, never run, and read as correct.

- **`getByLabel` matches by case-insensitive substring.** `getByLabel("Title")` also matches a button
  whose label is "Edit **the title**". The assertion that the editor had closed could never pass,
  because the pencil comes back the moment the editor goes away. Use `{ exact: true }`.
- **A live locator is re-resolved on every use.** Ticking a criterion sinks it to the bottom of the
  list, so `boxes.first()` afterwards reads a *different*, still-unticked checkbox and reports that
  the tick did nothing. Pin the row by its accessible name, not by position.
- **An `<img>` on screen is not an upload that has finished.** While it is in flight the document
  holds a placeholder that draws the picture dimmed under a progress bar — a real `<img>`. Saving in
  that state is refused on purpose, so the test clicked Save, was told "an image is still uploading",
  and asserted against a list that had never changed. Wait for `[data-uploading-image]` to reach zero.
- **A page-wide `getByText` also matches the toast.** "Removed “E2E temporary”." contains the text the
  test was asserting had gone, so the assertion could only pass if the undo toast never appeared —
  that is, only if the feature were broken. Scope to the list.

And one that was worse than red: **`?export=csv` is not a route.** Exports are produced by the
`renderExport` Server Action, so that request returned the sprint *page*, 200, and the money-leak
assertion ran against Next's own inline runtime — where `$` followed by a digit turns up in minified
React sooner or later. It reported a leak in a CSV it had never looked at. The one assertion in the
suite that must never cry wolf was crying wolf about the wrong document entirely.

### A single-row settings table cannot be shared by parallel workers
`app_settings` has `check (id = 1)`. Every earnings test has to point `payout_from_sprint_id` at a
sprint to have anything to assert against, and has to put it back afterwards. Under `fullyParallel`
those run in different workers against the same row, so one describe's teardown blanks the setting
while another's tests are still reading it — and every one of them fails as "not tracked", which is
the *correct* rendering of the state it was just put into. `e2e/earnings.spec.ts` is
`test.describe.configure({ mode: "serial" })` for that reason: unlike the `composer.spec.ts` fixture
race, there is no per-project row to hand out, because there is only ever one row.

### A client-safe TABLE is not a client-safe QUERY

`client_threads` and `client_messages` carry no internal-only columns, so reading them with an
ordinary `.from()` select and letting RLS pick the rows is correct. The first version of
`lib/data/client-threads.ts` did exactly that — and returned an **empty list** to a client who had a
question waiting.

The list also needs what a thread is *about*:

```ts
components!inner ( name, slug ),
projects!inner   ( slug ),
profiles!client_messages_author_id_fkey ( full_name, initials )
```

A client contact cannot read any of those three. That is the boundary working as designed —
`is_active_member()` is false for her. But `!inner` on a join that returns nothing **drops the parent
row**, so the query came back `[]`: no error, no permission message, no 403. The screen said "Nothing
to answer right now" while the database was perfectly willing to say there was one.

The pgTAP suite was green throughout, because the SQL was never wrong. Only the browser found it.

**The rule:** the moment a query joins outward from a client-readable table it inherits the strictest
policy it touches, and `!inner` makes that silent. Anything a client reads that needs a name from
`components`, `projects` or `profiles` goes through a `security definer` RPC that selects those
columns by name — `client_thread_list` and `client_thread_messages` exist for exactly this.

The tell, if this happens again: a `.from()` select that returns `[]` for a client and the right rows
for `postgres`, with RLS assertions passing on both.

### Clipping is not overflow, and no overflow assertion will catch it

`html` carries `overflow-x-clip`. A control pushed past the right edge therefore creates **no
scrollbar** and does not change `scrollWidth` — `document.documentElement.scrollWidth >
clientWidth` stays false while the control is unreadable and unhittable.

The topbar shipped this in step 7 ("pushed off-screen and *clipped* — no scrollbar, just unreachable
buttons"). The client portal header shipped it again at 320px in the client-portal brief, one fix
after the label had been made to wrap instead. Two different screens, same invisible failure.

Assert element geometry, not document width:

```ts
const rect = el.getBoundingClientRect();
if (rect.right > viewportWidth || rect.left < 0) // escaped
```

`e2e/client-questions.spec.ts` does this for every header control at 320/360/390.

### `server-only` is a bundler rule, so `typecheck` and `lint` both pass

`components/app/client-visibility-panel.client.tsx` imported `THREAD_STATE_LABEL_INTERNAL` from
`lib/data/client-threads.ts`, which begins `import "server-only"`. That is a build error:

```
Ecmascript file had an error
> 1 | import "server-only";
```

`npm run typecheck` passed. `npm run lint` passed. The rule is enforced by the **bundler**, so
nothing short of `next build` or actually loading the page sees it — and the page in question was a
route neither the unit tests nor the pgTAP suite touch. The screenshot found it.

**Types are fine either way** — they are erased, so `import type` across the boundary never trips it.
It is a runtime value (a const, a function, an object) that drags the whole module across.

The fix is to put shared vocabulary in a module with no `server-only` and let the server-only file
re-export it: `lib/client-threads.ts` holds the labels and the view types, `lib/data/client-threads.ts`
holds the loaders. When a client component needs one word from a server module, move the word.

**The general lesson for this repo:** the green gate is `lint + typecheck + test + db:test`, and none
of those four opens a page. A route that no spec visits is a route where a build error can sit
undetected. Run it, or screenshot it.

### …and opening the page is not enough either — run the specs that have an opinion about it

The complement, found on 2026-08-25 while taking a baseline. C12 added the client-visibility panel to
the component dossier page. Its verification was `lint && typecheck` plus looking at the rendered page
at five widths, and the page looked correct — because it *was* correct.

`e2e/components.spec.ts` had asserted, since before that panel existed:

```ts
await expect(page.getByRole("heading", { level: 2 })).toHaveCount(sprints.length);
```

A new panel with an `<h2>` of its own makes that 6 against 5. Nothing was wrong with the page; the
assertion had quietly meant "every h2 on this page is a sprint" and nobody had said so. It sat on
`main` from `3da9eb7` until the next full suite ran.

Two things to take from it:

- **A phase that changes a rendered route runs the specs for that route.** Not the whole suite
  necessarily — `npx playwright test e2e/<that-one>.spec.ts` is twenty seconds.
- **Count what you mean.** `getByRole("heading", { level: 2 })` is a claim about the entire document.
  The fix is `h2[id^="sprint-"]`, scoped by the id the `<section aria-labelledby>` already carries —
  which is also a small argument for labelling sections properly in the first place, since it gives a
  spec something honest to point at.

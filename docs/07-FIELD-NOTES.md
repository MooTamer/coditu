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
and gets `403`):

```bash
supabase link --project-ref hayfsvsepgfescojesbd && supabase db push
```

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

### The status vocabulary — this note was wrong, and here is what is true
**Corrected 2026-08-25.** This entry described a rename of `work_item_status` on 2026-08-21 —
`todo → ready`, `dev_started → in_progress`, `ready_for_peer_review → in_peer_review`,
`in_review → in_qa`. **That rename is not in this repository.** `20260820120000_enums.sql` still
declares the original eight values, no later migration renames them, `enum_range(null::work_item_status)`
on a freshly reset database returns `{draft,todo,dev_started,ready_for_peer_review,in_review,changes_requested,done,blocked}`,
and `parseStatusFilter` — which this note said holds the retired spellings — **does not exist**. Verified
three ways rather than assumed.

Either the rename happened somewhere this repository is not, or the note was written from a plan. A
stale note is worse than no note because it is trusted, so: **the vocabulary is the original eight**,
and `lib/work-items.ts` is the one place to read it.

The one part of the entry that survives is `STATUS_ALIASES` in `lib/import/notion.ts`, which does exist
and does map old Notion spellings onto these values.

**Still outstanding: `blocked` is not a status, it is a flag over one.** A blocked item is also
mid-build or waiting on a reviewer, and storing `blocked` in the status column destroys the state
needed to unblock it. The fix is a nullable `blocked_reason` with "blocked" derived from it; deferred,
and it needs a backfill decision for existing rows.

Old Notion spellings stay readable through `STATUS_ALIASES` in `lib/import/notion.ts`.

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


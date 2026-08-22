# Coditu — mobile, access, and notifications

**This is a work order from the team, for a session starting with no memory of this repository.**
It is not a rewrite. Every complaint below is a real, located defect with a mechanical cause, and the
cause is named so you do not have to go and find it again.

Six things are wrong. They are listed as workstreams **A–F**. Do them in order. Each is one or more
commits, each commit builds, and each carries the command that proved it.

---

## 0. Before your first edit

1. **Read `docs/06-PROGRESS.md`.** It is the ledger and it outranks anything you remember or infer.
2. Read `CLAUDE.md` — in particular **the five invariants**. They still bind here. Nothing in this
   document licenses breaking one.
3. Read `docs/03-APP-SPEC.md` §Shell and §Settings, and `docs/01-DESIGN-SYSTEM.md` for tokens. Use the
   existing tokens (`--canvas`, `--raised`, `--hairline`, `--ink-muted`, `--app-gutter`, `--topbar-h`,
   `rounded-control`, `rounded-list`, the `Mono` and `Reveal` primitives). Do not introduce a new
   colour, radius, or motion tier.

### How to log the work

Every change goes in the **"After §14 — the team's own requests"** table near the end of
`docs/06-PROGRESS.md` — one row, with the command that proved it, **in the same commit as the work**.
Never a separate "update docs" commit.

`CLAUDE.md` says to *ask* before changing the data model or the auth model. **This document is that
authorization**, for exactly two data-model additions (`profiles.must_set_password`,
`push_subscriptions`) and one auth-model change (temporary passwords replace every email-based
recovery path). Nothing else. Each needs an ADR appended to `docs/05-DECISIONS.md` in the file's
existing shape:

```
## YYYY-MM-DD · A sentence saying what was decided

**Decision.** …

**Why.** …

**What was rejected, and why.** …
```

### Commits

Plain human subject lines describing the change — the way `git log` already reads here
("Stop a sign-up choosing its own role, and build the callback the links point at"). **No**
`feat:`/`fix:`/`chore:` prefixes. **No** `Co-Authored-By` trailer, no "Generated with", no 🤖, no
mention of Claude, Anthropic, AI, an assistant, or an agent anywhere in a message, branch name, or tag.
Author and committer stay the repository owner's own git identity.

Add any Playwright screenshots, traces, `test-results/`, or scratch verification files to
`.gitignore` **before** running them, and check the staged file list before every commit.

---

## 1. Traps. Read these; each one has already cost a day.

- **`npm run build` points at production.** Next loads `.env.production.local` when `NODE_ENV=production`.
  A build that quietly talks to the hosted database presents as *"That email and password do not match"*
  on the login form — not as an error. Use `npm run dev` against the local stack for everything here.
- **Production migrations are applied by hand.** Nothing gates a deploy on them. This is precisely the
  outage already in the ledger: `sprints.notes_written_at` shipped ahead of its migration and every
  production sprint page threw `42703`. **Both new migrations in this document must be applied to the
  hosted database**, and you must say so explicitly in the handoff.
- **The e2e suite shares one local database.** A second agent's run looks like a regression in yours.
- **Do not repoint the local seed.** `e2e/fixtures.ts` signs in as `mohamed@coditu.com` / `coditu`.
  Production uses the team's real addresses; local deliberately does not. Changing local breaks 162 specs.
- **`must_set_password` must default to `false`.** Default it `true` and every seeded account bounces
  to the password screen and the whole suite fails at the fixture.
- **Light is the default theme** (a reversed ADR; `docs/05-DECISIONS.md` records it). The manifest
  currently declares dark colours — see workstream D.
- **A Server Action that throws never returns**, so your `if (!result.ok)` branch never runs and an
  optimistic control sits there looking saved. Wrap in `try/catch` and roll back in the `catch`, the
  way `avatar-settings.client.tsx` does.
- **`router.refresh()` cancels a pending `router.push()`.** Ordering matters.
- **`storage.objects` refuses a direct SQL delete** — that is a trigger, not RLS. Cleanup goes through
  the Storage API.
- **`@supabase/ssr` uses PKCE**, so email links return `?code=` on the query string. The old implicit
  flow put it in the URL *fragment*, which never reaches the server.

---

## 2. Workstream A — navigation you can see

### What is wrong

There is **no `loading.tsx`, `error.tsx`, or `not-found.tsx` anywhere under `app/`.** Verify it
yourself: `find app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx'` returns nothing.

Every rail link is `prefetch={false}`, and that is **correct and deliberate** — the comment at
`components/app/rail.client.tsx:145` records the measurement: prefetching dynamic routes was costing
28 speculative server renders and 178 database statements per sprint-page view, for a navigation that
measured 269ms prefetched against 277ms not. **Do not turn prefetch back on.** The prefetch was never
what made navigation feel responsive; the missing loading state is what makes it feel dead. On a phone,
on mobile latency, a tap currently produces *nothing at all* until the full dynamic render returns.

Separately: `signOut` exists at `lib/actions/auth.ts:256` and is called from exactly one place —
`components/app/command-palette.client.tsx:204`. The palette's trigger button carries
`hidden … sm:flex` (`components/app/topbar.client.tsx:110`). **On a phone there is no way to sign out.**

### Build

1. **`loading.tsx` per route segment** under `app/app/` — at minimum for `/app`,
   `/app/projects`, `/app/projects/[slug]`, `/app/projects/[slug]/sprints/[number]`, `/app/my-work`,
   `/app/people`, `/app/import`, `/app/settings`. Skeletons shaped like the real screen — a table with
   the right column count and row height, cards at the right size — not a centred spinner. Reuse
   `--topbar-h`, `rowHeight`, and the existing surface tokens so the skeleton and the real thing occupy
   the same box and nothing jumps.
2. **`useLinkStatus`** (stable since Next 15.3; this repo is on **16.1.6**) inside the rail and bottom-nav
   link components, so the *tapped* item shows pending state on the very next frame. It must be read in
   a child of the `<Link>`, not in the same component that renders it. Respect
   `prefers-reduced-motion` — the repo has motion specs that assert computed style.
3. **`error.tsx` and `not-found.tsx`** under `app/app/`, plus a `global-error.tsx`. Written in the
   repo's voice: say what happened, say what is still true, give one action. Not "Something went wrong".
4. **An account menu in the topbar.** Trigger is the person's own `PersonAvatar`
   (`components/app/person-avatar.tsx`) — the same face already shown in the rail footer. Contents: full
   name, email, role, **→ Settings**, **→ Sign out**. Build it on `radix-ui` (already a dependency) or on
   the existing portalled-menu pattern from `components/app/row-editors.client.tsx`, which was written
   precisely because menus inside the table's `overflow: auto` were being clipped. 44px targets.
5. Leave the ⌘K palette exactly as it is. It simply stops being the *only* home for sign-out.

### Prove it

```bash
npm run lint && npm run typecheck && npm run e2e
```

New specs: a tapped rail item shows a pending state before the destination renders; every `/app` route
has a `loading.tsx`; Sign out is reachable and works at a 390×844 viewport; the account menu is
keyboard-traversable and axe-clean.

---

## 3. Workstream B — a profile page that is actually yours

### What is wrong

`/app/settings` exists, renders, and works. **Nothing links to it.**
`grep -rn '/app/settings' app components lib e2e` returns exactly two hits, and both are in
`e2e/avatar.spec.ts` calling `page.goto()`. Scoped to shipped code — `app components lib` — it returns
**zero**. The only way in is to type the URL, which inside an installed PWA is impossible.

It is also thin: it edits a picture and nothing else. There is no way to correct your own name.

### Build

`app/app/settings/page.tsx` becomes a real profile page:

- **Display name**, editable. Writes `profiles.full_name` and re-derives `profiles.initials` using the
  same rule as `handle_new_user` (`supabase/migrations/20260821180000_role_is_not_client_supplied.sql:32`)
  so a name set here and a name set at sign-up produce identical initials. Read that function and match it.
- **Your picture** — the existing `AvatarSettings` block, unchanged. It is good.
- **Email and role**, shown read-only, with a sentence pointing at People: an admin administers those.
  This is the boundary `lib/actions/profiles.ts` already documents at length; do not blur it.
- **Sign out**, as a plain visible control.
- Keep the existing `Reveal` staggering and section structure. Note the `<Reveal>` bug already fixed in
  the ledger: it has an explicit prop list and no rest spread, so `aria-labelledby` on a `<section>`
  reached the DOM as nothing. Any new labelled section must be verified with
  `getByRole("region", { name: … })`, which only resolves if the label actually lands.

New Server Action beside `setMyAvatar` in `lib/actions/profiles.ts`. Invariant 3: zod-validate →
re-check authorization server-side → write → revalidate. Call the existing
`revalidateEverywhereAPersonAppears()` — a name appears on nearly every screen, so this invalidates the
`/app` subtree, not one page.

Reachable from the account menu (A) and from the mobile navigation (E).

### Prove it

```bash
npm run test && npm run e2e
```

New specs: a name change reaches the database and updates the initials; the new face/name appears in the
rail without a manual reload; email and role render but cannot be submitted; Settings is reachable by
clicking only, from a cold `/app`; axe clean.

---

## 4. Workstream C — one login form, and no SMTP anywhere

### What is wrong

`app/login/page.tsx` renders `LoginForm`, which puts **four forms and three separate email fields** on
one screen: a sign-in/create-account tab pair, then "Email a sign-in link instead", then "Set or reset
your password". Read `components/app/login-form.client.tsx` — the density is the whole problem.

Two of those four depend on SMTP the team does not have. Vercel's free tier allows two emails per hour;
Supabase's shared SMTP is rate-limited and is not meant for production. **The decision has been made: no
SMTP, at all, from the start.** Recovery is an admin handing someone a temporary password.

### Build

**C1 — one form.**
- Delete `sendMagicLink` and `requestPasswordReset` from `lib/actions/auth.ts`, and both fallback forms
  from `login-form.client.tsx`.
- What remains: email, password, and the sign-in / create-account tab pair. Keep the allowlist gate in
  `signUp` and its explanatory copy. Keep the deliberately non-enumerating
  *"That email and password do not match."* — the comment above it explains why, and that reasoning has
  not changed.
- Keep the `data-auth-message` attribute and the `role="alert"` / `role="status"` split. Specs depend on
  both, and the reasoning in the comment is correct.
- Keep `app/auth/callback/route.ts`. It costs nothing and it still serves the forced-change redirect.
  Keep its `safeNext()` open-redirect guard exactly as written.

**C2 — an admin sets a temporary password.**
- On `/app/people`, in `components/app/team-panel.client.tsx`, beside the existing role select and
  two-step deactivate: **"Set a temporary password"**.
- Server Action in `lib/actions/profiles.ts`, using the existing service-role client
  `createAdminClient()` from `lib/supabase/admin.ts` (already `server-only`) →
  `auth.admin.updateUserById`. Generate the password server-side with `crypto.randomUUID()` or
  `crypto.getRandomValues` — never let the admin choose it, and never accept one from the client.
- The plaintext is returned **once**, shown once in the UI with a copy button, and **never written to
  any table, log, or activity row**. Say so in a code comment.
- Same guardrails the file already establishes and for the same reasons: admin-only; not on your own
  row; and if the target is the last active admin, refuse by name.
- The action sets `must_set_password = true` in the same transaction as the password change wherever
  possible; if not, set the flag *first*, so a failure leaves the account locked-but-recoverable rather
  than reset-but-unflagged.

**C3 — the forced change.**
- Migration: `alter table public.profiles add column must_set_password boolean not null default false;`
  with a `comment on column`, matching the style of `20260821190000_avatar_pictures.sql`.
- Add the column to `guard_profile_privilege_columns`
  (`supabase/migrations/20260820120600_rls.sql:72`) so nobody can clear their own flag with a direct
  PostgREST `PATCH`. Read that function before editing it.
- **Positive and negative RLS assertions** in `supabase/tests/rls.sql`, as every other policy has: an
  admin can set it; the owner cannot clear it; a non-admin cannot set it on anyone.
- The gate: `app/app/layout.tsx` already re-checks `getCurrentProfile()` server-side — add the
  redirect to `/auth/update-password` there. Add it to `middleware.ts` too, for the round trip.
  **Note that `/auth/update-password` sits outside the middleware matcher** (`["/app", "/app/:path*",
  "/login"]`), so the layout is what actually holds the line. Do not widen the matcher without reading
  the circuit-breaker comment at the top of that file — the narrow matcher is load-bearing.
- `/auth/update-password` and `SetPasswordForm` already do the right thing and need almost no change:
  the page reads the *user* rather than the profile, deliberately. `setPassword` must additionally clear
  `must_set_password`.
- Add a line to `docs/02-DATA-MODEL.md` for the new column.

### The ADR must say

That an admin setting another person's password **is** account takeover of that person, that this is
accepted because the alternative is a mail dependency the team cannot operate, that the plaintext is
never persisted, and that this is also the mechanism that finally retires the shared seed password
still sitting on production accounts. Record what was rejected: SMTP, and a self-service reset.

### Prove it

```bash
npm run db:test && npm run test && npm run e2e
```

New specs: the login page renders exactly one email field; an admin sets a temp password and the target
is redirected to the password screen on next sign-in and cannot navigate past it; after setting their own
password the flag is clear and `/app` loads; a non-admin's `PATCH` of `must_set_password` is refused by
PostgREST; the plaintext appears in no table (assert in `rls.sql` or `seed.sql`, alongside the existing
"no API key reached any prose column" check); axe clean.

---

## 5. Workstream D — the PWA is the app

### What is wrong

`public/site.webmanifest` declares `"start_url": "/"`. And
`grep -rn '"/app"\|"/login"' components/site app/\(marketing\)` returns **nothing** — the marketing site
contains no link to the application at all. So: install to Home Screen, tap the icon, land on the
marketing page, and there is no address bar to type into and no link to follow. **The installed app is
a dead end.** This is the single most severe finding in this document.

Two more, in the same file and its neighbour:
- `background_color` and `theme_color` are `#07090E` — dark. Light is the default theme. The splash
  screen is the wrong colour on every launch.
- `app/layout.tsx` exports a `viewport` with `themeColor` but **no `viewportFit`**. The rail
  (`rail.client.tsx:92`), the topbar (`topbar.client.tsx:94`), and `DialogShell` (`:134`) all already use
  `env(safe-area-inset-*)` — and **every one of those resolves to `0` without `viewport-fit=cover`.**
  The safe-area handling that looks present has never once taken effect on a notched iPhone.

### Build

**The manifest** (`public/site.webmanifest`) — one manifest, whole-site scope:

```json
{
  "id": "/app",
  "start_url": "/app",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "background_color": "#ebeff6",
  "theme_color": "#ebeff6",
  …
}
```

Keep the existing `icons` array as-is — those files are generated by `npm run brand:assets` and must not
be hand-edited. Add `shortcuts` for **My work** and **Settings**. Consider adding `screenshots` with
`form_factor: "narrow"`, which is what gives Android a richer install prompt.

**`app/layout.tsx`** — add `viewportFit: "cover"` to the exported `viewport`. Consider
`interactiveWidget: "resizes-content"` for the on-screen keyboard. **Do not** add `maximumScale` or
`userScalable: false` — `e2e/a11y.spec.ts` asserts no horizontal overflow at 200% zoom and that spec is
protecting a real accessibility requirement.

**The way in** — `components/site/site-nav.client.tsx` gains a persistent "Open the app" entry, in both
the desktop nav and the mobile menu, pointing at `/app`. `middleware.ts` already sends an anonymous
visitor from `/app` to `/login?next=…` and a signed-in one from `/login` to `/app`, so one link serves
both cases correctly. This is the fix for "there is no URL to change in a PWA".

**Standalone detection** — a small helper (`lib/pwa.ts` or similar):
`window.matchMedia("(display-mode: standalone)").matches || (navigator as …).standalone === true`.
Workstream F depends on it. iOS never fires `beforeinstallprompt`, so the install hint there must be
static instructional copy: Share → Add to Home Screen.

### Prove it

```bash
npm run e2e
```

New specs: the manifest is served, parses, and has `start_url: "/app"`; the rendered viewport meta
contains `viewport-fit=cover`; the marketing page has a link whose href is `/app`, at both a 390px and a
1440px viewport; with an emulated notch, computed `padding-bottom` on the app shell is greater than zero.

---

## 6. Workstream E — `/app` made for a phone

### What is wrong

This is the largest piece, and the numbers are worth stating plainly:

- `grep -rhoE '\b(sm|md|lg|xl):' --include='*.tsx' app/app components/app | wc -l` returns **8**. That is
  every responsive utility in the entire authenticated surface, and they live in four files: four in
  `topbar.client.tsx`, two in `project-switcher.client.tsx`, one each in `sprint-manager.client.tsx` and
  `allowlist-panel.client.tsx`. Every other screen has none.
- `app/globals.css` is 838 lines and contains **one** `@media` query: `prefers-reduced-motion`.
- Exactly one screen has a mobile path — the sprint table, via `@max-[900px]:hidden` plus
  `components/app/sprint-cards.tsx`. **That pattern is correct and it is the template.** It uses a
  *container* query, not a viewport query, because pinning the rail open changes the available width
  without the viewport moving at all. The comment at
  `app/app/projects/[slug]/sprints/[number]/page.tsx:76` explains it.
- The rail is `sticky h-dvh`, 72px collapsed, and expands **on hover** — which does not exist on touch.
  On a 390px iPhone it permanently consumes 18% of the width to show five unlabelled icons.

`npm run e2e` passing 162 specs is not a contradiction. `playwright.config.ts` declares **one** project,
`Desktop Chrome`. The suite proves *no horizontal overflow at 13 widths*, which is a much weaker claim
than *usable on a phone*.

### Build — several commits, one screen or group each

**E1 — the shell.** Below `md`: the rail becomes a **fixed bottom tab bar**. Thumb-reachable, labelled,
44px minimum targets, `padding-bottom: env(safe-area-inset-bottom)`. Four or five destinations plus an
overflow — `components/ui/sheet.tsx` already exists for that. Above `md` the desktop rail stays exactly
as it is, hover-expand and pin included. The main content region needs bottom padding equal to the bar
height plus the safe-area inset, or the last table row sits permanently behind the bar. Keep exactly one
`aria-current="page"`; the per-item `isActive` predicates in `rail.client.tsx` were written for a
specific bug (`startsWith` lit up two items on a sprint URL) and must be reused, not re-derived.

**E2 — the topbar.** It survives at 390px but is cramped. The palette trigger is `hidden … sm:flex`, so
give mobile a search affordance. Export and New item already collapse to icon-only via
`hidden sm:inline` on their labels — keep that; the `title` attribute is doing accessibility work there
and the disabled-with-a-reason pattern is deliberate (read the comments before touching it).

**E3 — dialogs.** `DialogShell` becomes a **bottom sheet** below `md`: full width, near-full height, its
own scroll, drag-or-tap to dismiss. The existing height cap, focus trap, `Esc` handling and focus
return all stay — they were each written for a recorded bug. One caveat to fix while you are there: the
body-scroll lock is `body.style.overflow = "hidden"`, which **does not hold on iOS Safari** — the page
behind still scrolls under touch. Fix it properly (fixed-position body with scroll restoration, or
`overscroll-behavior: contain` on the panel plus `inert` on the background) and leave a comment saying why.

**E4 — every screen without a mobile path.** Follow the `SprintCards` container-query template for:
`components/app/item-detail.tsx`, `sprint-header.tsx`, `filter-bar.client.tsx`,
`comment-thread.client.tsx`, `comment-composer.client.tsx`, `log-time.client.tsx`,
`app/app/my-work/page.tsx`, `app/app/people/page.tsx`, `app/app/projects/page.tsx`,
`app/app/import/page.tsx`, `app/app/settings/page.tsx`. Multi-column layouts stack; dense tables become
cards; property grids become labelled rows; `min-w-[220px]` filter controls go full width.

**E5 — touch and input.** Every interactive target ≥44px on a coarse pointer. Inputs at ≥16px font, or
iOS zooms the page on focus. Correct `inputMode` and `enterKeyHint` on every field. `dvh` only, never
`vh` — there is a spec (`"100dvh everywhere, never 100vh"`) that greps the built stylesheets for it, and
it exists because `100vh` on mobile Safari is taller than the visible viewport, so the bottom of a
full-height element is cut off — which is exactly where an action bar lives. Test the drag-reorder
(`@dnd-kit`) with a touch sensor; a pointer sensor alone will fight the scroll.

### Prove it

Add to `playwright.config.ts`:

```ts
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
],
```

Note honestly in the ledger row that Playwright's WebKit is **not** iOS Safari — it is a close proxy that
catches layout and touch regressions, and it is not a substitute for looking at a real handset.

```bash
npm run e2e
```

Extend the existing 44px touch-target spec in `e2e/a11y.spec.ts` (currently `/` only) to the `/app`
routes. Keep the 13-width overflow spec green. New specs: every primary destination is reachable by tap
at 390px; the bottom bar does not cover the last row of the table; a dialog opens as a sheet and the
page behind does not scroll; axe clean on the mobile projects.

---

## 7. Workstream F — notifications that actually arrive

### What is wrong

There is no service worker, no `Notification.requestPermission` call, no VAPID key, and no push
dependency anywhere in the repository. "Notifications" are rows in `public.notifications`, surfaced as a
dot on My work in the rail and a list on `/app/my-work`. **Nothing has ever reached an operating system.**

### The one thing you must get right about where they come from

Notification rows are **not** written by a Server Action. They are written by a `security definer`
database trigger — `sync_comment_mentions`, at
`supabase/migrations/20260820120400_thread.sql:47`, which fires `after insert or update of body_json on
public.comments` and inserts one `notifications` row per mentioned, active, non-author profile.

Read that function before you write any code. It means the correct place to send a push is
**`postComment` in `lib/actions/comments.ts:63`, after its insert has returned** — the trigger has
already run inside the same transaction, so the rows exist and can be read back. Note that `postComment`
currently calls `.insert({...})` without `.select()`; you will need the comment id, so add
`.select("id").single()`.

Also worth knowing: the `kind` check constraint allows `'assigned'` and `'review_requested'`, and
`lib/data/notifications.ts` types all three — but **nothing in the schema or the application ever
inserts either one**. Only `'mention'` is real today. Do not build delivery for kinds that are never
produced; if the team wants them, that is a separate request.

### Build

**F1 — the subscription store.** Migration creating `public.push_subscriptions`:

```
id, profile_id (fk profiles, on delete cascade), endpoint text not null unique,
p256dh text not null, auth text not null, user_agent text, created_at timestamptz default now()
```

RLS restricting every operation to `profile_id = auth.uid()`, with **positive and negative assertions**
in `supabase/tests/rls.sql` — the standard this repo already holds every policy to. `endpoint` is unique
so re-subscribing the same device upserts rather than duplicating. Document it in `docs/02-DATA-MODEL.md`.

**F2 — the service worker.** `public/sw.js`, served from the origin root so its scope covers the whole
site. It needs a `push` handler and a `notificationclick` handler that focuses an existing client if one
is open and otherwise opens the item's URL. Keep it small and dependency-free.

> **iOS revokes a push subscription that receives a push without showing a notification.** Never handle
> a push silently. Every `push` event must end in `showNotification`.

Register it from a client component, after load, and only where it makes sense. Do not add a caching
strategy — this app is dynamic and server-rendered, and a stale cached shell is a worse bug than a slow
one. If you later want offline, that is a separate request with its own ADR.

**F3 — sending.** Add `web-push` and three server-only environment variables to `.env.example`, under
its existing "server only: NEVER prefix with NEXT_PUBLIC_" heading:
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The public key also needs to reach the browser
— expose it via `NEXT_PUBLIC_VAPID_PUBLIC_KEY` or return it from a server action; it is a public key and
it is safe in the bundle.

The ADR should record choosing the library over hand-rolling VAPID JWT signing and `aes128gcm` payload
encryption with Web Crypto, in a repository that is otherwise deliberately dependency-lean.

In `postComment`, after the insert returns: read the `notifications` rows for that `comment_id`, load
each recipient's subscriptions, and send. Then:

- **A failed push must never fail the write.** The comment is the thing that matters. Catch, log, continue.
- **A `404` or `410` from the push service means the subscription is dead.** Delete that row. Anything
  else, leave alone and retry next time.
- Payload carries title, body, and the item URL — nothing sensitive beyond what the recipient can already
  see, since they are mentioned on it and RLS already grants them the row.
- Do not `await` the sends in a way that delays the action's response beyond what is reasonable; the
  optimistic comment path in `components/app/comment-composer.client.tsx` is already tuned.

**F4 — the permission control.** In Settings, a plainly labelled **"Turn on notifications"** section
that is honest about every state:

- Calls `Notification.requestPermission()` **from inside a tap handler**. iOS requires a user gesture and
  will silently do nothing otherwise. Never call it on page load.
- **On iOS, if the app is not running standalone, say so and explain Add to Home Screen instead of
  showing a button that cannot work.** iOS 16.4+ supports Web Push *only* for web apps installed to the
  Home Screen — a Safari tab gets nothing, ever. Use the D5 standalone helper.
- If permission is `denied`, the browser will not prompt again. Say that, and say where in iOS/Android
  settings to reverse it. Do not render a button that silently no-ops.
- Show the true current state — subscribed on this device, permission granted but not subscribed, denied,
  or unsupported — and offer "Send a test notification" so a person can confirm it works without waiting
  to be mentioned.
- Unsubscribing removes the row and calls `subscription.unsubscribe()`.

**F5 — the badge.** `navigator.setAppBadge()` / `clearAppBadge()` driven by the existing
`countUnreadNotifications()`. Feature-detect; it does not exist everywhere.

### Prove it — and one limit you must state, not paper over

```bash
npm run db:test && npm run test && npm run e2e
```

- **vitest**: payload construction, the `410`/`404` prune logic, and VAPID key handling — pure functions,
  extracted so they are testable without a browser.
- **Chromium e2e**: the permission UI in every state, and the subscribe → row-in-database → unsubscribe
  round trip. Chromium can be driven through CDP; grant the permission via
  `context.grantPermissions(["notifications"])`.
- **Playwright's WebKit cannot test Web Push at all.** Do not write a spec that appears to and does not.

> **Workstream F may not be marked `done` on the strength of automated tests.** It requires a manual
> check on a real iPhone **and** a real Android, over HTTPS — a Vercel preview deployment is the
> straightforward way — with the app installed to the Home Screen on iOS. Confirm: the permission prompt
> appears, a notification arrives while the app is backgrounded and while it is fully closed, tapping it
> opens the right item, and the badge count is right. Record what was tested, on what OS versions, in the
> ledger row. If you cannot do this, mark it `wip` and say exactly what is unverified.

---

## 8. Definition of done

Green, all of it:

```bash
npm run lint && npm run typecheck && npm run test && npm run db:test && npm run build && npm run e2e
```

And:

- [ ] Every rail/nav tap shows feedback within one frame; every `/app` route has a `loading.tsx`.
- [ ] Sign out and Settings are both reachable by tapping, at 390px, from a cold `/app`.
- [ ] The login page has exactly one email field. `sendMagicLink` and `requestPasswordReset` are gone.
      Nothing in the repository sends mail.
- [ ] An admin can hand someone a temporary password; that person must change it before reaching `/app`;
      the plaintext is in no table.
- [ ] Installing the PWA on iOS and Android lands on `/app`. The marketing site links to the app.
- [ ] The rendered viewport meta contains `viewport-fit=cover`, and safe-area padding measures non-zero
      under an emulated notch.
- [ ] Every `/app` screen has a deliberate layout at 390px. No horizontal scroll at any of the 13 widths
      or at 200% zoom — the existing specs stay green.
- [ ] Touch targets ≥44px across `/app`, not just `/`.
- [ ] `playwright.config.ts` runs Desktop Chrome, Mobile Safari, and Pixel 7; axe is clean on all three.
- [ ] Push arrives on a real iPhone and a real Android, verified by hand, with OS versions recorded.
- [ ] Both migrations applied to the **hosted** database, and the handoff says so in as many words.
- [ ] `docs/06-PROGRESS.md` has one row per change with its verification command; `docs/05-DECISIONS.md`
      has an ADR for the auth-model change, for each data-model addition, and for the `web-push`
      dependency.
- [ ] No AI attribution anywhere in any commit, branch, or tag.

## 9. Out of scope

Do not add offline caching, background sync, an email digest, notification preferences per kind, a
`'assigned'`/`'review_requested'` producer, a native app wrapper, an onboarding tour, or any new
navigation destination beyond what workstreams A–F name. **Restraint is the design.** If something here
turns out to need one of those, stop and say so rather than building it.

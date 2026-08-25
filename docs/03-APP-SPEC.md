# 03 — App spec

Geometry, spacing, and copy come from `design/project/Coditu App.dc.html`. What follows is the
**behaviour** the prototype could only gesture at, plus the routing contract.

---

## Routes

```
/                                          marketing site
/login                                     split layout, brand-forward
/app                                       → the user's last project, its active sprint
/app/projects                              all projects: client, scope, sprint state, sprints, hours
/app/projects/[slug]                       project overview + its sprints + recent components
/app/projects/[slug]/components            the component registry: what this project is made of
  …/[component]                            one component — every item that has ever named it
/app/projects/[slug]/sprints/[number]      the sprint — Table (default) | Board
  …/items/[key]                            item detail — intercepted as a modal via @modal + (.)items/[key];
                                           a hard navigation renders the full page
  …/report                                 the client report, on screen
  …/report/pdf                             Route Handler streaming the PDF
/app/my-work                               assigned to me · awaiting my review · my hours this week
/app/people                                team load
/app/import                                Notion CSV importer
/app/settings                              your profile: name, picture, notifications, your earnings,
                                           account, sign out — plus, for an admin, every tunable
/app/earnings                              what each sprint paid, and the confirmation panel
/app/clients                               who outside the company can see our work, and what
                                           they can see. Lead reads, admin writes, engineer 404s
/api/attachments/[...path]                 Route Handler: authorizes, then signs a fresh storage URL
/api/uploads                               Route Handler: one image, with upload progress

/client                                    the client portal — overview
  /client/projects/[slug]/components/[component]   one component: its curated summary,
                                           its progress, and the work published to this client
```

**`/client` is a separate route tree, not a mode of `/app`.** A client contact never renders the
internal shell, and the reason is a data boundary rather than a visual one: `app/app/layout.tsx`
fetches every project, every active profile, every project's component registry and an unread count
before it renders a pixel. Hiding those with CSS still ships them in the RSC payload, and the app
shell was already 116.2KB against a 110KB budget before any of this. `app/client/layout.tsx` reads
exactly one row — who is asking — and everything else is fetched per page, per capability.

Routing is decided **server-side from `profiles.account_kind`**, never from a JWT claim. An internal
account that lands on `/client` is sent to `/app`; a client contact that lands on `/app` is sent to
`/client`. Neither is a refusal — both are people at the wrong door, and a sign-in form would tell
either of them their password was wrong when it is not.

**`/app/earnings` is reachable from the account menu and the phone's "More" sheet, and from nowhere
else.** Not the rail, not the top bar. Those are visible on every screen that gets shared — a
projector in a client meeting, a screenshot in a chat — and a link labelled "Earnings" beside "Sprint"
advertises the one screen with money on it on all of them.

Filter, sort, and view state live in the URL (`?status=in_progress,ready&assignee=…&component=evim-themen-kachel&view=board`)
so a view is shareable and survives reload. `component` is a **slug**, validated against the project's
own registry — a hand-edited one that names another client's component resolves to nothing and the
filter is simply not applied. A `?status=` naming a **retired** value — `todo`, `dev_started`,
`ready_for_peer_review`, `in_review` — is mapped forward rather than dropped, because an unrecognised
value would quietly widen the filter to the whole sprint instead of erroring, and those links are in
bookmarks.

---

## Shell

**Rail.** 72 → 240px on hover *and* on click-to-pin; pinned state persists per user. Labels cross-fade
at 160ms, width transitions at 220ms on `entrance`. Nav: Sprint · Projects · My work · People · Import.
Footer shows the signed-in profile and role.

**Project switcher.** The topbar control shows the client mark (EVIM's glyph, or an accent square), the
client name in mono, a hairline divider, then the sprint name. The menu lists all projects, then **only
the sprints belonging to the selected project**, then "Manage projects". Picking a project with no
sprint routes to `/app/projects`, not to an empty sprint page.

**No-sprint empty state.** A real screen, not a spinner: client mark, `"{client} has no open sprint"`,
a sentence explaining that items, hours, and reviews all hang off a sprint, and two actions — "See all
projects" and "Switch project". The Export button is `disabled` with a tooltip reading
`No sprint to export for {client}` — **disabled, not hidden**.

---

## Sprint header

Three columns at `minmax(280px, 1fr)`:

1. Client pill linking to the client's site (`target="_blank" rel="noreferrer"`),
   `sprint {n} · {status}`, sprint name at 26px / `-0.024em`, window `starts → ends` with a
   `{n} days left` amber pill, and member avatars whose tooltips carry per-person logged hours.
2. **Status distribution** — a 10px stacked bar, one segment per status with a `title`, a legend
   beneath, and `{logged} / {estimated} h` at 26px mono tabular.
3. **Burn-up** — cumulative hours logged per sprint day against the estimate line,
   `viewBox="0 0 300 108"`, gradient stroke, dashed estimate rule, terminal dot in `--signal-to`.
   Real `aria-label` listing the series values.

Below: a collapsible **Sprint notes** panel — markdown, attributed (`written by {author} · {date}`),
rendering the highlight convention as a 2px amber left rule. It reads as a written note, never as a
form field.

---

## Table — the default view

Columns: `Task · Component · Status · Hours · Assignee · Reviewer · Deadline · Type · Grouping`.

**Component** sits directly beside the task because it is the other half of what the row is about:
"COD-153 · Themen Kachel · in review" is the sentence the table exists to say. It renders the web
part's own SharePoint toolbox glyph beside the name, and opens the same picker the New item dialog
uses — filterable, and able to add a component in place. Admin and lead only; for an engineer it is
**disabled with a tooltip**, never hidden.

Real `<table>` semantics — `<th scope="col">`, never a div with a role. Sticky header; sticky Task
column with an **opaque per-group background** (see `01-DESIGN-SYSTEM.md`). The Task cell carries
`{key}` in mono, the title (ellipsis + `title` attribute), and the AC progress `3/5` right-aligned.

- **Status chip** is a Radix popover: keyboard-navigable, optimistic write, rollback + toast on failure.
- **Assignee / Reviewer** open a searchable popover for admin and lead. For an engineer the control is
  **disabled with a tooltip**, never hidden.
- **Hours** render `logged / estimate`. Over-estimate turns **amber, not red** — running long is
  information, not failure.
- **Deadline** within 24h renders amber.
- **Footer row** pins with `Sum · {n} items` and `{logged} / {estimate}`, mono, tabular.
  **This sum must equal the database, always.** There is a test.
- Sort any column. Filter by status, type, assignee, reviewer, grouping. Free text over title and
  description.
- **Drag to reorder** (`dnd-kit`) persisting `order_index`. The **keyboard path is required**: focus a
  row, `Space` to lift, arrows to move, `Space` to drop, `Esc` to cancel — each step announced via
  `aria-live`.
- Below 900px the table becomes **stacked cards, driven by a container query**, not a viewport
  breakpoint. Each card carries key, status chip, title, the component as a caption under the title,
  `AE → MT`, hours, deadline, grouping. Plus a sum card.

## Board

Columns per status with count. Cards show key, type, title, the component with its glyph, assignee
initials, hours, AC progress, and the grouping border. Drag between columns writes status optimistically. Horizontal scroll with snap
when narrow.

## Item detail

`max-width: 1080px`, two columns at `minmax(300px, 1fr)`, scrim `blur(10px)`. Focus trapped, `Esc`
closes, focus returns to the originating row, body scroll locked.

- **Left**: title, description, the highlight block (amber rule), acceptance criteria with a gradient
  progress ring (`r=15`, `stroke-dasharray="94.2"`), the comment thread, then the activity feed in
  faint mono.
- **Right**: status, then the **component** — the only property that goes somewhere, linking to
  everything that has ever happened to that web part — then type, assignee, reviewer, deadline,
  estimate and grouping, each inline-editable and optimistic. Then **Log time**: 0.5h steps (30 minutes) via − / +, today's
  date, a gradient `Log {n} h` button, your entries on this item, and a total. Then **Move** and
  **Delete**.

### What is editable here, and by whom

Everything below is optimistic with a rollback and a visible error (invariant 4). All of it was
schema-ready and screen-less until 2026-08-25; a title you cannot correct is not restraint, it is an
unfinished CRUD.

| Field | Who | Notes |
|---|---|---|
| Title | admin, lead | An editable heading. ⏎ saves, Esc abandons. |
| Description, highlight | admin, lead | **Block documents**, edited where they are read with the universal editor. `⌘⏎` or **Save** commits; Escape abandons. An emptied field is null, never `""`. Text written before the editor converts on read — single newlines become hard breaks, because 58 imported descriptions are requirement lists and collapsing them turned those items into one run-on paragraph once already. |
| A criterion's body | assignee, reviewer, admin, lead | The same rich editor as a comment. Widened at the team's request — see `05-DECISIONS.md`. |
| Add / remove / reorder a criterion | admin, lead | The shape of the scope is a lead's call. Removing offers an undo toast. |
| A comment | its author | The same editor, pre-filled. `edited_at` is stamped and the badge finally means something. |
| Withdrawing a comment | its author, admin | Soft. It keeps its place, its author and its timestamp, and says it was withdrawn — its words are nulled in the **read model**, so they never reach a browser. |
| A time entry | the person who logged it | Minutes and date. An admin may **delete** anyone's; nobody rewrites anyone else's record of what they did. |
| Moving the item | admin, lead | Within the project only. A cross-project move is refused in the action and again in a trigger — the key already names the project, so a moved item would carry a key that lies. |
| Deleting the item | admin, lead | Soft. The confirm names the hours it takes out of the sprint; the toast offers them straight back. |

> **Clicking away no longer saves these, and that is a change.** A textarea has
> nothing to click except away, so committing on blur was right for it. The
> editor has a **toolbar**, and pressing Bold blurs the contenteditable — so
> blur-to-save would commit on every formatting click, once per round trip, with
> the text half-formatted. `criteria-list.client.tsx` met the same constraint and
> answered it with explicit Save and Cancel; both writing surfaces keep one set
> of habits. Recorded in `05-DECISIONS.md`, 2026-08-25.

### Acceptance criteria

A checklist that can hold a document — paragraphs, code blocks, links and screenshots pasted straight
in, indented under the criterion's text rather than beside the checkbox, so a criterion with three
screenshots still reads as one to-do item.

**Done sinks.** The sort key is `(is_done, order_index)` applied at the render edge and never written,
so un-ticking returns a criterion to exactly the position it held. Dragging reorders within a group;
across the boundary is refused with a sentence. The move is a `micro`-tier transition and
`prefers-reduced-motion` drops it entirely. The count is announced `aria-live="polite"`; the reorder
is not, because dnd-kit already has a live region for it and two describing one list is noise.

The tick, the body and the row controls are **three separate targets**, each ≥44px on a coarse
pointer. Tapping the words opens the editor and does not tick the box.

### An image in the thread

A `clamp(88px, 22vw, 132px)` thumbnail that reserves its own box from the file's intrinsic dimensions,
so the thread does not reflow while somebody is reading it. Tapping opens a viewer capped at
`max-h-[76dvh]`; **left/right arrows and a one-finger swipe move between every image in the item**, a
downward swipe closes, and pinch-to-zoom is untouched. A source that 404s renders a quiet "image
unavailable" box at the size the picture would have been, with its alt text — never the browser's
broken-image glyph, and never nothing.

**While it uploads** the picture is already in the document, dimmed, at its own aspect ratio, with a
determinate bar over it. On failure the placeholder is removed entirely and the reason is said out
loud; the composer refuses to send while one is in flight rather than storing a `blob:` URL that dies
with the tab. The author can edit the alt text from the toolbar; the filename is the default.

### Version history

Below Activity, and the pairing is the point: `activity` says a property changed, this says what the
writing used to be, and reading them in that order is how somebody reconstructs a day.

**One timeline per story**, not per column — every version of the description, the highlight, each
criterion and each comment, newest first, labelled `Description · v4`. Each entry names who wrote it
(or *written outside the app*, for the seed, the importer, a migration, or a hand-applied fix), when,
in `Africa/Cairo`, and what changed: `2 lines added, 1 line removed`, or `formatting only` when the
flattened text is untouched, or `restored from v2`.

Expanding an entry shows a line diff against the previous version. **Added and removed are marked
with `+` and `−` as well as by hue** — a diff carried by colour alone is unreadable to a good part of
the team, and `01-DESIGN-SYSTEM.md` forbids it. Long unchanged stretches collapse with two lines of
context and the panel says how many it hid; an elision nobody is told about is indistinguishable from
a diff that missed something.

**Restore adds a version.** The control says so before it acts — *"a restore never overwrites history
— it writes a new current version, and records the restore itself"* — because "restore" implies a
rewind to most people. It is offered only where the reader could edit the document by hand; the
database refuses the rest, and it is the database that decides.

Expansion is a `<details>` element and the diffs are server-rendered, so the only client JavaScript on
this panel is the restore button.

## Presence

Beside the sprint's name in the header eyebrow, never in the shell: this is presence **on this
sprint**, and a stack in the top bar would imply it means presence in the workspace.

An avatar per person, capped at four, each with a **dot** in its corner — `--jade` for online,
`--amber` for idle, the design's own two hex values — and a caption reading `2 here now`. The caption
is what tells this row apart from the sprint-member avatars a few lines below, which look identical
and mean something entirely different: who is assigned work, not who is looking at the page.

State never travels by colour alone. Each avatar carries a `title` and a visually hidden
`Name — online` / `Name — idle`.

**You are not in your own stack**, and the whole row renders nothing when nobody else is here, so it
costs no space on most days. Two windows signed in as the same person are one member — presence is
keyed by profile.

**Idle after 60 seconds** without a key, pointer move or scroll — long enough not to flicker while
somebody reads, short enough that a forgotten tab on a second monitor fades within a minute. Hiding
the tab is immediate, because switching away is unambiguous.

Presence touches no table. The roster lives in the socket and dies with it, so somebody who closes a
laptop mid-sprint disappears when their connection does — no heartbeat, no sweeper, no row to leak.
An avatar arriving never re-renders the server tree; only `postgres_changes` does that.

**What crosses the wire is a profile id, a surface name and a state.** Never text anybody has typed.
`e2e/presence.spec.ts` reads the socket frames and asserts it.

### On a story

Above the title, a second stack with a different job: `2 viewing · Adam editing criteria`, the
design's own line.

**You are in this one**, marked `(you)` — on one story the question is whether anybody is in here
with you, and your own face makes the others countable. Renders nothing when you are alone and
nothing is being edited, which is nearly always.

The editing half is presence, not a separate typing channel: opening an editor re-announces this
member with the surface's name — `criteria`, `description`, `highlight`, `comment`, `title` — and
closing it announces `viewing` again. **A name only, never what is being typed.** Per-keystroke
typing is deliberately not built; see `05-DECISIONS.md`.

The line is `aria-live="polite"`, because somebody starting to edit under you is worth hearing
without going to look — and polite, so it never cuts across what a screen reader is already saying.

## Trash

`/app/trash`, reached from the account menu and the phone's "More" sheet — not the rail. A bin on
every screen is noise most days and a small invitation on the rest.

Deleted stories and withdrawn comments, newest first. Each row says **where it was** — key, title,
project, sprint, when it went — because a story deleted from the wrong sprint is otherwise
recoverable in principle and unfindable in practice. A story's row also states the hours logged
against it, before anybody presses anything: that is what a purge actually costs, and it is invisible
everywhere else once the story is binned.

**A withdrawn comment's words are never shown.** The row reads `Comment on COD-241` and nothing more.
The words are not hidden by this screen; they are absent from what it is given.

Who sees what: stories, admin and lead. Comments, the author or an admin — a lead sees the row and is
told *"only its author or an admin"* rather than finding a control missing.

**Purging is admin only, one row at a time, and there is no "empty the trash".** The confirmation
names what goes — the criteria, the thread, the version history, the hours — because "are you sure?"
tells nobody anything they did not already know. It is the only irreversible action in the
application.

## Components

Two screens, both under the project rather than the sprint, because a component
outlives any one sprint.

**`/app/projects/[slug]/components` — the registry.** Every component the project is made of, as a
grid that reflows from four columns to one on its own width (`auto-fill` + `minmax(min(300px,100%),1fr)`,
no media query). Each card: the web part's own **SharePoint toolbox glyph**, its name, the kind chip,
item count, open count, hours logged, and the last sprint it was worked in. A component with nothing
attributed says "no items yet" rather than three zeroes. Admin and lead get **New component** here;
the grid itself ships no JavaScript.

**`/app/projects/[slug]/components/[component]` — one component.** Its whole history, grouped by
sprint, newest first, and inside a sprint in the fixed status display order. Each sprint heading links
back to that sprint filtered to this component; each row opens the item. The header carries the glyph,
the kind, item/open counts and `logged / estimated`. **Component settings** (admin and lead) renames
it, corrects its kind, or retires it — there is no delete, and the panel says why.

Looked up by project id **and** slug together. Two clients may both have something called "Calendar";
guessing a URL must not read one under the other's heading.

## The story thread

**Editor: TipTap**, dynamically imported, and only when a composer is focused or a draft exists. A
read-only thread must never ship the editor bundle.

Extensions: `StarterKit` (paragraph, bold, italic, strike, bullet/ordered list, blockquote, inline
code, horizontal rule), `Link`, `CodeBlockLowlight` (languages limited to ts, tsx, js, json, sql, bash,
css, html, python, diff), `Image`, `Mention`, `Placeholder`.

**Rendering is the security boundary.** Stored comments render **server-side by walking known node
types only**. Never round-trip to an HTML string and inject it. Never `dangerouslySetInnerHTML` a value
derived from user input. An unknown node type renders as its text content, or nothing. Code blocks are
highlighted server-side with lowlight into typed spans. See `05-DECISIONS.md`.

**Composer**
- Toolbar (bold, italic, inline code, code block, link, bullet list, image) is compact,
  hairline-bordered, and appears on focus.
- `Cmd/Ctrl+Enter` submits. `Esc` blurs without discarding. Drafts persist per item in `localStorage`
  keyed `coditu.draft.{itemKey}`, cleared on successful submit.
- **Code**: triple-backtick or toolbar. Language picker on the block. Mono 12.5px / 1.6 on `--canvas`
  with a hairline and a copy button. Long lines scroll **inside** the block — the thread never scrolls
  sideways.
- **Images**: paste, drag-and-drop, or toolbar. Upload to the private `comment-images` bucket through a
  Server Action that validates MIME (`image/png|jpeg|webp|gif|avif`) and size (≤ 8MB), strips EXIF, and
  returns the storage path. Optimistic placeholder with a progress bar while uploading; failure
  replaces it with a retry affordance, never a broken image. Rendered inline at `max-width: 100%`,
  `border-radius: 12px`, opening in a keyboard-navigable lightbox on click.
- **Mentions**: `@` opens a suggestion list of active profiles, filtered as you type, navigable with
  arrows and `Enter`, dismissed with `Esc`. Stored node holds the profile **UUID**. Rendered as a
  non-link chip in `--accent` with a subtle tinted background. On submit a trigger populates
  `comment_mentions` and inserts a `notification` per mentioned profile. Mentions surface in
  `/app/my-work` under "Mentions" with an unread dot in the rail.

**Thread.** Newest last. Each entry: avatar initials, author, timestamp in mono
(`YYYY-MM-DD HH:mm`, Africa/Cairo), body. Author may edit — the edit renders in place and stamps
`edited_at`, shown as `edited` in faint mono. A realtime insert appends with a `micro` reveal
(**no blur** — a per-message blur in a live thread reads as jitter).

**Empty state:** `"No discussion yet."` plus the composer. Never a bare box.

---

## Projects · My work · People · Import

These follow the bundle. The **Notion importer** maps:

| Notion column | Target |
|---|---|
| `Task` | `title` |
| `Status` | `status` |
| `Hours Worked` | one `time_entries` row |
| `Assignee` / `Reviewer` | `profiles`, matched by name |
| `Deadline` | `deadline` |
| `Story Type` | `type` (`CR: Change Request → change_request`) |
| `Grouping` | `grouping` |

It shows a **preview table flagging every unmatched value — including the non-integer grouping case
(`"1a"`) — before committing anything.**

## Settings · your profile

**Your name and your picture** — the two things on a profile its owner sets, and the boundary is the
point: they are how a person presents themselves. Role, capacity and access are decisions *about* a
person, are an admin's to make on **People**, and appear here as read-only facts with a pointer to
where they change. Sign out is here too, as a plain `<form>` on the Server Action, because it is the
one control that has to work before hydration.

**Your name** writes `profiles.full_name` and re-derives `profiles.initials` by the same rule
`handle_new_user` applies at sign-up — one rule, copied once, with the property asserted end to end
rather than assumed. The circle beside the field shows the derived initials as you type, because
nobody has memorised the rule. `initials` is never accepted from the form.

**Your picture** — choose, replace, or remove; the browser centre-crops to
256px WebP before it uploads, and the caption names your initials while there is no picture. It then
replaces the initials **everywhere a person appears** — the rail, the sprint header, the board cards,
the assignee and reviewer columns, the mobile cards, the People list, the mention menu, every comment
and every logged hour. Wherever a person has no picture, the initials stay.

Every one of those is `<PersonAvatar>`, which always draws the initials and lays the picture over
them: a missing or broken image degrades to initials with no JavaScript involved.

Exports are unchanged. `04-EXPORT-SPEC.md` states people as name and initials, and a CSV is not a
place for a photograph.

## Notifications

**Where they come from.** Not a Server Action. `sync_comment_mentions` is a `security definer`
trigger on `comments` that walks `body_json` for mention nodes and inserts one `notifications` row
per mentioned, active, non-author profile. It has already run inside the same transaction by the time
an insert returns, which is why `postComment` is the right place to send a push from and why
`lib/actions/notifications.ts` is a red herring for anybody looking for where they are created.

**Where they go.** A dot on My work in the rail and the tab bar, a list on `/app/my-work`, a number on
the installed app's icon (`navigator.setAppBadge`, feature-detected), and — for `kind = 'mention'`
only — a Web Push to every device the person has registered. `'assigned'` and `'review_requested'`
are allowed by the check constraint and typed in the data layer, and **nothing ever produces them**;
delivery for a kind that is never produced is code with no way to know whether it works.

**Turning them on** is per device, in Settings, and the control is honest about every state:
unsupported, not configured, iOS-in-a-tab (Add to Home Screen, because iOS grants Web Push only to an
installed web app and a Safari tab gets nothing, ever), denied (with where in the OS to reverse it),
allowed-but-not-subscribed, and subscribed — with a test send, because waiting to be mentioned is not
a way to find out whether it works. `Notification.requestPermission()` is called from inside the tap
handler and never on load; iOS requires a gesture and silently does nothing otherwise.

**The rules that outrank the feature.** A failed push never fails the write. Every `push` event ends
in `showNotification`, because iOS revokes a subscription that receives a silent one. A push service
answering 404 or 410 means that installation is gone and the row is deleted; anything else is left
alone. The service worker caches nothing — this is a live board with realtime subscriptions, and a
stale shell is a worse bug than a slow one.

## Command palette

`⌘K` / `Ctrl+K`. Jump to project, sprint, or item; change status; log time; assign; toggle theme; sign
out. Fuzzy over keys and titles. `Esc` closes this, the detail modal, the export dialog, and the
project menu.

---

## Performance budgets

| Metric | Budget |
|---|---|
| LCP | < 2.0s, mid-tier Android over 4G |
| CLS | < 0.05 |
| INP | < 200ms |
| Marketing route JS | ≤ 130KB gzipped |
| App shell JS | ≤ 220KB gzipped, TipTap excluded (lazy) |
| Lighthouse, marketing | ≥ 95 on all four categories |

Held by: Server Components for the sprint table, item detail body, and every marketing section. Client
boundaries only at the composer, command palette, drag-and-drop, export dialog, filter controls, and
theme toggle. Realtime subscribes to the **active sprint only**, unsubscribes on unmount, and coalesces
bursts through a 120ms buffer. `npm run analyze` plus a CI budget check that fails the build on a
route over cap. Lighthouse CI on the marketing route.

---

## Earnings · `/app/earnings`

The one screen in this app with money on it, and one of exactly two places a figure may appear — the
other is a card on `/app/settings`. Nothing under `/app/projects/**` and nothing in any export carries
one. That boundary is the most important requirement in the feature and it is asserted twice: against
rendered output on a sprint that *has* a confirmed payout, and as a source-level grep so the next
person cannot add one by accident.

**A card per sprint, phone first.** No horizontal scroll at 320px, every target ≥44px, the numbers
legible without zooming.

- **Provisional** until confirmed, and it says so. Recomputed on every render from the time entries as
  they stand.
- **Confirmed** shows the snapshot — the pot, each share, the rate per hour and the FX rate it was
  confirmed at — and never moves again.
- **The pot is `minutes × rate ÷ 60`** with the division last. The split is **equal, not
  proportional**: the person with 40 hours and the person with 12 take the same amount.
- **Not tracked**, never `$0.00`, for a sprint before `app_settings.payout_from_sprint_id`. Zero is a
  claim about money that was never counted.

**The confirmation panel** is an admin's. Every developer who logged anything is listed with their
minutes and their share of the total, pre-ticked at or above the threshold — the threshold is a
suggestion engine and the confirmed set is the truth. The pot, the per-person amount in USD and EGP,
and the rate being used are shown **before** the button. A non-developer who logged time is named
explicitly: *"Includes 2.0 h logged by Adam Nafie, who takes no share."*

**When the minutes change after a confirmation** a banner says so by name and by amount, and the
confirmed figures keep being shown. An admin re-confirms, which supersedes the previous row and leaves
it in the record.

A sprint with nothing logged offers nothing to confirm and says so. Confirming twice with no change in
between is a no-op, not a second row.

## Settings · what an admin sets up

Below the profile sections, for an admin only: **every tunable in Coditu**, each with its current
value, what it affects, and who may change it — the hourly rate, the proposal threshold, the
effective-from sprint, the image upload cap, how many images one paste may carry, the default weekly
capacity, the exchange rate and its source, and who takes a share.

Each field saves on blur. None of these numbers exists as a constant anywhere in the source: a rate
that needs a deploy to change is a rate nobody changes.

## Projects · administration

`/app/projects` gained the two things that could only be done in SQL: **New client** (name, https-only
website, accent) and **New project** (client, name, address, key prefix, scope). A project row carries
rename and archive controls for an admin or a lead.

**The address is permanent in the sense that matters**: renaming it keeps the old one working for ever
through `project_slug_aliases`, and the form says so. **Archive, never delete** — a project cascades to
its sprints, its items, and the hours an invoice was built from.

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
/app/projects/[slug]                       project overview + its sprints
/app/projects/[slug]/sprints/[number]      the sprint — Table (default) | Board
  …/items/[key]                            item detail — intercepted as a modal via @modal + (.)items/[key];
                                           a hard navigation renders the full page
  …/report                                 the client report, on screen
  …/report/pdf                             Route Handler streaming the PDF
/app/my-work                               assigned to me · awaiting my review · my hours this week
/app/people                                team load
/app/import                                Notion CSV importer
/app/settings                              profile · allowlist (admin) · projects (admin)
```

Filter, sort, and view state live in the URL (`?status=dev_started,todo&assignee=…&view=board`) so a
view is shareable and survives reload.

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

Columns: `Task · Status · Hours · Assignee · Reviewer · Deadline · Type · Grouping`.

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
  breakpoint. Each card carries key, status chip, title, `AE → MT`, hours, deadline, grouping. Plus a
  sum card.

## Board

Columns per status with count. Cards show key, type, title, assignee initials, hours, AC progress, and
the grouping border. Drag between columns writes status optimistically. Horizontal scroll with snap
when narrow.

## Item detail

`max-width: 1080px`, two columns at `minmax(300px, 1fr)`, scrim `blur(10px)`. Focus trapped, `Esc`
closes, focus returns to the originating row, body scroll locked.

- **Left**: title, description, the highlight block (amber rule), acceptance criteria with a gradient
  progress ring (`r=15`, `stroke-dasharray="94.2"`), the comment thread, then the activity feed in
  faint mono.
- **Right**: the seven properties — status, type, assignee, reviewer, deadline, estimate, grouping —
  each inline-editable and optimistic. Then **Log time**: 0.5h steps (30 minutes) via − / +, today's
  date, a gradient `Log {n} h` button, your entries on this item, and a total.

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

## Settings · your picture

The one thing on a profile its owner sets. Choose, replace, or remove; the browser centre-crops to
256px WebP before it uploads, and the caption names your initials while there is no picture. It then
replaces the initials **everywhere a person appears** — the rail, the sprint header, the board cards,
the assignee and reviewer columns, the mobile cards, the People list, the mention menu, every comment
and every logged hour. Wherever a person has no picture, the initials stay.

Every one of those is `<PersonAvatar>`, which always draws the initials and lays the picture over
them: a missing or broken image degrades to initials with no JavaScript involved. Role, capacity and
access stay on **People** — they are decisions *about* a person and are an admin's to make.

Exports are unchanged. `04-EXPORT-SPEC.md` states people as name and initials, and a CSV is not a
place for a photograph.

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

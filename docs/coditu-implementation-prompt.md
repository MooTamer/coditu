# Coditu — implementation brief for Claude Code

Build the Coditu marketing site and the internal delivery app from the approved Claude Design bundle. This document is the contract. Read it end to end before writing code.

Working repo: the existing Next.js project currently named **Strukture Digital**. That name is retired — everything ships as **Coditu**.

---

## 0. First action — make this survivable

Sessions end. Context windows fill. Other agents will pick this up. **Before writing a single line of feature code**, land the durable context so any future session can resume without re-reading this prompt.

Create, commit, and keep current:

```
CLAUDE.md                     entry point — every session reads this first
docs/
  00-CONTEXT.md               who Coditu is, voice rules, non-negotiables
  01-DESIGN-SYSTEM.md         tokens, type, motion, a11y contract
  02-DATA-MODEL.md            schema, enums, RLS, invariants
  03-APP-SPEC.md              every screen, every behaviour
  04-EXPORT-SPEC.md           CSV / Markdown / PDF contract
  05-DECISIONS.md             append-only ADR log (date, decision, why, alternatives rejected)
  06-PROGRESS.md              the ledger — the single source of truth on what is done
design/                       the design handoff bundle, committed verbatim
```

`CLAUDE.md` must open with, in this order:

1. One paragraph on what this repo is.
2. **"Read `docs/06-PROGRESS.md` before doing anything else."**
3. The commands: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run db:migrate`, `npm run db:seed`, `npm run db:test`.
4. The five invariants from §6.1 below, verbatim.
5. A pointer to each `docs/` file with one line on what lives there.

`docs/06-PROGRESS.md` is a checkbox ledger, one line per task from §13, each carrying: status (`todo` / `wip` / `done`), the commit SHA that completed it, and the verification command that proved it. **Rule: a task is only `done` when its verification command passes. Update the ledger in the same commit as the work — never in a separate "update docs" commit.**

Append to `docs/05-DECISIONS.md` every time you make a call this brief did not make for you. Future sessions must not have to re-litigate settled choices.

---

## 1. Import the design

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:

https://claude.ai/design/p/98bbd011-5858-4cee-af83-4360f7c83cb6?file=Coditu+App.dc.html

Focus on these files (the whole project is readable):
- `Coditu App.dc.html`

Also read these files the selection imports:
- `support.js`

Implement: `Coditu App.dc.html`

The same bundle is committed at `design/` in this repo. Read all five artboards, not just the App:

| File | What it defines |
|---|---|
| `Coditu App.dc.html` | The internal app — rail, topbar, project switcher, sprint header, table, board, item detail, export dialog, command palette, Projects / My work / People / Import views |
| `Coditu Brand.dc.html` | Mark construction, the two rejected variants, lockups, OG compositions |
| `Coditu Site.dc.html` | The marketing site — sections `#top #work #services #process #use-cases #team #insights #faq #contact` |
| `Coditu Sprint Report.dc.html` | The client PDF — cover, "Progress at a glance", "Where each item stands", "What happens next" |
| `Current Site - Strukture Digital.dc.html` | The site as it exists today. Reference only — do not port it |

`docs/coditu-revamp-prompt.md` is already in this repo: the original brief the designs were built from. It is the source for **voice, positioning, and the company facts** (§1–§2 there). Where it and the design bundle disagree on anything visual, the bundle wins — it is the later artefact.

**These are prototypes, not production code.** The `.dc.html` files use a template runtime (`<x-dc>`, `sc-for`, `sc-if`, `{{ }}`, inline styles) that exists only in the design tool. Recreate the *visual and behavioural output* in React/Tailwind idiomatically. Do not port inline-style soup, do not port the `DCLogic` class shape, do not ship `support.js` or `doc-page.js`. Every number in those files — every px, ms, opacity, radius, gap — **is** the spec and must survive the translation.

Do not screenshot or browser-render the prototypes. Everything you need is in the source.

Assets in `design/project/assets/` move to `public/`:
- `assets/brand/*` → `public/brand/`
- `assets/clients/evim.svg` → `public/clients/evim.svg`
- `assets/work/*` → `public/work/`
- `assets/legacy/*` → delete after the Coditu marks are wired in

The EVIM logo is a third-party mark used to identify their project inside our own tooling. It belongs in the app and in reports prepared for EVIM. It does **not** go on the public marketing site as a client logo without their written permission — leave that decision to the team.

---

## 2. Stack and conventions

Keep the existing stack. Do not introduce a competing one.

| Area | Choice |
|---|---|
| Framework | Next.js 16.1.6, App Router, React 19.2.3, TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 with CSS variables in `app/globals.css`; shadcn/ui (New York) + Radix primitives |
| Motion | Framer Motion 12 for orchestrated sequences; plain CSS for anything that can be CSS |
| Icons | lucide-react. The prototype's inline `<path d="…">` icons are lucide-equivalent — map each to its lucide name rather than hand-rolling SVG |
| Data | Supabase — Postgres, Auth, Storage, Realtime. `@supabase/ssr` for cookie sessions |
| Editor | TipTap (ProseMirror) for the comment composer — §9 |
| Tables | TanStack Table for sorting/filtering state; TanStack Virtual when a sprint exceeds 100 rows |
| Validation | zod at every server boundary |
| Tests | Vitest + Testing Library for units; Playwright for e2e; `pgTAP`-style SQL assertions for RLS |

Conventions:

- **Server Components by default.** A `"use client"` boundary needs a reason you can name in one sentence. Keep the existing `.client.tsx` suffix discipline.
- **All writes go through Server Actions.** zod-validate the input, re-check authorization server-side, then call Supabase. Never mutate from the browser with the anon key.
- `lib/marketing-content.ts` stays the typed single source for all marketing copy. Extend the types; do not scatter strings into components.
- No `any`, no `@ts-expect-error` without a comment naming the upstream issue, no `eslint-disable` without the same.
- Absolute imports via `@/`.
- Conventional commits. One logical change per commit.
- **Housekeeping on day one:** the repo carries macOS AppleDouble junk (`._tsconfig.tsbuildinfo`, `._pack-*.idx` inside `.git/objects/pack/`) that makes `git status` emit `non-monotonic index` errors. Delete the stray `._*` files, add `._*` and `.DS_Store` to `.gitignore`, and confirm `git status` is clean before anything else.

---

## 3. Design tokens — extracted, do not re-derive

These are lifted from the approved bundle. Put them in `app/globals.css` as CSS variables and mirror the semantic names into the Tailwind theme. Every component reads tokens; **no component hardcodes a hex.**

```css
/* dark */
--canvas:#07090E  --raised:#0C1119  --overlay:#111826
--hairline:rgba(255,255,255,.07)  --hairline-strong:rgba(255,255,255,.13)
--ink:#EDF1F7  --ink-muted:#93A0B4  --ink-faint:#7C899C
--accent:#21E2C6  --scrim:rgba(7,9,14,.72)

/* light */
--canvas:#EBEFF6  --raised:#F8FAFC  --overlay:#FFFFFF
--hairline:rgba(11,14,20,.10)  --hairline-strong:rgba(11,14,20,.18)
--ink:#0B0E14  --ink-muted:#52607A  --ink-faint:#5F6B80
--accent:#1E4AE0  --scrim:rgba(11,14,20,.45)

/* brand — identical in both themes */
--signal-from:#2B57FF  --signal-to:#21E2C6
--signal: linear-gradient(135deg, #2B57FF, #21E2C6)

/* functional */
--amber:#FFB020  --rose:#FF5F6D  --jade:#23C97F  --slate:#6B7A90
```

**Chip text is a themed pair, not one hue.** A value tuned for paper drops to ~2.4:1 on the dark canvas. Every status and tone carries a light `fg`/`bg` and a dark `fg`/`bg`:

| token | light fg | dark fg | bg (light / dark) |
|---|---|---|---|
| `draft` | `#52607A` | `#9AA7BB` | `rgba(107,122,144,.14)` / `rgba(147,160,180,.16)` |
| `todo` | `#3F4C63` | `#AEBACD` | `rgba(107,122,144,.16)` / `rgba(147,160,180,.16)` |
| `dev_started` | `#183FBF` | `#89A7FF` | `rgba(43,87,255,.12)` / `rgba(43,87,255,.22)` |
| `ready_for_peer_review` | `#7A4F00` | `#FFC24D` | `rgba(255,176,32,.18)` / same |
| `in_review` | `#0B6B5C` | `#4FE9D2` | `rgba(33,226,198,.18)` / `rgba(33,226,198,.16)` |
| `changes_requested` | `#A81F2C` | `#FF9AA2` | `rgba(255,95,109,.14)` / `rgba(255,95,109,.18)` |
| `done` | `#0E6B4B` | `#63E3A9` | `rgba(35,201,127,.18)` / `rgba(35,201,127,.16)` |
| `blocked` | `#A81F2C` | `#FF9AA2` | `rgba(255,95,109,.20)` / `rgba(255,95,109,.22)` |

Tones `amber` / `jade` / `slate` follow the same pattern — see the bundle's `TONE` map.

**Grouping hues** are deterministic per integer: `1 → #5B8CFF`, `2 → #12A594`. Extend with a stable hash, never a random or index-based pick. The hue lives on the **3px left border and the ≤6% row tint only**; the number itself renders in `--ink`, because an 11px label in the hue never clears 4.5:1. Sticky-cell backgrounds are opaque and pre-mixed per group (`#F4F7FE` / `#F2F9F8` light, `#111827` / `#0F1A1C` dark) so the sticky column does not go transparent over a tinted row.

**Type.** Satoshi (Fontshare, 400/500/700/900) self-hosted via `next/font/local`; JetBrains Mono (400/500/600) via `next/font/google` for every key, timestamp, count, metric, and status label. Fallback if Satoshi self-hosting is blocked: **Instrument Sans**. Never substitute anything else. `font-variant-numeric: tabular-nums` on every number that sits in a column or updates in place.

**Geometry.** Radii `6` chips · `10` inputs/buttons · `12` inner panels · `14` cards · `16` list sections · `20` top-level sections and modals · `999` pills. Elevation is hairline + background step; the only shadow in the system is `0 24px 64px -24px rgba(0,0,0,.45)` on overlays. Rail `72px` collapsed → `240px` expanded. Topbar `60px`. Row height `52px` comfortable / `44px` compact.

**Contrast is already measured and must not regress:** dark canvas — ink 17.6:1, ink-muted 7.4:1, ink-faint 5.6:1, aqua 12.1:1, cobalt 3.7:1 (UI boundaries only, never text). Light canvas — ink 18.4:1, ink-muted 6.0:1, ink-faint 5.0:1. `ink-faint` carries mono metadata, so it is held at AA in both themes, not treated as decoration.

---

## 4. Motion — fluid and noticeable, blur-led

Motion should be *felt*. The house effect is a **blur fade-in**: content arrives from slightly below, out of focus, and resolves. Not a subtle 10px nudge — a visible resolve.

Build one primitive, `<Reveal>`, and one hook, `useReveal`, and route everything through them.

```ts
export const ease = {
  entrance: [0.16, 1, 0.30, 1],   // default
  exit:     [0.55, 0, 1, 0.45],
  drift:    [0.32, 0.72, 0, 1],
  spring:   { type: "spring", stiffness: 380, damping: 32, mass: 0.9 },
} as const;

export const reveal = {
  micro:   { y: 4,  blur: 0,  duration: 0.20 },  // chips, tooltips, inline state
  surface: { y: 10, blur: 8,  duration: 0.32 },  // popovers, menus, modal panels
  section: { y: 18, blur: 14, duration: 0.52 },  // page and section entrances
} as const;

export const stagger = { tight: 0.045, base: 0.075, loose: 0.11 }; // total capped at 0.6s
```

Where each tier applies:

- **section** — route entrance, sprint header, table body on first paint, each marketing section on scroll-in. Stagger children at `base`.
- **surface** — item detail modal, export dialog, command palette, project switcher, every popover. The design's `.rise` (240ms / 10px) upgrades to this tier: keep the 10px, add the 8px blur, take it to 320ms.
- **micro** — status chip changes, checkbox ticks, hover elevation, filter pills. No blur.

Backdrops: scrim fades `0 → 1` while `backdrop-filter` goes `blur(0) → blur(10px)` over 240ms. Modal panel enters one frame behind the scrim so it reads as arriving *through* it.

**The blur performance rule — this is where blur fade-ins go wrong.** `filter: blur()` forces an offscreen composite pass every frame.

- Set `will-change: filter, transform, opacity` when the animation starts, **remove it on completion** — a permanent `will-change` pins a layer and costs memory for nothing.
- Never blur-animate an element taller than ~40vh, and never one containing an above-the-fold image. Blur its *container's children* in a stagger instead of the whole block.
- Blur only on entrance. Never on exit, never on hover, never on scroll-linked values.
- Table rows: blur-reveal the `<tbody>` once on mount as a single group. Never per-row on filter, sort, or realtime update — those get `micro` opacity only, or the table will visibly hitch.

Scroll-linked motion (the marketing signal trace) drives `stroke-dashoffset` through a `useScroll` + `useTransform` chain with `will-change: transform`. Never a `filter` on a scroll-linked value.

**Reduced motion:** `prefers-reduced-motion: reduce` sets every tier to `{ y: 0, blur: 0, duration: 0.12 }`, freezes the trace at full draw, and stops the spinner rotation. One check, one place, applied globally — not re-implemented per component.

The app's only spinner is the rotating Coditu mark: `cd-spin`, 1.4s linear, `transform-origin: 16px 16px`, `transform-box: view-box`.

---

## 5. Performance — budgets, and how they are enforced

| Metric | Budget |
|---|---|
| LCP | < 2.0s, mid-tier Android over 4G |
| CLS | < 0.05 |
| INP | < 200ms |
| Marketing route JS | ≤ 130KB gzipped |
| App shell JS | ≤ 220KB gzipped, TipTap excluded (lazy) |
| Lighthouse, marketing | ≥ 95 on all four categories |

How you hold them:

- Server Components render the sprint table, the item detail body, and every marketing section. Client boundaries: the composer, the command palette, drag-and-drop, the export dialog, filter controls, theme toggle.
- **TipTap is dynamically imported** and only when a composer is focused or a draft exists. A read-only thread must never ship the editor bundle — render stored comments from JSON with a server-side renderer.
- Fonts: `next/font` with `display: swap`, preload the two weights above the fold, subset Latin. No FOUT jump — size-adjust the fallback.
- Images: `next/image` with explicit `sizes`; `priority` on exactly one LCP image; AVIF/WebP; blur placeholders.
- Skeletons match final dimensions to the pixel, or CLS pays for it.
- Realtime subscribes to the **active sprint only**, unsubscribes on unmount, and coalesces bursts through a 120ms buffer so a batch import does not thrash React.
- Add `npm run analyze` (`@next/bundle-analyzer`) and a CI budget check that fails the build when a route exceeds its cap.
- Lighthouse CI on the marketing route in the pipeline, asserting the table above.

---

## 6. Data model

Postgres via Supabase. Real SQL migrations in `supabase/migrations/`. RLS on every table, no exceptions, no `USING (true)` on a write policy.

### 6.1 The five invariants — copy these verbatim into CLAUDE.md

1. **A work item belongs to a sprint; a sprint belongs to a project; a project belongs to a client.** Nothing is global. No query, view, export, or report may return an item outside the active project's scope. Every server action that touches an item re-derives the project from the item's own sprint — never from client-supplied state.
2. **Time is stored as integer minutes, never floating hours.** `time_entries.minutes int`. `work_items.minutes_logged int` is a trigger-maintained rollup. Hours are a *presentation* concern: divide by 60 at the render edge only. Summing floats drifts, and this app's whole credibility is its sums.
3. **Every mutation is a Server Action:** zod-validate → re-check authorization server-side → write → revalidate. The browser never holds a privileged key.
4. **Optimistic updates always have a rollback path and a visible error.** A failed write that silently reverts is worse than no optimism.
5. **Dates: `date` columns are calendar dates with no timezone; everything else is `timestamptz`.** Render in `Africa/Cairo`. Never `new Date("2026-08-23")` — that parses as UTC midnight and shows the previous day in half the world.

### 6.2 Enums

```sql
create type app_role         as enum ('admin','lead','engineer');
create type sprint_status    as enum ('planned','active','closed');
create type work_item_status as enum ('draft','todo','dev_started','ready_for_peer_review',
                                      'in_review','changes_requested','done','blocked');
create type work_item_type   as enum ('story','change_request','bug_fix','chore','spike');
```

Status order for boards, reports, and sorting is fixed: `dev_started → ready_for_peer_review → in_review → changes_requested → todo → draft → blocked → done`. Define it once as a Postgres function and once in TS, and assert they agree in a test.

### 6.3 Tables

- **`profiles`** — `id uuid pk references auth.users on delete cascade`, `full_name`, `initials`, `avatar_url`, `role app_role default 'engineer'`, `weekly_capacity_minutes int default 2400`, `is_active bool default true`, timestamps. Populated by an `on auth.users` insert trigger.
- **`clients`** — `id`, `name`, `website_url`, `logo_path`, `accent_hex`, timestamps. EVIM lives here with `logo_path = '/clients/evim.svg'` and `website_url = 'https://www.evim.de'`.
- **`projects`** — `id`, `client_id fk`, `name`, `slug unique`, `scope text`, `accent_hex`, `is_archived bool default false`, timestamps.
- **`sprints`** — `id`, `project_id fk`, `number int`, `name`, `starts_on date`, `ends_on date`, `goal text`, `notes text` (markdown), `notes_author_id fk`, `status sprint_status default 'planned'`, timestamps. `unique (project_id, number)`. A partial unique index enforces **at most one `active` sprint per project**.
- **`work_items`** — `id`, `sprint_id fk on delete cascade`, `key text unique` (`COD-140`, from a sequence), `title`, `description text`, `highlight text` (the "discuss before implementing" note — a first-class field, not a markdown convention), `status`, `type`, `assignee_id fk profiles null`, `reviewer_id fk profiles null`, `deadline date`, `estimate_minutes int`, `minutes_logged int not null default 0`, `grouping smallint null`, `order_index int not null`, `closed_at timestamptz`, timestamps.
- **`acceptance_criteria`** — `id`, `work_item_id fk on delete cascade`, `body text`, `is_done bool default false`, `order_index int`.
- **`time_entries`** — `id`, `work_item_id fk`, `profile_id fk`, `minutes int not null check (minutes > 0 and minutes <= 1440)`, `worked_on date not null default current_date`, `note text`, `created_at`.
- **`comments`** — `id`, `work_item_id fk on delete cascade`, `author_id fk`, `body_json jsonb not null` (ProseMirror doc), `body_text text not null` (flattened, for search and export), `edited_at`, `deleted_at`, `created_at`. Soft delete only.
- **`comment_mentions`** — `comment_id fk`, `profile_id fk`, primary key on the pair. Written by a trigger that walks `body_json` for `mention` nodes.
- **`notifications`** — `id`, `profile_id fk`, `kind text` (`mention` | `assigned` | `review_requested`), `work_item_id fk`, `comment_id fk null`, `read_at`, `created_at`.
- **`attachments`** — `id`, `work_item_id fk`, `storage_path`, `file_name`, `mime_type`, `bytes int`, `uploaded_by`, `created_at`.
- **`activity`** — `id`, `work_item_id fk`, `actor_id`, `verb`, `field`, `from_value`, `to_value`, `created_at`. Written by `security definer` triggers on status, assignee, reviewer, and deadline changes. Read-only to everyone.

**Rollup trigger:** `after insert/update/delete on time_entries` recomputes `work_items.minutes_logged`. Comment the migration explaining why it is denormalised — the table renders a per-row number and a footer sum on every paint, and an aggregate per render is the wrong trade.

**Indexes:** `work_items(sprint_id, order_index)`; `work_items(assignee_id) where status <> 'done'`; `work_items(reviewer_id) where status = 'ready_for_peer_review'`; `time_entries(work_item_id)`; `time_entries(profile_id, worked_on)`; `comments(work_item_id, created_at)`; `activity(work_item_id, created_at desc)`; `notifications(profile_id) where read_at is null`.

**Views:** `v_sprint_summary` — per sprint: item count, count per status, total estimate minutes, total logged minutes, days remaining. `v_person_load` — per profile per sprint: assigned count, review-queue count, minutes logged, capacity.

### 6.4 Auth and RLS

Supabase Auth, email + password with magic-link fallback. **No public sign-up:** an `allowed_emails` table plus a `before insert on auth.users` trigger that raises on a miss. `middleware.ts` guards `/app/*` and redirects to `/login?next=…`. Roles are read server-side from `profiles`; a client-held role is never trusted.

Policies:

- **Read** — any authenticated profile with `is_active = true` reads all rows. Small team, full transparency.
- **`clients`, `projects`, `sprints`** — insert / update / delete: `admin` and `lead` only.
- **`work_items`** — insert / delete: `admin` and `lead`. Update: `admin` and `lead` on any column; an `engineer` may change **only** `status` and `order_index`, and **only** where they are the `assignee_id` or `reviewer_id`. Enforce the column restriction with a `before update` trigger that raises on a protected-column change — a policy alone cannot express it.
- **`acceptance_criteria`** — `is_done` togglable by assignee, reviewer, admin, lead. Body edits: admin and lead.
- **`time_entries`** — insert / update / delete only where `profile_id = auth.uid()`. Admin may delete any.
- **`comments`** — author may update or soft-delete their own; admin may soft-delete any; nobody hard-deletes.
- **`notifications`** — a profile reads and updates only its own rows.
- **`attachments`** + storage buckets `work-attachments` and `comment-images` — both private. Authenticated read; insert by any active profile; delete by uploader or admin. Serve through signed URLs, 1 hour TTL.
- **`activity`** — read-only; written by triggers.

`supabase/tests/rls.sql` asserts each policy with a **positive and a negative case**, including: an engineer cannot reassign an item; an engineer cannot edit an item they neither own nor review; a user cannot delete another's time entry; a member of one project cannot read another project's items through a crafted filter; an anonymous session reads nothing.

---

## 7. Routes

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

Filter, sort, and view state live in the URL (`?status=dev_started,todo&assignee=…&view=board`) so a view is shareable and survives reload.

---

## 8. Screens — behaviour that must be exact

Geometry, spacing, and copy come from `Coditu App.dc.html`. What follows is the behaviour the prototype could only gesture at.

**Rail.** 72 → 240px on hover *and* on click-to-pin; pinned state persists per user. Labels cross-fade at 160ms, width transitions at 220ms `entrance`. Nav: Sprint · Projects · My work · People · Import. Footer shows the signed-in profile and role.

**Project switcher.** The topbar control shows the client mark (EVIM's glyph, or an accent square), the client name in mono, a hairline divider, then the sprint name. The menu lists all projects, then **only the sprints belonging to the selected project**, then "Manage projects". Picking a project with no sprint routes to `/app/projects`, not to an empty sprint page.

**No-sprint empty state.** A real screen, not a spinner: client mark, `"{client} has no open sprint"`, a sentence explaining that items, hours, and reviews all hang off a sprint, and two actions — "See all projects" and "Switch project". The Export button is `disabled` with a tooltip reading `No sprint to export for {client}`, not hidden.

**Sprint header.** Three columns at `minmax(280px, 1fr)`:
1. Client pill linking to `www.evim.de` (`target="_blank" rel="noreferrer"`), `sprint {n} · {status}`, sprint name at 26px/-0.024em, window `starts → ends` with a `{n} days left` amber pill, and member avatars whose tooltips carry per-person logged hours.
2. Status distribution — a 10px stacked bar, one segment per status with a `title`, a legend beneath, and `{logged} / {estimated} h` at 26px mono tabular.
3. Burn-up — cumulative hours logged per sprint day against the estimate line, `viewBox="0 0 300 108"`, gradient stroke, dashed estimate rule, terminal dot in `--signal-to`. Give it a real `aria-label` listing the series values.

Below: a collapsible **Sprint notes** panel — markdown, attributed (`written by {author} · {date}`), rendering the highlight convention as a 2px amber left rule. It reads as a written note, never as a form field.

**Table.** Columns `Task · Status · Hours · Assignee · Reviewer · Deadline · Type · Grouping`. Real `<table>` semantics — `<th scope="col">`, no div-with-role. Sticky header; sticky Task column with an opaque per-group background. Task cell carries `{key}` in mono, the title (ellipsis + `title` attribute), and the AC progress `3/5` right-aligned.

- Status chip is a Radix popover: keyboard-navigable, optimistic write, rollback + toast on failure.
- Assignee / Reviewer open a searchable popover for admin and lead; for an engineer the control is **disabled with a tooltip**, never hidden.
- Hours render `logged / estimate`; over-estimate turns amber, not red — running long is information, not failure.
- Deadline within 24h renders amber.
- Footer row pins with `Sum · {n} items` and `{logged} / {estimate}`, mono, tabular. **This sum must equal the database, always.** Test it.
- Sort any column; filter by status, type, assignee, reviewer, grouping; free-text over title and description.
- Drag to reorder (`dnd-kit`) persisting `order_index`. **Keyboard path is required:** focus a row, `Space` to lift, arrows to move, `Space` to drop, `Esc` to cancel, each step announced via `aria-live`.
- Below 900px the table becomes stacked cards — driven by a **container query**, not a viewport breakpoint — carrying key, status chip, title, `AE → MT`, hours, deadline, grouping, plus a sum card.

**Board.** Columns per status with count, cards showing key, type, title, assignee initials, hours, AC progress, and the grouping border. Drag between columns writes status optimistically. Horizontal scroll with snap when narrow.

**Item detail.** `max-width: 1080px`, two columns at `minmax(300px, 1fr)`, scrim `blur(10px)`. Focus trapped, `Esc` closes, focus returns to the originating row, body scroll locked.
- Left: title, description, the highlight block (amber rule), acceptance criteria with a gradient progress ring (`r=15`, `stroke-dasharray="94.2"`), the comment thread (§9), then the activity feed in faint mono.
- Right: the seven properties — status, type, assignee, reviewer, deadline, estimate, grouping — each inline-editable and optimistic; then **Log time**: 0.5h steps (30 minutes) via − / +, today's date, a gradient `Log {n} h` button, your entries on this item, and a total.

**Projects / My work / People / Import** follow the bundle. The Notion importer maps `Task → title`, `Status → status`, `Hours Worked → one time entry`, `Assignee`/`Reviewer → profiles by name`, `Deadline → deadline`, `Story Type → type` (`CR: Change Request → change_request`), `Grouping → grouping`, and shows a preview table flagging every unmatched value — including the non-integer grouping case (`"1a"`) — **before** committing anything.

**Command palette.** `⌘K` / `Ctrl+K`. Jump to project, sprint, or item; change status; log time; assign; toggle theme; sign out. Fuzzy over keys and titles. `Esc` closes this, the detail modal, the export dialog, and the project menu.

---

## 9. The story thread — text, code, images, @mentions

The prototype shows a placeholder (`"Write a comment — @ to mention"`). Build the real thing.

**Editor: TipTap.** Extensions: `StarterKit` (paragraph, bold, italic, strike, bullet/ordered list, blockquote, inline code, horizontal rule), `Link`, `CodeBlockLowlight` (lowlight, languages limited to ts, tsx, js, json, sql, bash, css, html, python, diff), `Image`, `Mention`, `Placeholder`.

**Storage.** `comments.body_json jsonb` holds the ProseMirror doc. `comments.body_text` holds a flattened plain-text projection, written in the same transaction, used for search, the CSV/Markdown export, and notification previews.

**Rendering — the security boundary.** Render stored comments **server-side from the JSON by walking known node types only**. Do not round-trip to an HTML string and inject it; do not `dangerouslySetInnerHTML` a value derived from user input. An unknown node type renders as its text content or nothing. Code blocks are highlighted server-side with lowlight into typed spans. This is a hard rule — write it into `docs/05-DECISIONS.md`.

**Composer behaviour.**
- Toolbar: bold, italic, inline code, code block, link, bullet list, image. Compact, hairline-bordered, appearing on focus.
- `Cmd/Ctrl+Enter` submits. `Esc` blurs without discarding. Drafts persist per item in `localStorage`, keyed `coditu.draft.{itemKey}`, cleared on successful submit.
- **Code snippets:** triple-backtick or the toolbar. Language picker on the block. Monospace at 12.5px/1.6 on `--canvas` with a hairline and a copy button. Long lines scroll inside the block — the thread never scrolls sideways.
- **Images:** paste from clipboard, drag-and-drop, or the toolbar. Upload to the private `comment-images` bucket through a Server Action that validates MIME (`image/png|jpeg|webp|gif|avif`) and size (≤ 8MB), strips EXIF, and returns the storage path. Optimistic placeholder with a progress bar while uploading; failure replaces it with a retry affordance, never a broken image. Rendered inline at `max-width: 100%`, `border-radius: 12px`, opening in a keyboard-navigable lightbox on click.
- **Mentions:** typing `@` opens a suggestion list of active profiles, filtered as you type, navigable with arrows and `Enter`, dismissed with `Esc`. The stored node holds the **profile UUID**, not the display name, so a rename never breaks a historical mention. Rendered as a non-link chip in `--accent` with a subtle tinted background. On submit, a trigger populates `comment_mentions` and inserts a `notification` per mentioned profile. Mentions surface in `/app/my-work` under "Mentions" with an unread dot in the rail.

**Thread.** Newest last. Each entry: avatar initials, author, timestamp in mono (`YYYY-MM-DD HH:mm`, Africa/Cairo), body. Author may edit — the edit renders in place and stamps `edited_at`, shown as `edited` in faint mono. Realtime insert appends with a `micro` reveal (no blur — a per-message blur in a live thread reads as jitter).

**Empty state:** `"No discussion yet."` plus the composer. Never a bare box.

---

## 10. Export

Reached from the topbar Export button, disabled when the active project has no sprint. Dialog `max-width: 1000px`, two panes.

**Left pane — Format · Include · Items.**

Three formats, radio-style cards:

| Format | Card copy (use verbatim) |
|---|---|
| Markdown | *Markdown — for an AI agent.* Front-matter facts, sprint notes, then every item with criteria, discussion, activity and time entries. |
| CSV | *CSV — detailed.* One row per item, every column including criteria and time entries. Opens in Sheets or Excel. |
| PDF | *PDF — for the client.* A typeset sprint report: summary, burn-up, and each item with its acceptance criteria. |

Include toggles (pills): **Acceptance criteria · Hours & time entries · Comments & activity · Assignee & reviewer**.

Item selector: every item in the sprint with a checkbox, key, title, hours; quick actions **all · none · drop drafts**. The header reads `{n} of {total} items` live. Selection persists to `localStorage` under `coditu.export.v1` so it survives to the report route and the next session.

**Right pane — live preview.** For CSV and Markdown, a mono `<pre>` of the actual output with a line count, plus **Copy to clipboard** and **Download .csv / .md**. For PDF, a mini cover card and a primary action that opens the report route.

**CSV contract.** Header: `key,title,status,type,grouping,assignee,reviewer,deadline,estimate_hours,hours_logged`, then conditionally `acceptance_criteria_done,acceptance_criteria_total,acceptance_criteria` · `comments,activity` · `time_entries`. RFC 4180 quoting: wrap any cell containing `"`, `,`, or a newline; double internal quotes. Prefix a UTF-8 BOM so Excel opens it correctly. Multi-value cells join with ` | `. Criteria render `[x] ` / `[ ] `. **Filename:** `{client-slug}-sprint-{n}.csv`.

**Markdown contract.** Written for an AI agent, so it front-loads the facts it needs to act:

```
# {Client} — {Sprint name}

- project: {name} ({client}, {url})
- window: {start} → {end} ({n} days remaining as of {today})
- items in export: {n} of {total}
- hours: {logged} logged / {estimated} estimated
- statuses used: draft, todo, dev_started, ready_for_peer_review, in_review, changes_requested, done, blocked
- convention: items sharing a `grouping` integer overlap in logic/UI and are taken by one developer
- convention: a highlighted block means discuss before implementing

## Sprint notes
> {notes, with the highlight line in bold}

## Items
### {n}. {KEY} — {title}
| field | value |   ← status, type, grouping, assignee, reviewer, deadline, hours
{description}
> **Discuss before implementing:** {highlight}
**Acceptance criteria** → `- [x] …`
**Discussion** → `- {author} ({when}): {text}`
**Activity** → `- {line}`
**Time entries** → `- {date} — {n} h`
```

Every conditional section respects the Include toggles. **Filename:** `{client-slug}-sprint-{n}.md`.

**PDF contract.** This is the one a client sees; it must look considered.

Sections, per `Coditu Sprint Report.dc.html`: cover (`Sprint report`, `Prepared for {Client} · {url}`, four stat blocks — Items in report, Hours logged, Of estimate, Sprint window) → **Progress at a glance** (status distribution + burn-up) → **Where each item stands** (every included item with its acceptance criteria as written, grouped by the fixed status order) → **What happens next** → a closing line offering a reply to `hello@coditu.com`.

- Letter, portrait, `0.7in` margins, running header (Coditu mark + wordmark + `{Client} · Sprint {n}`) and footer (`hello@coditu.com` + `Page {n} of {m}`).
- **Client-facing means client-facing:** no internal comments, no activity log, no `COD-` keys, no reviewer names, no per-person hours. Status labels are humanised — `dev_started → "In progress"`, `ready_for_peer_review → "In peer review"`, `todo → "Not started"`, `draft → "Not scoped yet"`.
- `break-inside: avoid; orphans: 3; widows: 3` on every item block. No item's heading orphans from its criteria.
- Satoshi and JetBrains Mono embedded, not substituted.

**Implementation — one source of truth.** The report is React components rendered at `/app/projects/[slug]/sprints/[number]/report`, styled with print CSS (`@page { size: letter; margin: 0.7in }`, `position: running()` header/footer or a fixed-element equivalent). `…/report/pdf` is a Node-runtime Route Handler that drives headless Chromium (`playwright-core`; on Vercel, `puppeteer-core` + `@sparticuz/chromium-min`) over that same route with a short-lived signed token, and streams `application/pdf` with a `Content-Disposition` filename of `{client-slug}-sprint-{n}.pdf`. One layout, two outputs — the screen preview can never drift from the file.

If serverless Chromium turns out to be unacceptable in their hosting, the documented fallback is `@react-pdf/renderer` with the layout rebuilt in its primitives. Record whichever path you take in `docs/05-DECISIONS.md` with the reason.

**Scoping, restated because it is the easiest thing to get wrong:** an export is always `{project} → {sprint} → {selected items}`. It is never possible to emit one client's work under another client's name. Write a test that asserts it.

---

## 11. Marketing site

Per `Coditu Site.dc.html`. Sections in order: `#top` hero → `#work` → `#services` → `#process` → `#use-cases` → `#team` → `#insights` → `#faq` → `#contact`. The signature device is the **signal trace** — a scroll-linked SVG path that threads the page, branches at section anchors, and doubles as the reading-progress indicator. Process steps render as nodes on it.

- Copy comes from `lib/marketing-content.ts`, rewritten under Coditu. Locations are `Munich · Ulm · Cairo` — there is nobody in Berlin.
- Work cards → shared-element modal via `layoutId`, with image, title, and tag row as individually shared elements.
- **The three existing testimonials are placeholders attributed to named people at named companies. Do not ship them.** Cut the section, or keep the component behind `TESTIMONIALS_ENABLED = false` with a typed empty array and a comment. No invented praise, no invented metrics, no invented client counts.
- No stock photography of people anywhere. Product screenshots, diagrams, and the trace motif only.
- Metadata per route; JSON-LD `Organization` + `WebSite`; OG and Twitter cards from `public/brand/`; `robots.ts` and `sitemap.ts` updated; `hello@coditu.com`.
- Render `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192`, `icon-512`, `icon-maskable-512`, `og.png` (1200×630), `og-square.jpg` (1200×1200) from `public/brand/` sources at build time. Delete every legacy Strukture asset.

---

## 12. Accessibility

WCAG 2.2 AA, verified with a tool, not by eye.

- `:focus-visible` — 2px `--accent` plus a 2px canvas-colored offset ring so it reads on any surface.
- Full keyboard operation: modal, palette, popovers, table, drag reorder, lightbox, composer, mention list.
- Real table semantics. One `h1` per page. Correct heading order. Landmarks.
- `aria-live="polite"` on status changes, toasts, drag announcements, and realtime inserts. `aria-busy` during optimistic writes.
- Charts carry `role="img"` and an `aria-label` naming the actual series values.
- Every icon-only control has an `aria-label`; every truncated cell has a `title`.
- `prefers-reduced-motion` produces a calm, fully functional interface.
- Zero horizontal scroll at 320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560 — and at 200% zoom. Touch targets ≥ 44px on coarse pointers. `100dvh`, never `100vh`. `env(safe-area-inset-*)` on the rail, sheets, and the mobile action bar.
- `axe` assertions in the Playwright suite covering the sprint table, item detail, composer, and export dialog.

---

## 13. Order of work

Each step ends with its verification command green, `docs/06-PROGRESS.md` updated in the same commit, and a commit that builds.

1. **Bootstrap** — `CLAUDE.md`, `docs/*`, `design/` committed, `._*` junk removed, `.gitignore` fixed. → `git status` clean.
2. **Import the design** (§1), asset migration, `docs/01-DESIGN-SYSTEM.md` filled from the bundle.
3. **Tokens and primitives** — `globals.css`, Tailwind theme, fonts, `<Reveal>`, `<StatusChip>`, `<Mono>`, `<CoditusMark />` with `animated` and `spin`. → Storybook or a `/dev/tokens` route showing every token and tier in both themes.
4. **Supabase** — migrations, enums, triggers, views, indexes, RLS, `allowed_emails`, auth, middleware. → `npm run db:test` green with positive **and** negative RLS cases.
5. **Seed** — clients (EVIM + three), projects, Week 17 with all twelve items exactly as in the bundle (`COD-140`…`COD-151`, statuses, groupings 1 and 2, assignees, criteria, comments, activity, time entries), plus a closed Week 16 so the burn-up and sprint list have history. → a test asserts the footer sum reads **16.0 / 46.0**.
6. **App shell** — rail, topbar, project switcher, routing, theme, empty states.
7. **Sprint table** — columns, chips, sticky behaviour, grouping treatment, sum row, filters in the URL, mobile cards. → sum-equals-database test; container-query test at 320px.
8. **Item detail** — intercepting route, properties, criteria ring, log time, activity.
9. **Comment thread** (§9) — composer, code, images, mentions, notifications, server-side JSON rendering. → XSS test: a comment whose JSON carries a hostile node renders inert.
10. **Board, My work, People, Import.**
11. **Export** (§10) — CSV, Markdown, PDF, item selection, persistence. → golden-file tests for CSV and Markdown; a scoping test proving cross-project leakage is impossible.
12. **Marketing site** (§11) — sections, trace, work modal, metadata, brand assets.
13. **Motion pass** (§4) — every tier applied, reduced-motion verified, no `will-change` left pinned.
14. **Performance and a11y pass** (§5, §12) — budgets asserted in CI, Lighthouse ≥ 95, axe clean.

---

## 14. Definition of done

- [ ] `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run db:test` all pass clean.
- [ ] TypeScript strict. Zero `any`. Zero unexplained suppressions.
- [ ] Zero horizontal scroll at all thirteen widths and at 200% zoom.
- [ ] Full keyboard traversal of site and app, including drag reorder and the mention list.
- [ ] `prefers-reduced-motion` fully functional, no transforms, no blur.
- [ ] Contrast verified with a tool for every text/background pair in both themes; the measured figures in §3 do not regress.
- [ ] Lighthouse ≥ 95 on all four categories for the marketing route; route JS within budget.
- [ ] Every RLS policy has a passing positive **and** negative test.
- [ ] The sprint footer sum equals the database in a test, including after an optimistic update rolls back.
- [ ] Export scoping test proves one project's export can never contain another's items.
- [ ] Comment rendering is proven inert against hostile stored JSON.
- [ ] PDF renders with embedded fonts, running header and footer, no orphaned item headings, and no internal-only fields.
- [ ] The word "Strukture" appears nowhere — code, copy, metadata, README, or assets. Legacy assets deleted.
- [ ] No fabricated testimonials, metrics, client counts, or logos.
- [ ] `.env.example` complete; `SUPABASE_SERVICE_ROLE_KEY` referenced only from server-only modules; no secret in a client bundle.
- [ ] `CLAUDE.md` and `docs/06-PROGRESS.md` accurate as of the final commit; `docs/05-DECISIONS.md` records every judgement call.

---

## 15. How to work

- **Read `docs/06-PROGRESS.md` first, every session.** Trust it over your own recollection.
- Work one step of §13 at a time. Do not start the next before the current one's verification is green.
- Commit small and often. Every commit builds.
- When this brief is silent, choose the option that is easier to change later, then record it in `docs/05-DECISIONS.md`.
- When this brief conflicts with the design bundle on a *number*, the bundle wins. When it conflicts on *behaviour*, this brief wins. When it conflicts on *correctness*, correctness wins and you record it.
- **Ask before implementing** anything that would change the data model, the export contract, or the auth model in a way this brief does not describe.
- Do not add features that are not here. No epics, no story points, no workflow engine, no custom fields, no roadmap. Restraint is the design.

The bar: the sums are right, the scoping is airtight, the motion is felt, and a client who opens the PDF assumes it came from a team much larger than four people.

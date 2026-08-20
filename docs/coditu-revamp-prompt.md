# Coditu — Full Product & Brand Revamp Brief

You are designing and building the complete public website **and** an internal delivery dashboard for **Coditu**, a small senior software house. Treat this as one continuous engagement: identity, design system, marketing site, and internal app all ship from the same codebase and the same visual language.

Read this brief end to end before writing a line of code. Build the whole thing — do not stop to ask which part to do first.

---

## 1. Who Coditu is

Coditu is a distributed engineering team with hubs in **Germany and Egypt**. Four people. They design, build, launch, and keep running:

- **Enterprise portals** in the Microsoft ecosystem — SPFx components, SharePoint Online, governance and permission models.
- **Internal business systems** — approvals, scheduling, reporting, role-based operational software.
- **AI assistants using RAG** — ingestion, indexing, answer guardrails, workflow actions.
- **Web applications** — Next.js product surfaces, partner portals, operations dashboards.
- **Performance and technical SEO** — Core Web Vitals, metadata structure, performance budgets.

They are not an agency that subcontracts. One team owns discovery through post-launch iteration.

**Real, nameable work** (use these; do not invent others):

| Project | Client / context | What it was |
|---|---|---|
| MEINEvim internal SharePoint components | EVIM, Germany — enterprise | Reusable SPFx component set replacing fragmented legacy widgets |
| Nile Atelier partner portal | Egypt — clothing manufacturing | Partner onboarding, document routing, shared visibility |
| Ops Console | DevOps / infrastructure | Unified Vue 3 dashboard over Redis, Pinecone, S3, PostgreSQL, AI services |
| NVRMiss | B2B SaaS / field services | Product landing for a 24/7 AI receptionist — lead qualification, booking, calendar sync |

**The team:**

| Name | Role | Base |
|---|---|---|
| Mohamed Tamer | Frontend Lead — UI/UX, motion, design systems, frontend architecture | Cairo, EG |
| Adam Nafie | Client Partnerships Lead — discovery, solution design, roadmapping, QA | Munich, DE |
| Abdelrahman Elkhateeb | Frontend Engineer — performance (CWV), technical SEO, scalable UI | Cairo, EG |
| Ahmed Yehia | Backend & DevOps — APIs, CI/CD, databases, infrastructure, RAG pipelines | Ulm, DE |

---

## 2. Voice — read this twice

This is the single easiest thing to get wrong.

**Do not inflate.** No "world-class", "cutting-edge", "revolutionary", "industry-leading", "10x", "seamless", "unlock", "empower", "leverage", "transform your business", "we're passionate about". No invented metrics ("300% faster", "50+ clients"). No fake logos wall. No invented testimonials with invented people at invented companies.

**Do not shrink either.** Never write "we're just a small team", "boutique", "humble", "we may be small but". Never apologise for size.

**The register you want:** a senior engineer explaining precisely what they build and how, to a technical buyer who has been burned before. Confidence comes from *specificity*, not adjectives. "SPFx components inside existing SharePoint governance" beats "innovative enterprise solutions" every single time.

Size is handled by *omission and precision*, not by claims. Say "one team owns scope, design, build, launch, and iteration" — true, and it reframes a four-person team as an advantage. Never state a headcount, revenue figure, or client count.

Sentences: short. Paragraphs: two to three sentences maximum on the marketing site. Headlines: declarative, no gerund-stacking, no colons-with-a-cute-subtitle.

**Rewrite all existing copy under the Coditu name.** The current site runs under "Strukture Digital" — that name is retired. Every string, meta tag, email address (`hello@coditu.com`), OG title, sitemap entry, and README reference becomes Coditu.

**One thing to fix, not port:** the current site has three testimonials attributed to named people at named companies that are placeholders. Do not carry them over. Either cut the testimonials section entirely, or build it and leave it behind a `TESTIMONIALS_ENABLED` flag set to `false` with a typed empty array and a code comment saying real quotes go here. Never ship attributed praise from someone who did not say it.

---

## 3. Visual direction — "Instrument"

Commit fully to one aesthetic: **a precision instrument panel rendered in software.** Dark, dimensional, engineered. Aerospace telemetry and modern developer tooling, not consumer SaaS marketing.

The one thing a visitor should remember: **the signal trace** — a thin luminous line that threads through the entire page, drawn on scroll, branching at section boundaries like a PCB trace or a data path. It is the spine of the layout, the loading indicator, the section divider, and the logo's core motif, all the same object. Use it everywhere and nowhere else needs decoration.

### Color

Dark-first. Ship a light mode too, but design dark first and make it the default.

```css
/* Dark — the primary canvas */
--canvas:            #07090E;   /* near-black, blue undertone */
--canvas-raised:     #0C1119;   /* cards, panels */
--canvas-overlay:    #111826;   /* modals, popovers, command palette */
--hairline:          rgba(255,255,255,0.07);
--hairline-strong:   rgba(255,255,255,0.13);

--ink:               #EDF1F7;   /* primary text */
--ink-muted:         #93A0B4;   /* secondary text */
--ink-faint:         #5C6779;   /* metadata, timestamps */

/* Signature gradient — cobalt into aqua. This IS the brand. */
--signal-from:       #2B57FF;
--signal-to:         #21E2C6;
--signal-glow:       rgba(43,87,255,0.35);

/* Functional accent — used ONLY for status and warnings, never decoration */
--amber:             #FFB020;
--rose:              #FF5F6D;
--jade:              #23C97F;
--slate:             #6B7A90;
```

Light mode inverts to a cool paper `#F7F9FC` canvas with `#0B0E14` ink; the signal gradient stays identical so the brand does not shift between themes.

**Rules:** the gradient appears on at most three elements per viewport — never on body text, never as a full-page background wash. Everything else is ink on canvas separated by hairlines. Depth comes from *layered translucency and hairlines*, not drop shadows. If you find yourself reaching for a fourth gradient, use a hairline instead.

**Texture:** a 1px dot grid at 32px pitch, `rgba(255,255,255,0.025)`, masked with a radial fade — plus a fine grain overlay (SVG `feTurbulence`, ~3% opacity, `mix-blend-mode: overlay`) fixed to the viewport. Both are what stop a dark UI from reading as flat black.

### Typography

**Forbidden:** Inter, Roboto, Arial, Open Sans, Lato, Poppins, Montserrat, system font stacks, and Space Grotesk. The current site uses Inter + Manrope — replace both.

**Use:** **Satoshi** (Fontshare, free for commercial use) self-hosted via `next/font/local` for display and body, paired with **JetBrains Mono** via `next/font/google` for all metadata, numerals, IDs, status chips, timestamps, and code.

If self-hosting Satoshi is blocked for any reason, fall back to **Instrument Sans** (Google Fonts) — do not silently substitute anything else.

Type scale, fluid, `clamp()` on every step:

```css
--text-display: clamp(2.75rem, 1.6rem + 5.2vw, 6rem);      /* hero, 1.02 leading, -0.035em */
--text-h1:      clamp(2.25rem, 1.5rem + 3.2vw, 3.75rem);   /* 1.08, -0.028em */
--text-h2:      clamp(1.75rem, 1.3rem + 1.9vw, 2.5rem);    /* 1.15, -0.022em */
--text-h3:      clamp(1.25rem, 1.1rem + 0.7vw, 1.5rem);    /* 1.25, -0.015em */
--text-body:    clamp(1rem, 0.96rem + 0.18vw, 1.125rem);   /* 1.6, -0.005em */
--text-small:   0.875rem;                                   /* 1.5 */
--text-micro:   0.75rem;                                    /* mono, 0.06em tracking, uppercase */
```

Body copy caps at `68ch`. Display headlines cap at `18ch` and are allowed to break the grid.

### Space, radius, elevation

8px base grid. Radii: `6px` chips, `10px` inputs and buttons, `14px` cards, `20px` panels and modals, `999px` pills. Never mix more than three radii in one composition.

Elevation is expressed as: hairline border + background lightness step + (for overlays only) a wide soft shadow `0 24px 64px -24px rgba(0,0,0,0.7)`. Four levels total. No inner shadows, no neumorphism, no glassmorphism blur except on the sticky nav.

---

## 4. The logo

Design the **Coditu** mark from scratch. It is a wordmark plus a glyph, and the glyph is the signal trace closing into a **C**.

### Primary concept — "Aperture C"

A `C` built from a single continuous stroke on a 32×32 grid:

- Outer stroke: circular arc, 3.2 units wide, rounded caps, spanning 300° with a 60° gap opening to the **right**.
- The stroke is not uniform: it starts at 2.4 units at the top terminal and tapers to 3.6 units at the bottom terminal — the taper is what makes it read as a *signal* with direction rather than a geometric ring.
- Inside the gap, a single filled node — a 3-unit circle — sits on the arc's implied path, as if the trace continues to a connection point.
- The outer arc carries the cobalt→aqua gradient rotated 135°; the node is solid `--signal-to`.
- Optical correction: the arc's terminals are cut on the radial, not the vertical, so both ends read as perpendicular to the curve.

Produce **three variants** of this concept (differing in gap angle, taper ratio, and node placement), render them at 20px, 32px, 64px, and 256px, choose the one that survives 20px best, and ship that one. Show the rejected two in a `/docs/brand` contact sheet.

### Wordmark

"Coditu" in Satoshi Bold, tracking `-0.02em`, lowercase `t` shortened by 6% to sit under the cap line. The mark's node aligns optically with the x-height of the `o`. Lockup gap = 0.42× mark height.

### Animated mark

Ship `<CoditusMark />` as a React component with an `animated` prop:

- **Draw-on:** the arc renders via `stroke-dasharray` / `stroke-dashoffset` over 900ms `cubic-bezier(0.16,1,0.3,1)`, then the node scales in from 0 with a 60ms overshoot. Runs once on first paint of the hero.
- **Hover (navbar):** the node travels 300° along the arc path in 600ms and settles back at the gap. `offset-path` if supported, `<animateMotion>` fallback.
- **Loading state:** the arc rotates continuously at 1.4s linear while the node pulses opacity. This is the app's only spinner.
- Every animation is a no-op under `prefers-reduced-motion: reduce` — static mark, no exceptions.

### Brand deliverables

Write all of these into `/public/brand/` and document them in `/docs/brand/README.md`:

- `mark.svg` (viewBox `0 0 32 32`), `mark-mono-light.svg`, `mark-mono-dark.svg`
- `lockup-horizontal.svg`, `lockup-stacked.svg`, plus mono variants of each
- `icon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- `og.png` (1200×630) — mark, wordmark, one line of positioning, signal trace, dark canvas. Plus `og-square.jpg` (1200×1200) for WhatsApp/messaging previews.
- Usage rules in the README: clear space = 0.5× mark height on all sides; minimum sizes 20px (mark) / 96px (lockup); never recolor the gradient, never outline, never place on a busy photo, never stretch, never add a shadow.

---

## 5. Motion system

Motion is the reason this brief exists. Every animation must be **transform and opacity only** — never animate `width`, `height`, `top`, `left`, or anything that triggers layout. Filter/blur is allowed only on reveals under 200ms of blur.

Extend the existing token file rather than replacing it:

```ts
easing:   entrance [0.16, 1, 0.30, 1]      // the default — decisive arrival
          exit     [0.55, 0, 1, 0.45]      // quick departure
          drift    [0.32, 0.72, 0, 1]      // ambient float
          spring   { stiffness: 380, damping: 32, mass: 0.9 }  // interactive
duration: instant 0.12 | quick 0.22 | base 0.38 | slow 0.68 | ambient 7
stagger:  tight 0.045 | base 0.075 | loose 0.11   // cap total stagger at 0.6s
```

**Choreography — high-impact moments, not scattered fidget:**

1. **Hero entrance.** Signal trace draws left-to-right across the viewport (1.1s). Headline reveals per word, each word `translateY(0.6em) → 0` with `blur(8px) → 0`, staggered 45ms. Subhead and CTAs follow at 0.28s. Ambient tiles fade in with individual parallax factors. Total sequence under 1.6s. Never blocks interaction.
2. **Scroll-linked trace.** The signal line is a fixed SVG path whose `stroke-dashoffset` maps to scroll progress. It branches at each section anchor and its glow intensity tracks the section currently in view. This is the site's structural motif and its reading-progress indicator at once.
3. **Section reveals.** IntersectionObserver at `rootMargin: "-12% 0px"`, `threshold: 0.15`, fires once. Children stagger. Never re-animate on scroll-back.
4. **Work card → modal.** Keep and sharpen the existing `layoutId` shared-element transition. Card image, title, and tag row are individually shared elements so nothing cross-fades. Spring transition. Backdrop blurs from 0 → 12px over 240ms. Body scroll locked, focus trapped, `Esc` closes, focus returns to the originating card.
5. **Magnetic CTAs.** Primary buttons translate up to 6px toward the cursor within a 90px radius, spring-damped, released on leave. Pointer-fine devices only.
6. **Number counters.** Any figure counts up once on first view, `requestAnimationFrame`, monospace tabular numerals so width never shifts.
7. **Nav.** Sticky, 88px → 64px on scroll past 120px, backdrop blur 16px with a `saturate(180%)`, hairline appears only after the shrink. Active-section pill slides between nav items using `layoutId`.
8. **Page transitions.** Route changes fade and lift 12px over 240ms. No spinners between routes — use React `Suspense` with skeletons that match final layout dimensions exactly.

**Reduced motion:** a global `prefers-reduced-motion` check kills transforms, keeps opacity fades under 150ms, freezes the trace at full draw, disables parallax, magnetism, counters, and the loading rotation. Test this — it is an acceptance criterion, not a nicety.

---

## 6. Responsiveness — the hard requirement

The site must be flawless from **320px to 2560px**, with zero horizontal overflow at any width, at any zoom level up to 200%.

Design and verify at these exact widths: **320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560**.

- **Fluid over breakpoints.** Type, spacing, and container padding use `clamp()` and interpolate continuously. Breakpoints only change *layout topology* (column count, nav pattern, table→card), never a stack of hardcoded font sizes.
- **Container queries** for every card, work tile, stat block, and dashboard row — a component must lay itself out from its own width, not the viewport's. This is what makes the dashboard's table→card transition free.
- **Touch targets** ≥ 44×44px on coarse pointers. Increase spacing, do not shrink hit areas.
- **Safe areas.** `env(safe-area-inset-*)` on the sticky nav, any bottom sheet, and the mobile dashboard action bar. Use `100dvh`, never `100vh`.
- **Landscape phones** (430×932 rotated) must not trap content behind the nav.
- **Images.** `next/image` everywhere with explicit `sizes`, correct `priority` on the LCP image only, `blur` placeholders, AVIF/WebP.
- **Text never overflows.** `min-width: 0` on flex children, `overflow-wrap: anywhere` on user-generated strings, `text-overflow: ellipsis` with a `title` attribute on truncated table cells.
- **No fixed pixel heights** on anything containing text.

---

## 7. Accessibility and performance — non-negotiable

**WCAG 2.2 AA.** Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI boundaries — verify the muted ink and the gradient-on-canvas combinations with a contrast checker, do not eyeball them. Visible `:focus-visible` ring: 2px `--signal-to` plus a 2px canvas-colored offset ring so it reads on any surface. Full keyboard operation for the modal, command palette, dropdowns, drag-and-drop (keyboard reorder alternative required), and the data table. Semantic landmarks, one `h1` per page, correct heading order, `aria-live="polite"` on status changes and toasts, `aria-busy` during optimistic updates. Real `<table>` semantics for the dashboard grid — not divs with roles.

**Performance budgets:** LCP < 2.0s, CLS < 0.05, INP < 200ms on a mid-tier Android over 4G. Server Components by default; client boundaries only at genuine interaction islands (keep the existing `.client.tsx` discipline). Marketing route JS budget: 130KB gzipped. Fonts preloaded and subset. No animation library on the critical path for the hero — the entrance sequence is CSS. Route-level code splitting for the dashboard so it never ships to marketing visitors.

---

## 8. The marketing site

Stack, unchanged: **Next.js 16.1.6 App Router, React 19.2.3, TypeScript 5, Tailwind CSS 4, shadcn/ui (New York), Radix UI, Framer Motion 12, next-themes, lucide-react.** Keep the typed content model in `lib/marketing-content.ts` — extend its types, do not scatter copy into components. Keep the server-first composition and the `robots.ts` / `sitemap.ts` setup.

Section order and intent:

1. **Nav** — logo lockup, four links (Work, Team, Services, Contact), theme toggle, "Request a call" CTA. *(The current nav ships Work / Team / Use Cases / Contact with Services, Process, and Insights commented out — restore Services to the nav and leave the rest reachable by scroll and footer links.)* Mobile: sheet with the trace motif as the divider.
2. **Hero** — declarative headline, one-sentence support line, three concrete capability lines, two CTAs, "Germany + Egypt" footnote. The ambient tiles stay but become nodes on the signal trace with individual parallax, instead of free-floating cards. **Fix the city labels:** they currently read Berlin / Cairo / Munich, and no one on the team is in Berlin. Use **Cairo · Munich · Ulm** alongside the capability tiles (SPFx Portals, RAG, Web Apps, Systems).
3. **Work** — the strongest section, first after hero. Four case study cards → shared-element modal with problem / solution / impact, stack chips, image carousel, CTA. Asymmetric grid: feature the EVIM case at 2× width on desktop.
4. **Services** — six capabilities, each with three concrete bullets. Present as a dense bordered grid, not floating cards — hairlines doing the work.
5. **Use cases** — six audience blocks with named outcomes. Compact.
6. **Process** — five steps. Render them *on* the signal trace as sequential nodes, drawn as you scroll. This is where the motif pays off.
7. **Team** — four members with role, base, and specialties. Two-hub map with Germany and Egypt as pulsing trace nodes and a connecting arc that draws on view.
8. **Insights** — three delivery notes. Keep the existing entries; make the cards editorial, mono metadata line.
9. **FAQ** — five questions, Radix accordion, trace-styled expand indicator.
10. **Contact / footer** — direct CTA, `hello@coditu.com`, the two contact lines, full lockup, copyright.

**Imagery rule:** no stock photography of people, anywhere. Use product screenshots, architecture diagrams, abstract system geometry, and the trace motif. This is both a taste decision and a practical one — real screenshots of real work sell a software house; stock photos of smiling strangers actively undermine it.

**SEO:** per-route metadata, OG and Twitter cards from the new brand assets, JSON-LD `Organization` and `WebSite` schema, canonical URLs from `NEXT_PUBLIC_SITE_URL`, updated `sitemap.ts` and `robots.ts`, meaningful `alt` on every image.

---

## 9. The internal dashboard

An authenticated area at **`/app`** in the same Next.js project, for running Coditu's own sprints. It replaces the Notion board the team uses now.

**Design goal: Linear's restraint, not Jira's surface area.** Every field below exists because the team already uses it. Add nothing else. If a feature is not in this spec, it is out of scope — no epics, no story points, no workflows engine, no custom fields, no roadmap, no reporting suite.

### 9.1 Data model — Supabase (Postgres + Auth + Storage)

Write real SQL migrations under `supabase/migrations/`. Every table gets RLS enabled; there are no exceptions and no `USING (true)` policies on write.

**Enums**

```sql
create type app_role          as enum ('admin','lead','engineer');
create type sprint_status     as enum ('planned','active','closed');
create type work_item_status  as enum ('draft','todo','dev_started','ready_for_peer_review','in_review','changes_requested','done','blocked');
create type work_item_type    as enum ('story','change_request','bug_fix','chore','spike');
```

**Tables**

- `profiles` — `id uuid pk references auth.users on delete cascade`, `full_name`, `initials`, `avatar_url`, `role app_role not null default 'engineer'`, `weekly_capacity_hours numeric(4,1) default 40`, `is_active bool default true`, timestamps. Populated by an `on auth.users insert` trigger.
- `projects` — `id`, `name`, `client_name`, `accent_hex`, `is_archived bool default false`, timestamps. *(One small table now; without it, adding a second client later means a painful migration.)*
- `sprints` — `id`, `project_id fk`, `number int not null`, `name text not null`, `starts_on date`, `ends_on date`, `goal text`, `notes text` (markdown — this holds the sprint-level instructions the team writes today), `status sprint_status default 'planned'`, `created_by`, timestamps. `unique (project_id, number)`.
- `work_items` — `id`, `sprint_id fk on delete cascade`, `key text not null unique` (e.g. `COD-142`, from a per-project sequence), `title text not null`, `description text` (markdown), `status work_item_status default 'todo'`, `type work_item_type default 'story'`, `assignee_id fk profiles null`, `reviewer_id fk profiles null`, `deadline date`, `estimate_hours numeric(5,2)`, `hours_logged numeric(6,2) not null default 0` (denormalised rollup, trigger-maintained), `grouping smallint null`, `order_index int not null`, `closed_at timestamptz`, timestamps.
- `acceptance_criteria` — `id`, `work_item_id fk on delete cascade`, `body text`, `is_done bool default false`, `order_index int`. *(The team writes ACs as checklists today — first-class, not buried in the description.)*
- `time_entries` — `id`, `work_item_id fk`, `profile_id fk`, `hours numeric(5,2) not null check (hours > 0 and hours <= 24)`, `worked_on date not null default current_date`, `note text`, `created_at`.
- `comments` — `id`, `work_item_id fk on delete cascade`, `author_id fk`, `body text` (markdown), timestamps, `deleted_at`.
- `attachments` — `id`, `work_item_id fk`, `storage_path`, `file_name`, `mime_type`, `bytes int`, `uploaded_by`, `created_at`.
- `activity` — `id`, `work_item_id fk`, `actor_id`, `verb text`, `field text`, `from_value text`, `to_value text`, `created_at`. Written by triggers on status, assignee, reviewer, and deadline changes.

**Hours: log entries, read a rollup.** `hours_logged` on `work_items` is maintained by an `after insert/update/delete` trigger on `time_entries`. This gives you the single number the table needs *and* per-person, per-day breakdowns for the burn chart, without an aggregate query on every render. Explain this choice in a migration comment.

**Indexes:** `work_items(sprint_id, order_index)`, `work_items(assignee_id) where status <> 'done'`, `work_items(reviewer_id) where status = 'ready_for_peer_review'`, `time_entries(work_item_id)`, `time_entries(profile_id, worked_on)`, `comments(work_item_id, created_at)`, `activity(work_item_id, created_at desc)`.

**Views:** `v_sprint_summary` (per sprint: item count, count by status, total estimate, total logged, days remaining) and `v_person_load` (per profile per sprint: assigned count, review queue count, hours logged).

### 9.2 Auth and RLS

Supabase Auth, **email + password with magic-link fallback**, sign-up locked to an allowlist. Implement the allowlist as an `allowed_emails` table checked by a `before insert on auth.users` trigger that raises on a miss — not as a client-side check. No public sign-up.

Session handling via `@supabase/ssr` with cookie-based sessions. Next.js `middleware.ts` guards `/app/*`: unauthenticated → `/login?next=…`. Server Components read the session server-side; never trust a client-held role.

RLS policies, stated plainly:

- **Read:** any authenticated profile with `is_active = true` reads all rows in every table. Small team, full transparency.
- **`sprints`, `projects`:** insert / update / delete restricted to `admin` and `lead`.
- **`work_items`:** insert and delete restricted to `admin` and `lead`. Update allowed for `admin` and `lead` on any field; an `engineer` may update **only** `status`, `order_index`, and `acceptance_criteria` completion, and **only** on items where they are the `assignee_id` or `reviewer_id`. Enforce the column restriction with a trigger that rejects changes to protected columns rather than trying to express it in a policy alone.
- **`time_entries`:** a profile may insert, update, and delete only rows where `profile_id = auth.uid()`. Admins may delete any.
- **`comments`:** author may update or soft-delete their own; admin may soft-delete any; nobody hard-deletes.
- **`attachments` + storage bucket `work-attachments`:** authenticated read; insert by any active profile; delete by uploader or admin. Bucket is private; serve via signed URLs with a 1-hour TTL.
- **`activity`:** read-only to everyone; written by triggers with `security definer`.

Write a `supabase/tests/rls.sql` file that asserts each of these — including the negative cases (engineer cannot reassign, user cannot delete another's time entry).

### 9.3 Mutations

All writes go through **Next.js Server Actions**, each one: `zod`-validated input → server-side authorization re-check → Supabase call → `revalidatePath` / `revalidateTag`. Never mutate from the client with the anon key directly.

Optimistic UI on status change, assignee change, checklist toggle, and drag reorder via `useOptimistic`, with **rollback plus an error toast** on failure. Realtime via Supabase Postgres Changes subscribed to `work_items` and `comments` for the active sprint, so two people on the board see each other's moves.

### 9.4 Routes and screens

```
/login                                  email+password, magic-link fallback, brand-forward split layout
/app                                    → redirect to the active sprint
/app/sprints                            all sprints, grouped by project, status chips, hours logged vs estimated
/app/sprints/[number]                   sprint view — default Table, toggle to Board
/app/sprints/[number]/items/[key]       item detail (intercepted as a modal over the table via a @modal
                                        parallel route + (.)items/[key]; a hard navigation renders the
                                        full page — this is the single best App Router flourish here)
/app/my-work                            assigned to me + awaiting my review + my hours this week
/app/people                             team load: assigned, review queue, hours logged vs capacity
/app/settings                           profile, allowlist (admin only), project management (admin only)
```

**App shell.** Left rail, 64px icon-only, expanding to 240px on hover or pin, state persisted. Top bar: project + sprint switcher (`⌘K`-searchable), global search, user menu, theme toggle. The loading indicator is the rotating Coditu mark — nothing else.

**Sprint header.** Sprint name and number, date range with days remaining, a horizontal stacked bar of status distribution (each segment a status color, hover to reveal counts), total hours logged against total estimated, member avatars with per-person load on hover, and the sprint `notes` markdown in a collapsible panel — that panel is where the team's sprint instructions live, and it should look like a written note, not a form field.

**Table view** (the default — it is what the team actually uses):

Columns: **Task · Status · Hours · Assignee · Reviewer · Deadline · Type · Grouping**

- Sticky header. Sticky Task column on ≥1280px. Row height 52px, comfortable/compact toggle.
- **Grouping** is a small integer that marks items sharing logic or UI — the team's convention is that one developer takes a whole group. Render it as a 3px colored left border on the row plus a very subtle row tint of the same hue (≤6% alpha), with the number in a mono chip in the last column. Deterministic hue per grouping value. Rows in the same group visually cohere without being nested — do not build a tree.
- **Status** and **Type** are colored chips with `:` mono labels. Status chip is a click-to-open Radix popover with keyboard-navigable options and an optimistic write.
- **Assignee / Reviewer** are avatar + name, click to reassign via a searchable popover (admin/lead only — engineers see it read-only, and the control is *disabled with a tooltip*, not hidden).
- **Hours** shows `logged` with `estimate` in faint ink beside it (`7.5 / 8`). Over-estimate turns amber, not red — running long is information, not failure.
- **Footer row** pins to the bottom of the table with the column sum, exactly as the team's current board shows `SUM 16`. Tabular numerals.
- Sort by any column; filter by status, type, assignee, reviewer, grouping; a free-text search across title and description. Filter state lives in the URL (`?status=todo,dev_started&assignee=…`) so views are shareable and survive reload.
- Drag to reorder within the sprint (`dnd-kit`), persisting `order_index`. **Keyboard alternative required:** focus a row, `Space` to lift, arrows to move, `Space` to drop, `Esc` to cancel — announced via `aria-live`.
- Row hover: background lifts one step and a right-edge action cluster fades in (open, log time, copy link).
- Empty state, skeleton rows matching final height exactly, and an error boundary with a retry.

**Board view.** Columns by status, cards showing key, title, assignee avatar, hours, type chip, grouping band, AC progress (`3/5`). Drag between columns writes status optimistically. Columns collapse; horizontal scroll with snap on narrow screens.

**Item detail.** Two-column on desktop, single scroll on mobile.

- Left: `key` in mono, editable title, markdown description with rendered images, **acceptance criteria checklist** with a circular progress ring in the header, attachment gallery with a keyboard-navigable lightbox, comment thread with markdown and `@`-mention autocomplete, and an activity feed at the bottom in faint mono.
- Right: properties panel — status, type, assignee, reviewer, deadline, estimate, grouping — each inline-editable, each write optimistic.
- A **Log time** control: hours stepped in 0.5 increments, date defaulting to today, optional note; below it, your entries on this item and a running total. Logging time is two clicks from anywhere.
- Markdown rendering must handle the team's existing content: `- [ ]` task lists, headings, embedded images, and bold-highlighted passages (their convention: a highlighted block means "discuss before implementing" — render highlights with a left amber rule and preserve them faithfully).

**Charts — exactly two, no more.** A sprint burn-up of cumulative hours logged per day against total estimate, and the status distribution bar already in the header. Both use the palette above, both have accessible text alternatives. Resist adding a third.

**Command palette (`⌘K` / `Ctrl+K`).** Jump to sprint or item, change status of the focused item, log time, assign, toggle theme, sign out. Fuzzy search over item keys and titles. This is the fastest path for everything and should feel instant.

**Mobile dashboard.** Below 744px the table becomes a stacked card list — title, status chip, avatars, hours, grouping band — driven by a container query, not a viewport breakpoint. Item detail opens as a full-height sheet with a drag handle. Filters live in a bottom sheet. A sticky bottom bar holds Log Time and New Item, respecting the safe-area inset. Everything must be one-thumb reachable.

### 9.5 Seed with real data

Seed the database with the team's actual **Sprint — Week 17** (project: *EVIM*, deadline `2026-08-23`, members Mohamed Tamer, Abdelrahman Elkhateeb, Ahmed Yehia). Sprint notes:

> Please work this sprint on the issues in the order they are sorted in. Stories with the same grouping are preferred to be implemented by the same developer because they overlap in some logic/UI. In the stories, there are highlighted sections, which means you need to discuss something before implementing — please reach out.

| # | Task | Status | Type | Grouping | Hours | Assignee | Reviewer |
|---|---|---|---|---|---|---|---|
| 1 | Add optional titles to all webparts | dev_started | story | — | 7.5 | Mohamed Tamer | Abdelrahman Elkhateeb |
| 2 | Tabs with Cards | ready_for_peer_review | change_request | — | 0.5 | Mohamed Tamer | Abdelrahman Elkhateeb |
| 3 | Tabs with Cards: height logic fix | ready_for_peer_review | bug_fix | 1 | 2 | Mohamed Tamer | Abdelrahman Elkhateeb |
| 4 | Link Kachel changes | ready_for_peer_review | change_request | 1 | 3 | Mohamed Tamer | Abdelrahman Elkhateeb |
| 5 | Newspart changes | todo | change_request | 2 | — | — | — |
| 6 | Banner News Mode | todo | change_request | 2 | — | — | — |
| 7 | Responsiveness for Link Kachel, Tabs with Cards, Newspart | ready_for_peer_review | story | — | 3 | Abdelrahman Elkhateeb | Mohamed Tamer |
| 8 | Unifying pill button: arrow and animation | todo | story | — | — | — | — |
| 9 | Banner Intranet Mode | todo | change_request | — | — | — | — |
| 10 | Rollover Contact Cards | todo | change_request | — | — | — | — |
| 11 | Calendar | draft | story | — | — | — | — |
| 12 | [React] Redakteurseite | draft | change_request | — | — | — | — |

Total logged: **16 hours** — the footer sum row must read `16`.

Give at least three items real acceptance criteria, e.g. for *Add optional titles to all webparts*:

> A unified optional title field on all webparts.
> - [ ] Each webpart has a "Show Title" ("Überschrift anzeigen") toggle at the very top of its settings
> - [ ] The toggle is on by default
> - [ ] When on, the title renders directly above the webpart
> - [ ] When `?Mode=Edit`, the title is editable inline from the webpart with the same options
> - [ ] Behaviour matches the standard SharePoint "Events" webpart title exactly

And for *Tabs with Cards: height logic fix*:

> When a 4th card has no description it wraps to a new row at a different height.
> - [ ] All Link Kachels share the same height, even across rows
> - [ ] Height is set by the Kachel with the most text
> - [ ] No min-height

Also seed one closed prior sprint so the sprint list and burn-up chart have something to show, and add a few comments and time entries with realistic dates.

### 9.6 Notion importer

Ship a small `/app/settings/import` tool that accepts a Notion CSV export and maps `Task → title`, `Status → status`, `Hours Worked → a single time entry`, `Assignee`/`Reviewer → profiles by name`, `Deadline → deadline`, `Story Type → type` (`CR: Change Request → change_request`, `Bug Fix → bug_fix`, `Story → story`), `Grouping → grouping`. Show a preview table with unmatched values flagged before committing. This is how they move off Notion in one afternoon.

---

## 10. Definition of done

Do not report finished until all of these hold:

- [ ] `npm run build` and `npm run lint` pass clean. TypeScript strict, zero `any`, zero suppressed errors.
- [ ] Zero horizontal scroll at 320, 360, 390, 430, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560 — verify each, do not assume.
- [ ] Full keyboard traversal of the site and app, including the modal, command palette, table, and drag reorder.
- [ ] `prefers-reduced-motion: reduce` produces a calm, fully functional interface with no transforms.
- [ ] Contrast verified with a tool for every text/background pair in both themes.
- [ ] Lighthouse ≥ 95 on Performance, Accessibility, Best Practices, SEO for the marketing route.
- [ ] Every RLS policy has a passing positive and negative test.
- [ ] The word "Strukture" appears nowhere in the repo — code, copy, metadata, README, or assets. The old assets (`public/logo.svg`, `logo-stripped.svg`, `logo-wordmark.png`, `logo-wordmark.webp`, `og.png`, `og/og.png`, `og/og-whatsapp.jpg`, `apple-touch-icon.png`) are deleted and replaced from `/public/brand/`.
- [ ] No fabricated testimonials, metrics, client counts, or logos anywhere.
- [ ] Brand assets exported and documented; the logo is legible and correct at 20px.
- [ ] `.env.example` lists every variable; secrets never reach the client bundle; `SUPABASE_SERVICE_ROLE_KEY` is used only in server-only modules.
- [ ] README rewritten for Coditu: setup, Supabase migration and seed commands, environment variables, architecture notes, and the brand usage summary.

## 11. Anti-patterns — reject on sight

Purple-to-pink gradients. Glassmorphism everywhere. Generic hero with a centered headline and two stock-photo columns. Emoji as icons. Rounded-everything with no radius hierarchy. Bouncy spring animations on non-interactive elements. Parallax that fights scroll. Scroll-jacking. Autoplaying carousels. Cookie-banner-shaped CTAs. A dashboard that clones Jira's information density. Feature bloat in the app. Skeleton loaders whose dimensions differ from the loaded content. Placeholder lorem ipsum surviving to the final build. Any copy that could appear verbatim on a thousand other software-house sites.

The measure of success is simple: a technical buyer lands on the site, and within eight seconds understands precisely what Coditu builds, sees proof, and believes these people ship. Then the team opens `/app` on Monday morning and closes Notion for good.

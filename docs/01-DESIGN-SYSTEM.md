# 01 — Design system

Extracted from `design/project/*.dc.html`. **Every number here is the spec.** Components read tokens;
no component hardcodes a hex.

Where the bundle's own `assets/brand/README.md` and its executable `palette()` function disagree, the
function wins — it is what actually renders, and it agrees with the implementation brief §3. The two
known drifts are noted inline.

---

## 1. Colour tokens

Ship `palette(theme, 0)` from `Coditu App.dc.html`. The prototype's `brightness` prop is a
**design-tool control and does not ship** — it lerps the canvas toward a lighter value so the designer
can preview mid-brightness screens. `brightness = 0` is the canonical token set.

### Dark — the primary canvas

```css
--canvas:          #07090E;
--raised:          #0C1119;
--overlay:         #111826;
--hairline:        rgba(255,255,255,.07);
--hairline-strong: rgba(255,255,255,.13);
--ink:             #EDF1F7;
--ink-muted:       #93A0B4;
--ink-faint:       #7C899C;
--accent:          #21E2C6;
--scrim:           rgba(7,9,14,.72);
```

### Light

```css
--canvas:          #EBEFF6;
--raised:          #F8FAFC;
--overlay:         #FFFFFF;
--hairline:        rgba(11,14,20,.10);
--hairline-strong: rgba(11,14,20,.18);
--ink:             #0B0E14;
--ink-muted:       #52607A;
--ink-faint:       #5F6B80;
--accent:          #1E4AE0;
--scrim:           rgba(11,14,20,.45);
```

> **Drift 1.** `assets/brand/README.md` says light canvas `#F7F9FC`. That is the value from the earlier
> revamp brief; `palette()` and implementation brief §3 both say `#EBEFF6`. Ship `#EBEFF6`.

### Brand — identical in both themes

```css
--signal-from: #2B57FF;
--signal-to:   #21E2C6;
--signal:      linear-gradient(135deg, #2B57FF, #21E2C6);
```

The gradient appears on **at most three elements per viewport**, never behind body text, never as a
full-page wash. Everything else is ink on canvas separated by hairlines.

### Functional

```css
--amber: #FFB020;  --rose: #FF5F6D;  --jade: #23C97F;  --slate: #6B7A90;
```

Functional colour is for status and warnings only, never decoration.

---

## 2. Chip text is a themed pair, not one hue

A value tuned for paper drops to ~2.4:1 on the dark canvas. Every status carries a light **and** a dark
`fg` / `bg`. Source: the `STATUS` map in `Coditu App.dc.html`.

| token | label | light fg | light bg | dark fg | dark bg |
|---|---|---|---|---|---|
| `draft` | draft | `#52607A` | `rgba(107,122,144,.14)` | `#9AA7BB` | `rgba(147,160,180,.16)` |
| `ready` | ready | `#3F4C63` | `rgba(107,122,144,.16)` | `#AEBACD` | `rgba(147,160,180,.16)` |
| `in_progress` | in progress | `#183FBF` | `rgba(43,87,255,.12)` | `#89A7FF` | `rgba(43,87,255,.22)` |
| `in_peer_review` | peer review | `#7A4F00` | `rgba(255,176,32,.18)` | `#FFC24D` | `rgba(255,176,32,.18)` |
| `in_qa` | in qa | `#0B6B5C` | `rgba(33,226,198,.18)` | `#4FE9D2` | `rgba(33,226,198,.16)` |
| `changes_requested` | changes req. | `#A81F2C` | `rgba(255,95,109,.14)` | `#FF9AA2` | `rgba(255,95,109,.18)` |
| `done` | done | `#0E6B4B` | `rgba(35,201,127,.18)` | `#63E3A9` | `rgba(35,201,127,.16)` |
| `blocked` | blocked | `#A81F2C` | `rgba(255,95,109,.20)` | `#FF9AA2` | `rgba(255,95,109,.22)` |

The chip **label is not the enum value** — `in_progress` renders as `in progress`,
`in_peer_review` as `peer review`, `changes_requested` as `changes req.`. These are the in-app
labels. The **client-facing PDF uses a different set entirely** — see `04-EXPORT-SPEC.md`.

### Tones

Same pattern, for any non-status chip:

| tone | light fg | light bg | dark fg | dark bg |
|---|---|---|---|---|
| `amber` | `#7A4F00` | `rgba(255,176,32,.18)` | `#FFC24D` | `rgba(255,176,32,.18)` |
| `jade` | `#0E6B4B` | `rgba(35,201,127,.18)` | `#63E3A9` | `rgba(35,201,127,.16)` |
| `slate` | `#3F4C63` | `rgba(107,122,144,.14)` | `#AEBACD` | `rgba(147,160,180,.16)` |

Standalone amber **text** (over-estimate hours, near deadline, days-left pill) is
`{ light: "#7A4F00", dark: "#FFC24D" }`.

---

## 3. Grouping hues

Deterministic per integer — the same integer always reads the same:

```
1 → #5B8CFF     2 → #12A594
```

Extend with a **stable hash**, never a random or index-based pick.

The hue lives on the **3px left border and the ≤6% row tint only**. The number itself renders in
`--ink`, because an 11px label in the hue never clears 4.5:1.

| surface | grouping 1 | grouping 2 | none |
|---|---|---|---|
| row tint | `rgba(91,140,255,.05)` | `rgba(18,165,148,.05)` | `transparent` |
| sticky cell bg — light | `#F4F7FE` | `#F2F9F8` | `var(--raised)` |
| sticky cell bg — dark | `#111827` | `#0F1A1C` | `var(--raised)` |
| chip bg | `rgba(11,14,20,.04)` light / `rgba(255,255,255,.06)` dark | same | `transparent` |
| chip border | the hue | the hue | `var(--hairline)` |
| chip text | `var(--ink)` | `var(--ink)` | `var(--ink-faint)` |

**Sticky-cell backgrounds are opaque and pre-mixed per group.** A translucent sticky column goes
see-through over a tinted row as it scrolls — that is the reason these four hexes exist.

---

## 4. Type

**Satoshi** (Fontshare, 400/500/700/900) self-hosted via `next/font/local`.
**JetBrains Mono** (400/500/600) via `next/font/google`.

Mono carries **every** key, timestamp, count, metric, and status label. Fallback if self-hosting
Satoshi is blocked: **Instrument Sans**. Never substitute anything else.

`font-variant-numeric: tabular-nums` on every number that sits in a column or updates in place.

### Marketing — fluid, `clamp()` on every step

```css
--text-display: clamp(2.75rem, 1.6rem + 5.2vw, 6rem);      /* 1.02, -0.035em */
--text-h1:      clamp(2rem,    1.4rem + 2.2vw, 3rem);
--text-h2:      clamp(1.75rem, 1.3rem + 1.9vw, 2.5rem);    /* 1.15, -0.022em */
--text-h3:      clamp(1.5rem,  1.2rem + 1.2vw, 2rem);
--text-h4:      clamp(1.25rem, 1.1rem + 0.7vw, 1.5rem);    /* 1.25, -0.015em */
--text-body:    clamp(1rem,    0.96rem + 0.18vw, 1.125rem);/* 1.6, -0.005em */
```

Body copy caps at `68ch`. Display headlines cap at `18ch`.

Section rhythm, also fluid: `clamp(48px, 7vw, 104px)` and `clamp(56px, 6vw, 96px)` between sections;
`clamp(24px, 4vw, 64px)` / `clamp(40px, 5vw, 72px)` inside them; gutters `clamp(20px, 3vw, 40px)`.

### App — fixed steps, because density is the point

| px | Use |
|---|---|
| 26 | sprint name, the `{logged} / {estimated} h` metric — `-0.024em` |
| 22 | empty-state / section h1 — `-0.022em` |
| 19 / 18 | panel headings |
| 15.5 / 15 | item detail title, body |
| 14.5 | rail labels |
| 14 / 13.5 | control text, table cells, buttons |
| 13 / 12.5 | secondary text, code blocks (12.5 / 1.6) |
| 12 | mono metadata |
| 11.5 / 11 | mono keys, counts, chips |
| 10.5 / 10 | mono uppercase eyebrows — `0.06em`–`0.07em`, `text-transform: uppercase` |
| 9.5 / 9 | the smallest mono labels |

Weights: 500 (default UI), 600 (primary buttons, emphasis), 700 (headings). Uppercase mono eyebrows
carry `letter-spacing: 0.06em`; the tightest display tracking is `-0.024em`.

App container padding is `clamp(16px, 2vw, 28px)`.

---

## 5. Geometry and elevation

**Radii:** `6` chips · `10` inputs and buttons · `12` inner panels · `14` cards ·
`16` list sections · `20` top-level sections and modals · `999` pills.
(`2` and `4` also appear, for the 8px accent squares and the focus ring.)

**Fixed dimensions:**

| element | value |
|---|---|
| Rail | `72px` collapsed → `240px` expanded |
| Topbar | `60px` |
| Row height | `52px` comfortable / `44px` compact |
| Control height | `34px` (topbar) / `38px` (buttons in body) |
| Nav button height | `44px` |
| Avatar | `30px` header / `26px` rail |
| Status bar | `10px` tall, `999px` radius |
| Item detail | `max-width: 1080px`, columns `minmax(300px, 1fr)` |
| Export dialog | `max-width: 1000px` |
| Project menu | `340px` |
| Sprint header columns | `repeat(auto-fit, minmax(280px, 1fr))`, gap `28px` |
| Burn-up chart | `viewBox="0 0 300 108"` |
| AC progress ring | `r=15`, `stroke-dasharray="94.2"` |

**Elevation is hairline + background step.** The only shadow in the system is
`0 24px 64px -24px rgba(0,0,0,.45)` on overlays (`.35` on the lighter project menu). No inner shadows,
no neumorphism, no glass except the modal scrim.

**Scrim:** `var(--scrim)` plus `backdrop-filter: blur(10px)`.

**Gap scale, in observed frequency order:** `10, 8, 12, 20, 14, 6, 7, 11, 16, 4, 18, 24, 28`.
The 8px grid holds; the odd values are optical corrections inside chips and pills.

---

## 6. Motion

The house effect is a **blur fade-in**: content arrives from slightly below, out of focus, and
resolves. Not a subtle 10px nudge — a visible resolve. One primitive, `<Reveal>`, one hook,
`useReveal`, everything routed through them.

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

| tier | where |
|---|---|
| `section` | route entrance, sprint header, table body on first paint, each marketing section on scroll-in. Children stagger at `base`. |
| `surface` | item detail modal, export dialog, command palette, project switcher, every popover. The prototype's `.rise` (240ms / 10px) **upgrades to this tier**: keep the 10px, add the 8px blur, take it to 320ms. |
| `micro` | status chip changes, checkbox ticks, hover elevation, filter pills, realtime comment inserts. **No blur.** |

**Backdrops:** scrim fades `0 → 1` while `backdrop-filter` goes `blur(0) → blur(10px)` over 240ms. The
modal panel enters one frame behind the scrim so it reads as arriving *through* it.

### The blur performance rule

`filter: blur()` forces an offscreen composite pass every frame.

- Set `will-change: filter, transform, opacity` when the animation starts and **remove it on
  completion**. A permanent `will-change` pins a layer and costs memory for nothing.
- Never blur-animate an element taller than ~40vh, and never one containing an above-the-fold image.
  Blur its *container's children* in a stagger instead of the whole block.
- **Blur only on entrance.** Never on exit, never on hover, never on a scroll-linked value.
- **Table rows:** blur-reveal the `<tbody>` once on mount as a single group. Never per-row on filter,
  sort, or realtime update — those get `micro` opacity only, or the table visibly hitches.

Scroll-linked motion (the marketing signal trace) drives `stroke-dashoffset` through
`useScroll` + `useTransform` with `will-change: transform`. Never a `filter` on a scroll-linked value.

### Prototype keyframes, carried over

| name | value |
|---|---|
| `cd-spin` | `to { transform: rotate(360deg) }` · 1.4s linear infinite · `transform-box: view-box` · `transform-origin: 16px 16px` |
| `cd-word` | `opacity 0→1`, `translateY(0.6em)→0`, `blur(8px)→0` · 620ms `entrance` — hero, per word, 45ms stagger |
| `cd-rise` | `opacity 0→1`, `translateY(14px)→0` · 520ms `entrance` (site) / 240ms 10px (app `.rise`) |
| `cd-draw` | `stroke-dashoffset: var(--len,1200) → 0` · 1100ms `entrance` — the signal trace |
| `cd-pulse` | `opacity 1→.45`, `scale(1)→(1.35)` · 3.2s ease-in-out infinite · `transform-box: fill-box` — trace nodes |

The app's **only** spinner is the rotating Coditu mark.

### Reduced motion

`prefers-reduced-motion: reduce` sets every tier to `{ y: 0, blur: 0, duration: 0.12 }`, freezes the
trace at full draw, and stops the spinner rotation. **One check, one place, applied globally** — never
re-implemented per component.

---

## 7. The mark

**Aperture C** — one tapered stroke on a 32×32 grid, 284° clockwise from +38°, path radius 11,
terminals cut on the radial with a `w/2` round.

Shipped variant: **76° aperture, taper 2.0 → 4.0, node inset 0.6 (r 1.6)** — chosen because it is the
variant that survives 20px. The rejected 60° and 46° variants are documented in
`design/project/Coditu Brand.dc.html`.

The arc carries the cobalt→aqua gradient at 135°; the node in the aperture is solid `#21E2C6`. The node
is the same object as the signal trace on the site and the spinner in the app.

**Three motion states, one object** — all transform / opacity / dashoffset only, all no-ops under
reduced motion:

1. **Draw-on** — 900ms `cubic-bezier(0.16,1,0.3,1)`, then the node scales in from 0 with a 60ms
   overshoot. Once, on first paint of the hero.
2. **Hover (navbar)** — the node travels 300° along the arc and settles back at the gap, 600ms.
   `offset-path` where supported, `<animateMotion>` fallback.
3. **Loading** — `cd-spin`, 1.4s linear, node pulses opacity.

**Wordmark:** Satoshi Bold, tracking `-0.02em`, lowercase `t` shortened 6% so it sits under the cap
line. The mark's node aligns optically with the x-height of the `o`. Lockup gap = 0.42× mark height.

**Rules.** Clear space 0.5× mark height on all sides. Minimum sizes: mark 20px, lockup 96px wide. Never
recolour the gradient or reverse its direction; never outline, stretch, rotate, or add a shadow. Never
place the gradient mark on a busy photograph — use a mono variant.

### Assets in `public/brand/`

| File | Use |
|---|---|
| `mark.svg` | Primary mark, cobalt→aqua at 135° |
| `mark-mono-light.svg` | One colour `#EDF1F7` — dark backgrounds, photography |
| `mark-mono-dark.svg` | One colour `#0B0E14` — light backgrounds, print, partner sheets |
| `icon.svg` | Mark on a `#07090E` rounded square, 0.82 scale — app icons, favicons |
| `lockup-horizontal.svg` / `lockup-stacked.svg` | Mark + wordmark |
| `lockup-*-mono.svg` | Same lockups using `currentColor` |

**Still to render at build time** from these sources: `favicon.ico` (16/32/48),
`apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`og.png` (1200×630), `og-square.jpg` (1200×1200). OG compositions are designed in
`Coditu Brand.dc.html` §06.

The lockup SVGs reference `Satoshi` **by name** — they render correctly only where the font is
installed or embedded. Export outlined copies for third-party use.

`public/clients/evim.svg` is a third-party mark. See `00-CONTEXT.md` for where it may and may not
appear.

---

## 8. Accessibility contract

WCAG 2.2 AA, verified with a tool, not by eye.

**Measured contrast — must not regress:**

| | dark canvas | light canvas |
|---|---|---|
| `ink` | 17.6:1 | 18.4:1 |
| `ink-muted` | 7.4:1 | 6.0:1 |
| `ink-faint` | 5.6:1 | 5.0:1 |
| aqua `#21E2C6` | 12.1:1 | — |
| cobalt `#2B57FF` | 3.7:1 — **UI boundaries only, never text** | — |

`ink-faint` carries mono metadata — keys, timestamps, counts, specialties — so it is held at **AA in
both themes**, not treated as decoration. The earlier `#5C6779` / `#7A8699` pair measured 3.5:1 and was
retired; do not reintroduce it.

> **Drift 2.** The revamp brief and some older copy list dark `--ink-faint` as `#5C6779`. The shipped
> value is `#7C899C`.

**The rest of the contract:**

- `:focus-visible` — 2px `--accent` plus a 2px canvas-coloured offset ring so it reads on any surface.
  `outline-offset: 2px`, `border-radius: 4px`.
- Full keyboard operation: modal, palette, popovers, table, drag reorder, lightbox, composer, mention
  list.
- Real `<table>` semantics — `<th scope="col">`, never a div with a role. One `h1` per page. Correct
  heading order. Landmarks.
- `aria-live="polite"` on status changes, toasts, drag announcements, and realtime inserts.
  `aria-busy` during optimistic writes.
- Charts carry `role="img"` and an `aria-label` naming the **actual series values**.
- Every icon-only control has an `aria-label`; every truncated cell has a `title`.
- `prefers-reduced-motion` produces a calm, fully functional interface.
- Zero horizontal scroll at 320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560 — and
  at 200% zoom. Touch targets ≥ 44px on coarse pointers. `100dvh`, never `100vh`.
  `env(safe-area-inset-*)` on the rail, sheets, and the mobile action bar.
- Component layout comes from **container queries**, not viewport breakpoints — that is what makes the
  table → card transition free.
- `axe` assertions in the Playwright suite covering the sprint table, item detail, composer, and export
  dialog.

> **Note for verification.** Headless and in-app browsers report `pointer: fine`, so every
> `@media (pointer: coarse)` rule is inert there and touch-target measurements come back as desktop
> sizes. Replay the coarse rules into an injected `<style>` before measuring, or the check invents
> failures.

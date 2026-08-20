# Coditu brand assets

The mark is the **Aperture C**: one tapered stroke on a 32×32 grid, 284° clockwise from +38°, path radius 11, terminals cut on the radial with a w/2 round. The node in the aperture is the same object as the signal trace on the site and the rotating spinner in the app.

Shipped variant: **76° aperture, taper 2.0 → 4.0, node inset 0.6 (r 1.6)** — chosen because it is the variant that survives 20px. The two rejected variants (60° / 46°) are documented in `Coditu Brand.dc.html`.

## Files

| File | Use |
|---|---|
| `mark.svg` | Primary mark, cobalt→aqua gradient at 135° |
| `mark-mono-light.svg` | One colour `#EDF1F7` — dark backgrounds, photography |
| `mark-mono-dark.svg` | One colour `#0B0E14` — light backgrounds, print, partner sheets |
| `icon.svg` | Mark on a `#07090E` rounded square, 0.82 scale — app icons, favicons |
| `lockup-horizontal.svg` | Mark + wordmark, gap 0.42× mark height |
| `lockup-stacked.svg` | Mark over wordmark |
| `lockup-*-mono.svg` | Same lockups using `currentColor` |

Still to render from these sources at build time: `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `og.png` (1200×630), `og-square.jpg` (1200×1200). The OG compositions are designed in `Coditu Brand.dc.html` section 06.

## Wordmark

Satoshi Bold, tracking −0.02em, lowercase `t` shortened 6% so it sits under the cap line. The lockup SVGs reference `Satoshi` by name — they render correctly only where the font is installed or embedded. For third-party use, export outlined copies.

Fallback if self-hosting Satoshi is blocked: **Instrument Sans** (Google Fonts). Never substitute anything else.

## Rules

- Clear space: 0.5× mark height on all sides.
- Minimum sizes: mark 20px, lockup 96px wide.
- Never recolour the gradient or reverse its direction; never outline, stretch, rotate, or add a shadow.
- Never place the gradient mark on a busy photograph — use a mono variant.
- The gradient appears on at most three elements per viewport, never behind body text.

## Colour

```
canvas          #07090E     canvas-raised   #0C1119     canvas-overlay  #111826
ink             #EDF1F7     ink-muted       #93A0B4     ink-faint       #7C899C
signal          #2B57FF → #21E2C6
amber #FFB020   rose #FF5F6D   jade #23C97F   slate #6B7A90
```

Light mode: canvas `#F7F9FC`, ink `#0B0E14`, muted `#52607A`, faint `#5F6B80`. The signal gradient is identical in both themes.

Measured contrast on the dark canvas: ink 17.6:1, ink-muted 7.4:1, ink-faint 5.6:1, aqua 12.1:1, cobalt 3.7:1 (UI boundaries only, never text). Light canvas: ink 18.4:1, ink-muted 6.0:1, ink-faint 5.0:1.

ink-faint carries mono metadata — keys, timestamps, counts, specialties — so it is held at AA (≥ 4.5:1) in both themes rather than treated as decoration. The earlier `#5C6779` / `#7A8699` pair measured 3.5:1 and was retired.

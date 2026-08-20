export type CubicBezier = [number, number, number, number];

/**
 * The motion system. Three tiers, one primitive (`<Reveal>`), one hook
 * (`useReveal`). Everything routes through them — see docs/01-DESIGN-SYSTEM.md §6.
 *
 * The house effect is a blur fade-in: content arrives from slightly below, out
 * of focus, and resolves. Not a 10px nudge — a visible resolve.
 */

export const ease = {
  /** the default — decisive arrival */
  entrance: [0.16, 1, 0.3, 1] as CubicBezier,
  /** quick departure */
  exit: [0.55, 0, 1, 0.45] as CubicBezier,
  /** ambient float */
  drift: [0.32, 0.72, 0, 1] as CubicBezier,
  /** interactive */
  spring: { type: "spring", stiffness: 380, damping: 32, mass: 0.9 },
} as const;

export interface RevealTier {
  /** px travelled on entry */
  y: number;
  /** px of blur on entry — 0 means no offscreen composite pass at all */
  blur: number;
  /** seconds */
  duration: number;
}

export const reveal = {
  /** chips, tooltips, inline state, realtime inserts. No blur, ever. */
  micro: { y: 4, blur: 0, duration: 0.2 },
  /** popovers, menus, modal panels. The prototype's `.rise` upgrades to this. */
  surface: { y: 10, blur: 8, duration: 0.32 },
  /** route and section entrances. */
  section: { y: 18, blur: 14, duration: 0.52 },
} as const satisfies Record<string, RevealTier>;

export type RevealTierName = keyof typeof reveal;

/** Total stagger is capped at 0.6s regardless of child count. */
export const stagger = { tight: 0.045, base: 0.075, loose: 0.11 } as const;
export const STAGGER_TOTAL_CAP = 0.6;

/**
 * Under `prefers-reduced-motion: reduce` every tier collapses to this: no
 * travel, no blur, a 120ms opacity fade. One definition, applied globally —
 * never re-implemented per component.
 */
export const REDUCED: RevealTier = { y: 0, blur: 0, duration: 0.12 };

/** Cap the per-child delay so a long list still finishes inside 0.6s. */
export function staggerDelay(index: number, count: number, step: number = stagger.base): number {
  if (count <= 1) return 0;
  const capped = Math.min(step, STAGGER_TOTAL_CAP / (count - 1));
  return index * capped;
}

export function tierFor(name: RevealTierName, reducedMotion: boolean): RevealTier {
  return reducedMotion ? REDUCED : reveal[name];
}

export function cssBezier(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(",")})`;
}

/**
 * `filter: blur()` forces an offscreen composite pass every frame, so
 * `will-change` must be set when the animation starts and REMOVED when it
 * completes. A permanent `will-change` pins a compositor layer and costs
 * memory for nothing — see docs/01-DESIGN-SYSTEM.md §6.
 */
export function willChangeFor(tier: RevealTier): string {
  return tier.blur > 0 ? "filter, transform, opacity" : "transform, opacity";
}

/**
 * An element taller than this fraction of the viewport must never be
 * blur-animated as a single block; stagger its children instead.
 */
export const MAX_BLUR_VIEWPORT_FRACTION = 0.4;

"use client";

import { useId } from "react";

/**
 * The gradient progress ring, in one place.
 *
 * ## The bug this component exists to prevent
 *
 * `criteria-list.client.tsx` drew this inline with a hard-coded
 * `<linearGradient id="ringGrad">`. That is fine while exactly one ring exists
 * on a page. Put one on every row of a twelve-row sprint table — which is what
 * D2 of the thread brief asks for — and there are twelve elements sharing an
 * id: invalid HTML, and `url(#ringGrad)` resolves to whichever the browser saw
 * first. It would have looked *correct*, because every gradient is identical,
 * right up until somebody changed one of them.
 *
 * `useId()` gives each instance its own. `e2e/sprint-table.spec.ts` asserts
 * that a full table contains no duplicate gradient id.
 *
 * ## Why the number is still rendered as text beside it
 *
 * Because the ring cannot carry it on its own, and that is a measurement
 * rather than an opinion. The gradient's teal stop measures **1.36:1** against
 * a light surface — the default theme — so on a mostly-complete ring the tail
 * is invisible to anybody who is not looking hard. `role="img"` and an
 * `aria-label` cover a screen reader; they do nothing for low vision.
 *
 * So the count stays visible next to the ring on every surface, and the ring is
 * the at-a-glance shape rather than the sole carrier. That costs the sticky
 * Task column about 18px, which the thread brief asked it not to spend — this
 * is correctness winning over the brief, and it is recorded as such in
 * `docs/05-DECISIONS.md`.
 *
 * The tooltip mistake is worth restating anyway, because it is why the
 * `aria-label` is spelled out rather than left to a `title`: a finger cannot
 * open a tooltip, and that is already recorded in `06-PROGRESS.md` for
 * per-person sprint load.
 *
 * ## Reduced motion
 *
 * The `stroke-dashoffset` transition is dropped entirely rather than shortened.
 * The ring still renders at the right value — the animation was the affordance,
 * not the information.
 */

/** 2·pi·15, rounded — straight from the design bundle. */
const CIRCUMFERENCE = 94.2;

export function ProgressRing({
  done,
  total,
  size = 34,
  strokeWidth = 3,
  /**
   * The unfilled part. Defaults to `--ring-track`, which is a token computed
   * for this — 3.26:1 in light, 3.01:1 in dark, at the worst of the four
   * grouping-tint layers. A hairline measured 1.47:1 and was invisible.
   */
  trackColor = "var(--ring-track)",
  className,
}: {
  done: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  className?: string;
}) {
  const gradientId = useId();

  // Zero criteria renders nothing at all. An empty ring on every unscoped row
  // is twelve pieces of furniture saying "no information".
  if (total <= 0) return null;

  const complete = Math.min(Math.max(done, 0), total);
  const offset = (CIRCUMFERENCE * (total - complete)) / total;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      role="img"
      aria-label={`${complete} of ${total} acceptance criteria done`}
      className={className}
    >
      <circle cx="18" cy="18" r="15" fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        // Rotated so it starts at twelve o'clock rather than three.
        transform="rotate(-90 18 18)"
        className="[transition:stroke-dashoffset_320ms_var(--ease-entrance)] motion-reduce:transition-none"
      />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B57FF" />
          <stop offset="1" stopColor="#21E2C6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

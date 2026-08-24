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
 * ## Why the number is not only in a tooltip
 *
 * Because a finger cannot open a tooltip. That exact mistake is already
 * recorded in `06-PROGRESS.md` for per-person sprint load. The ring carries
 * `role="img"` and an `aria-label` that spells the count out, so a screen
 * reader and a touch device both get the information the ring encodes.
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
  /** The track has to clear AA against whatever it sits on, not against `--canvas`. */
  trackColor = "var(--hairline)",
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

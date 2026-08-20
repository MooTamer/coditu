import type { CSSProperties, ElementType, ReactNode } from "react";

import { stagger as staggerTokens, staggerDelay, type RevealTierName } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { RevealObserver } from "./reveal-observer.client";

export interface RevealProps {
  /** `section` for page and section entrances, `surface` for overlays, `micro` for inline state. */
  tier?: RevealTierName;
  /** Render as something other than a div — `section`, `li`, `tbody`. */
  as?: ElementType;
  /** Seconds of extra delay. Prefer `index`/`count` for lists. */
  delay?: number;
  /** Position within a staggered group. */
  index?: number;
  /** Size of the group. Required for `index`, so the total stays inside 0.6s. */
  count?: number;
  /** Stagger step. Defaults to `base` (0.075s). */
  step?: number;
  /**
   * Drop the tier's blur, keeping its travel and fade. For a group past the
   * ~40vh ceiling that cannot be split into staggered children — a table body,
   * which §4 requires to reveal as one group and never per row.
   */
  flat?: boolean;
  /** Hold until scrolled into view instead of animating on parse. */
  onView?: boolean;
  /** Re-animate on scroll-back. Off by default — reveals fire once. */
  repeat?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * The one entrance primitive. A Server Component — it ships no JavaScript
 * unless `onView` is set.
 *
 * The animation is CSS. That is a correctness decision, not a performance one:
 * a JS-driven reveal has to server-render its own hidden state, so the HTML
 * arrives with real content at `opacity: 0` and stays invisible until React
 * hydrates. Slow bundle, failed bundle, or a blocked script and the reader gets
 * a blank section — and the LCP element never paints. With CSS the resolve
 * starts at parse and finishes whether or not JS ever arrives.
 *
 * `will-change` is deliberately absent here. Browsers already promote an
 * element with a running transform/opacity/filter animation, and the hint's
 * only real use is warning *ahead* of an animation that has not started yet.
 * On a parse-time one-shot there is nothing to warn about, and a hint left
 * behind pins a compositor layer for the life of the page. `<RevealObserver>`
 * does set and clear it, because a scroll-triggered reveal genuinely does wait.
 *
 * Never wrap an element taller than ~40vh, and never one containing an
 * above-the-fold image. Stagger the container's children instead.
 */
export function Reveal({
  tier = "section",
  as,
  delay = 0,
  index,
  count,
  step = staggerTokens.base,
  flat = false,
  onView = false,
  repeat = false,
  className,
  style,
  children,
}: RevealProps) {
  const Component = (as ?? "div") as ElementType;

  const computedDelay =
    index !== undefined && count !== undefined ? delay + staggerDelay(index, count, step) : delay;

  const content = (
    <Component
      data-reveal={tier}
      data-reveal-flat={flat ? "" : undefined}
      data-reveal-on-view={onView ? "" : undefined}
      className={cn(className)}
      style={computedDelay ? { animationDelay: `${computedDelay}s`, ...style } : style}
    >
      {children}
    </Component>
  );

  return onView ? <RevealObserver repeat={repeat}>{content}</RevealObserver> : content;
}

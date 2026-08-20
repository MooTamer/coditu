import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The 1240px measure every section shares, with the site gutter. */
export function SiteContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1240px] px-[var(--site-gutter)]", className)}>
      {children}
    </div>
  );
}

/**
 * The numbered rule above every section.
 *
 * `flex-wrap` rather than a fixed row: at 320px the heading needs the full
 * measure and the meta drops beneath it, instead of squeezing the title to two
 * characters per line.
 */
export function SectionHead({
  n,
  title,
  meta,
  id,
}: {
  n: string;
  title: string;
  meta?: string;
  id: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-2 border-b border-hairline-strong pb-[22px]">
      <span className="font-mono text-xs tracking-[0.06em] text-accent">{n}</span>
      <h2
        id={id}
        className="min-w-0 text-h2 leading-[1.15] font-bold tracking-[-0.022em] text-balance"
      >
        {title}
      </h2>
      {meta ? <span className="ml-auto font-mono text-xs text-ink-faint">{meta}</span> : null}
    </div>
  );
}

/** A section at the site measure, anchored for the nav and the trace. */
export function SiteSection({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-trace-section={label}
      className={cn(
        "section-anchor py-[clamp(40px,5vw,80px)]",
        className
      )}
    >
      <SiteContainer>{children}</SiteContainer>
    </section>
  );
}

/**
 * The horizontal signal stroke used as a section rule and under the hero.
 * `cd-draw` resolves it once on first paint; reduced motion freezes it drawn.
 */
export function SignalRule({
  d = "M0 12 L470 12 C520 12 520 4 570 4 L1200 4",
  viewBox = "0 0 1200 24",
  length = 1200,
  className,
  gradientId,
}: {
  d?: string;
  viewBox?: string;
  length?: number;
  className?: string;
  gradientId: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      fill="none"
      aria-hidden
    >
      <path
        className="cd-draw"
        style={{ "--len": length } as React.CSSProperties}
        d={d}
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
        strokeDasharray={length}
      />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--signal-from)" />
          <stop offset="1" stopColor="var(--signal-to)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

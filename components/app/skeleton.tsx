import { cn } from "@/lib/utils";

/**
 * The pieces every `loading.tsx` under `/app` is built from.
 *
 * A skeleton here is not decoration and it is not a spinner. Every route in
 * this app is dynamic and none of them are prefetched — the measurement that
 * decided that is in `rail.client.tsx` — so on mobile latency a tap produced
 * nothing at all until the whole server render came back. What makes navigation
 * feel answered is a frame that arrives immediately and is the right *shape*:
 * the same gutter, the same row height, the same number of columns. The real
 * screen then replaces it in place instead of shoving it aside.
 *
 * So the rule for anything in this file: match the box, not the artwork. If the
 * real row is 52px tall inside a `rounded-list` card on `--raised`, the
 * skeleton row is 52px tall inside a `rounded-list` card on `--raised`.
 */

/** One grey bar. `w` accepts any CSS length — `"60%"`, `140`, `"12ch"`. */
export function Bar({
  w,
  h = 12,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn("cd-skeleton block", className)}
      style={{ width: w, height: h, ...style }}
    />
  );
}

/** A circle, for a face. */
export function Dot({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("cd-skeleton block rounded-pill", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The outer frame of every loading screen, matching the `<main>` each real page
 * renders — same flex column, same gap, same `--app-gutter`.
 *
 * `role="status"` with a name is the only thing here a screen reader is told
 * about; every bar inside is `aria-hidden`, because "twelve grey rectangles"
 * is not information. `aria-live` is deliberately absent: the fallback mounts
 * before the reader has moved, so announcing it would interrupt for something
 * that is about to be replaced anyway.
 */
export function LoadingScreen({
  label,
  children,
}: {
  /** What is on its way — "Loading the sprint", not "Loading". */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <main
      role="status"
      aria-label={label}
      data-loading-skeleton
      className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]"
    >
      {children}
    </main>
  );
}

/** The page title and its one-line description, at the size the real one is. */
export function HeaderSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <header className="flex flex-col gap-3">
      <Bar w={wide ? 220 : 160} h={wide ? 26 : 22} />
      <Bar w="min(52ch, 100%)" h={14} />
    </header>
  );
}

/**
 * A bordered card holding `rows` rows of a fixed height — the shape shared by
 * the projects list, both My work columns, and the People table.
 *
 * The rows are one element, painted by `.cd-skeleton-rows`. See the comment
 * beside it in `globals.css`: a fallback is serialized into the flight payload
 * of every page below its boundary, so an element here is an element on every
 * screen in the app, and forty of them measured as +44KB per page view.
 */
export function ListSkeleton({
  rows,
  rowHeight = 56,
  header = true,
  className,
}: {
  rows: number;
  rowHeight?: number;
  /** The card's own header strip, where a real list carries its label and count. */
  header?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]",
        className
      )}
    >
      {header ? (
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-[14px]">
          <Bar w={110} h={11} />
          <Bar w={28} h={11} className="ml-auto" />
        </div>
      ) : null}

      <Rows count={rows} height={rowHeight} />
    </div>
  );
}

/** The painted rows on their own, for a card that brings its own frame. */
export function Rows({ count, height = 52 }: { count: number; height?: number }) {
  return (
    <div
      aria-hidden
      data-skeleton-rows={count}
      className="cd-skeleton-rows"
      style={
        {
          "--skeleton-rows": count,
          "--row-h": `${height}px`,
        } as React.CSSProperties
      }
    />
  );
}

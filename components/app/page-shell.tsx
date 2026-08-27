import { cn } from "@/lib/utils";

/**
 * One `<main>`, one measure, fifteen surfaces.
 *
 * ## What this replaces, and why it is one component and not fifteen wrappers
 *
 * Every surface in `design/project/Coditu Workspace.dc.html` opens with an
 * explicit centred measure — `max-width: 1320px` on Home, `1520px` on the
 * sprint, `900px` on settings — and the build had two of them, both wrong, and
 * thirteen with none at all. A page with no measure is not neutral: it fills
 * whatever the sidebar leaves, which was 1157px of settings form at a 1440px
 * viewport and keeps growing with the monitor.
 *
 * The measures live here, in one table, keyed by surface. That is deliberate:
 * fifteen hand-written `max-w-[…]` wrappers is the shape the audit found, and
 * the reason it drifted is that nothing made the fifteen values comparable.
 * When the design changes a measure, it changes in one place and the diff says
 * which surface moved.
 *
 * ## The width is an inline custom property, not an interpolated class
 *
 * `max-w-[${n}px]` cannot work — Tailwind scans source text, so a computed
 * class name compiles to nothing and the element silently keeps its previous
 * width. `app/globals.css` already carries a long note about that failure mode
 * biting the sidebar. So the class is the static `max-w-[var(--measure)]` and
 * only the *value* is dynamic.
 *
 * ## `<main>` is part of the contract
 *
 * Four routes — Home, Trash, the sprint and its notes — rendered a bare `<div>`
 * and had no `main` landmark at all. Anything that uses this gets one.
 */

/**
 * Every surface's measure, read from the `max-width` on its root `div` in
 * `Coditu Workspace.dc.html`. The audit's V-A1 – V-A15.
 */
export const MEASURES = {
  /** `/app` — Workspace Home. Wide enough for the 320px right column. */
  home: 1320,
  /** `/app/projects/:slug/sprints/:n` — the sprint database. The widest surface. */
  sprint: 1520,
  /** Sprint notes. A reading measure, not a layout one. */
  notes: 860,
  /** `/app/my-work` */
  mywork: 1240,
  /** `/app/projects` */
  projects: 1320,
  /** `/app/projects/:slug` — project home. */
  project: 1320,
  /** `/app/people` */
  people: 1320,
  /** `/app/profile` */
  profile: 900,
  /** `/app/settings` */
  settings: 900,
  /** `/app/earnings` */
  earnings: 1080,
  /** `/app/settings/payouts` */
  payouts: 1080,
  /** `/app/trash` */
  trash: 1240,
  /** `/app/history` */
  history: 1320,
  /** `/app/settings/recovery` */
  recovery: 1240,
  /** `/app/import` */
  import: 1080,
  /** The story as a full page. `min(1080px, 94vw)` in the handoff. */
  story: 1080,
} as const;

export type Measure = keyof typeof MEASURES;

export function PageShell({
  measure,
  children,
  className,
  innerClassName,
  container = false,
}: {
  measure: Measure;
  children: React.ReactNode;
  /** Extra classes on the `<main>` — padding and flow overrides. */
  className?: string;
  /** Extra classes on the centred inner column — usually the gap. */
  innerClassName?: string;
  /**
   * Opt into a container-query context. The sprint table and board size
   * themselves against their column, not the viewport, so they need it.
   */
  container?: boolean;
}) {
  return (
    <main className={cn("flex flex-1 flex-col p-[var(--app-gutter)]", className)}>
      <div
        className={cn(
          "mx-auto flex w-full max-w-[var(--measure)] flex-1 flex-col gap-5",
          container && "@container",
          innerClassName
        )}
        style={{ "--measure": `${MEASURES[measure]}px` } as React.CSSProperties}
      >
        {children}
      </div>
    </main>
  );
}

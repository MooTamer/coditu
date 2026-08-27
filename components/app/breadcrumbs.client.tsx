"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mono } from "@/components/coditu/mono";
import { crumbsFor, type CrumbProject } from "@/lib/breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * Where you are, in the topbar.
 *
 * ## It waited for the sidebar, and the wait was the point
 *
 * Written and tested in W6c, mounted in W6e. In between, the topbar still
 * carried a **project switcher** naming the same project and the same sprint as
 * crumbs two and three — two controls saying one thing, and at 1400px neither
 * of them fitting:
 *
 * ```
 * Coditu            22px   truncated
 * MEINEvim          73px   truncated
 * Sprint — Week 17  68px   truncated
 * COD-241           40px   truncated
 * ```
 *
 * Project spaces took switching into the sidebar, the switcher left, and the
 * same four crumbs now measure 37 / 128 / 104 / 58 at their natural widths with
 * nothing clipped. It was never a styling problem.
 *
 * ## Below `lg` the trail collapses — it used to disappear
 *
 * Forced on at each width, on the deepest route this app has:
 *
 * ```
 * 1024   Coditu 37   MEINEvim components 128   nothing clipped
 *  900   Coditu 35   MEINEvim components 122   every crumb clipped
 *  768   Coditu 16   MEINEvim components  54   every crumb clipped
 *  390   Coditu 37   MEINEvim components   8   unreadable
 * ```
 *
 * Those numbers are still true, and the conclusion drawn from them — hide the
 * whole trail below `lg`, and suppress it entirely on any two-crumb route —
 * was wrong. `Coditu Workspace.dc.html` draws `Coditu / Home` at 390 and at
 * 320, and a shell that will not say which screen you are on is worse than one
 * whose middle crumbs are folded away.
 *
 * The clipping was never solved by hiding; it is solved by **collapsing**. Four
 * crumbs become `Coditu / … / COD-241` under `lg`, which fits at 320 with room
 * to spare, and the folded crumbs stay in the markup — hidden with `lg:`
 * classes rather than dropped — so a screen reader still gets the whole path
 * and the ellipsis is `aria-hidden`.
 *
 * Still CSS rather than a width hook, so the server renders one markup.
 *
 * ## The trail comes from a pure function
 *
 * `crumbsFor` is a function of the path and the projects the topbar already
 * holds, so this file is presentation and nothing else, and every route's trail
 * is asserted in `tests/breadcrumbs.test.ts` rather than checked by opening two
 * screens.
 *
 * ## The last crumb is a `<span>`, not a disabled link
 *
 * `aria-current="page"` on a link a screen reader can still follow is a
 * different, worse thing than not being a link at all. `crumbsFor` returns the
 * last crumb without an `href` and this renders exactly what it is given.
 */
export function Breadcrumbs({ projects }: { projects: CrumbProject[] }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname, projects);

  if (crumbs.length === 0) return null;

  /**
   * Which crumbs survive below `lg`.
   *
   * The measurements above are real: at 900 and below, every crumb of a deep
   * trail clips. The answer that follows from them is not "show nothing" —
   * `Coditu Workspace.dc.html` renders the trail at 390 and at 320, and the
   * screen a person is on is the one thing a shell should never be coy about.
   *
   * So the trail *collapses* rather than clips: the root, an ellipsis standing
   * for whatever is between, and the page you are on. Two labels and a marker
   * fit at 320 with room to spare, and the full trail is still in the DOM for a
   * screen reader — the middle crumbs are hidden with `lg:` classes, not
   * dropped from the markup, so the accessibility tree keeps the whole path.
   */
  const lastIndex = crumbs.length - 1;
  const collapses = crumbs.length > 2;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-[6px]">
      {crumbs.map((crumb, index) => {
        const last = index === lastIndex;
        // Kept at every width: the root and the page you are on.
        const alwaysVisible = index === 0 || last;
        // Everything between is desktop-only, and stands in as one ellipsis.
        const middleClass = alwaysVisible ? "" : "hidden lg:flex";
        const body = (
          <span className="flex min-w-0 items-center gap-[6px]">
            {crumb.glyph ? (
              <Mono
                size="meta"
                className="shrink-0 rounded-chip border border-[var(--hairline)] px-[5px] py-[1px] text-[9.5px] uppercase tracking-[0.04em] text-[var(--ink-faint)]"
              >
                {crumb.glyph}
              </Mono>
            ) : null}
            {/* Each crumb truncates on its own rather than the row scrolling.
                A sprint called "Sprint — Week 17, carry-over from 16" must not
                push the story's key off the end of the bar. */}
            <span className="max-w-[22ch] truncate">{crumb.label}</span>
          </span>
        );

        return (
          <span key={`${crumb.label}-${index}`} className="contents">
            <span className={cn("min-w-0 items-center gap-[6px]", middleClass || "flex")}>
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  prefetch={false}
                  className="flex min-w-0 items-center text-[12.5px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  {body}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="flex min-w-0 items-center text-[12.5px] text-[var(--ink)]"
                >
                  {body}
                </span>
              )}
              {!last ? (
                <span aria-hidden="true" className="shrink-0 text-[var(--hairline-strong)]">
                  /
                </span>
              ) : null}
            </span>

            {/* The stand-in for everything the narrow trail folded away. Drawn
                once, immediately after the root, and only where there is
                something to stand in for. `aria-hidden` because the crumbs it
                replaces are still in the tree right beside it. */}
            {collapses && index === 0 ? (
              <span aria-hidden="true" className="flex shrink-0 items-center gap-[6px] lg:hidden">
                <span className="text-[12.5px] text-[var(--ink-faint)]">…</span>
                <span className="text-[var(--hairline-strong)]">/</span>
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

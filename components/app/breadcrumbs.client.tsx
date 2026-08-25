"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mono } from "@/components/coditu/mono";
import { crumbsFor, type CrumbProject } from "@/lib/breadcrumbs";

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
 * ## Below `lg` it is not there, and that is measured rather than assumed
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
 * So `lg` is where it starts. Below it the page's own `h1` says which screen,
 * the sprint and item headers name their project, and the back gesture is a
 * swipe. Hidden with CSS rather than a width hook, so the server renders the
 * same markup either way.
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

  // `/app` itself is `Coditu / Home`, which says nothing the rail does not.
  if (crumbs.length < 3) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-0 shrink items-center gap-[6px] lg:flex"
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
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
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-[6px]">
            {crumb.href ? (
              <Link
                href={crumb.href}
                prefetch={false}
                className="min-w-0 text-[12.5px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                {body}
              </Link>
            ) : (
              <span aria-current="page" className="min-w-0 text-[12.5px] text-[var(--ink)]">
                {body}
              </span>
            )}
            {!last ? (
              <span aria-hidden="true" className="shrink-0 text-[var(--hairline-strong)]">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

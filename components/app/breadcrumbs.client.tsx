"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mono } from "@/components/coditu/mono";
import { crumbsFor, type CrumbProject } from "@/lib/breadcrumbs";

/**
 * Where you are, in the topbar — **not mounted yet, and deliberately so.**
 *
 * ## Why this is written and not rendered
 *
 * The trail measured, at 1400px, with this in the topbar:
 *
 * ```
 * Coditu            22px   truncated
 * MEINEvim          73px   truncated
 * Sprint — Week 17  68px   truncated
 * COD-241           40px   truncated
 * ```
 *
 * Every crumb clipped, including a six-letter word. The cause is not styling:
 * the topbar already carries the **project switcher**, which names the same
 * project and the same sprint as crumbs two and three. Two controls saying one
 * thing, and neither fitting.
 *
 * The design does not have this problem because its topbar has no switcher —
 * project spaces live in the sidebar there, and the topbar is breadcrumbs,
 * presence, save state, search and New. So the order of work is: the sidebar
 * takes over project switching, the switcher leaves the topbar, and this
 * mounts into the room that makes.
 *
 * Shipping it before that would mean a bar where "Coditu" is twenty-two pixels
 * wide, which is worse than no trail at all.
 *
 * `lib/breadcrumbs.ts` and its eleven tests are the hard part and they are
 * done: every route this app has is asserted. Mounting is one line in
 * `topbar.client.tsx`.
 *
 * ## Where you are, in the topbar.
 *
 * The trail comes from `crumbsFor`, a pure function of the path and the
 * projects the topbar already holds — so this file is presentation and nothing
 * else, and every route's trail is asserted in `tests/breadcrumbs.test.ts`
 * rather than checked by opening two screens.
 *
 * ## Below `lg` it is not there
 *
 * The topbar at 390px already carries the project switcher, search, theme,
 * export, new, and the account menu. A trail is the first thing to go: the
 * switcher says which project, the page's own `h1` says which screen, and the
 * back gesture is a swipe. Hidden with CSS rather than a width hook, so the
 * server renders the same markup either way.
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

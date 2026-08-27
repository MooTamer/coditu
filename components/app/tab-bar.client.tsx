"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";

import { TABS, overflowFor } from "@/components/app/nav-items";
import { NavIcon, NavLink } from "@/components/app/nav-link.client";
import { DialogShell } from "@/components/app/dialog-shell.client";
import { cn } from "@/lib/utils";

/**
 * The phone's navigation: a fixed bar at the bottom, below `md`.
 *
 * ── Why the rail could not simply be narrowed ──────────────────────────────
 * It expands on **hover**, and a touch screen has no hover. At 390px the rail
 * was 72px of permanently unlabelled icons — 18% of the screen — with no way to
 * find out what any of them meant. It is hidden below `md` now and this takes
 * over; above `md` the rail is untouched, hover-expand and pin included.
 *
 * ── Why the bottom ────────────────────────────────────────────────────────
 * Reach. A 6.1" phone held in one hand puts the top of the screen out of the
 * thumb's arc entirely, and navigation is the thing people hit most often.
 *
 * ── Five tabs, which is what the design asks for ──────────────────────────
 * `Coditu Workspace.dc.html`'s `bottomNav` is Home, Sprint, My work, Search,
 * More. This carried four for a while on the grounds that five at 390px is 78px
 * each and the labels would truncate. Measured rather than assumed after the
 * fifth went in: at 320px — the narrowest supported width, and worse than 390 —
 * five tabs are 64px each and the longest label, "My work", sets at 44px. It
 * fits, and the concern was theoretical.
 *
 * Search is a button rather than a link: it opens the same command palette
 * `⌘K` opens, which is a dialog and not a route. On a phone it is the only way
 * to reach a story that is not in the sprint you happen to be looking at, so it
 * earns a tab. People, Import and Settings stay behind More, because they are
 * administration rather than the work.
 *
 * `aria-current` stays exactly one item: the predicates come from
 * `nav-items.ts`, shared verbatim with the rail, and More is current whenever
 * any of the destinations behind it is.
 */
export function TabBar({ unreadCount, role }: { unreadCount: number; role: string }) {
  const pathname = usePathname();

  // The sheet has to agree with the rail about what exists. Both read the same
  // predicate rather than each filtering for itself.
  const overflow = overflowFor(role);
  const [moreOpen, setMoreOpen] = useState(false);

  /**
   * A navigation closes the sheet.
   *
   * Adjusted during render rather than in an effect. Every link inside the
   * sheet already closes it on tap, so this is for the case that does not go
   * through one: a back gesture, which on a phone is a swipe and is easy to do
   * by accident. Left open, the sheet would sit over the page it just took you
   * away from. `useEffect` + `setState` is the obvious shape and React's own
   * lint rule refuses it — the documented answer is to compare here.
   */
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setMoreOpen(false);
  }

  const overflowActive = overflow.some((item) => item.isActive(pathname));

  return (
    <>
      <nav
        data-app-chrome
        data-tab-bar
        aria-label="Sections"
        // `fixed`, not sticky: the content column scrolls under it, and a
        // sticky bar inside a flex column would need the column to be the
        // scroll container — which would break the table's own sticky header.
        //
        // The safe-area inset is the home indicator. It resolves to a real
        // number now that the viewport is `viewport-fit=cover`; before
        // workstream D it was always 0 and this padding would have done
        // nothing at all.
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--hairline)] bg-[var(--raised)] md:hidden"
        style={{
          height: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {TABS.map(({ id, label, href, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <NavLink
              key={id}
              href={href}
              label={label}
              active={active}
              anchorClassName="relative flex-1"
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center gap-[3px] rounded-control",
                active ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
              )}
              pendingClassName="text-[var(--ink)]"
            >
              {(pending) => (
                <>
                  <span className="relative flex size-[22px] items-center justify-center">
                    <NavIcon Icon={Icon} pending={pending} size={22} strokeWidth={1.7} />
                    {id === "my-work" && unreadCount > 0 ? (
                      <span
                        aria-hidden
                        className="absolute -right-[3px] -top-[3px] size-[7px] rounded-pill"
                        style={{ background: "var(--accent)" }}
                      />
                    ) : null}
                  </span>
                  <span className="text-[11px] font-medium leading-none">
                    {label}
                    {id === "my-work" && unreadCount > 0 ? (
                      <span className="sr-only">{` — ${unreadCount} unread`}</span>
                    ) : null}
                  </span>
                  {/* The current tab carries a 2px rule at the top of its own
                      cell. Colour alone would be the only signal otherwise,
                      and `--ink` against `--ink-muted` is not a large enough
                      difference to be one. */}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 top-0 h-[2px] rounded-pill"
                      style={{ background: "var(--accent)" }}
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}

        {/* The design's fourth destination. Dispatches the same event `⌘K`
            does, so there is one palette and one place that owns opening it. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("coditu:open-palette"))}
          aria-haspopup="dialog"
          className="relative flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-control text-[var(--ink-muted)]"
        >
          <Search size={22} strokeWidth={1.7} aria-hidden />
          <span className="text-[11px] font-medium leading-none">Search</span>
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={overflowActive ? "page" : undefined}
          className={cn(
            "relative flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-control",
            overflowActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
          )}
        >
          <MoreHorizontal size={22} strokeWidth={1.7} aria-hidden />
          <span className="text-[11px] font-medium leading-none">More</span>
          {overflowActive ? (
            <span
              aria-hidden
              className="absolute inset-x-3 top-0 h-[2px] rounded-pill"
              style={{ background: "var(--accent)" }}
            />
          ) : null}
        </button>
      </nav>

      {moreOpen ? (
        // Built on `DialogShell`, which is a bottom sheet below `md` — so this
        // costs no new dialog code, no new focus trap, and no extra bytes in a
        // shell that is 1.4KB from its budget.
        <DialogShell
          label="More"
          onClose={() => setMoreOpen(false)}
          header={<span className="text-[15px] font-semibold">More</span>}
        >
          <nav aria-label="More sections" className="flex flex-col p-2">
            {overflow.map(({ id, label, href, Icon, isActive }) => {
              const active = isActive(pathname);
              return (
                <Link
                  key={id}
                  href={href}
                  prefetch={false}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 items-center gap-4 rounded-control px-4 text-[15px] font-medium",
                    active ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]"
                  )}
                >
                  <Icon size={20} strokeWidth={1.7} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        </DialogShell>
      ) : null}
    </>
  );
}

"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Favourites } from "@/components/app/favourites.client";
import { navFor } from "@/components/app/nav-items";
import { NavIcon, NavLink } from "@/components/app/nav-link.client";
import { ProjectSpaces } from "@/components/app/project-spaces.client";
import type { FavouriteLink } from "@/lib/favourites";
import type { SpaceProject } from "@/lib/project-spaces";
import { cn } from "@/lib/utils";

/**
 * The 768–1179 gap in the shell, and what fills it.
 *
 * The handoff's breakpoint table says of that band: *"Icon rail (64 px) **plus
 * overlay drawer on demand**"*. The build had the icon rail and nothing else —
 * so between a phone (which has the bottom bar and its More sheet) and a
 * desktop (which has the 268px labelled sidebar) sat a 411px-wide band where
 * navigation was five unlabelled icons and no way to see their names without a
 * hover a tablet does not have.
 *
 * ## Why this is not visible above 1179 or below 768
 *
 * Above, the sidebar carries its own labels and a drawer would be a second way
 * to do a thing already done. Below, `TabBar` owns navigation and its More
 * sheet is the overflow. Between, this is the only way to read a label.
 *
 * ## Why it renders the same lists rather than its own
 *
 * `navFor`, `Favourites` and `ProjectSpaces` are the sidebar's own components,
 * given the same props. Two copies of a navigation tree is two chances for them
 * to disagree about what exists — which is the bug `tab-bar.client.tsx` already
 * records for `aria-current`.
 */
export function NavDrawer({
  role,
  unreadCount,
  projects,
  componentCounts,
  favourites,
}: {
  role: string;
  unreadCount: number;
  projects: SpaceProject[];
  componentCounts: Record<string, number>;
  favourites: FavouriteLink[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * A navigation closes it — including a back gesture, which no link handler
   * would catch. Compared during render rather than in an effect: `useEffect` +
   * `setState` is the obvious shape and React's own lint rule refuses it. The
   * More sheet in `tab-bar.client.tsx` carries the same pair for the same
   * reason.
   */
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open workspace navigation"
        title="Open workspace navigation"
        data-nav-drawer-trigger
        // Shown only between 768 and 1179 — the band where the sidebar is
        // icons and cannot say what any of them is. That range is a plain rule
        // in `globals.css`: written as `md:flex min-[1180px]:hidden` it put the
        // hamburger on a 1920px screen, because two utilities from different
        // breakpoint families do not order the way reading them suggests.
        className="size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-[var(--ink-muted)] hover:bg-[var(--tint)] hover:text-[var(--ink)]"
      >
        <Menu size={19} strokeWidth={1.9} aria-hidden />
      </button>

      {open ? (
        <DialogShell
          label="Workspace navigation"
          variant="drawer"
          onClose={() => setOpen(false)}
          header={<span className="text-[15px] font-semibold">Navigation</span>}
        >
          <div className="flex flex-col gap-1 p-2">
            <nav aria-label="Sections" className="flex flex-col gap-1">
              {navFor(role).map(({ id, label, href, Icon, isActive }) => {
                const active = isActive(pathname);
                return (
                  <NavLink
                    key={id}
                    href={href}
                    label={label}
                    active={active}
                    className={cn(
                      "flex h-11 items-center gap-[14px] rounded-control px-3 transition-colors",
                      active
                        ? "bg-[var(--canvas)] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--tint)]"
                    )}
                    pendingClassName="bg-[var(--canvas)] text-[var(--ink)]"
                  >
                    {(pending) => (
                      <>
                        <span className="relative flex size-[18px] shrink-0 items-center justify-center">
                          <NavIcon Icon={Icon} pending={pending} />
                          {id === "my-work" && unreadCount > 0 ? (
                            <span
                              aria-hidden
                              className="absolute -right-1 -top-1 size-[7px] rounded-pill"
                              style={{ background: "var(--accent)" }}
                            />
                          ) : null}
                        </span>
                        <span className="text-[14.5px] font-medium">
                          {label}
                          {id === "my-work" && unreadCount > 0 ? (
                            <span className="sr-only">{` — ${unreadCount} unread`}</span>
                          ) : null}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* `idPrefix` is not decoration: the icon rail is still in the
                document behind this drawer, so without a namespace every id
                these two render is in the page twice and `aria-labelledby`
                resolves to the rail's copy. */}
            <Favourites links={favourites} idPrefix="drawer" />
            <ProjectSpaces
              projects={projects}
              componentCounts={componentCounts}
              idPrefix="drawer"
            />
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";

import { navFor } from "@/components/app/nav-items";
import { NavIcon, NavLink } from "@/components/app/nav-link.client";
import { PersonAvatar, type AvatarPerson } from "@/components/app/person-avatar";
import { ProjectSpaces } from "@/components/app/project-spaces.client";
import { CoditusMark } from "@/components/coditu/coditus-mark";
import { usePersistentFlag } from "@/lib/hooks/use-client-state";
import type { SpaceProject } from "@/lib/project-spaces";
import { cn } from "@/lib/utils";

/**
 * The sidebar. 268px with labels at ≥1180px, 64px icons below that, gone below
 * 768 where the bottom bar takes over.
 *
 * ## It used to open on hover, and that was the problem
 *
 * 72px collapsed, 240px on hover or on click-to-pin. Three things were wrong
 * with it, and the design fixes all three by making width the only input:
 *
 * **Hover is not an input everybody has.** This file's own comment said so —
 * the rail is hidden below `md` precisely *because* a touch screen cannot open
 * it — and a tablet at 800px has no hover either, so it got permanently
 * unlabelled icons with no way to read them.
 *
 * **A preference should not be needed to read your own navigation.** Pinning
 * was discoverable only by finding a button whose purpose is not obvious, and
 * until you found it every label was invisible on a 1440px screen with room to
 * spare.
 *
 * **Hover-to-expand moves the page under the pointer.** Reaching for Projects
 * at 72px meant the rail widened, the content reflowed, and the thing being
 * aimed at moved.
 *
 * ## Why the widths are CSS and not state
 *
 * A `useMediaQuery` here would mean the server renders one width and the client
 * corrects it, which is a hydration mismatch on every load and a visible jump.
 * The two widths are a media query at `--rail-wide`, so the correct sidebar
 * arrives in the HTML at every viewport with no JavaScript at all. The toggle
 * only sets `data-collapsed`, which overrides the wide case — so the thing that
 * needs JS is the preference, not the layout.
 *
 * The prototype's inline `<path d="…">` icons are lucide-equivalent, so they
 * are mapped to their lucide names rather than hand-rolled back into SVG.
 */

/**
 * ── Why nothing in this rail is prefetched ─────────────────────────────────
 * Kept here because `nav-link.client.tsx` points at it, and because the numbers
 * are the whole argument.
 *
 * Next prefetches every `<Link>` that enters the viewport. For a DYNAMIC route
 * the payload lands in the client router cache with `staleTimes.dynamic`, which
 * defaults to **0** — so it is stale on arrival, the click re-fetches, and the
 * prefetch was a full server render performed for nothing.
 *
 * Every route under `/app` is dynamic. One sprint page view was costing 28 of
 * these renders — twelve item routes and five rail routes, each fetched twice —
 * and 178 database statements. With them off it is 0 and 40.
 *
 * What it cost: nothing anyone can feel. Rail navigation measures 269ms
 * prefetched and 277ms not, over twelve samples; opening an item, 210ms and
 * 209ms. What it cost on a PHONE was the entire sense that the tap registered,
 * and that is what `useLinkStatus` in `NavLink` gives back — for free, without
 * re-running a single speculative render.
 *
 * The alternative was `experimental.staleTimes.dynamic`, which makes the
 * prefetch usable by letting the router serve a tree up to N seconds old.
 * Rejected: this is a live sprint board with realtime subscriptions, and the
 * reason the number in the footer is trusted is that it is never out of date.
 */

/**
 * Renamed from `coditu.rail.pinned`, and the rename is deliberate rather than
 * cosmetic: the flag's MEANING inverted. It used to mean "keep this open even
 * though it would otherwise be shut", and now it means "keep this shut even
 * though it would otherwise be open". Reusing the old key would have read every
 * existing pin as a collapse and shut the sidebar for everybody who had pinned
 * it — the worst possible outcome for the people who liked it most.
 */
const COLLAPSED_KEY = "coditu.rail.collapsed";

/**
 * A label that is present for a screen reader at every width and visible only
 * where there is room for it.
 *
 * `opacity` rather than `hidden`: the name has to reach the accessibility tree
 * at 64px too, or the sidebar becomes six unlabelled icons to anybody not
 * looking at it. `NavLink` adds a `title` for the pointer.
 */
const LABEL = cn(
  "whitespace-nowrap opacity-0 motion-safe:transition-opacity motion-safe:duration-150"
);

export function Rail({
  me,
  role,
  unreadCount,
  projects,
  componentCounts,
}: {
  me: AvatarPerson;
  role: string;
  /** Unread notifications. Surfaces as a dot on My work. */
  unreadCount: number;
  /** Every unarchived project, for the spaces tree. Already fetched by the
   *  shell for the topbar, so this is the same array and not a second read. */
  projects: SpaceProject[];
  /** Live component count per project id, for the registry row. */
  componentCounts: Record<string, number>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistentFlag(COLLAPSED_KEY);

  return (
    <aside
      data-app-chrome
      // The only thing JavaScript contributes. Undefined rather than `false`,
      // so the attribute is absent and the CSS below can key on its presence.
      data-collapsed={collapsed || undefined}
      // Hidden below `md`, where `TabBar` takes over — not merely narrowed. At
      // 390px a 64px rail is 16% of the width spent on icons that compete with
      // the content for the same thumb.
      // 64px here; `globals.css` widens it to 268px above `--rail-wide` unless
      // `data-collapsed` says otherwise. The two states are plain CSS because
      // the Tailwind variants that would express them compile to nothing.
      className={cn(
        "sticky top-0 hidden h-dvh w-[var(--rail-collapsed)] shrink-0 flex-col gap-1",
        "overflow-hidden border-r border-[var(--hairline)] bg-[var(--raised)]",
        "p-3 pl-[max(0.75rem,env(safe-area-inset-left))] md:flex",
        "motion-safe:transition-[width] motion-safe:duration-[220ms] motion-safe:ease-[var(--ease-entrance)]"
      )}
    >
      <div className="mb-3 flex h-10 items-center gap-3 px-1">
        <CoditusMark size={26} hoverTravel />
        <span data-rail-label className={cn(LABEL, "flex-1 text-[16px] font-bold tracking-[-0.02em]")}>
          Coditu
        </span>
        {/* Only where it does something. Below 1180 the sidebar is icons at
            every setting, so a control that appears to change that and does
            not is worse than no control. */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Show navigation labels" : "Collapse the navigation"}
          title={collapsed ? "Show navigation labels" : "Collapse the navigation"}
          data-rail-toggle
          className="hidden size-8 shrink-0 items-center justify-center rounded-control text-[var(--ink-faint)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
        >
          <PanelLeft size={16} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      {/* The scroll container, and the reason there is one: project spaces made
          the sidebar taller than the shortest laptop. The header and the
          footer stay put — losing your own face and the collapse control off
          the bottom of a scroll is worse than scrolling the middle. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
        <nav className="flex flex-col gap-1">
          {navFor(role).map(({ id, label, href, Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <NavLink
                key={id}
                href={href}
                label={label}
                active={active}
                className={cn(
                  "flex h-11 items-center gap-[14px] overflow-hidden whitespace-nowrap rounded-control px-3 transition-colors",
                  active ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
                )}
                // The tapped item takes the active surface immediately. That is
                // the half of the pending state that survives reduced motion,
                // where the mark below stops rotating.
                pendingClassName="bg-[var(--canvas)] text-[var(--ink)]"
              >
                {(pending) => (
                  <>
                    <span className="relative flex size-[18px] shrink-0 items-center justify-center">
                      <NavIcon Icon={Icon} pending={pending} />
                      {/* The dot is decorative; the count is announced in the label
                          below so it is not colour-only information. */}
                      {id === "my-work" && unreadCount > 0 ? (
                        <span
                          aria-hidden
                          className="absolute -right-1 -top-1 size-[7px] rounded-pill"
                          style={{ background: "var(--accent)" }}
                        />
                      ) : null}
                    </span>
                    <span data-rail-label className={cn(LABEL, "text-[14.5px] font-medium")}>
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

        <ProjectSpaces projects={projects} componentCounts={componentCounts} />
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-[var(--hairline)] px-3">
        {/* Initials came from splitting the display name here, which is a
            second answer to a question `profiles.initials` already answers.
            It reads the column now, like every other face in the app. */}
        <PersonAvatar person={me} size={26} fontSize={10} />
        <span data-rail-label className={cn(LABEL, "text-[13px] text-[var(--ink-muted)]")}>
          {me.fullName.split(" ")[0]} · {role}
        </span>
      </div>
    </aside>
  );
}

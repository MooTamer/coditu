"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { NAV } from "@/components/app/nav-items";
import { NavIcon, NavLink } from "@/components/app/nav-link.client";
import { PersonAvatar, type AvatarPerson } from "@/components/app/person-avatar";
import { CoditusMark } from "@/components/coditu/coditus-mark";
import { usePersistentFlag } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * The rail. 72px collapsed, 240px expanded on hover *and* on click-to-pin;
 * the pinned state persists per user.
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

const PIN_KEY = "coditu.rail.pinned";

export function Rail({
  me,
  role,
  unreadCount,
}: {
  me: AvatarPerson;
  role: string;
  /** Unread notifications. Surfaces as a dot on My work. */
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [pinned, setPinned] = usePersistentFlag(PIN_KEY);
  const [hovered, setHovered] = useState(false);

  const open = pinned || hovered;

  return (
    <aside
      data-app-chrome
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Hidden below `md`, where `TabBar` takes over. Not merely narrowed: the
      // rail expands on HOVER, which a touch screen does not have, so at 390px
      // it was 72px of permanently unlabelled icons — 18% of the width — that
      // could never open.
      className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 overflow-hidden border-r border-[var(--hairline)] bg-[var(--raised)] p-3 pl-[max(0.75rem,env(safe-area-inset-left))] md:flex"
      style={{
        width: open ? "var(--rail-expanded)" : "var(--rail-collapsed)",
        transition: "width 220ms var(--ease-entrance)",
      }}
    >
      <button
        type="button"
        onClick={() => setPinned(!pinned)}
        aria-pressed={pinned}
        aria-label={pinned ? "Unpin the navigation rail" : "Pin the navigation rail open"}
        className="mb-3 flex h-10 items-center gap-3 rounded-control px-1"
      >
        <CoditusMark size={26} hoverTravel />
        <span
          className="whitespace-nowrap text-[16px] font-bold tracking-[-0.02em]"
          style={{ opacity: open ? 1 : 0, transition: "opacity 160ms" }}
        >
          Coditu
        </span>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ id, label, href, Icon, isActive }) => {
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
                  <span
                    className="text-[14.5px] font-medium"
                    style={{ opacity: open ? 1 : 0, transition: "opacity 160ms" }}
                  >
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

      <div className="mt-auto flex h-11 items-center gap-3 border-t border-[var(--hairline)] px-3">
        {/* Initials came from splitting the display name here, which is a
            second answer to a question `profiles.initials` already answers.
            It reads the column now, like every other face in the app. */}
        <PersonAvatar person={me} size={26} fontSize={10} />
        <span
          className="whitespace-nowrap text-[13px] text-[var(--ink-muted)]"
          style={{ opacity: open ? 1 : 0, transition: "opacity 160ms" }}
        >
          {me.fullName.split(" ")[0]} · {role}
        </span>
      </div>
    </aside>
  );
}

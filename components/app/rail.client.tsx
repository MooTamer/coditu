"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CheckCheck, FolderOpen, Import, Rows3, Users } from "lucide-react";

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
 * Each entry owns the rule for when it is the current page.
 *
 * `startsWith(href)` cannot express this list. `/app/projects/evim/sprints/17`
 * starts with `/app/projects`, so Projects and Sprint both lit up on every
 * sprint page and the rail claimed the reader was in two places at once. A
 * sprint URL is nested under its project for scoping reasons — invariant 1 —
 * not because it is a sub-page of the project list, so the prefix is the wrong
 * question to ask. Each item answers it for itself instead.
 */
const NAV = [
  {
    id: "sprint",
    label: "Sprint",
    href: "/app",
    Icon: Rows3,
    isActive: (path: string) => path === "/app" || /^\/app\/projects\/[^/]+\/sprints(\/|$)/.test(path),
  },
  {
    id: "projects",
    label: "Projects",
    href: "/app/projects",
    Icon: FolderOpen,
    // The list, and a project's own overview — but not the sprints beneath it.
    isActive: (path: string) => /^\/app\/projects(\/[^/]+)?$/.test(path),
  },
  {
    id: "my-work",
    label: "My work",
    href: "/app/my-work",
    Icon: CheckCheck,
    isActive: (path: string) => path.startsWith("/app/my-work"),
  },
  {
    id: "people",
    label: "People",
    href: "/app/people",
    Icon: Users,
    isActive: (path: string) => path.startsWith("/app/people"),
  },
  {
    id: "import",
    label: "Import",
    href: "/app/import",
    Icon: Import,
    isActive: (path: string) => path.startsWith("/app/import"),
  },
] as const;

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
      className="sticky top-0 flex h-dvh shrink-0 flex-col gap-1 overflow-hidden border-r border-[var(--hairline)] bg-[var(--raised)] p-3 pl-[max(0.75rem,env(safe-area-inset-left))]"
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
            <Link
              key={id}
              href={href}
              /**
               * Not prefetched, and this is measured rather than assumed.
               *
               * Next prefetches every `<Link>` that enters the viewport. For a
               * DYNAMIC route the payload lands in the client router cache with
               * `staleTimes.dynamic`, which defaults to **0** — so it is stale
               * on arrival, the click re-fetches, and the prefetch was a full
               * server render performed for nothing.
               *
               * Every route under `/app` is dynamic. One sprint page view was
               * costing 28 of these renders — twelve item routes and five rail
               * routes, each fetched twice — and 178 database statements. With
               * them off it is 0 and 38.
               *
               * What it cost: nothing anyone can feel. Rail navigation measures
               * 269ms prefetched and 277ms not, over twelve samples; opening an
               * item, 210ms and 209ms.
               *
               * The alternative was `experimental.staleTimes.dynamic`, which
               * makes the prefetch usable by letting the router serve a tree up
               * to N seconds old. Rejected: this is a live sprint board with
               * realtime subscriptions, and the reason the number in the footer
               * is trusted is that it is never out of date.
               */
              prefetch={false}
              title={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-[14px] overflow-hidden whitespace-nowrap rounded-control px-3 transition-colors",
                active ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
              )}
            >
              <span className="relative flex size-[18px] shrink-0 items-center justify-center">
                <Icon size={18} strokeWidth={1.7} aria-hidden />
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
            </Link>
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

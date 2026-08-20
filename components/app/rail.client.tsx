"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CheckCheck, FolderOpen, Import, Rows3, Users } from "lucide-react";

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
const NAV = [
  { id: "sprint", label: "Sprint", href: "/app", Icon: Rows3 },
  { id: "projects", label: "Projects", href: "/app/projects", Icon: FolderOpen },
  { id: "my-work", label: "My work", href: "/app/my-work", Icon: CheckCheck },
  { id: "people", label: "People", href: "/app/people", Icon: Users },
  { id: "import", label: "Import", href: "/app/import", Icon: Import },
] as const;

const PIN_KEY = "coditu.rail.pinned";

export function Rail({ profileName, role }: { profileName: string; role: string }) {
  const pathname = usePathname();
  const [pinned, setPinned] = usePersistentFlag(PIN_KEY);
  const [hovered, setHovered] = useState(false);

  const open = pinned || hovered;

  return (
    <aside
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
        {NAV.map(({ id, label, href, Icon }) => {
          const active =
            href === "/app" ? pathname === "/app" || pathname.startsWith("/app/projects/") : pathname.startsWith(href);
          return (
            <Link
              key={id}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-[14px] overflow-hidden whitespace-nowrap rounded-control px-3 transition-colors",
                active ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
              )}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center">
                <Icon size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span
                className="text-[14.5px] font-medium"
                style={{ opacity: open ? 1 : 0, transition: "opacity 160ms" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex h-11 items-center gap-3 border-t border-[var(--hairline)] px-3">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-pill border border-[var(--hairline-strong)] font-mono text-[10px]">
          {profileName
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <span
          className="whitespace-nowrap text-[13px] text-[var(--ink-muted)]"
          style={{ opacity: open ? 1 : 0, transition: "opacity 160ms" }}
        >
          {profileName.split(" ")[0]} · {role}
        </span>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mono } from "@/components/coditu/mono";
import type { RecentView } from "@/lib/data/recents";
import { cn } from "@/lib/utils";

/**
 * Recently opened — on Workspace Home, where the design puts it.
 *
 * `PLAN.md` §2 lists *"Recently opened stories, projects, and notes"* among
 * Workspace Home's sections, and the returned prototype draws it in Home's
 * 320px right column, between the online-teammates panel and the activity
 * stream. Favourites — the *deliberate* list — is the one in the sidebar.
 *
 * ## It was in the sidebar for an hour, and that was wrong twice
 *
 * Once against the design, which is the reason above. And once in a way the
 * e2e suite found within a minute: recents fill in **by themselves**, so the
 * sidebar acquired a second link to every story anybody opened, on every screen
 * in the application. Twenty-two specs that had located a story by its
 * accessible name started matching two elements. A favourite is a link
 * somebody chose to put there and a recent is not, and a persistent chrome
 * position is for the ones somebody chose.
 *
 * ## Nothing is drawn when there is nothing
 *
 * No empty state, no "pages you open will appear here". An empty heading is
 * furniture that promises a feature — the rule `favourites.client.tsx` states.
 */
export function Recents({ items }: { items: RecentView[] }) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <div data-recents>
      <Mono
        size="meta"
        as="h2"
        id="home-recents"
        className="uppercase tracking-[0.06em] text-[var(--ink-faint)]"
      >
        Recently opened
      </Mono>

      <nav aria-labelledby="home-recents" className="mt-3 flex flex-col">
        {items.map((item) => {
          const here = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              title={item.label}
              aria-current={here ? "true" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-[9px] rounded-inner px-2 text-[13px] outline-offset-2",
                here
                  ? "bg-[var(--canvas)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
              )}
            >
              <Mono size="meta" className="w-[26px] shrink-0 text-[11px] text-[var(--ink-faint)]">
                {item.glyph}
              </Mono>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

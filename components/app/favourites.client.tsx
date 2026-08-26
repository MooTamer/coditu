"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mono } from "@/components/coditu/mono";
import type { FavouriteLink } from "@/lib/favourites";
import { cn } from "@/lib/utils";

/**
 * Favourites — the sidebar's first section, and the last thing the design's
 * sidebar was missing.
 *
 * W6d deferred this on purpose and said why: the design's three favourites are a
 * saved filter view, a work item and a component registry, and saved views did
 * not exist until W7. Building it then would have meant a table that could hold
 * two of its three kinds.
 *
 * ## Above Project spaces, and hidden at the same widths
 *
 * A favourite is a shortcut past the tree, so it goes above it. Both sections
 * are `display: none` below `--rail-wide` and while the sidebar is collapsed,
 * for the reason recorded in W6d: unlike a nav label, a list of names has no
 * 64px representation, so fading it would leave rows nobody sighted can see and
 * nobody can reach.
 *
 * ## The links are built on the server
 *
 * `favouriteLinks` resolves each starred row against the project list — including
 * the awkward case, a view that follows whichever sprint is running — and the
 * shell does that before this renders. Doing it here instead put `lib/favourites`
 * into the browser bundle and the app shell's §5 **total** to 220.4 of 220. This
 * component is a list and a `usePathname`.
 *
 * ## Nothing is drawn when nothing is starred
 *
 * No empty state, no "star something to see it here". An empty `Favourites`
 * heading is furniture that promises a feature, which is the same rule that kept
 * this section out of the sidebar for two phases rather than rendering it blank.
 */
export function Favourites({ links }: { links: FavouriteLink[] }) {
  const pathname = usePathname();

  if (links.length === 0) return null;

  return (
    <div data-rail-favourites className="mt-4">
      <Mono
        size="eyebrow"
        as="h2"
        id="rail-favourites"
        className="px-3 pb-1 text-[9.5px] tracking-[0.07em] text-[var(--ink-faint)]"
      >
        Favourites
      </Mono>

      <nav aria-labelledby="rail-favourites" className="flex flex-col">
        {links.map((link) => {
          // The path only — a saved view's query string is what it carries, not
          // what makes it the page you are on. Matching the whole URL would
          // leave the star unlit the moment somebody changed one filter.
          const here = pathname === link.href.split("?")[0];
          return (
            <Link
              key={link.id}
              href={link.href}
              prefetch={false}
              title={link.label}
              aria-current={here ? "true" : undefined}
              className={cn(
                "flex h-8 items-center gap-[9px] rounded-control px-[10px] text-[13px] outline-offset-2",
                here
                  ? "bg-[var(--canvas)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
              )}
            >
              <Mono size="meta" className="w-[26px] shrink-0 text-[9.5px] text-[var(--ink-faint)]">
                {link.glyph}
              </Mono>
              <span className="min-w-0 flex-1 truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

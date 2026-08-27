import Link from "next/link";

import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { calendarDate } from "@/lib/format";
import type { PageDetail } from "@/lib/data/pages";

/**
 * A list of pages, in whichever scope asked for it.
 *
 * One component for the workspace index, the project index and the project
 * page's panel, because the three differ only in what they are a list *of* —
 * and three copies of a row is three places for a link to start pointing
 * somewhere else.
 *
 * ## `min-h-11` on the row, not on something inside it
 *
 * §5's touch-target floor is 44px and the target here is the whole row. Putting
 * the minimum on a span inside it makes the *text* 44px tall inside a 32px row,
 * which measures as a pass and misses by a finger.
 */
export function PageList({
  pages,
  empty,
  compact = false,
}: {
  pages: PageDetail[];
  /** What to say when there are none. Different in each of the three places. */
  empty: string;
  /** The project page's panel: no author line, no chip, tighter rows. */
  compact?: boolean;
}) {
  if (pages.length === 0) {
    return (
      <p className="rounded-inner border border-[var(--hairline)] px-4 py-5 text-center text-[12.5px] text-[var(--ink-faint)]">
        {empty}
      </p>
    );
  }

  return (
    <ul data-page-list className="flex flex-col">
      {pages.map((page) => (
        <li key={page.id}>
          <Link
            href={page.href}
            data-page-row
            className="flex min-h-11 items-center gap-3 rounded-inner px-2 py-1.5 hover:bg-[var(--tint)]"
          >
            <Mono size="meta" className="w-8 shrink-0 text-[var(--ink-faint)]">
              page
            </Mono>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">
              {page.title}
            </span>

            {/* Never published is a real state a reader can act on, not a
                decoration: it means nobody else can see this page yet. */}
            {page.publishedAt === null ? (
              <ToneChip tone="amber" className="shrink-0">
                draft
              </ToneChip>
            ) : null}

            {compact ? null : (
              <Mono size="meta" className="hidden shrink-0 text-[var(--ink-faint)] sm:block">
                {page.author?.fullName.split(" ")[0] ?? "outside the app"} ·{" "}
                {calendarDate(page.updatedAt)}
              </Mono>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

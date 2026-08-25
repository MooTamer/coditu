import { notFound } from "next/navigation";

import { TrashRow } from "@/components/app/trash-row.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getTrash } from "@/lib/data/trash";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Trash" };

/**
 * What has been deleted, and how to get it back.
 *
 * Soft delete has existed here for a while and had no window into it. A story
 * deleted from the wrong sprint was recoverable in principle and unfindable in
 * practice — you had to already know which sprint to ask about — and a
 * withdrawn comment was recoverable by nobody at all.
 *
 * ## It shows where a thing was, and never what it said
 *
 * A withdrawn comment's words do not leave the database. The thread hides them
 * from every reader including their author, and a trash screen that printed
 * them would quietly undo that: "withdrawn" would come to mean "moved somewhere
 * less obvious". `trash_list()` returns the location and the timestamp, and the
 * words are not in the projection at all — not hidden by this page, absent from
 * what it is given.
 */
export default async function TrashPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const entries = await getTrash();
  const canPurge = profile.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-4 py-6 sm:px-6">
      <Reveal tier="section">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--ink)]">Trash</h1>
        <p className="mt-1 max-w-[62ch] text-[13.5px] text-[var(--ink-muted)]">
          Deleted stories and withdrawn comments. Nothing here is visible anywhere else in the app,
          and nothing here is gone —{" "}
          {canPurge
            ? "until an admin removes it for good, one at a time."
            : "only an admin can remove something for good."}
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--overlay)]"
      >
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
            Nothing has been deleted.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {entries.map((entry) => (
              <li
                key={`${entry.kind}-${entry.entityId}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="flex min-w-0 items-baseline gap-2 text-[13.5px] text-[var(--ink)]">
                    {/* The key, first — it is how anybody names a story out
                        loud, and two stories called "Banner" are otherwise
                        indistinguishable here, where neither is on screen
                        anywhere else. A comment's title already ends in its
                        story's key, so it does not get a second copy. */}
                    {entry.kind === "work_item" ? (
                      <Mono size="meta" className="shrink-0 text-[11.5px] text-[var(--ink-muted)]">
                        {entry.itemKey}
                      </Mono>
                    ) : null}
                    <span className="truncate">{entry.title}</span>
                  </p>
                  <Mono size="meta" className="mt-[2px] block text-[11.5px] text-[var(--ink-faint)]">
                    {entry.projectName} · sprint {entry.sprintNumber} ·{" "}
                    <time dateTime={entry.deletedAt}>{stamp(entry.deletedAt)}</time>
                    {/* The hours are stated BEFORE anybody presses anything.
                        They are what a purge actually costs, and they are
                        invisible everywhere else once the story is binned. */}
                    {entry.minutesLogged ? ` · ${(entry.minutesLogged / 60).toFixed(1)} h logged` : ""}
                  </Mono>
                </div>
                <TrashRow entry={entry} canPurge={canPurge} />
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </div>
  );
}

/** `20 Aug, 10:02` in Africa/Cairo — invariant 5, at the render edge. */
function stamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

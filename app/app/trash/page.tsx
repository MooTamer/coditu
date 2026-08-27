import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
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
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  const all = await getTrash();
  const canPurge = profile.role === "admin";

  // In memory, unlike `/app/history`, and the difference is not an oversight:
  // `trash_list()` already returns everything deleted in one bounded read, so
  // there is nothing to save by narrowing in SQL and a `q` in the query would
  // be a second place for the projection to drift.
  //
  // **It searches what the screen shows, and the screen does not show a
  // withdrawn comment's words.** `body_text` is not in the projection at all,
  // so there is no way for a search box to become the thing that prints them —
  // which is the failure this screen was careful about from the day it was
  // built. `e2e/trash.spec.ts` asserts it.
  const needle = q.toLowerCase();
  const entries = needle
    ? all.filter((entry) =>
        [entry.title, entry.itemKey ?? "", entry.projectName]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : all;

  return (
    <PageShell measure="trash">
      <Reveal tier="section">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--ink)]">Trash</h1>
        <p className="mt-1 max-w-[62ch] text-[13.5px] text-[var(--ink-muted)]">
          Deleted stories and withdrawn comments. Nothing here is visible anywhere else in the app,
          and nothing here is gone —{" "}
          {canPurge
            ? "until an admin removes it for good, one at a time."
            : "only an admin can remove something for good."}
        </p>

        {/* A real GET form, so searching works before hydration and every
            result is a URL somebody can paste. No `onChange`, no debounce, no
            client component: the list is already loaded whole and the only
            thing typing could buy is a round trip. */}
        <form method="get" role="search" className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="trash-q" className="sr-only">
            Search the bin
          </label>
          <input
            id="trash-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search deleted stories and comments"
            className="h-11 min-w-0 flex-1 rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-3 text-[13.5px] placeholder:text-[var(--ink-faint)]"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
          >
            Search
          </button>
          {q ? (
            <Link
              href="/app/trash"
              className="inline-flex h-11 items-center rounded-control px-3 text-[12.5px] font-medium text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)]"
            >
              Clear
            </Link>
          ) : null}
        </form>

        {q ? (
          <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
            {entries.length} of {all.length} matching &ldquo;{q}&rdquo;
          </Mono>
        ) : null}
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--overlay)]"
      >
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
            {q ? "Nothing in the bin matches that." : "Nothing has been deleted."}
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
                    {entry.kind === "page" ? (
                      <Mono size="meta" className="shrink-0 text-[11.5px] text-[var(--ink-muted)]">
                        page
                      </Mono>
                    ) : null}
                    <span className="truncate">{entry.title}</span>
                  </p>
                  <Mono size="meta" className="mt-[2px] block text-[11.5px] text-[var(--ink-faint)]">
                    {/* A page has no sprint, and a workspace page has no
                        project either — `trash_list()` returns the word
                        `Workspace` for that so this line never has to invent
                        one. Printing "sprint null" is the kind of small lie a
                        recovery screen cannot afford. */}
                    {entry.projectName}
                    {entry.sprintNumber === null ? "" : ` · sprint ${entry.sprintNumber}`} ·{" "}
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
    </PageShell>
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

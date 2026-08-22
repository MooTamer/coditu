"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

import { Mono } from "@/components/coditu/mono";

/**
 * A screen inside `/app` failed to render.
 *
 * Written the way the rest of this app talks: what happened, what is still
 * true, and one thing to do about it. "Something went wrong" tells a person
 * nothing they had not already worked out, and the sentence that matters most
 * here is the second one — a failed *read* has changed nothing, and somebody
 * looking at a red screen in the middle of a sprint needs to know that before
 * they start wondering whether their hours are still there.
 *
 * The digest is shown deliberately. It is the only handle on a production
 * failure: `sprints.notes_written_at` shipped ahead of its migration and every
 * sprint page threw `42703`, and the whole diagnosis started from a digest
 * somebody read off a screen and repeated. Server details are stripped from a
 * production build, so this string is all there is.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-5 p-[var(--app-gutter)]">
      <div className="max-w-[60ch]">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">This screen did not load.</h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--ink-muted)]">
          Nothing was written and nothing was lost — this was a read that failed, so every item,
          hour and comment is exactly where you left it. Usually the database was briefly
          unreachable and the next attempt works.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
        >
          <RotateCw size={15} strokeWidth={2} aria-hidden />
          Try again
        </button>

        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-control px-3 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          Back to the current sprint
        </Link>
      </div>

      {error.digest ? (
        <Mono size="meta" className="text-[var(--ink-faint)]">
          reference {error.digest} — quote this if it keeps happening
        </Mono>
      ) : null}
    </main>
  );
}

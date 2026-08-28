"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { type ControlState } from "@/lib/interactive";

/**
 * A URL write that knows it is still happening.
 *
 * This is PF-4's dead two seconds, exactly. Sort, filter, grouping and view are
 * all URL state — the right design, because it makes every one of them a link
 * somebody can paste — and every one of them was written as a bare
 * `router.replace(...)`. A bare router call is a **server round trip on a
 * dynamic route**, and React gives you no indication that one is in flight
 * unless you ask: the click lands, nothing changes, and roughly two seconds
 * later the table is sorted. Every reader's first conclusion is that the first
 * click missed.
 *
 * `startTransition` around the router call is the whole fix. `pending` is true
 * from the click until the new render commits — synchronously, in the same tick
 * as the event, which is what makes the 100 ms budget in
 * `docs/10-PRODUCT-FEEDBACK.md` reachable rather than aspirational.
 *
 * It also removes five copies of the same eight lines. Each of
 * `filter-bar`, `filter-panel`, `project-filters`, `sprint-table` (twice) and
 * `view-menu` built the href, remembered `scroll: false`, and chose between
 * push and replace on its own — which is five chances to forget the
 * `scroll: false` that stops a filter throwing somebody back to the top of a
 * table they were part way down.
 *
 * ── replace, and when not to ───────────────────────────────────────────────
 * `replace` is the default and is right for a filter: twelve status toggles
 * should not be twelve entries in the back button. `push` is right for
 * applying a saved view, which is a place somebody may want to come back from.
 */
export function useUrlWrite({ history = "replace" }: { history?: "replace" | "push" } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  /**
   * WHICH control asked, not merely that something did.
   *
   * `useTransition` gives one boolean for the hook, and a filter bar has
   * fourteen controls sharing it — so the first version of this lit the pending
   * line under every status chip when one of them was clicked, which says "the
   * whole bar is thinking" and loses the only thing the reader wanted to know.
   *
   * Never cleared, and does not need to be: it is only ever read through
   * `state()`, which gates it on `pending`. A stale key while idle is
   * unreachable.
   */
  const [asked, setAsked] = useState<string | null>(null);

  const write = useCallback(
    (next: URLSearchParams, key?: string) => {
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      setAsked(key ?? null);
      startTransition(() => {
        // `scroll: false` in one place rather than five. Toggling a filter must
        // not throw the reader back to the top of the table.
        if (history === "push") router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [history, pathname, router]
  );

  /** The state to hand `control()` for one keyed control. */
  const state = useCallback(
    (key: string): ControlState => (pending && asked === key ? "pending" : "idle"),
    [asked, pending]
  );

  return { params, pending, write, state };
}

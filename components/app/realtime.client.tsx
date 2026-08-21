"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Realtime, for the active sprint and the open thread.
 *
 * Three rules from §5, and each one is a bug if it is dropped:
 *
 *   - **The active sprint only.** A subscription per sprint the person can see
 *     is a channel per row of the projects list, and every one of them wakes
 *     React for work nobody is looking at.
 *   - **Unsubscribe on unmount.** A Supabase channel outlives a route change
 *     otherwise, so moving between sprints leaves the old one connected and the
 *     leak stays invisible until the socket limit is hit.
 *   - **Coalesce through a 120ms buffer.** A Notion import writes a batch of
 *     rows in a few milliseconds. One `router.refresh()` per row would refetch
 *     the whole server tree a dozen times over for the same final state.
 *
 * The client is imported INSIDE the effect, not at the top of the file. This is
 * the only module in the app that touches `@supabase/supabase-js`, and a static
 * import puts it — plus the zod-based env validator it pulls with it — into the
 * first chunk of every page in `/app`. That is ~130KB gzipped, on the critical
 * path, so that a subscription can start a moment later. Loading it when the
 * effect runs costs nothing anybody waits for.
 *
 * The refresh IS the update path. There is deliberately no client-side merge of
 * the payload into a local cache: a merge is a second implementation of every
 * rule the server already applies — RLS scope, the minutes rollup, the status
 * ordering — and the two would drift. The server re-renders and React
 * reconciles, so a new row is a new node and animates in on the `micro` tier,
 * while rows that were already there do not move.
 */

const BUFFER_MS = 120;

function useRealtime(channelName: string, table: "work_items" | "comments", filter: string) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let teardown: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      // The route may already have changed while the chunk was in flight.
      if (cancelled) return;

      const supabase = createClient();
      const channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
          // The leading event schedules the refresh; everything that lands
          // inside the window is absorbed into that one call.
          if (timer) return;
          timer = setTimeout(() => {
            timer = null;
            router.refresh();
          }, BUFFER_MS);
        })
        .subscribe();

      teardown = () => void supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      teardown?.();
    };
  }, [channelName, table, filter, router]);
}

/** Items moving in the sprint the reader is actually looking at. */
export function SprintRealtime({ sprintId }: { sprintId: string }) {
  useRealtime(`sprint:${sprintId}`, "work_items", `sprint_id=eq.${sprintId}`);
  return null;
}

/** Comments arriving on the open item. */
export function ThreadRealtime({ workItemId }: { workItemId: string }) {
  useRealtime(`thread:${workItemId}`, "comments", `work_item_id=eq.${workItemId}`);
  return null;
}

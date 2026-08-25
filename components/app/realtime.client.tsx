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
 *   - **Unsubscribe on unmount.** A channel outlives a route change otherwise,
 *     so moving between sprints leaves the old one connected and the leak stays
 *     invisible until the socket limit is hit.
 *   - **Coalesce through a 120ms buffer.** A Notion import writes a batch of
 *     rows in a few milliseconds. One `router.refresh()` per row would refetch
 *     the whole server tree a dozen times over for the same final state.
 *
 * The socket module is imported INSIDE the effect, not at the top of the file.
 * A static import puts it into the first chunk of every page in `/app`, on the
 * critical path, so that a subscription can start a moment later. Loading it
 * when the effect runs costs nothing anybody waits for.
 *
 * It used to be `@supabase/ssr`'s browser client, which built auth, postgrest,
 * storage and functions to read one cookie and open one websocket — 65 KB
 * gzipped, 55% of the app shell's JS budget. It is `@supabase/realtime-js` and
 * a token endpoint now; see `lib/realtime/socket.ts`.
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
      const { subscribeToTable } = await import("@/lib/realtime/socket");
      // The route may already have changed while the chunk was in flight.
      if (cancelled) return;

      const stop = await subscribeToTable({
        channelName,
        table,
        filter,
        onChange: () => {
          // The leading event schedules the refresh; everything that lands
          // inside the window is absorbed into that one call.
          if (timer) return;
          timer = setTimeout(() => {
            timer = null;
            router.refresh();
          }, BUFFER_MS);
        },
      });

      // Awaiting the token means the route can change twice over before this
      // resolves. Tear down immediately rather than leaving a channel nobody
      // will ever remove.
      if (cancelled) {
        stop();
        return;
      }
      teardown = stop;
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

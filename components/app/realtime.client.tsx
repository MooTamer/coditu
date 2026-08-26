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

/**
 * The open story itself changing under whoever is reading it.
 *
 * `ThreadRealtime` covers the discussion and nothing else, so a story page was
 * subscribed to its comments and not to the story: somebody else could publish
 * a new description, rename it, or move its status, and the reader went on
 * seeing the old one indefinitely. Presence said `2 viewing` the whole time,
 * which made it worse — the page knew both people were there and still said
 * nothing.
 *
 * Mounted by the FULL page only, deliberately. The side peek is a parallel
 * route rendered over the sprint, whose `SprintRealtime` filters on
 * `sprint_id` and therefore already carries every item in it — including the
 * one being peeked at. Mounting this in the shared body would give every open
 * peek a second channel for a row it is already being told about, and this
 * file's first rule is that channels are not free.
 *
 * Verified both ways before it was written: the table converged, the peek
 * converged, a comment on the story converged, and the story's own text on the
 * full page did not.
 */
export function ItemRealtime({ workItemId }: { workItemId: string }) {
  useRealtime(`item:${workItemId}`, "work_items", `id=eq.${workItemId}`);
  return null;
}

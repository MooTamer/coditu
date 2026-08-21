"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

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
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
        // The leading event schedules the refresh; everything that lands inside
        // the window is absorbed into that one call.
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          router.refresh();
        }, BUFFER_MS);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
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

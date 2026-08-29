"use client";

import { unstable_rethrow } from "next/navigation";
import { useTransition } from "react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { control } from "@/lib/interactive";

/**
 * The design's `mark all read`, doing what it says.
 *
 * `markNotificationsRead` already existed and was already correct — a Server
 * Action that re-checks the caller server-side, writes only their own rows, and
 * `revalidatePath("/app")`s so this card comes back with the dots gone
 * (invariant 3). The card simply never offered a way to call it.
 *
 * ## It is not offered when there is nothing to mark
 *
 * A control that runs an `update … where read_at is null` against no rows,
 * reports success, and changes nothing on screen is indistinguishable from a
 * broken one. With no unread rows the caller sees no button.
 *
 * ## Failure is visible
 *
 * Invariant 4. There is nothing optimistic to roll back here — the count is
 * server-rendered and only moves when the revalidation lands — but a write that
 * fails silently would leave the reader pressing a button that does nothing, so
 * the toast says so. A Server Action call is a `fetch` and a network failure
 * *rejects* it, which is why this is in a `try`: the `if (!ok)` branch on its
 * own is skipped entirely by a throw.
 */
export function MarkAllRead({ unread }: { unread: number }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (unread === 0) return null;

  return (
    <button
        {...control(pending ? "pending" : "idle")}
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await markNotificationsRead();
            if (!result.ok) toast("Those could not be marked read.");
          } catch (error) {
            // `unstable_rethrow` first, and it is not a formality. Next implements
            // `redirect()` and `notFound()` by THROWING, so a bare catch around a
            // Server Action swallows a working navigation and leaves a control that
            // appears to do nothing. This block guards more than the action call —
            // which is why it stays a block rather than becoming `settle()` — so the
            // rethrow has to be written here.
            unstable_rethrow(error);
            toast("Those could not be marked read — check your connection.");
          }
        })
      }
      className="ml-auto inline-flex h-11 cursor-pointer items-center rounded-control px-[6px] text-[var(--accent)] hover:bg-[var(--tint)] disabled:opacity-60 md:h-[28px]"
    >
      <Mono size="meta">mark all read</Mono>
      <span className="sr-only"> — {unread} unread</span>
    </button>
  );
}

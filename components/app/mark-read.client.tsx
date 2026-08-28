"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/app/toast.client";
import { settle } from "@/lib/action-result";
import { markNotificationsRead } from "@/lib/actions/notifications";

/**
 * Clears the unread notifications, and looks cleared straight away.
 *
 * It used to `await` the write and then `router.refresh()` — a full round trip
 * with the button still saying "Mark 3 as read", which reads as a click that
 * did not land. And it discarded the result entirely: `markNotificationsRead()`
 * returns `{ ok: false }` for a signed-out or deactivated caller, and this
 * refreshed regardless, so a refusal looked exactly like a success that had
 * nothing to clear.
 *
 * Invariant 4: the optimistic value lives only for the transition, so a refusal
 * puts the button back with the count still on it, and says why.
 */
export function MarkNotificationsRead({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [cleared, clear] = useOptimistic(false);
  const router = useRouter();
  const toast = useToast();

  if (cleared) return null;

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          clear(true);
          const result = await settle(() => markNotificationsRead(), "Those could not be marked read. Try signing in again.");
          if (result.ok) router.refresh();
          else toast("Those could not be marked read. Try signing in again.");
        })
      }
      className="w-full border-t border-[var(--hairline)] bg-[var(--canvas)] px-4 py-3 text-left text-[13px] text-[var(--accent)] disabled:opacity-60"
    >
      Mark {count} as read
    </button>
  );
}

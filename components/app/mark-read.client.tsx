"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { markNotificationsRead } from "@/lib/actions/notifications";

export function MarkNotificationsRead({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
      className="w-full border-t border-[var(--hairline)] bg-[var(--canvas)] px-4 py-3 text-left text-[13px] text-[var(--accent)] disabled:opacity-60"
    >
      Mark {count} as read
    </button>
  );
}

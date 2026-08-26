"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { toggleFavourite } from "@/lib/actions/favourites";
import type { FavouriteKind } from "@/lib/favourites";
import { cn } from "@/lib/utils";

/**
 * The one control that puts something in the sidebar, wherever it is.
 *
 * One component for all three kinds, because the only thing that differs is a
 * word in the label. Three near-identical buttons is three chances for the
 * story's star to behave differently from the component's.
 *
 * ## Optimistic, with a rollback and a visible error
 *
 * Invariant 4. The star fills on click, and if the write fails it goes back and
 * says so — a filled star that quietly did nothing is worse than a slow one,
 * because the sidebar is somewhere else on the screen and the reader will not
 * notice it is missing.
 *
 * `router.refresh()` on success is what redraws the sidebar: the action
 * revalidates the app layout, and this is the client half that asks for it.
 */
export function FavouriteStar({
  kind,
  targetId,
  label,
  starred,
  className,
}: {
  kind: FavouriteKind;
  targetId: string;
  /** What is being starred, for the accessible name. */
  label: string;
  starred: boolean;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(starred);

  // The server is the source of truth: a navigation, a revalidate, or the same
  // thing starred from another surface has to reach this control.
  const [lastSeen, setLastSeen] = useState(starred);
  if (lastSeen !== starred) {
    setLastSeen(starred);
    setOn(starred);
  }

  function toggle() {
    const next = !on;
    setOn(next);

    startTransition(async () => {
      const result = await toggleFavourite({ kind, targetId }).catch(() => ({
        ok: false as const,
        error: "That could not be starred.",
      }));

      if (!result.ok) {
        setOn(!next);
        toast(result.error ?? "That could not be starred.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      data-favourite-star
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      title={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control",
        on ? "text-[var(--amber)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]",
        className
      )}
    >
      <Star size={15} strokeWidth={1.9} fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/app/toast.client";
import { settle } from "@/lib/action-result";
import { purgeFromTrash, restoreFromTrash } from "@/lib/actions/trash";
import type { TrashEntry } from "@/lib/data/trash";

/**
 * The two controls on a row in the bin.
 *
 * Restoring is one press. Purging is two, and the second one says what will be
 * lost — this is the only irreversible operation in the application, and for a
 * story it takes the criteria, the thread, the logged hours and the version
 * history with it. A confirmation that says "are you sure?" and nothing else
 * gives somebody no information they did not already have.
 */
export function TrashRow({ entry, canPurge }: { entry: TrashEntry; canPurge: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const noun = entry.kind === "work_item" ? entry.itemKey : "That comment";

  function act(what: "restore" | "purge") {
    startTransition(async () => {
      const result = await settle(
        () =>
          what === "restore"
            ? restoreFromTrash({ kind: entry.kind, entityId: entry.entityId })
            : purgeFromTrash({ kind: entry.kind, entityId: entry.entityId }),
        "That did not go through — check your connection."
      );
      setConfirming(false);
      if (result.ok) {
        toast(what === "restore" ? `${noun} is back.` : `${noun} is gone for good.`);
        router.refresh();
      } else {
        toast(result.error ?? "That did not go through.");
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="text-[11.5px] text-[var(--ink-muted)]">
          {entry.kind === "work_item"
            ? `Deletes ${entry.itemKey}, its criteria, its thread, its version history${
                entry.minutesLogged ? ` and ${(entry.minutesLogged / 60).toFixed(1)} logged hours` : ""
              }. This cannot be undone.`
            : "Removes the comment permanently. This cannot be undone."}
        </p>
        <button
          type="button"
          onClick={() => act("purge")}
          disabled={pending}
          aria-busy={pending}
          className="rounded-chip border border-[var(--hairline-strong)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete for good"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-chip px-[10px] py-[5px] text-[11.5px] text-[var(--ink-faint)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {entry.canRestore ? (
        <button
          type="button"
          onClick={() => act("restore")}
          disabled={pending}
          aria-busy={pending}
          className="rounded-chip border border-[var(--hairline)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-60"
        >
          {pending ? "Restoring…" : "Restore"}
        </button>
      ) : (
        // Visible and explained rather than absent: somebody looking for a
        // control they cannot find assumes the app is broken.
        <span className="text-[11.5px] text-[var(--ink-faint)]">
          {entry.kind === "comment" ? "only its author or an admin" : "admin or lead only"}
        </span>
      )}

      {canPurge ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-chip px-[10px] py-[5px] text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          Delete for good
        </button>
      ) : null}
    </div>
  );
}

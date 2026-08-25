"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/app/toast.client";
import { settle } from "@/lib/action-result";
import { restoreRevision } from "@/lib/actions/revisions";
import type { RevisionSurface } from "@/lib/data/revisions";

/**
 * The one control on the history panel that needs JavaScript.
 *
 * Everything else there — the timeline, the diffs, the expand and collapse — is
 * server-rendered markup and a `<details>` element, so this file is the whole
 * client cost of version history. That is deliberate after W3d, where two
 * innocuous-looking imports put 177 KB into the app shell: a history panel is
 * read far more often than it is acted on, and the reading half should not
 * ship a bundle.
 *
 * ## It asks first, and the confirmation says what will happen
 *
 * Not because restoring is dangerous — it cannot be, since a restore adds a
 * version and removes none — but because the word "restore" implies a rewind to
 * most people, and doing something other than what somebody expects is the
 * problem whether or not it is recoverable. The confirmation states the actual
 * behaviour in the sentence the design wrote for it.
 */
export function RestoreVersion({
  surface,
  entityId,
  revisionNo,
  label,
  itemKey,
  projectSlug,
  sprintNumber,
}: {
  surface: RevisionSurface;
  entityId: string;
  revisionNo: number;
  /** "Description", "Acceptance criterion" — named so the prompt can be specific. */
  label: string;
  itemKey?: string;
  projectSlug?: string;
  sprintNumber?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function run() {
    startTransition(async () => {
      const result = await settle(
        () =>
          restoreRevision({ surface, entityId, revisionNo, itemKey, projectSlug, sprintNumber }),
        "That version did not go back — check your connection."
      );
      setConfirming(false);
      if (result.ok) {
        toast(
          result.revisionNo
            ? `${label} restored as version ${result.revisionNo}.`
            : `${label} restored.`
        );
        router.refresh();
      } else {
        toast(result.error ?? "That version did not go back.");
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-chip border border-[var(--hairline)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        Restore as a new version
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[11.5px] text-[var(--ink-muted)]">
        A restore never overwrites history — it writes a new current version, and records the
        restore itself.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        aria-busy={pending}
        className="rounded-chip border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] disabled:opacity-60"
      >
        {pending ? "Restoring…" : `Restore version ${revisionNo}`}
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

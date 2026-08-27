"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import { useTrackedSave } from "@/components/app/save-state.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { createPage } from "@/lib/actions/pages";

/**
 * Starting a page.
 *
 * A title and nothing else. A page is created empty and unpublished, so the
 * only thing this has to ask for is what to call it — everything else is the
 * editor's job, on the page itself, where there is room.
 *
 * ## Disabled with the reason, never hidden
 *
 * The rule the topbar's Export and New-item controls already follow: a control
 * that disappears reads as a bug, one that is present and explains itself reads
 * as an answer. An engineer sees this button, sees why it is off, and does not
 * have to guess whether pages exist.
 */
export function NewPage({
  projectId,
  canCreate,
  label = "New page",
}: {
  /** Null creates a workspace page. */
  projectId: string | null;
  canCreate: boolean;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const trackedSave = useTrackedSave();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    const result = await trackedSave(
      () => createPage({ projectId, title: name }),
      "That page was not created — check your connection."
    );
    setBusy(false);

    if (result.ok && "href" in result && result.href) {
      setOpen(false);
      setTitle("");
      router.push(result.href);
      router.refresh();
      return;
    }
    // The title stays in the box. Losing what somebody typed because a request
    // failed is the thing invariant 4 forbids, and it is no less true of one
    // field than of a whole document.
    toast(result.error ?? "That page was not created.");
  }

  if (!canCreate) {
    return (
      <button
        type="button"
        disabled
        title="Only an admin or lead can create a page"
        className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[13px] text-[var(--ink-faint)]"
      >
        <Plus size={14} strokeWidth={1.9} aria-hidden />
        {label}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-new-page
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--raised)]"
      >
        <Plus size={14} strokeWidth={1.9} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="new-page-title">
        Page title
      </label>
      <input
        id="new-page-title"
        autoFocus
        value={title}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void create();
          if (event.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        placeholder="What is this page called?"
        className="min-h-11 min-w-[220px] flex-1 rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)] px-3 text-[13px]"
      />
      <button
        type="button"
        onClick={() => void create()}
        disabled={busy || title.trim().length === 0}
        aria-busy={busy}
        className="signal-gradient min-h-11 rounded-control px-4 text-[13px] font-semibold text-[#07090E] disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle("");
        }}
        className="min-h-11 rounded-control border border-[var(--hairline)] px-3 text-[13px] text-[var(--ink-muted)] hover:bg-[var(--raised)]"
      >
        Cancel
      </button>
      <Mono size="meta" className="text-[var(--ink-faint)]">
        ⏎ to create · esc to cancel
      </Mono>
    </div>
  );
}

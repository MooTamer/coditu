"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { useSaveReporter, useTrackedSave } from "@/components/app/save-state.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { publishPage, renamePage, setPageDeleted } from "@/lib/actions/pages";
import { isEmptyDocument } from "@/lib/blocks/schema";
import type { ProfileRef } from "@/lib/data/profiles";

/**
 * A project page or a workspace page, read and written.
 *
 * ## The same editor, loaded the same way
 *
 * `PLAN.md` §3: **one** editor system across story bodies, sprint notes,
 * project notes, criteria, comments and standalone pages. This is the sixth,
 * and it mounts `RichTextEditor` exactly as the other five do — behind
 * `next/dynamic`, so reading a page (which is what almost everybody does, on
 * almost every load) does not pay for TipTap.
 *
 * ## Publishing is explicit, and a draft never leaves the browser
 *
 * §3 again: *"Other users must not see the draft text live"* and *"Longer story
 * or note changes become visible only after Publish/Save succeeds."* Nothing
 * here writes on a keystroke. `Publish` is the act; until it succeeds the draft
 * is in this component and nowhere else, and if it fails the draft stays
 * exactly where it is — invariant 4, and §3's *"Never clear a draft merely
 * because a request failed."*
 *
 * The one state a page has that a sprint note does not is **never published at
 * all**: `pages.published_at is null` is visible to its author and to nobody
 * else, enforced by the read policy rather than by this file. The banner says so
 * rather than leaving somebody to wonder whether their team can see a page they
 * have not finished.
 */
const RichTextEditor = dynamic(
  () => import("./rich-text-editor.client").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-4">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export function PageEditor({
  pageId,
  title,
  bodyDoc,
  body,
  published,
  canEdit,
  people,
  maxImageBatch,
  listHref,
}: {
  pageId: string;
  title: string;
  /** The block document — the editor's starting content. */
  bodyDoc: unknown;
  /** The READ state, rendered on the server. See `sprint-notes.client.tsx`. */
  body: ReactNode;
  published: boolean;
  /** Admin or lead. RLS refuses everyone else's write. */
  canEdit: boolean;
  people: ProfileRef[];
  maxImageBatch: number;
  /** Where "Deleted" returns to. */
  listHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const trackedSave = useTrackedSave();
  const report = useSaveReporter();

  const stored = bodyDoc ?? null;
  const empty = stored === null || isEmptyDocument(stored);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<unknown>(stored ?? EMPTY_DOC);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);

  function begin() {
    if (!canEdit) return;
    setDraft(stored ?? EMPTY_DOC);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(stored ?? EMPTY_DOC);
    report("idle");
  }

  async function save(doc: unknown) {
    setSaving(true);
    const result = await trackedSave(
      () => publishPage({ pageId, doc, publish: true }),
      "That page did not save — check your connection."
    );
    setSaving(false);

    if (result.ok) {
      setEditing(false);
      router.refresh();
      return;
    }
    // The draft stays in `draft`, which is still mounted, so nothing typed is
    // lost. The chip already says `Failed — draft kept`; the toast says why.
    toast(result.error ?? "That page did not save.");
  }

  async function rename() {
    const next = name.trim();
    if (!next || next === title) {
      setRenaming(false);
      setName(title);
      return;
    }
    const result = await trackedSave(
      () => renamePage({ pageId, title: next }),
      "That title did not save — check your connection."
    );
    setRenaming(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setName(title);
    toast(result.error ?? "That title did not save.");
  }

  async function remove() {
    const result = await trackedSave(
      () => setPageDeleted({ pageId, deleted: true }),
      "That page was not deleted — check your connection."
    );
    if (result.ok) {
      // To the bin, not away. The toast says so, because "Deleted" on its own
      // reads as gone and this one is recoverable from `/app/trash`.
      toast("Moved to the bin. It can be put back from Trash.");
      router.push(listHref);
      router.refresh();
      return;
    }
    toast(result.error ?? "That page was not deleted.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void rename();
              if (event.key === "Escape") {
                setRenaming(false);
                setName(title);
              }
            }}
            aria-label="Page title"
            maxLength={120}
            className="min-h-11 min-w-0 flex-1 rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)] px-3 text-[22px] font-bold tracking-[-0.022em]"
          />
        ) : (
          <h1 className="min-w-0 flex-1 text-[22px] font-bold tracking-[-0.022em]">{title}</h1>
        )}

        {canEdit && !renaming ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              aria-label={`Rename ${title}`}
              title="Rename this page"
              className="flex size-11 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--raised)] hover:text-[var(--ink)]"
            >
              <Pencil size={14} strokeWidth={1.8} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              aria-label={`Move ${title} to the bin`}
              title="Move this page to the bin"
              className="flex size-11 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--tone-rose-fg)] hover:bg-[var(--raised)]"
            >
              <Trash2 size={14} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {!published ? (
        <p
          data-unpublished
          className="rounded-inner border border-[var(--tone-amber-fg)] bg-[var(--tone-amber-bg)] px-3 py-2 text-[12.5px] text-[var(--tone-amber-fg)]"
        >
          Not published yet — only you can see this page. Publishing shows it to the team.
        </p>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <RichTextEditor
            initialDoc={draft}
            onChange={setDraft}
            onSubmit={() => void save(draft)}
            onEscape={cancel}
            onToast={toast}
            autoFocus
            placeholder="Write the page — / for blocks, @ to mention"
            ariaLabel="Page body"
            people={people}
            images
            minHeight={260}
            maxBatch={maxImageBatch}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save(draft)}
              disabled={saving}
              aria-busy={saving}
              className="signal-gradient h-[34px] rounded-control px-4 text-[13px] font-semibold text-[#07090E] disabled:opacity-60"
            >
              {saving ? "Publishing…" : published ? "Publish changes" : "Publish to the team"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="h-[34px] rounded-control border border-[var(--hairline-strong)] px-4 text-[13px] font-medium hover:bg-[var(--raised)]"
            >
              Cancel
            </button>
            <Mono size="meta" className="text-[var(--ink-faint)]">
              ⌘⏎ to publish · esc to cancel
            </Mono>
          </div>
        </div>
      ) : (
        <PageBody body={body} onEdit={canEdit ? begin : null} empty={empty} />
      )}
    </div>
  );
}

/**
 * The read state.
 *
 * The whole prose block is the edit affordance, so it is a button rather than a
 * div with a click handler — it has to be reachable and announced. For anybody
 * who cannot edit it renders as plain prose, with no dead control to tab
 * through. Exactly the shape `sprint-notes.client.tsx` settled on, and for the
 * same reasons.
 */
function PageBody({
  body,
  onEdit,
  empty,
}: {
  body: ReactNode;
  onEdit: (() => void) | null;
  empty: boolean;
}) {
  const content = empty ? (
    <p className="text-[13.5px] italic text-[var(--ink-faint)]">
      {onEdit ? "Nothing written yet. Click to start." : "Nothing written yet."}
    </p>
  ) : (
    body
  );

  if (!onEdit) return <div className="max-w-[76ch]">{content}</div>;

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label="Edit this page"
      className="max-w-[76ch] rounded-inner p-2 text-left transition-colors duration-[var(--dur-micro)] hover:bg-[var(--raised)]"
    >
      {content}
    </button>
  );
}

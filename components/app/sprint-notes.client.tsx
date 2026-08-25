"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";

import { CommentBody } from "@/components/app/comment-body";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { setSprintNotes } from "@/lib/actions/sprints";
import { settle } from "@/lib/action-result";
import { isEmptyDocument } from "@/lib/blocks/schema";
import type { ProfileRef } from "@/lib/data/profiles";
import { calendarDate } from "@/lib/format";

/**
 * The same editor the thread and the criteria use, loaded the same way: only
 * when somebody intends to write. Reading a sprint's notes — which is what
 * almost everybody does, on almost every page load — must not pay for TipTap.
 */
const RichTextEditor = dynamic(
  () => import("./rich-text-editor.client").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[120px] rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-4">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

/** What an empty note is, so "nothing written yet" is one shape and not three. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * A legacy note, as a document.
 *
 * Notes written before the editor existed are plain text with a `**wrapped**`
 * paragraph meaning "discuss this first". Converting them on read rather than
 * rewriting the rows keeps 15 sprints of history exactly as it was written, and
 * turns the old convention into the callout it always meant — which is the same
 * thing the amber left rule was drawing by hand.
 */
function documentFromText(text: string): unknown {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: paragraphs.map((paragraph) => {
      // [\s\S] rather than the `s` flag: tsconfig targets ES2017.
      const highlighted = /^\*\*([\s\S]+)\*\*$/.exec(paragraph);
      const body = {
        type: "paragraph",
        content: [{ type: "text", text: highlighted ? highlighted[1] : paragraph }],
      };
      return highlighted ? { type: "callout", attrs: { tone: "amber" }, content: [body] } : body;
    }),
  };
}

/**
 * The sprint notes panel.
 *
 * It has to read as a written note, never as a form field — so: prose at
 * 15px/1.65, no border box, no label, and the "discuss before implementing"
 * convention rendered as a 2px amber left rule rather than a callout component.
 *
 * Markdown here is deliberately minimal. The notes are one or two paragraphs
 * with at most a bolded line, and pulling in a markdown pipeline to render that
 * would ship a parser to every sprint page for no gain. Anything richer belongs
 * in a comment, which has a real editor.
 *
 * Editing keeps that shape. Clicking the prose swaps it for a textarea holding
 * the same text at the same size in the same place — not a modal, not a
 * separate "edit sprint" screen. What you see is what you are editing.
 */
export function SprintNotes({
  sprintId,
  notes,
  notesDoc,
  author,
  writtenOn,
  canEdit,
  people,
  maxImageBatch,
}: {
  sprintId: string;
  /** The flattened projection. Still what the export and the report read. */
  notes: string;
  /** The block document, or null for a note written before the editor existed. */
  notesDoc: unknown;
  author: string | null;
  writtenOn: string | null;
  /** Admin or lead. RLS refuses everyone else's update. */
  canEdit: boolean;
  /** For the `@` list. Notes are written TO the team, so mentions belong here. */
  people: ProfileRef[];
  maxImageBatch: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // A note written before the editor existed renders as the document it always
  // meant — including the `**paragraph**` convention as a real callout.
  const stored = notesDoc ?? (notes.trim() ? documentFromText(notes) : null);
  const empty = stored === null || isEmptyDocument(stored);

  const [draft, setDraft] = useState<unknown>(stored ?? EMPTY_DOC);

  function begin() {
    if (!canEdit) return;
    setDraft(stored ?? EMPTY_DOC);
    setOpen(true);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(stored ?? EMPTY_DOC);
  }

  async function save(doc: unknown) {
    setSaving(true);
    const result = await settle(
      () => setSprintNotes({ sprintId, doc }),
      "Those notes did not save — check your connection."
    );
    setSaving(false);

    if (result.ok) {
      setEditing(false);
      router.refresh();
      return;
    }
    // Invariant 4: the draft stays in the editor, so nothing typed is lost, and
    // the failure is said out loud rather than the panel quietly snapping back.
    toast(result.error ?? "Those notes did not save.");
  }

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--canvas)]">
      <div className="flex items-center gap-[10px] px-6 py-[14px]">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-[10px] text-left"
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            aria-hidden
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms" }}
          />
          <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            Sprint notes
          </Mono>
          {author ? (
            <span className="min-w-0 truncate text-[13.5px] text-[var(--ink-muted)]">
              written by {author}
              {writtenOn ? ` · ${calendarDate(writtenOn)}` : ""}
            </span>
          ) : null}
        </button>

        {canEdit && !editing ? (
          <button
            type="button"
            onClick={begin}
            // 24px minimum target, and a name that says what it edits — there
            // are several "Edit" buttons on this page.
            aria-label="Edit the sprint notes"
            className="flex size-8 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--raised)] hover:text-[var(--ink)]"
          >
            <Pencil size={13} strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="max-w-[78ch] pb-6 pl-[50px] pr-6">
          {editing ? (
            <div className="flex flex-col gap-3">
              <RichTextEditor
                initialDoc={draft}
                onChange={setDraft}
                onSubmit={() => void save(draft)}
                onEscape={cancel}
                onToast={toast}
                autoFocus
                placeholder="What the team should know before starting this sprint — / for blocks, @ to mention"
                ariaLabel="Sprint notes"
                people={people}
                images
                minHeight={140}
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
                  {saving ? "Publishing…" : "Publish to the team"}
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
            <NotesBody doc={stored} onEdit={canEdit ? begin : null} empty={empty} />
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The read state.
 *
 * The whole prose block is the edit affordance, which is why it is a button
 * rather than a div with a click handler: it has to be reachable and announced.
 * For anyone who cannot edit it renders as plain prose, with no dead control to
 * tab through.
 *
 * The body goes through `CommentBody` — the same server-side walker the thread
 * and the criteria use. One renderer means a callout written in a comment and a
 * callout written in the notes are the same thing on screen, and the allowlist
 * is enforced in one place rather than three.
 */
function NotesBody({
  doc,
  onEdit,
  empty,
}: {
  doc: unknown;
  onEdit: (() => void) | null;
  empty: boolean;
}) {
  const body = empty ? (
    <p className="text-[15px] leading-[1.65] text-[var(--ink-faint)]">
      {onEdit ? "No notes yet — click to write them." : "No notes for this sprint."}
    </p>
  ) : (
    <div className="coditu-notes text-[15px] leading-[1.65]">
      <CommentBody doc={doc} />
    </div>
  );

  if (!onEdit) return body;

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Click to edit the sprint notes"
      className="-m-2 block w-full cursor-text rounded-inner p-2 text-left transition-colors duration-[var(--dur-micro)] hover:bg-[var(--raised)]"
    >
      {body}
    </button>
  );
}

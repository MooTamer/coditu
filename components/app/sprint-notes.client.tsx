"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { setSprintNotes } from "@/lib/actions/sprints";
import { calendarDate } from "@/lib/format";

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
  author,
  writtenOn,
  canEdit,
}: {
  sprintId: string;
  notes: string;
  author: string | null;
  writtenOn: string | null;
  /** Admin or lead. RLS refuses everyone else's update. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const paragraphs = notes.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // Put the caret at the END of the text, not the start. Selecting all of it —
  // which is what focus() alone effectively invites — means the first keystroke
  // of someone who meant to append destroys the note.
  useEffect(() => {
    if (!editing) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [editing]);

  function begin() {
    if (!canEdit) return;
    setDraft(notes);
    setOpen(true);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(notes);
  }

  async function save() {
    if (draft.trim() === notes.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await setSprintNotes({ sprintId, notes: draft });
    setSaving(false);

    if (result.ok) {
      setEditing(false);
      router.refresh();
      return;
    }
    // Invariant 4: the draft is kept, so nothing typed is lost, and the failure
    // is visible rather than a panel that quietly snaps back.
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
              <textarea
                ref={areaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    // Stop here: the item modal listens for Escape on the
                    // document, and leaving this to bubble closes the whole
                    // dialog behind an editor the reader was still in.
                    event.stopPropagation();
                    cancel();
                  } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void save();
                  }
                }}
                rows={Math.min(Math.max(draft.split("\n").length + 2, 5), 18)}
                aria-label="Sprint notes"
                className="w-full resize-y rounded-inner border border-[var(--hairline-strong)] bg-[var(--raised)] p-4 text-[15px] leading-[1.65] text-[var(--ink)]"
                placeholder="What the team should know before starting this sprint."
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  aria-busy={saving}
                  className="signal-gradient h-[34px] rounded-control px-4 text-[13px] font-semibold text-[#07090E] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save notes"}
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
                  ⌘⏎ to save · esc to cancel · wrap a paragraph in ** to flag it amber
                </Mono>
              </div>
            </div>
          ) : (
            // The whole prose block is the edit affordance, which is why it is
            // a button rather than a div with a click handler: it has to be
            // reachable and announced. For anyone who cannot edit it renders as
            // plain prose, with no dead control to tab through.
            <ProseBody
              paragraphs={paragraphs}
              onEdit={canEdit ? begin : null}
              empty={notes.trim().length === 0}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProseBody({
  paragraphs,
  onEdit,
  empty,
}: {
  paragraphs: string[];
  onEdit: (() => void) | null;
  empty: boolean;
}) {
  const body = empty ? (
    <p className="text-[15px] leading-[1.65] text-[var(--ink-faint)]">
      {onEdit ? "No notes yet — click to write them." : "No notes for this sprint."}
    </p>
  ) : (
    <>
      {paragraphs.map((paragraph, index) => {
        // A whole paragraph wrapped in ** is the highlight convention: it
        // means "discuss this before implementing".
        // [\s\S] rather than the `s` flag: tsconfig targets ES2017, which predates it.
        const highlight = /^\*\*([\s\S]+)\*\*$/.exec(paragraph);
        if (highlight) {
          return (
            <p
              key={index}
              className="mt-[14px] border-l-2 pl-4 text-[15px] leading-[1.65] text-[var(--ink)] first:mt-0"
              style={{ borderColor: "var(--amber)" }}
            >
              {highlight[1]}
            </p>
          );
        }
        return (
          <p key={index} className="mt-[14px] text-[15px] leading-[1.65] text-[var(--ink)] first:mt-0">
            {paragraph}
          </p>
        );
      })}
    </>
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

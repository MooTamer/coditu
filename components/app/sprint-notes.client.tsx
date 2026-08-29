"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, History, Pencil } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { setSprintNotes } from "@/lib/actions/sprints";
import { useTrackedSave } from "@/components/app/save-state.client";
import { documentFromText, isEmptyDocument } from "@/lib/blocks/schema";
import type { ProfileRef } from "@/lib/data/profiles";
import { calendarDate } from "@/lib/format";
import { control } from "@/lib/interactive";

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

export function SprintNotes({
  sprintId,
  notes,
  notesDoc,
  body,
  author,
  writtenOn,
  canEdit,
  people,
  maxImageBatch,
  historyHref,
}: {
  sprintId: string;
  /** The flattened projection. Still what the export and the report read. */
  notes: string;
  /** The block document — the editor's starting content, and how emptiness is decided. */
  notesDoc: unknown;
  /**
   * The READ state, rendered on the server.
   *
   * `CommentBody` pulls in lowlight; importing it into this client component put
   * it on every sprint page. See `item-fields.client.tsx` for the measurement.
   */
  body: ReactNode;
  author: string | null;
  writtenOn: string | null;
  /** Admin or lead. RLS refuses everyone else's update. */
  canEdit: boolean;
  /** For the `@` list. Notes are written TO the team, so mentions belong here. */
  people: ProfileRef[];
  maxImageBatch: number;
  /**
   * Where this note's Version History lives.
   *
   * Absent on the notes' own page, which already *is* that screen — a link back
   * to the page you are on is a control that does nothing. Present in the
   * sprint header, where the timeline has no room: `PLAN.md` §11 asks for
   * *"Version History"* on every sprint note, and this is the door to it.
   */
  historyHref?: string;
}) {
  const router = useRouter();
  const trackedSave = useTrackedSave();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // A note written before the editor existed renders as the document it always
  // meant — including the `**paragraph**` convention as a real callout.
  const stored = notesDoc ?? (notes.trim() ? documentFromText(notes, { starsAreCallouts: true }) : null);
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
    const result = await trackedSave(
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

        {historyHref && !editing ? (
          // A link rather than a button, so it opens in a new tab, can be
          // copied, and works before hydration — the same reasoning the history
          // screen's own filter chips follow.
          <Link
            href={historyHref}
            data-notes-history
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-[12px] font-medium text-[var(--ink-muted)] hover:bg-[var(--raised)] hover:text-[var(--ink)]"
          >
            <History size={13} strokeWidth={1.8} aria-hidden />
            Version history
          </Link>
        ) : null}

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
                {/* The contract goes on the button that does the WORK.
                    PF-4's sweep put the `control()` spread on Cancel and left
                    Publish reporting ad-hoc with `disabled` + `aria-busy` — the
                    exact spelling that sweep existed to remove, on the exact
                    button it was meant to move. Cancel triggers no work and
                    keeps native `disabled`, which is the contract's own answer
                    for that state. Found while measuring PF-6. */}
                <button
                  {...control(saving ? "pending" : "idle")}
                  type="button"
                  onClick={() => void save(draft)}
                  disabled={saving}
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
            <NotesBody body={body} onEdit={canEdit ? begin : null} empty={empty} />
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
  body: rendered,
  onEdit,
  empty,
}: {
  body: ReactNode;
  onEdit: (() => void) | null;
  empty: boolean;
}) {
  const body = empty ? (
    <p className="text-[15px] leading-[1.65] text-[var(--ink-faint)]">
      {onEdit ? "No notes yet — click to write them." : "No notes for this sprint."}
    </p>
  ) : (
    <div className="coditu-notes text-[15px] leading-[1.65]">{rendered}</div>
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

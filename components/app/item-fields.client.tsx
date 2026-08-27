"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { CornerUpRight, Loader2, Pencil, Trash2, X } from "lucide-react";

import dynamic from "next/dynamic";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { useTrackedSave } from "@/components/app/save-state.client";
import { useAnnounceSurface } from "@/components/app/presence-surface.client";
import { documentFromText, isEmptyDocument } from "@/lib/blocks/schema";
import type { ProfileRef } from "@/lib/data/profiles";
import { deleteWorkItem, moveWorkItem, restoreWorkItem, setWorkItemFields } from "@/lib/actions/work-items";
import { hoursLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The same editor every other writing surface uses, loaded the same way — only
 * when somebody intends to write. An item page that is being read, which is
 * almost all of them, must not pay for TipTap.
 */
const RichTextEditor = dynamic(
  () => import("./rich-text-editor.client").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[74px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

/** What an empty field is, so "nothing written" is one shape and not three. */
const EMPTY_PROSE_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * An item's own words, editable in place.
 *
 * Until 2026-08-25 a work item's title, description and highlight had **no
 * path at all** after creation. `guard_work_item_columns` had always treated
 * them as admin and lead columns, so the database was ready and only the screen
 * was missing — which is the definition of an unfinished CRUD rather than
 * restraint. The day after planning, somebody always wants to fix a typo.
 *
 * Every control here is optimistic with a rollback and a visible error
 * (invariant 4), and every one of them is `settle()`d, because a Server Action
 * that *rejects* skips the rollback path a plain `if (!result.ok)` covers.
 */

const FIELD =
  "w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] py-2 text-[var(--ink)]";
const GHOST =
  "grid size-[30px] shrink-0 place-items-center rounded-control text-[var(--ink-faint)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45";

export function EditableTitle({
  itemId,
  title,
  canEdit,
}: {
  itemId: string;
  title: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const trackedSave = useTrackedSave();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  // The title is a document surface like any other as far as the stack is
  // concerned: a name, never the words.
  useAnnounceSurface(editing ? "title" : null);
  const [draft, setDraft] = useState(title);
  const [shown, showOptimistic] = useOptimistic(title, (_current, next: string) => next);

  // The server is the source of truth the moment it answers. Without this a
  // second edit starts from the first edit's draft rather than from what was
  // actually saved.
  //
  // Adjusted during render rather than in an effect. React documents this
  // shape for exactly this case, and an effect that calls `setState` costs a
  // second render pass every time the prop moves — which here is every refresh.
  const [lastTitle, setLastTitle] = useState(title);
  if (title !== lastTitle) {
    setLastTitle(title);
    setDraft(title);
  }

  function save() {
    const next = draft.trim();
    if (!next) {
      toast("An item needs a title.");
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }
    setEditing(false);
    startTransition(async () => {
      showOptimistic(next);
      const result = await trackedSave(
        () => setWorkItemFields({ itemId, title: next }),
        "That title did not save — check your connection."
      );
      if (result.ok) {
        router.refresh();
        return;
      }
      // `useOptimistic` reverts on its own when the transition ends; the
      // sentence is the half that used to be missing.
      setDraft(title);
      toast(result.error ?? "That title did not save.");
    });
  }

  if (!canEdit) {
    return <h1 className="text-[22px] font-bold leading-[1.25] tracking-[-0.02em]">{shown}</h1>;
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`title-${itemId}`}>
          Title
        </label>
        <textarea
          id={`title-${itemId}`}
          autoFocus
          rows={2}
          maxLength={200}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(title);
              setEditing(false);
            }
          }}
          className={cn(FIELD, "resize-none text-[20px] font-bold leading-[1.3]")}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="signal-gradient h-[32px] rounded-control px-4 text-[12.5px] font-semibold text-[#07090E] disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(title);
              setEditing(false);
            }}
            className="h-[32px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)]"
          >
            Cancel
          </button>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            ⏎ to save · Esc to abandon
          </Mono>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <h1
        className={cn(
          "min-w-0 flex-1 text-[22px] font-bold leading-[1.25] tracking-[-0.02em]",
          pending && "text-[var(--ink-muted)]"
        )}
      >
        {shown}
      </h1>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label="Edit the title"
        className={cn(GHOST, "mt-1")}
      >
        {pending ? (
          <Loader2 size={13} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Pencil size={13} strokeWidth={1.8} aria-hidden />
        )}
      </button>
    </div>
  );
}

/**
 * The description and the highlight — multi-line plain text, edited where they
 * are read.
 *
 * `whitespace-pre-line` in read mode and a plain textarea in edit mode, because
 * 58 of the imported descriptions are multi-line requirement lists and
 * collapsing their newlines turned them into one unreadable paragraph once
 * before. Not the rich editor: `03-APP-SPEC.md` describes these as prose
 * fields, and a criterion or a comment is where a screenshot belongs.
 */
export function EditableProse({
  itemId,
  field,
  value,
  doc,
  body,
  canEdit,
  label,
  placeholder,
  accent,
  people,
  maxImageBatch,
}: {
  itemId: string;
  field: "description" | "highlight";
  /** The flattened projection. What every export reads, and the legacy source. */
  value: string | null;
  /**
   * The block document — the editor's starting content, and how emptiness is
   * decided. Plain JSON, so it costs the client nothing.
   */
  doc: unknown;
  /**
   * The READ state, rendered on the server and handed down.
   *
   * `CommentBody` walks stored JSON and pulls in lowlight with every common
   * language. Importing it here would ship that to the sprint page — the item
   * detail's client refs land in the sprint route's chunk group — and it
   * measured **+114 KB**, taking the shell from 69 KB to 184 KB against a
   * 110 KB budget. `criteria-list.client.tsx` says so in its own header; this
   * prop is that lesson, learned twice.
   */
  body: ReactNode;
  canEdit: boolean;
  label: string;
  placeholder: string;
  /** The highlight renders as a rule in `--amber`; the description has none. */
  accent?: string;
  /** For the `@` list. A story body is written to the team like anything else. */
  people: ProfileRef[];
  /** From `app_settings`. Optional for the same reason the editor's own is: a
   *  caller without it gets the editor's default rather than a crash. */
  maxImageBatch?: number;
}) {
  const router = useRouter();
  const trackedSave = useTrackedSave();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  // `description` or `highlight` — the field's own name, so the stack can
  // say which one. Never its contents.
  useAnnounceSurface(editing ? field : null);

  // A story written before the editor existed reads as the document it always
  // meant. `starsAreCallouts` is off: a description never used that convention —
  // it has `highlight`, a column of its own.
  const stored = doc ?? (value?.trim() ? documentFromText(value) : null);
  const [draft, setDraft] = useState<unknown>(stored ?? EMPTY_PROSE_DOC);

  // Adjusted during render, not in an effect — the same rule the title above
  // follows.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(stored ?? EMPTY_PROSE_DOC);
  }

  const [shownDoc, showOptimistic] = useOptimistic<unknown>(stored);
  const empty = shownDoc === null || isEmptyDocument(shownDoc);

  function save(next: unknown) {
    setEditing(false);
    startTransition(async () => {
      const cleared = next === null || isEmptyDocument(next);
      showOptimistic(cleared ? null : next);
      const result = await trackedSave(
        () => setWorkItemFields({ itemId, [`${field}Doc`]: cleared ? null : next }),
        `That ${label.toLowerCase()} did not save — check your connection.`
      );
      if (result.ok) {
        router.refresh();
        return;
      }
      setDraft(stored ?? EMPTY_PROSE_DOC);
      toast(result.error ?? `That ${label.toLowerCase()} did not save.`);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <RichTextEditor
          initialDoc={draft}
          onChange={setDraft}
          onSubmit={() => save(draft)}
          onEscape={() => {
            setDraft(stored ?? EMPTY_PROSE_DOC);
            setEditing(false);
          }}
          onToast={toast}
          autoFocus
          placeholder={placeholder}
          ariaLabel={label}
          people={people}
          images
          workItemId={itemId}
          minHeight={field === "description" ? 120 : 74}
          density={field === "highlight" ? "compact" : "comfortable"}
          maxBatch={maxImageBatch}
        />
        <div className="flex items-center gap-2">
          <Mono size="meta" className="mr-auto text-[var(--ink-faint)]">
            ⌘⏎ to save · Esc to abandon
          </Mono>
          {/* Explicit Save, and it replaces blur-to-save deliberately.
              A textarea has nothing to click except away, so committing on blur
              was right for it. This editor has a TOOLBAR, and pressing Bold
              blurs the contenteditable — so blur-to-save would commit on every
              formatting click, once per round trip, half-formatted. The criteria
              editor met the same constraint and answered it the same way, so the
              two writing surfaces keep one set of habits. */}
          <button
            type="button"
            onClick={() => {
              setDraft(stored ?? EMPTY_PROSE_DOC);
              setEditing(false);
            }}
            className="h-[30px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save(draft)}
            className="signal-gradient h-[30px] rounded-control px-3 text-[12.5px] font-semibold text-[#07090E]"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (empty) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start rounded-control border border-dashed border-[var(--hairline-strong)] px-3 py-2 text-[13.5px] text-[var(--ink-faint)] hover:text-[var(--ink-muted)]"
      >
        {placeholder}
      </button>
    );
  }

  const read = (
    <div
      className={cn(
        "coditu-prose-read text-[14.5px] leading-[1.6]",
        accent ? "border-l-2 pl-[14px] text-[var(--ink)]" : "text-[var(--ink-muted)]",
        pending && "opacity-70"
      )}
      style={accent ? { borderColor: accent } : undefined}
    >
      {field === "highlight" ? <span className="sr-only">Discuss before implementing: </span> : null}
      {/* Rendered upstairs by the same server-side walker the thread, the
          criteria and the sprint notes use — one renderer, one allowlist, one
          shape for a callout wherever it was written. It is a frame behind after
          a save; the `pending` opacity says so until the refresh lands. */}
      {body}
    </div>
  );

  if (!canEdit) return read;

  return (
    <div className="group flex items-start gap-2">
      <div className="min-w-0 flex-1">{read}</div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label={`Edit the ${label.toLowerCase()}`}
        className={GHOST}
      >
        {pending ? (
          <Loader2 size={13} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Pencil size={13} strokeWidth={1.8} aria-hidden />
        )}
      </button>
    </div>
  );
}

export interface MoveTarget {
  id: string;
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
}

/**
 * Carry it over, or take it out of the sprint.
 *
 * "This slipped, move it to next week" and "this was a duplicate" are the two
 * things a person needs on the morning after planning, and neither existed.
 *
 * **The delete is soft and it says what it costs.** The confirm names the hours
 * the item is carrying, because those hours are what a sprint total and an
 * invoice are built from — and the toast that follows offers them straight
 * back, because a first week should have nothing in it that a person still
 * learning the buttons cannot undo.
 */
export function ItemActions({
  itemId,
  itemKey,
  minutesLogged,
  sprintId,
  sprintPath,
  sprints,
  canManage,
}: {
  itemId: string;
  itemKey: string;
  minutesLogged: number;
  sprintId: string;
  /** Where to land after a delete. The item's own URL stops resolving. */
  sprintPath: string;
  /** Every sprint on THIS project. Invariant 1: there is no cross-project move. */
  sprints: MoveTarget[];
  canManage: boolean;
}) {
  const router = useRouter();
  const trackedSave = useTrackedSave();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 6000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (!canManage) return null;

  const targets = sprints.filter((sprint) => sprint.id !== sprintId && sprint.status !== "closed");

  function move(targetSprintId: string) {
    setMoving(false);
    startTransition(async () => {
      const result = await trackedSave(
        () => moveWorkItem({ itemId, targetSprintId }),
        "That move did not save — check your connection."
      );
      if (result.ok) {
        const target = targets.find((sprint) => sprint.id === targetSprintId);
        toast(`${itemKey} moved to ${target?.name ?? "the other sprint"}.`);
        router.refresh();
        return;
      }
      toast(result.error ?? "That move did not save.");
    });
  }

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    startTransition(async () => {
      const result = await trackedSave(
        () => deleteWorkItem({ itemId }),
        "That item did not go — check your connection."
      );
      if (!result.ok) {
        toast(result.error ?? "That item did not go.");
        return;
      }
      toast(`${itemKey} deleted. Its ${hoursLabel(minutesLogged)} are still here — restore it from the sprint.`, {
        label: "Undo",
        onAction: () => {
          startTransition(async () => {
            const undone = await trackedSave(
              () => restoreWorkItem({ itemId }),
              "That item did not come back."
            );
            toast(undone.ok ? `${itemKey} is back.` : undone.error ?? "That item did not come back.");
            router.refresh();
          });
        },
      });

      // Leave, rather than refresh. This control renders inside the intercepted
      // modal as well as on the full page, and in both cases the URL it is on
      // has just stopped resolving — the read policy hides a deleted item from
      // every select, so a refresh would land on the not-found screen with the
      // undo toast still on top of it.
      //
      // `push` alone, with no `refresh` after it: `revalidatePath` has already
      // run in the action, and a `refresh()` issued before a `push` has
      // committed CANCELS the navigation. That one is in the field notes.
      router.push(sprintPath);
    });
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
      {targets.length > 0 ? (
        <button
          type="button"
          onClick={() => setMoving((was) => !was)}
          disabled={pending}
          aria-expanded={moving}
          className="inline-flex h-8 items-center gap-[6px] rounded-control border border-[var(--hairline)] px-[10px] text-[12.5px] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)] disabled:opacity-45"
        >
          <CornerUpRight size={13} strokeWidth={1.9} aria-hidden />
          Move
        </button>
      ) : null}

      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete ${itemKey}`}
        title={
          minutesLogged > 0
            ? `${itemKey} carries ${hoursLabel(minutesLogged)}. Deleting takes them out of the sprint — nothing is destroyed, and it can be undone.`
            : `Delete ${itemKey}`
        }
        className={cn(
          "inline-flex h-8 items-center gap-[6px] rounded-control border border-[var(--hairline)] px-[10px] text-[12.5px] text-[var(--ink-muted)] hover:border-[var(--rose)] hover:text-[var(--rose)] disabled:opacity-45",
          confirming && "border-[var(--rose)] font-semibold text-[var(--rose)]"
        )}
      >
        {pending ? (
          <Loader2 size={13} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Trash2 size={13} strokeWidth={1.8} aria-hidden />
        )}
        {confirming
          ? minutesLogged > 0
            ? `Delete, and take out ${hoursLabel(minutesLogged)}?`
            : "Delete?"
          : "Delete"}
      </button>

      {moving ? (
        <div
          data-reveal="surface"
          className="absolute bottom-[calc(100%+6px)] left-0 z-[70] flex max-h-[240px] w-[min(280px,100%)] flex-col overflow-y-auto rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] p-1"
          style={{ boxShadow: "var(--shadow-overlay)" }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setMoving(false);
            }
          }}
        >
          <Mono size="eyebrow" className="px-2 py-1 text-[var(--ink-faint)]">
            Move {itemKey} to
          </Mono>
          {targets.map((sprint) => (
            <button
              key={sprint.id}
              type="button"
              onClick={() => move(sprint.id)}
              className="flex min-h-[44px] items-center justify-between gap-2 rounded-control px-2 text-left text-[13.5px] hover:bg-[var(--canvas)]"
            >
              <span className="min-w-0 truncate">{sprint.name}</span>
              <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                {sprint.status}
              </Mono>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMoving(false)}
            aria-label="Cancel the move"
            className="mt-1 flex min-h-[36px] items-center justify-center rounded-control text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            <X size={13} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

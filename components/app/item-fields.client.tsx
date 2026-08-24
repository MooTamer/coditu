"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { CornerUpRight, Loader2, Pencil, Trash2, X } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { deleteWorkItem, moveWorkItem, restoreWorkItem, setWorkItemFields } from "@/lib/actions/work-items";
import { hoursLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
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
      const result = await settle(
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
  canEdit,
  label,
  placeholder,
  accent,
}: {
  itemId: string;
  field: "description" | "highlight";
  value: string | null;
  canEdit: boolean;
  label: string;
  placeholder: string;
  /** The highlight renders as a rule in `--amber`; the description has none. */
  accent?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [shown, showOptimistic] = useOptimistic(value, (_current, next: string | null) => next);
  // Same as the title above: adjusted during render, not in an effect.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? "");
  }

  function save() {
    const next = draft.trim();
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    setEditing(false);
    startTransition(async () => {
      showOptimistic(next || null);
      const result = await settle(
        () => setWorkItemFields({ itemId, [field]: next || null }),
        `That ${label.toLowerCase()} did not save — check your connection.`
      );
      if (result.ok) {
        router.refresh();
        return;
      }
      setDraft(value ?? "");
      toast(result.error ?? `That ${label.toLowerCase()} did not save.`);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`${field}-${itemId}`}>
          {label}
        </label>
        <textarea
          id={`${field}-${itemId}`}
          autoFocus
          rows={Math.min(16, Math.max(4, draft.split("\n").length + 1))}
          maxLength={field === "description" ? 4000 : 2000}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(value ?? "");
              setEditing(false);
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
          }}
          // Clicking away commits, never silently discards — the same rule the
          // criteria editor follows, and the one that stops a half-written
          // paragraph vanishing because somebody scrolled.
          onBlur={save}
          className={cn(FIELD, "text-[14.5px] leading-[1.6]")}
        />
        <Mono size="meta" className="text-[var(--ink-faint)]">
          ⌘⏎ to save · Esc to abandon · clicking away saves
        </Mono>
      </div>
    );
  }

  if (!shown) {
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

  const body = (
    <p
      className={cn(
        "whitespace-pre-line text-[14.5px] leading-[1.6]",
        accent ? "border-l-2 pl-[14px] text-[var(--ink)]" : "text-[var(--ink-muted)]",
        pending && "opacity-70"
      )}
      style={accent ? { borderColor: accent } : undefined}
    >
      {field === "highlight" ? <span className="sr-only">Discuss before implementing: </span> : null}
      {shown}
    </p>
  );

  if (!canEdit) return body;

  return (
    <div className="group flex items-start gap-2">
      <div className="min-w-0 flex-1">{body}</div>
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
      const result = await settle(
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
      const result = await settle(
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
            const undone = await settle(
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

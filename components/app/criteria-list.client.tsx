"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
// From `lib/blocks/uploading.ts`, NOT from `uploading-image.client.tsx`:
// that module defines a TipTap node view, and importing a helper out of it
// puts 329 KB of ProseMirror on this page. See that file.
import { hasPendingUpload } from "@/lib/blocks/uploading";
import { Mono } from "@/components/coditu/mono";
import { ProgressRing } from "@/components/coditu/progress-ring";
import { useTrackedSave } from "@/components/app/save-state.client";
import { useAnnounceSurface } from "@/components/app/presence-surface.client";
import {
  addCriterion,
  editCriterion,
  removeCriterion,
  reorderCriteria,
  setCriterionDone,
} from "@/lib/actions/work-items";
import { flattenToText, isEmptyDocument } from "@/lib/blocks/schema";
import type { ProfileRef } from "@/lib/data/profiles";
import type { Criterion } from "@/lib/data/work-item";
import { cn } from "@/lib/utils";

/**
 * The same editor the thread uses, loaded the same way: only when somebody
 * actually intends to write. Reading a list of criteria must not pay for
 * TipTap, and most people only ever read it.
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

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Acceptance criteria: a checklist that can hold a document.
 *
 * ── A criterion is a document ──────────────────────────────────────────────
 * It holds what a comment holds: paragraphs, lists, links, code blocks, and
 * pictures pasted straight in. "How will we know this is done" is very often a
 * screenshot with an arrow on it, and before this it had to go in the thread
 * with the criterion saying "see comments".
 *
 * The bodies are rendered ON THE SERVER and handed down as `bodies` — the same
 * arrangement the comment thread uses, and for the same reason: `CommentBody`
 * walks stored JSON and pulls in lowlight, and shipping that to make a
 * checklist render would cost the item route a bundle it does not have.
 *
 * ── Done sinks, and manual order survives it ───────────────────────────────
 * The sort key is `(isDone, orderIndex)` and it is applied **at the render
 * edge, never written to `order_index`**. Ticking a box must not rewrite
 * anybody's manual ordering, and un-ticking has to return the criterion to
 * exactly the position it held before — which it does, because its position was
 * never touched. The optimistic state sorts by the same key as the server, or
 * the row would jump once on tick and again on refresh.
 *
 * **The export order is `order_index`, always.** "Done last" is a reading
 * affordance for the team; the CSV, the Markdown and the client PDF are a
 * contract and are unaffected. `tests/export.test.ts` asserts it.
 *
 * ── Why the row is no longer one big button ────────────────────────────────
 * It used to be: the whole row toggled the tick. That cannot survive a
 * criterion containing a link and a picture — a click on the screenshot would
 * tick the box instead of opening it, and a button containing a button is
 * `nested-interactive`. The tick, the body and the controls are three separate
 * targets now, each ≥44px on a coarse pointer.
 */
export function CriteriaList({
  itemId,
  criteria,
  bodies,
  canToggle,
  canEditBody,
  canManage,
  people,
  maxBatch,
}: {
  itemId: string;
  criteria: Criterion[];
  /** Server-rendered documents, keyed by criterion id. Null where a criterion
   *  has only ever been a sentence — `body` is then the whole of it. */
  bodies: Record<string, ReactNode>;
  canToggle: boolean;
  /** Assignee, reviewer, admin or lead. Widened 2026-08-25 at the team's
   *  request: the set that may tick a box may now say what the box says. */
  canEditBody: boolean;
  /** Admin or lead. Adding, removing and reordering is the shape of the scope. */
  canManage: boolean;
  /** For the mention list inside the editor. */
  people: ProfileRef[];
  /** How many images one paste may carry — from `app_settings`. */
  maxBatch?: number;
}) {
  const toast = useToast();
  const trackedSave = useTrackedSave();
  const router = useRouter();
  const [, startTransition] = useTransition();

  /** `null` = nothing open, `"new"` = the add form, otherwise a criterion id. */
  const [editing, setEditing] = useState<string | null>(null);
  // Tells the story's presence stack that criteria are being edited, for as
  // long as one is open. A name, never what is being typed.
  useAnnounceSurface(editing ? "criteria" : null);
  /** Text of a criterion whose edit has been sent but whose server tree has not
   *  come back yet. Without it the row shows the OLD wording for a beat, which
   *  reads as a failed save. */
  const [pendingText, setPendingText] = useState<Record<string, string>>({});
  /** A drag in progress, before the server has answered. */
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);

  const [items, setItems] = useOptimistic(
    criteria,
    (state, update: { id: string; isDone: boolean }) =>
      state.map((c) => (c.id === update.id ? { ...c, isDone: update.isDone } : c))
  );

  const done = items.filter((c) => c.isDone).length;
  const total = items.length;

  /**
   * The reading order: undone first, each group in its own manual order.
   *
   * Sorted here and nowhere else. `orderIndex` is what the database holds and
   * what every export reads; this is a lens over it.
   */
  const ordered = useMemo(() => {
    const byId = new Map(items.map((c) => [c.id, c]));
    // The optimistic order is used only while it still describes exactly this
    // list. The moment a criterion is added or removed it does not — and
    // preferring it anyway would render the new one nowhere at all, which
    // reads as the add having failed. The server's own order takes over as
    // soon as that happens, which is also what releases the drag handle.
    const usable =
      dragOrder !== null &&
      dragOrder.length === items.length &&
      dragOrder.every((id) => byId.has(id));

    const manual = usable
      ? dragOrder.map((id) => byId.get(id)!)
      : [...items].sort((a, b) => a.orderIndex - b.orderIndex);
    return [...manual].sort((a, b) => Number(a.isDone) - Number(b.isDone));
  }, [items, dragOrder]);

  /**
   * Let go of the optimistic order once the server agrees with it.
   *
   * Adjusted during render rather than in an effect. Without this the handle
   * stayed disabled after one drag — `canReorder` excluded it — so a checklist
   * could be reordered exactly once per mount, which is the kind of bug that
   * gets reported as "drag is flaky".
   */
  const serverOrder = items
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => c.id)
    .join(",");
  const [lastServerOrder, setLastServerOrder] = useState(serverOrder);
  if (serverOrder !== lastServerOrder) {
    setLastServerOrder(serverOrder);
    if (dragOrder && dragOrder.join(",") === serverOrder) setDragOrder(null);
  }

  /**
   * The sensors, copied exactly from `sprint-table.client.tsx`.
   *
   * `PointerSensor` at `distance: 6` treats the first six pixels of a SCROLL as
   * the start of a drag, which makes a list unusable with a thumb. A press
   * delay is the documented answer — hold for 220ms and it is a drag, move
   * before that and it is a scroll — and `tolerance` allows the few pixels a
   * finger drifts while pressing. The keyboard sensor is not a fallback: a
   * reorder you can only do with a mouse is a reorder half the team cannot do.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const label = useCallback(
    (id: string | number) => {
      const found = items.find((c) => c.id === String(id));
      return found ? found.body.slice(0, 60) : "that criterion";
    },
    [items]
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => `Lifted ${label(active.id)}. Use the arrow keys to move it.`,
      onDragOver: ({ active, over }) =>
        over ? `${label(active.id)} is now over ${label(over.id)}.` : "",
      onDragEnd: ({ active, over }) =>
        over ? `Dropped ${label(active.id)} after ${label(over.id)}.` : `Dropped ${label(active.id)}.`,
      onDragCancel: ({ active }) => `Cancelled. ${label(active.id)} returned to its place.`,
    }),
    [label]
  );

  function toggle(criterion: Criterion) {
    if (!canToggle) return;
    startTransition(async () => {
      setItems({ id: criterion.id, isDone: !criterion.isDone });
      const result = await trackedSave(
        () => setCriterionDone({ criterionId: criterion.id, isDone: !criterion.isDone }),
        "That tick did not save — check your connection."
      );
      if (!result.ok) toast(result.error ?? "That tick did not save.");
    });
  }

  function save(doc: unknown, criterionId: string | null) {
    if (isEmptyDocument(doc)) {
      toast("A criterion needs something in it.");
      return;
    }
    // The same guard the composer has, for the same reason: a `blob:` URL that
    // exists only in this tab must never reach the database.
    if (hasPendingUpload(doc)) {
      toast("An image is still uploading. It will be a moment.");
      return;
    }
    const text = flattenToText(doc).replace(/\s*\n+\s*/g, " ").trim();
    setEditing(null);
    if (criterionId) setPendingText((was) => ({ ...was, [criterionId]: text }));

    startTransition(async () => {
      const result = await trackedSave(
        () =>
          criterionId
            ? editCriterion({ criterionId, doc })
            : addCriterion({ itemId, doc }),
        "That criterion did not save — check your connection."
      );
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error ?? "That criterion did not save.");
        if (criterionId) {
          // Invariant 4: the optimistic text goes away at the same moment the
          // reason for it arrives.
          setPendingText((was) => {
            const next = { ...was };
            delete next[criterionId];
            return next;
          });
        }
      }
    });
  }

  /**
   * Remove one, with the way back in the same sentence.
   *
   * An undo toast rather than a confirm dialog — the team's own pattern for a
   * reversible destructive action. The document is captured before the delete
   * so Undo can put back exactly what was there, pictures included, rather than
   * a plain-text approximation of it.
   */
  function remove(criterion: Criterion) {
    const restoreDoc = criterion.bodyJson ?? textDoc(criterion.body);
    startTransition(async () => {
      const result = await trackedSave(
        () => removeCriterion({ criterionId: criterion.id }),
        "That criterion did not go — check your connection."
      );
      if (!result.ok) {
        toast(result.error ?? "That criterion did not go.");
        return;
      }
      router.refresh();
      toast(`Removed “${criterion.body.slice(0, 40)}”.`, {
        label: "Undo",
        onAction: () => {
          startTransition(async () => {
            const undone = await trackedSave(
              () => addCriterion({ itemId, doc: restoreDoc }),
              "That criterion did not come back."
            );
            if (undone.ok) router.refresh();
            else toast(undone.error ?? "That criterion did not come back.");
          });
        },
      });
    });
  }

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const dragged = items.find((c) => c.id === String(active.id));
      const target = items.find((c) => c.id === String(over.id));
      // Dragging across the done boundary is refused rather than silently
      // reinterpreted: the two groups are separate readings of the same list,
      // and dropping an undone criterion "below" a done one would mean writing
      // an order that the render-edge sort immediately undoes.
      if (dragged && target && dragged.isDone !== target.isDone) {
        toast("Drag within the done or the undone group — ticking is what moves it between them.");
        return;
      }

      const manual = [...items].sort((a, b) => a.orderIndex - b.orderIndex).map((c) => c.id);
      const from = manual.indexOf(String(active.id));
      const to = manual.indexOf(String(over.id));
      if (from < 0 || to < 0) return;

      const next = [...manual];
      next.splice(to, 0, ...next.splice(from, 1));
      setDragOrder(next);

      startTransition(async () => {
        const result = await trackedSave(
          () => reorderCriteria({ criterionId: String(active.id), orderedIds: next }),
          "The new order did not save — check your connection."
        );
        if (result.ok) {
          router.refresh();
        } else {
          // Invariant 4: the list snaps back and says why.
          setDragOrder(null);
          toast(result.error ?? "The new order did not save.");
        }
      });
    },
    [items, router, toast, trackedSave]
  );

  const list = (
    // Named, because a list of checkboxes with no accessible name is announced
    // as "list" and nothing more. It also gives a test somewhere to scope to:
    // since W4c the version history panel puts this story's criteria on the
    // page a second time, as diff lines inside its own <li>s.
    <ul aria-label="Acceptance criteria" className="mt-[14px] flex flex-col">
      {ordered.map((criterion) => (
        <CriterionRow
          key={criterion.id}
          criterion={criterion}
          body={bodies[criterion.id] ?? criterion.body}
          pendingText={pendingText[criterion.id]}
          canToggle={canToggle}
          canEditBody={canEditBody}
          canManage={canManage}
          canReorder={canManage && !dragOrder}
          isEditing={editing === criterion.id}
          onEdit={() => setEditing(criterion.id)}
          onCancel={() => setEditing(null)}
          onSave={(doc) => save(doc, criterion.id)}
          onRemove={() => remove(criterion)}
          onToggle={() => toggle(criterion)}
          onToast={toast}
          people={people}
          itemId={itemId}
          maxBatch={maxBatch}
        />
      ))}
    </ul>
  );

  return (
    <div>
      <div className="flex items-center gap-3">
        <ProgressRing done={done} total={total} size={34} />
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Acceptance criteria
        </Mono>
        {/* Announced on tick, and only the count. The reorder is NOT announced
            here — dnd-kit has its own live region for that, and two of them
            describing the same list is noise. */}
        <Mono size="key" className="ml-auto" aria-live="polite">
          {total ? `${done} / ${total}` : "none yet"}
        </Mono>
      </div>

      {total > 0 ? (
        canManage ? (
          <DndContext
            // A stable id, so the ids dnd-kit derives for its description
            // elements match on the server and the client.
            id={`criteria-${itemId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            accessibility={{ announcements }}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {list}
            </SortableContext>
          </DndContext>
        ) : (
          list
        )
      ) : (
        <p className="mt-[14px] text-[13.5px] text-[var(--ink-faint)]">No acceptance criteria yet.</p>
      )}

      {canManage ? (
        editing === "new" ? (
          <div className="mt-3">
            <CriterionForm
              initialDoc={EMPTY_DOC}
              people={people}
              itemId={itemId}
              maxBatch={maxBatch}
              onCancel={() => setEditing(null)}
              onSave={(doc) => save(doc, null)}
              onToast={toast}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mt-3 flex min-h-[44px] items-center gap-2 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Add a criterion
          </button>
        )
      ) : null}
    </div>
  );
}

function CriterionRow({
  criterion,
  body,
  pendingText,
  canToggle,
  canEditBody,
  canManage,
  canReorder,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  onToggle,
  onToast,
  people,
  itemId,
  maxBatch,
}: {
  criterion: Criterion;
  body: ReactNode;
  pendingText?: string;
  canToggle: boolean;
  canEditBody: boolean;
  canManage: boolean;
  canReorder: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (doc: unknown) => void;
  onRemove: () => void;
  onToggle: () => void;
  onToast: (message: string) => void;
  people: ProfileRef[];
  itemId: string;
  maxBatch?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: criterion.id, disabled: !canReorder });

  if (isEditing) {
    return (
      <li ref={setNodeRef} className="border-b border-[var(--hairline)]">
        <CriterionForm
          initialDoc={criterion.bodyJson ?? textDoc(criterion.body)}
          people={people}
          itemId={itemId}
          maxBatch={maxBatch}
          onCancel={onCancel}
          onSave={onSave}
          onToast={onToast}
        />
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // The move to the bottom of the list is a `micro`-tier transition —
        // 200ms, no blur — and `motion-reduce` drops it entirely rather than
        // shortening it.
        transition: transition ?? "transform 200ms var(--ease-entrance)",
        zIndex: isDragging ? 1 : undefined,
      }}
      className="border-b border-[var(--hairline)] motion-reduce:!transition-none"
    >
      <div className="group/criterion flex items-start gap-2 py-[11px]">
        {canReorder ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder: ${criterion.body.slice(0, 60)}`}
            className="-ml-1 mt-[1px] hidden size-6 shrink-0 cursor-grab items-center justify-center rounded-chip text-[var(--ink-faint)] hover:text-[var(--ink)] sm:flex [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:size-11"
          >
            <GripVertical size={13} strokeWidth={2} aria-hidden />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          disabled={!canToggle}
          role="checkbox"
          aria-checked={criterion.isDone}
          aria-label={pendingText ?? criterion.body}
          title={canToggle ? undefined : "Only the assignee, reviewer, an admin or a lead can tick this"}
          // 17px is the mark; the button around it is 24px square on a mouse and
          // 44px on a finger, so the tick and the body are two separate targets
          // and tapping the words does not tick the box.
          className={cn(
            "-m-[3px] flex size-6 shrink-0 items-center justify-center rounded-[7px] p-[3px] [@media(pointer:coarse)]:size-11",
            canToggle ? "cursor-pointer hover:bg-[var(--canvas)]" : "cursor-default"
          )}
        >
          <span
            aria-hidden
            className="flex size-[17px] items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]"
            style={{
              borderColor: criterion.isDone ? "#21E2C6" : "var(--hairline-strong)",
              background: criterion.isDone ? "#21E2C6" : "transparent",
            }}
          >
            {/* The tick arrives on the `micro` tier — 4px, 200ms, no blur.
                Keyed on the state so ticking again re-runs it; un-ticking
                simply removes it, because the tier is for entrances and
                nothing here should animate on exit. */}
            {criterion.isDone ? (
              <Check key="done" data-reveal="micro" size={10} strokeWidth={3.4} color="#07090E" />
            ) : null}
          </span>
        </button>

        {/* The body is its own target. Tapping it opens the editor and does not
            touch the checkbox — which is the behaviour change B5 asks for, and
            the reason the row stopped being one button. `[&_[data-thread-image]]`
            indents a picture to the TEXT column rather than to the checkbox, so
            a criterion with three screenshots still reads as one to-do item. */}
        {canEditBody ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit criterion: ${criterion.body.slice(0, 60)}`}
            className="min-w-0 flex-1 cursor-text rounded-control px-1 py-[2px] text-left text-[14px] leading-[1.5] hover:bg-[var(--canvas)]"
            style={{
              color: criterion.isDone ? "var(--ink-muted)" : "var(--ink)",
              // Only the TEXT is struck through, never a picture inside it:
              // `line-through` on a container draws a rule across every
              // screenshot in it.
              textDecoration: criterion.isDone && !criterion.bodyJson ? "line-through" : "none",
            }}
          >
            {pendingText ? <span className="text-[var(--ink-muted)]">{pendingText}</span> : body}
          </button>
        ) : (
          <div
            className="min-w-0 flex-1 px-1 py-[2px] text-[14px] leading-[1.5]"
            style={{
              color: criterion.isDone ? "var(--ink-muted)" : "var(--ink)",
              textDecoration: criterion.isDone && !criterion.bodyJson ? "line-through" : "none",
            }}
          >
            {pendingText ? <span className="text-[var(--ink-muted)]">{pendingText}</span> : body}
          </div>
        )}

        {canManage ? (
          // Visible on hover, on keyboard focus, and always on a touch screen —
          // where there is no hover to reveal them.
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-[var(--dur-micro)] focus-within:opacity-100 group-hover/criterion:opacity-100 [@media(pointer:coarse)]:opacity-100">
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove criterion: ${criterion.body.slice(0, 60)}`}
              title="Remove"
              className="flex size-6 items-center justify-center rounded-chip text-[var(--ink-faint)] hover:bg-[var(--canvas)] hover:text-[var(--rose)] [@media(pointer:coarse)]:size-11"
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** A criterion that predates documents, as one — so editing starts from what it says. */
function textDoc(body: string) {
  return { type: "doc", content: [{ type: "paragraph", content: body ? [{ type: "text", text: body }] : [] }] };
}

/**
 * One criterion, being written.
 *
 * Cmd+Enter saves and Escape cancels, the same two keys the composer uses —
 * one editor, one set of habits. Clicking away **commits**, never silently
 * discards: a half-written criterion that vanishes because somebody scrolled is
 * the failure this rule exists to prevent.
 */
function CriterionForm({
  initialDoc,
  people,
  itemId,
  maxBatch,
  onSave,
  onCancel,
  onToast,
}: {
  initialDoc: unknown;
  people: ProfileRef[];
  itemId: string;
  maxBatch?: number;
  onSave: (doc: unknown) => void;
  onCancel: () => void;
  onToast: (message: string) => void;
}) {
  const [doc, setDoc] = useState<unknown>(initialDoc);
  const [empty, setEmpty] = useState(isEmptyDocument(initialDoc));

  return (
    <div className="py-3">
      <RichTextEditor
        initialDoc={initialDoc}
        people={people}
        images
        workItemId={itemId}
        maxBatch={maxBatch}
        autoFocus
        minHeight={44}
        density="compact"
        placeholder="What has to be true — paste a screenshot if it is easier"
        ariaLabel="Acceptance criterion"
        onChange={(next, isEmpty) => {
          setDoc(next);
          setEmpty(isEmpty);
        }}
        onSubmit={() => onSave(doc)}
        // Escape reverts and closes; the editor has already blurred itself.
        onEscape={onCancel}
        onToast={onToast}
      />

      <div className="mt-2 flex items-center gap-2">
        <Mono size="eyebrow" className="mr-auto normal-case tracking-normal text-[var(--ink-faint)]">
          ⌘⏎ to save · esc to cancel
        </Mono>
        <button
          type="button"
          onClick={onCancel}
          className="h-[30px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(doc)}
          disabled={empty}
          className="signal-gradient h-[30px] rounded-control px-4 text-[12.5px] font-semibold text-[#07090E] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

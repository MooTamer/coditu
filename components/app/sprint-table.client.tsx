"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
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
import { GripVertical } from "lucide-react";

import {
  ComponentCell,
  DeadlineCell,
  GroupingCell,
  HoursCell,
  PersonCell,
  StatusCell,
  TypeCell,
} from "@/components/app/row-editors.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { reorderWorkItems } from "@/lib/actions/work-items";
import type { ComponentRef } from "@/lib/data/components";
import type { PersonRef, WorkItemRow } from "@/lib/data/sprint";
import { hours } from "@/lib/format";
import { groupingHue, groupingStickyBg, groupingTint } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * Editable cells give up their padding to the control inside them, which then
 * takes the whole box. Aiming at a 13px name to change an assignee is a target
 * the size of the word, and the rest of the column looks inert while being the
 * obvious place to click.
 *
 * The `<td>` carries an explicit height as well, and it has to: a table cell's
 * height comes from the row, so it is not a definite value a percentage can
 * resolve against, and `h-full` on the button inside measures 24px in a 52px
 * row. The row height is a number this component already has — using it is
 * cheaper and more predictable than any of the `height: inherit` folklore.
 */
const EDIT_CELL = "p-0";
const CELL = "px-4";
const HEAD =
  "px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-faint)]";

/**
 * The sprint table.
 *
 * Real `<table>` semantics — `<th scope="col">`, a real `<tbody>`, no div with
 * a role. Assistive technology gets row and column relationships for free that
 * a grid of divs can only imitate.
 *
 * A client component, because drag-and-drop is one of the interaction islands
 * the brief names. `DndContext` sits OUTSIDE `<table>` deliberately: it renders
 * its own live region and hidden instruction text as plain `<div>`s, and a
 * `<div>` inside `<table>` is invalid HTML that the browser silently hoists
 * out — which then shows up as a hydration mismatch on every row. When nobody
 * can reorder, no DndContext is mounted at all.
 *
 * Drag persists `order_index`. The keyboard path is not a fallback, it is
 * required: focus a row, Space to lift, arrows to move, Space to drop, Escape
 * to cancel, each step announced. A reorder you can only do with a mouse is a
 * reorder half the team cannot do.
 */
export function SprintTable({
  rows,
  allRows,
  basePath,
  canReorder,
  currentProfileId,
  canAssign,
  rowHeight,
  people,
  components,
  projectSlug,
  today,
}: {
  /** Rows after filtering — what is displayed. */
  rows: WorkItemRow[];
  /** Every row in the sprint, unfiltered — what the sum is computed from. */
  allRows: WorkItemRow[];
  /** Absolute path of this sprint. Item links are built from it — a relative
   *  `items/KEY` resolves against the PARENT directory and 404s. */
  basePath: string;
  canReorder: boolean;
  currentProfileId: string;
  canAssign: boolean;
  rowHeight: number;
  /** Active profiles, for the assignee and reviewer menus. */
  people: PersonRef[];
  /** The project's component registry, for the component picker. */
  components: ComponentRef[];
  /** Where a component created from a row's picker belongs. */
  projectSlug: string;
  /** Today in Africa/Cairo, from the server so a stale tab cannot drift. */
  today: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<string[] | null>(null);

  const ordered = useMemo(() => {
    if (!order) return rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const moved = order.map((id) => byId.get(id)).filter(Boolean) as WorkItemRow[];
    // Anything the optimistic order does not mention (a realtime insert, say)
    // keeps its server position rather than vanishing.
    return moved.length === rows.length ? moved : rows;
  }, [order, rows]);

  /**
   * A mouse, a finger and a keyboard each need a different way to start a drag,
   * and `PointerSensor` cannot give them one.
   *
   * It was `PointerSensor` with `distance: 6`, which is right for a mouse and
   * wrong for a touch screen: six pixels of movement is the beginning of a
   * SCROLL, so dragging a finger down the table picked a row up instead of
   * moving the page. `TouchSensor` with a press delay is the documented answer
   * — hold for 220ms and it is a drag, move before that and it is a scroll —
   * and `tolerance` allows the few pixels a finger drifts while pressing.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => `Lifted ${labelFor(rows, active.id)}. Use the arrow keys to move it.`,
      onDragOver: ({ active, over }) =>
        over ? `${labelFor(rows, active.id)} is now over ${labelFor(rows, over.id)}.` : "",
      onDragEnd: ({ active, over }) =>
        over
          ? `Dropped ${labelFor(rows, active.id)} at position ${indexOf(rows, over.id) + 1} of ${rows.length}.`
          : `Dropped ${labelFor(rows, active.id)}.`,
      onDragCancel: ({ active }) => `Cancelled. ${labelFor(rows, active.id)} returned to its place.`,
    }),
    [rows]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = ordered.map((row) => row.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;

      const next = [...ids];
      next.splice(to, 0, ...next.splice(from, 1));

      const rollback = ids;
      setOrder(next);

      startTransition(async () => {
        const result = await settle(
          () => reorderWorkItems({ itemId: String(active.id), orderedIds: next }),
          "The new order did not save — check your connection."
        );
        if (!result.ok) {
          // Invariant 4: rollback plus a visible error.
          setOrder(rollback);
          toast(result.error ?? "The new order did not save.");
        } else {
          setOrder(null);
          router.refresh();
        }
      });
    },
    [ordered, router, toast]
  );

  const filtered = rows.length !== allRows.length;
  const summed = filtered ? rows : allRows;
  const logged = summed.reduce((total, row) => total + row.minutesLogged, 0);
  const estimate = summed.reduce((total, row) => total + row.estimateMinutes, 0);

  const table = (
    <section className="overflow-auto rounded-section border border-[var(--hairline)] bg-[var(--raised)] @max-[900px]:hidden">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          {`Sprint work items. ${rows.length} of ${allRows.length} shown.` +
            (canReorder
              ? " Rows can be reordered: focus a row and press Space to lift it, arrow keys to move it, Space to drop, Escape to cancel."
              : "")}
        </caption>

        <thead>
          <tr className="border-b border-[var(--hairline-strong)]">
            <th scope="col" className={`sticky left-0 z-[2] min-w-[340px] bg-[var(--raised)] text-left ${HEAD}`}>
              Task
            </th>
            {/* A floor, not a fixed width: "EVIM Rollover Contact Cards" needs
                room, and the cell truncates rather than wrapping a row to two
                lines. */}
            <th scope="col" className={`min-w-[180px] text-left ${HEAD}`}>Component</th>
            <th scope="col" className={`text-left ${HEAD}`}>Status</th>
            <th scope="col" className={`text-right ${HEAD}`}>Hours</th>
            <th scope="col" className={`text-left ${HEAD}`}>Assignee</th>
            <th scope="col" className={`text-left ${HEAD}`}>Reviewer</th>
            <th scope="col" className={`text-left ${HEAD}`}>Deadline</th>
            <th scope="col" className={`text-left ${HEAD}`}>Type</th>
            <th scope="col" className={`text-right ${HEAD}`}>Grouping</th>
          </tr>
        </thead>

        <tbody>
          {ordered.map((row) => (
            <Row
              key={row.id}
              row={row}
              basePath={basePath}
              canReorder={canReorder}
              currentProfileId={currentProfileId}
              canAssign={canAssign}
              rowHeight={rowHeight}
              people={people}
              components={components}
              projectSlug={projectSlug}
              today={today}
              onToast={toast}
            />
          ))}
        </tbody>

        <tfoot>
          {/* The pinned sum. This must equal the database, always —
              tests/sprint-sums.test.ts asserts it against the seeded values. */}
          <tr className="bg-[var(--canvas)]">
            <td className="sticky left-0 border-l-[3px] border-transparent bg-[var(--canvas)] px-4 py-[14px]">
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                {`Sum · ${summed.length} ${summed.length === 1 ? "item" : "items"}${filtered ? " (filtered)" : ""}`}
              </Mono>
            </td>
            {/* Component, then Status. Both empty: nothing about this row is
                a sum. */}
            <td />
            <td />
            <td className="whitespace-nowrap px-4 py-[14px] text-right">
              <Mono size="meta" className="text-[15px] font-semibold">
                {hours(logged)}
              </Mono>
              <Mono size="key" className="text-[var(--ink-faint)]">
                {` / ${hours(estimate)}`}
              </Mono>
            </td>
            <td colSpan={5} />
          </tr>
        </tfoot>
      </table>
    </section>
  );

  if (!canReorder) return table;

  return (
    <DndContext
      // A stable id, so the ids dnd-kit derives for its description elements
      // are the same on the server and the client. Left to its own counter it
      // produces DndDescribedBy-0 on one side and -1 on the other, and every
      // row reports a hydration mismatch.
      id="sprint-reorder"
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{ announcements }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ordered.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        {table}
      </SortableContext>
    </DndContext>
  );
}

function labelFor(rows: WorkItemRow[], id: string | number) {
  const row = rows.find((r) => r.id === String(id));
  return row ? `${row.key} ${row.title}` : "item";
}
function indexOf(rows: WorkItemRow[], id: string | number) {
  return rows.findIndex((r) => r.id === String(id));
}

function Row({
  row,
  basePath,
  canReorder,
  currentProfileId,
  canAssign,
  rowHeight,
  people,
  components,
  projectSlug,
  today,
  onToast,
}: {
  row: WorkItemRow;
  basePath: string;
  canReorder: boolean;
  currentProfileId: string;
  canAssign: boolean;
  rowHeight: number;
  people: PersonRef[];
  components: ComponentRef[];
  projectSlug: string;
  today: string;
  onToast: (message: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !canReorder });

  const hue = groupingHue(row.grouping);
  const dueSoon = isDueWithin24h(row.deadline);
  const mayMove =
    canAssign || row.assignee?.id === currentProfileId || row.reviewer?.id === currentProfileId;

  return (
    // The drag affordance is a real handle, not the row. dnd-kit puts
    // `role="button"` on whatever it is spread onto, and a button containing a
    // link and a status popover is `nested-interactive`: a screen reader
    // announces the row as a button and the controls inside it become noise.
    // `setActivatorNodeRef` exists for exactly this — the row keeps its `row`
    // role and the handle carries the keyboard drag path.
    <tr
      ref={setNodeRef}
      style={{
        height: rowHeight,
        background: groupingTint(row.grouping),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="group/row border-b border-[var(--hairline)] hover:bg-[var(--canvas)] transition-[background-color,border-color,color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]"
    >
      {/* The whole task cell opens the item, not just the six words of the
          title. `after:absolute after:inset-0` stretches the link over the
          cell without wrapping the key or the drag handle in it — both of
          which sit above it on `z-[1]` and keep their own behaviour. */}
      <td
        className={cn("relative sticky left-0 border-l-[3px]", CELL)}
        style={{ background: groupingStickyBg(row.grouping), borderLeftColor: hue ?? "transparent" }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {canReorder ? (
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              type="button"
              aria-label={`Reorder ${row.key} — ${row.title}`}
              className="relative z-[1] -ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-[5px] text-[var(--ink-faint)] opacity-0 transition-opacity duration-[var(--dur-micro)] group-hover/row:opacity-100 hover:bg-[var(--canvas)] focus-visible:opacity-100"
            >
              <GripVertical size={13} strokeWidth={1.8} aria-hidden />
            </button>
          ) : null}
          <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
            {row.key}
          </Mono>
          {/* `min-h-6` so the link clears WCAG 2.5.8's 24px target minimum —
              a 14.5px line box on its own is 20px and fails. */}
          <Link
            href={`${basePath}/items/${row.key}`}
            // No viewport prefetch — see the note in `rail.client.tsx`. Twelve
            // rows cost twelve full item renders per page view and bought
            // nothing: opening a row measures 209ms with this off, 210ms on.
            prefetch={false}
            title={row.title}
            className="flex min-h-6 min-w-0 items-center truncate text-[14.5px] font-medium after:absolute after:inset-0 after:content-[''] hover:text-[var(--accent)]"
          >
            {row.title}
          </Link>
          {row.criteriaTotal > 0 ? (
            <Mono size="eyebrow" className="ml-auto shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
              {row.criteriaDone}/{row.criteriaTotal}
            </Mono>
          ) : null}
        </span>
      </td>

      {/* Component sits directly beside the task, because it is the other half
          of what the row is about: "COD-153 · Themen Kachel · in review" is the
          sentence the table exists to say. */}
      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <ComponentCell
          itemId={row.id}
          component={row.component}
          components={components}
          projectSlug={projectSlug}
          editable={canAssign}
          onToast={onToast}
        />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <StatusCell itemId={row.id} status={row.status} editable={mayMove} onToast={onToast} />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <HoursCell
          itemId={row.id}
          minutesLogged={row.minutesLogged}
          estimateMinutes={row.estimateMinutes}
          today={today}
          canEstimate={canAssign}
          onToast={onToast}
        />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <PersonCell
          itemId={row.id}
          field="assignee_id"
          person={row.assignee}
          people={people}
          editable={canAssign}
          fallback="unassigned"
          onToast={onToast}
        />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <PersonCell
          itemId={row.id}
          field="reviewer_id"
          person={row.reviewer}
          people={people}
          editable={canAssign}
          fallback="—"
          onToast={onToast}
        />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <DeadlineCell
          itemId={row.id}
          deadline={row.deadline}
          dueSoon={dueSoon}
          editable={canAssign}
          onToast={onToast}
        />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <TypeCell itemId={row.id} type={row.type} editable={canAssign} onToast={onToast} />
      </td>

      <td className={EDIT_CELL} style={{ height: rowHeight }}>
        <GroupingCell
          itemId={row.id}
          grouping={row.grouping}
          editable={canAssign}
          onToast={onToast}
        />
      </td>
    </tr>
  );
}

/**
 * Deadline urgency, compared as calendar dates. Never a timestamp difference —
 * that flips a day either side of midnight depending on the reader's zone.
 */
function isDueWithin24h(deadline: string | null): boolean {
  if (!deadline) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return deadline.slice(0, 10) <= addOneDay(today);
}

function addOneDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

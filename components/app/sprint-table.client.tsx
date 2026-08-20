"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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

import { StatusPopover } from "@/components/app/status-popover.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { reorderWorkItems } from "@/lib/actions/work-items";
import type { WorkItemRow } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { groupingHue, groupingStickyBg, groupingTint, TYPE_LABEL } from "@/lib/work-items";
import { cn } from "@/lib/utils";

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
  canReorder,
  currentProfileId,
  canAssign,
  rowHeight,
}: {
  /** Rows after filtering — what is displayed. */
  rows: WorkItemRow[];
  /** Every row in the sprint, unfiltered — what the sum is computed from. */
  allRows: WorkItemRow[];
  canReorder: boolean;
  currentProfileId: string;
  canAssign: boolean;
  rowHeight: number;
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
        const result = await reorderWorkItems({ itemId: String(active.id), orderedIds: next });
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
              canReorder={canReorder}
              currentProfileId={currentProfileId}
              canAssign={canAssign}
              rowHeight={rowHeight}
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
  canReorder,
  currentProfileId,
  canAssign,
  rowHeight,
  onToast,
}: {
  row: WorkItemRow;
  canReorder: boolean;
  currentProfileId: string;
  canAssign: boolean;
  rowHeight: number;
  onToast: (message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canReorder,
  });

  const hue = groupingHue(row.grouping);
  const over = row.minutesLogged > row.estimateMinutes && row.estimateMinutes > 0;
  const dueSoon = isDueWithin24h(row.deadline);
  const mayMove =
    canAssign || row.assignee?.id === currentProfileId || row.reviewer?.id === currentProfileId;

  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        height: rowHeight,
        background: groupingTint(row.grouping),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="border-b border-[var(--hairline)] hover:bg-[var(--canvas)]"
    >
      <td
        className={cn("sticky left-0 border-l-[3px]", CELL)}
        style={{ background: groupingStickyBg(row.grouping), borderLeftColor: hue ?? "transparent" }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
            {row.key}
          </Mono>
          <Link
            href={`items/${row.key}`}
            title={row.title}
            className="truncate text-[14.5px] font-medium hover:text-[var(--accent)]"
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

      <td className={CELL}>
        <StatusPopover itemId={row.id} status={row.status} editable={mayMove} onToast={onToast} />
      </td>

      <td className={cn(CELL, "whitespace-nowrap text-right")}>
        <Mono size="key" className="text-[13px]" style={{ color: over ? "var(--amber-text)" : "var(--ink)" }}>
          {row.minutesLogged > 0 ? hours(row.minutesLogged) : "—"}
        </Mono>
        <Mono size="key" className="text-[var(--ink-faint)]">
          {" "}
          / {hours(row.estimateMinutes)}
        </Mono>
      </td>

      <PersonCell person={row.assignee} canAssign={canAssign} fallback="unassigned" />
      <PersonCell person={row.reviewer} canAssign={canAssign} fallback="—" />

      <td className={cn(CELL, "whitespace-nowrap")}>
        <Mono
          size="key"
          className="text-[12.5px]"
          style={{ color: dueSoon ? "var(--amber-text)" : "var(--ink-muted)" }}
        >
          {calendarDate(row.deadline)}
        </Mono>
      </td>

      <td className={CELL}>
        <Mono size="meta" className="whitespace-nowrap text-[var(--ink-muted)]">
          {TYPE_LABEL[row.type]}
        </Mono>
      </td>

      <td className={cn(CELL, "text-right")}>
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-chip border px-[7px] py-[3px]"
          style={{
            borderColor: hue ?? "var(--hairline)",
            background: row.grouping ? "var(--group-chip-bg)" : "transparent",
          }}
        >
          {/* The number is ink, never the hue: an 11px label in the grouping
              colour never clears 4.5:1. */}
          <Mono size="meta" className={row.grouping ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}>
            {row.grouping ?? "—"}
          </Mono>
        </span>
      </td>
    </tr>
  );
}

function PersonCell({
  person,
  canAssign,
  fallback,
}: {
  person: WorkItemRow["assignee"];
  canAssign: boolean;
  fallback: string;
}) {
  return (
    <td className={CELL}>
      {/* Disabled with a tooltip for an engineer, never hidden — the control
          being absent reads as a bug, not as a permission. */}
      <span
        className="inline-flex items-center gap-2 whitespace-nowrap"
        title={canAssign ? undefined : "Only an admin or lead can change who owns an item"}
        aria-disabled={!canAssign}
      >
        <span
          className="flex size-6 items-center justify-center rounded-pill border border-[var(--hairline-strong)]"
          style={{ color: person ? "var(--ink)" : "var(--ink-faint)" }}
        >
          <Mono size="eyebrow" className="text-[9.5px] normal-case tracking-normal">
            {person?.initials ?? "··"}
          </Mono>
        </span>
        <span className="text-[13.5px]" style={{ color: person ? "var(--ink)" : "var(--ink-faint)" }}>
          {person ? person.fullName.split(" ")[0] : fallback}
        </span>
      </span>
    </td>
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

"use client";

import { useCallback } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
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
import {
  Calendar,
  CircleDashed,
  GripVertical,
  Hash,
  Plus,
  Trash2,
  Type,
  User,
} from "lucide-react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Mono } from "@/components/coditu/mono";
import { useUrlWrite } from "@/lib/hooks/use-url-write";
import { control } from "@/lib/interactive";
import {
  MAX_SORT_KEYS,
  SORTABLE_COLUMNS,
  SORT_COLUMN_META,
  addSort,
  directionLabel,
  removeSort,
  reorderSort,
  serializeSort,
  setSortColumn,
  setSortDirection,
  type SortColumn,
  type SortColumnKind,
  type SortDirection,
  type SortKey,
} from "@/lib/sprint-sort";

/**
 * The stacked sort, as a panel.
 *
 * ── What was already built, and what this is ───────────────────────────────
 * `lib/sprint-sort.ts` has held the whole stack since before PF-8 was raised:
 * `?sort=deadline:asc,status:desc`, four keys, nulls last in both directions,
 * unit-tested. The header cycles a single column and shift-click appends. What
 * there was no way to do was **see** the stack, **reorder** it, or change a rule
 * without taking the whole thing apart. So this is a surface over a contract
 * that already exists — every control below ends in the same `?sort=` string,
 * and reading it back is `parseSort`, unchanged.
 *
 * ── Why the stack is a drag list ───────────────────────────────────────────
 * Order IS priority: the first key wins and the next only breaks its ties. That
 * is not a property of a rule, it is a property of the arrangement, so the
 * control for it has to be the arrangement itself. A pair of up/down arrows
 * would work and would make the reader compute what the list is showing them.
 *
 * ── Why no direction says "ascending" ──────────────────────────────────────
 * `directionLabel` words each column by its own type — `Sort high → low` for a
 * number, `Latest → earliest` for a date, `A → Z` for text, display order for a
 * status. A reader sorting by deadline is not asking about a comparator. The
 * unit tests assert that neither word ever appears.
 */

const KIND_ICON: Record<SortColumnKind, typeof Type> = {
  text: Type,
  person: User,
  number: Hash,
  date: Calendar,
  option: CircleDashed,
};

// `h-11`, not `min-h-11`: WebKit ignores `min-height` on a `<select>` — measured
// on this project — so a minimum is a minimum everywhere except the phone the
// 44px rule exists for. Back to 34px where the pointer is fine.
const SELECT =
  "h-11 min-w-0 rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-2 text-[13px] text-[var(--ink)] md:h-[34px]";

function SortRow({
  entry,
  index,
  used,
  onColumn,
  onDirection,
  onRemove,
}: {
  entry: SortKey;
  index: number;
  used: Set<SortColumn>;
  onColumn: (column: SortColumn) => void;
  onDirection: (direction: SortDirection) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.column,
  });
  const Icon = KIND_ICON[SORT_COLUMN_META[entry.column].kind];

  return (
    <li
      ref={setNodeRef}
      data-sort-rule={entry.column}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // 0.9, not 0.5 — the same number and the same reason as the sprint
        // table's dragged row: at half opacity over a tinted background a row
        // reads as gone rather than as lifted. PF-13 measured that one.
        opacity: isDragging ? 0.9 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
      className="flex items-center gap-2 rounded-control border border-[var(--hairline)] bg-[var(--canvas)] p-2"
    >
      <button
        type="button"
        // The handle is the only draggable part, so a select can still be
        // opened with a pointer without the row coming with it.
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${SORT_COLUMN_META[entry.column].label}, currently ${index + 1} of the sort`}
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-[var(--ink-faint)] hover:text-[var(--ink-muted)] active:cursor-grabbing"
      >
        <GripVertical size={15} strokeWidth={1.8} aria-hidden />
      </button>

      {/* The type icon sits beside the selector rather than inside it: an
          `<option>` cannot carry an element, and a unicode stand-in would not
          match the icons the rest of the app draws. */}
      <Icon size={14} strokeWidth={1.8} aria-hidden className="shrink-0 text-[var(--ink-faint)]" />

      <select
        className={`${SELECT} flex-1`}
        value={entry.column}
        aria-label={`Sort ${index + 1}: column`}
        onChange={(event) => onColumn(event.target.value as SortColumn)}
      >
        {SORTABLE_COLUMNS.filter((column) => column === entry.column || !used.has(column)).map(
          (column) => (
            <option key={column} value={column}>
              {SORT_COLUMN_META[column].label}
            </option>
          )
        )}
      </select>

      <select
        className={`${SELECT} flex-1`}
        value={entry.direction}
        aria-label={`Sort ${index + 1}: direction`}
        onChange={(event) => onDirection(event.target.value as SortDirection)}
      >
        <option value="asc">{directionLabel(entry.column, "asc")}</option>
        <option value="desc">{directionLabel(entry.column, "desc")}</option>
      </select>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete sort by ${SORT_COLUMN_META[entry.column].label}`}
        title="Delete sort"
        className="flex size-9 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--rose)] hover:text-[var(--rose)]"
      >
        <Trash2 size={14} strokeWidth={1.8} aria-hidden />
      </button>
    </li>
  );
}

export function SortPanel({
  stack,
  onClose,
  focusColumn,
}: {
  stack: SortKey[];
  onClose: () => void;
  /** Which rule the toolbar chip asked to open on, so it can be marked. */
  focusColumn?: SortColumn | null;
}) {
  const { write, params, state } = useUrlWrite();

  const sensors = useSensors(
    // 6px, so a tap on the handle is a tap and not a one-pixel drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const commit = useCallback(
    (next: SortKey[], key: string) => {
      const query = new URLSearchParams(params.toString());
      const value = serializeSort(next);
      if (value) query.set("sort", value);
      else query.delete("sort");
      write(query, key);
    },
    [params, write]
  );

  const used = new Set(stack.map((entry) => entry.column));
  const canAdd = stack.length < MAX_SORT_KEYS && used.size < SORTABLE_COLUMNS.length;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stack.findIndex((entry) => entry.column === active.id);
    const to = stack.findIndex((entry) => entry.column === over.id);
    commit(reorderSort(stack, from, to), "sort-reorder");
  }

  return (
    <DialogShell
      label="Sort"
      maxWidth={520}
      onClose={onClose}
      header={<span className="text-[15px] font-semibold">Sort</span>}
    >
      <div className="flex flex-col gap-4 p-4">
        {stack.length === 0 ? (
          <p className="text-[13.5px] text-[var(--ink-muted)]">
            Nothing is sorted. The table is in the order the sprint puts it in.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={stack.map((entry) => entry.column)}
              strategy={verticalListSortingStrategy}
            >
              <ul data-sort-rules className="flex flex-col gap-2">
                {stack.map((entry, index) => (
                  <SortRow
                    key={entry.column}
                    entry={entry}
                    index={index}
                    used={used}
                    onColumn={(column) => commit(setSortColumn(stack, index, column), "sort-column")}
                    onDirection={(direction) =>
                      commit(setSortDirection(stack, index, direction), "sort-direction")
                    }
                    onRemove={() => commit(removeSort(stack, index), "sort-remove")}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {stack.length > 1 ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {/* Said once, in words, because the list's own order is the only
                other place this is stated and a stack is not obviously a
                priority to somebody meeting it for the first time. */}
            top rule first — the ones below it break ties
          </Mono>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => commit(addSort(stack), "sort-add")}
            disabled={!canAdd}
            {...control(state("sort-add") === "pending" ? "pending" : "idle")}
            className="inline-flex h-11 items-center gap-[6px] rounded-control border border-[var(--hairline-strong)] px-3 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50 md:h-[34px]"
          >
            <Plus size={14} strokeWidth={1.9} aria-hidden />
            Add sort
          </button>

          {stack.length > 0 ? (
            <button
              type="button"
              onClick={() => commit([], "sort-clear")}
              {...control(state("sort-clear") === "pending" ? "pending" : "idle")}
              className="inline-flex h-11 items-center rounded-control px-3 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] md:h-[34px]"
            >
              Delete sort
            </button>
          ) : null}

          {focusColumn ? (
            <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
              {SORT_COLUMN_META[focusColumn].label.toLowerCase()}
            </Mono>
          ) : null}
        </div>
      </div>
    </DialogShell>
  );
}

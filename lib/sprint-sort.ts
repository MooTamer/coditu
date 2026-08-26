/**
 * The sprint table's sort stack.
 *
 * ## Why this is a pure module and not table state
 *
 * Sort lives in the URL, like every other view decision in this app
 * (`03-APP-SPEC.md`): `?sort=deadline:asc,status:desc` is a link somebody can
 * paste into Slack, and "sorted by deadline, then by what needs attention" is
 * then a sentence you send rather than one you have to type. That makes the
 * whole thing a function of a string, which is the shape a test can hold.
 *
 * And a comparator is exactly the code that is wrong in one direction, for one
 * column, and looks entirely plausible on the screen somebody happened to open.
 * Every rule below is asserted in `tests/sprint-sort.test.ts`.
 *
 * ## Missing is not a value
 *
 * The prototype sorts nulls with a `"￿"` sentinel, which puts them last
 * ascending and **first** descending — so reversing a sort by deadline fills
 * the top of the sprint with stories that have no deadline. Here a missing
 * value is a separate flag compared before the value is, so it stays last
 * whichever way the column is pointing. Nobody sorts a column to find the rows
 * that do not have it.
 *
 * ## What the columns actually compare
 *
 * `status` sorts by `STATUS_DISPLAY_ORDER`, the same "what needs attention"
 * order the board, the report and the exports already use — alphabetically,
 * `blocked` would open the sprint and `in_progress` would sit in the middle.
 * `key` sorts by its number, because `COD-10` is not between `COD-1` and
 * `COD-9`. `criteria` sorts by proportion done, and a story with no criteria is
 * *missing* rather than 0% — 0/0 is not the least finished work in the sprint.
 */

import type { ComponentRef } from "@/lib/data/components";
import {
  STATUS_DISPLAY_ORDER,
  TYPE_LABEL,
  statusRank,
  type WorkItemStatus,
  type WorkItemType,
} from "@/lib/work-items";

/** Every column a header can sort by, and the vocabulary the URL uses. */
export const SORTABLE_COLUMNS = [
  "key",
  "component",
  "status",
  "hours",
  "assignee",
  "reviewer",
  "deadline",
  "type",
  "grouping",
  "criteria",
] as const;

export type SortColumn = (typeof SORTABLE_COLUMNS)[number];
export type SortDirection = "asc" | "desc";

export interface SortKey {
  column: SortColumn;
  direction: SortDirection;
}

/**
 * Four keys.
 *
 * Not a technical limit — a legibility one. The header shows a numbered badge
 * per key and the reader has to be able to hold the sentence in their head;
 * "by deadline, then status, then assignee, then grouping" is already the edge
 * of that. It also bounds the work a hand-edited `?sort=` can ask for.
 */
export const MAX_SORT_KEYS = 4;

/** Only the fields the comparator reads, so a test can build a row in a line. */
export interface SortableRow {
  key: string;
  status: WorkItemStatus;
  type: WorkItemType;
  deadline: string | null;
  minutesLogged: number;
  estimateMinutes: number;
  grouping: number | null;
  orderIndex: number;
  components: Pick<ComponentRef, "name">[];
  assignee: { fullName: string } | null;
  reviewer: { fullName: string } | null;
  criteriaDone: number;
  criteriaTotal: number;
}

/**
 * A cell's sortable value, or the fact that it has none.
 *
 * The flag rather than a sentinel is the whole reason nulls behave: `missing`
 * is compared first and never reversed.
 */
type Cell = { missing: true } | { missing: false; value: number | string };

const MISSING: Cell = { missing: true };

function present(value: number | string): Cell {
  return { missing: false, value };
}

/** `COD-10` is not between `COD-1` and `COD-9`. */
function keyNumber(key: string): number {
  const digits = /(\d+)\s*$/.exec(key);
  return digits ? Number(digits[1]) : Number.POSITIVE_INFINITY;
}

function cellFor(row: SortableRow, column: SortColumn): Cell {
  switch (column) {
    case "key":
      return present(keyNumber(row.key));

    case "component": {
      // The first tagged component, by name. A story about several is filed
      // under the first one the picker recorded, which is the one the table
      // shows before the `+N`.
      const first = row.components[0];
      return first ? present(first.name.toLowerCase()) : MISSING;
    }

    case "status":
      return present(statusRank(row.status));

    case "hours":
      return present(row.minutesLogged);

    case "assignee":
      return row.assignee ? present(row.assignee.fullName.toLowerCase()) : MISSING;

    case "reviewer":
      return row.reviewer ? present(row.reviewer.fullName.toLowerCase()) : MISSING;

    case "deadline":
      // `date` columns are calendar dates, so ISO text sorts correctly and
      // never goes near a `Date` — invariant 5.
      return row.deadline ? present(row.deadline) : MISSING;

    case "type":
      return present(TYPE_LABEL[row.type]);

    case "grouping":
      return row.grouping === null ? MISSING : present(row.grouping);

    case "criteria":
      // 0/0 is no progress to compare, not zero progress.
      return row.criteriaTotal === 0 ? MISSING : present(row.criteriaDone / row.criteriaTotal);
  }
}

function compareCells(a: Cell, b: Cell, direction: SortDirection): number {
  // Missing is compared BEFORE the direction is applied, so it stays last
  // whichever way the column points.
  if (a.missing || b.missing) {
    if (a.missing && b.missing) return 0;
    return a.missing ? 1 : -1;
  }

  const order =
    typeof a.value === "string" && typeof b.value === "string"
      ? a.value.localeCompare(b.value)
      : Number(a.value) - Number(b.value);

  if (order === 0) return 0;
  return direction === "asc" ? order : -order;
}

export function compareRows(a: SortableRow, b: SortableRow, stack: SortKey[]): number {
  for (const { column, direction } of stack) {
    const order = compareCells(cellFor(a, column), cellFor(b, column), direction);
    if (order !== 0) return order;
  }

  /**
   * The last tiebreak is the sprint's own manual order.
   *
   * `Array.prototype.sort` is stable, so leaving this out would *usually* be
   * the same thing — but only for as long as the rows arrive in `order_index`
   * order, which is a property of a query somewhere else. Saying it here means
   * a full tie is resolved by the order the team dragged the rows into, and it
   * cannot quietly stop being true.
   */
  return a.orderIndex - b.orderIndex;
}

/** A new array, always — the caller's rows are somebody else's props. */
export function sortRows<T extends SortableRow>(rows: readonly T[], stack: SortKey[]): T[] {
  if (stack.length === 0) return [...rows];
  return [...rows].sort((a, b) => compareRows(a, b, stack));
}

function isColumn(value: string): value is SortColumn {
  return (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

/**
 * `deadline:asc,status:desc` → the stack.
 *
 * Unrecognised columns and directions are **dropped, never guessed**. The same
 * rule the status filter lives by: a hand-edited or stale query string must not
 * quietly change what the reader is looking at, and there is no sort a wrong
 * word could safely mean.
 */
export function parseSort(raw: string | null | undefined): SortKey[] {
  if (!raw) return [];

  const stack: SortKey[] = [];
  for (const part of raw.split(",")) {
    const [rawColumn, rawDirection] = part.trim().split(":");
    const column = rawColumn?.trim().toLowerCase() ?? "";
    if (!isColumn(column)) continue;
    // First mention wins; a repeat is a broken link, not a second opinion.
    if (stack.some((entry) => entry.column === column)) continue;

    const direction = rawDirection?.trim().toLowerCase();
    stack.push({ column, direction: direction === "desc" ? "desc" : "asc" });
    if (stack.length === MAX_SORT_KEYS) break;
  }

  return stack;
}

/** The stack as a query value, or `null` when there is no sort to carry. */
export function serializeSort(stack: SortKey[]): string | null {
  if (stack.length === 0) return null;
  return stack.map((entry) => `${entry.column}:${entry.direction}`).join(",");
}

/**
 * What a header click does.
 *
 * **Plain click** — the primary column cycles `asc → desc → cleared`, and any
 * other column becomes the only sort, ascending. It deliberately does not
 * resume the cycle from wherever that column sat in a stack the reader may not
 * have open: the same click has to mean the same thing.
 *
 * **Shift-click** — append ascending, then flip to descending, then remove.
 * Same three states as the plain click, applied to one key of the stack instead
 * of to the whole thing.
 */
export function toggleSort(stack: SortKey[], column: SortColumn, shift: boolean): SortKey[] {
  const at = stack.findIndex((entry) => entry.column === column);

  if (shift) {
    if (at === -1) {
      if (stack.length >= MAX_SORT_KEYS) return stack;
      return [...stack, { column, direction: "asc" }];
    }
    if (stack[at].direction === "asc") {
      const next = [...stack];
      next[at] = { column, direction: "desc" };
      return next;
    }
    return stack.filter((entry) => entry.column !== column);
  }

  const isOnlySort = at === 0 && stack.length === 1;
  if (isOnlySort) {
    return stack[0].direction === "asc" ? [{ column, direction: "desc" }] : [];
  }

  return [{ column, direction: "asc" }];
}

/**
 * What the header says out loud.
 *
 * `aria-sort` takes exactly one of `ascending` / `descending` / `none`, and it
 * belongs only on the **primary** column — a table has one sort direction as
 * far as the accessibility tree is concerned. The rest of the stack is
 * announced in the header's own label instead.
 */
export function ariaSortFor(stack: SortKey[], column: SortColumn): "ascending" | "descending" | "none" {
  if (stack[0]?.column !== column) return "none";
  return stack[0].direction === "asc" ? "ascending" : "descending";
}

/** `sorted by deadline, ascending — 1 of 2`, for a header's accessible name. */
export function sortLabelFor(stack: SortKey[], column: SortColumn): string | null {
  const at = stack.findIndex((entry) => entry.column === column);
  if (at === -1) return null;

  const direction = stack[at].direction === "asc" ? "ascending" : "descending";
  const position = stack.length > 1 ? ` — ${at + 1} of ${stack.length}` : "";
  return `sorted ${direction}${position}`;
}

/** Display order is the app's, so this module and the chips cannot disagree. */
export const SORT_STATUS_ORDER = STATUS_DISPLAY_ORDER;

import { describe, expect, it } from "vitest";

import {
  MAX_SORT_KEYS,
  SORTABLE_COLUMNS,
  SORT_COLUMN_META,
  addSort,
  directionLabel,
  parseSort,
  reorderSort,
  serializeSort,
  setSortColumn,
  setSortDirection,
  sortRows,
  toggleSort,
  type SortKey,
  type SortableRow,
} from "@/lib/sprint-sort";

/**
 * The sort stack, asserted rather than clicked.
 *
 * A comparator is the kind of code that is wrong in one direction for one
 * column and looks entirely plausible on the screen somebody happened to open.
 * Everything here is a rule the table promises: nulls last **in both
 * directions**, status by its display order rather than its name, ties broken
 * by the manual order the sprint already has, and a URL that survives being
 * hand-edited.
 */

/** Only the fields the comparator reads. */
function row(over: Partial<SortableRow> & { key: string }): SortableRow {
  return {
    status: "ready",
    type: "story",
    deadline: null,
    minutesLogged: 0,
    estimateMinutes: 0,
    grouping: null,
    orderIndex: 0,
    components: [],
    assignee: null,
    reviewer: null,
    criteriaDone: 0,
    criteriaTotal: 0,
    ...over,
  };
}

const keys = (rows: SortableRow[]) => rows.map((r) => r.key);

describe("parseSort", () => {
  it("reads a stack in the order it is written", () => {
    expect(parseSort("deadline:asc,status:desc")).toEqual([
      { column: "deadline", direction: "asc" },
      { column: "status", direction: "desc" },
    ]);
  });

  it("defaults a bare column to ascending", () => {
    expect(parseSort("deadline")).toEqual([{ column: "deadline", direction: "asc" }]);
  });

  /**
   * The rule the status filter already lives by: an unrecognised value must not
   * quietly change what the reader is looking at. Here that means dropping the
   * key, never guessing a column.
   */
  it("drops what it does not recognise, and keeps what it does", () => {
    expect(parseSort("nonsense:asc,deadline:asc")).toEqual([
      { column: "deadline", direction: "asc" },
    ]);
    expect(parseSort("deadline:sideways")).toEqual([{ column: "deadline", direction: "asc" }]);
    expect(parseSort("")).toEqual([]);
    expect(parseSort(null)).toEqual([]);
    expect(parseSort(undefined)).toEqual([]);
  });

  it("keeps the first mention of a column and ignores the rest", () => {
    expect(parseSort("deadline:desc,deadline:asc")).toEqual([
      { column: "deadline", direction: "desc" },
    ]);
  });

  /** A hand-edited URL cannot make the comparator do unbounded work. */
  it("caps the stack", () => {
    const long = "key,status,deadline,type,grouping,hours,assignee,reviewer,component,criteria";
    expect(parseSort(long).length).toBeLessThanOrEqual(4);
  });

  it("round-trips through serializeSort, and an empty stack is no parameter", () => {
    const stack: SortKey[] = [
      { column: "grouping", direction: "asc" },
      { column: "hours", direction: "desc" },
    ];
    expect(serializeSort(stack)).toBe("grouping:asc,hours:desc");
    expect(parseSort(serializeSort(stack))).toEqual(stack);
    expect(serializeSort([])).toBeNull();
  });
});

describe("toggleSort", () => {
  it("cycles the primary column asc → desc → cleared", () => {
    let stack = toggleSort([], "deadline", false);
    expect(stack).toEqual([{ column: "deadline", direction: "asc" }]);
    stack = toggleSort(stack, "deadline", false);
    expect(stack).toEqual([{ column: "deadline", direction: "desc" }]);
    stack = toggleSort(stack, "deadline", false);
    expect(stack).toEqual([]);
  });

  it("replaces the whole stack when a different header is clicked", () => {
    const stack: SortKey[] = [
      { column: "deadline", direction: "desc" },
      { column: "status", direction: "asc" },
    ];
    expect(toggleSort(stack, "grouping", false)).toEqual([
      { column: "grouping", direction: "asc" },
    ]);
  });

  /**
   * A plain click on a column that is second in the stack promotes it to the
   * only sort. It does NOT start a asc→desc→cleared cycle from where that
   * column happened to be, which would make the same click mean different
   * things depending on a stack the reader may not have open.
   */
  it("promotes a stacked column to the only sort, ascending", () => {
    const stack: SortKey[] = [
      { column: "deadline", direction: "desc" },
      { column: "status", direction: "desc" },
    ];
    expect(toggleSort(stack, "status", false)).toEqual([{ column: "status", direction: "asc" }]);
  });

  it("appends on shift, and flips a direction already in the stack", () => {
    let stack = toggleSort([], "deadline", false);
    stack = toggleSort(stack, "status", true);
    expect(stack).toEqual([
      { column: "deadline", direction: "asc" },
      { column: "status", direction: "asc" },
    ]);

    stack = toggleSort(stack, "status", true);
    expect(stack).toEqual([
      { column: "deadline", direction: "asc" },
      { column: "status", direction: "desc" },
    ]);
  });

  it("shift-clicking a descending stacked column removes it", () => {
    const stack: SortKey[] = [
      { column: "deadline", direction: "asc" },
      { column: "status", direction: "desc" },
    ];
    expect(toggleSort(stack, "status", true)).toEqual([{ column: "deadline", direction: "asc" }]);
  });

  it("will not stack past the cap", () => {
    let stack: SortKey[] = [];
    for (const column of ["key", "status", "deadline", "type", "grouping"] as const) {
      stack = toggleSort(stack, column, true);
    }
    expect(stack).toHaveLength(4);
    expect(stack.map((entry) => entry.column)).toEqual(["key", "status", "deadline", "type"]);
  });
});

describe("sortRows", () => {
  it("returns the rows untouched when nothing is sorted", () => {
    const rows = [row({ key: "COD-2", orderIndex: 1 }), row({ key: "COD-1", orderIndex: 2 })];
    expect(keys(sortRows(rows, []))).toEqual(["COD-2", "COD-1"]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [row({ key: "COD-2" }), row({ key: "COD-1" })];
    sortRows(rows, [{ column: "key", direction: "asc" }]);
    expect(keys(rows)).toEqual(["COD-2", "COD-1"]);
  });

  /**
   * The one that makes the stack worth having: a tie on the first key is broken
   * by the second, and a tie on every key is broken by the sprint's own manual
   * order — never by whatever order the database happened to return.
   */
  it("breaks ties by the next key, and a full tie by the manual order", () => {
    const rows = [
      row({ key: "C", status: "ready", deadline: "2026-09-01", orderIndex: 3 }),
      row({ key: "A", status: "ready", deadline: "2026-09-01", orderIndex: 1 }),
      row({ key: "B", status: "in_progress", deadline: "2026-09-01", orderIndex: 2 }),
    ];

    // Every deadline ties, so status decides: B is in progress and leads. A and
    // C are both `ready` and tie again, so the manual order breaks it — A sits
    // at position 1 and C at 3.
    expect(
      keys(sortRows(rows, [{ column: "deadline", direction: "asc" }, { column: "status", direction: "asc" }]))
    ).toEqual(["B", "A", "C"]);

    expect(keys(sortRows(rows, [{ column: "deadline", direction: "asc" }]))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  /**
   * **Nulls last in BOTH directions**, which is where the prototype's
   * `"￿"` sentinel is wrong: a high sentinel sorts missing values last
   * ascending and *first* descending, so reversing the sort puts every story
   * without a deadline at the top. Missing is not a value, so it does not take
   * part in the reversal.
   */
  it("keeps missing values last whichever way the column is sorted", () => {
    const rows = [
      row({ key: "none", deadline: null }),
      row({ key: "late", deadline: "2026-09-30" }),
      row({ key: "soon", deadline: "2026-09-01" }),
    ];

    expect(keys(sortRows(rows, [{ column: "deadline", direction: "asc" }]))).toEqual([
      "soon",
      "late",
      "none",
    ]);
    expect(keys(sortRows(rows, [{ column: "deadline", direction: "desc" }]))).toEqual([
      "late",
      "soon",
      "none",
    ]);
  });

  it("treats an absent assignee, reviewer, grouping and component the same way", () => {
    const withNothing = row({ key: "empty" });
    // Only what the comparator reads — `SortableRow` is deliberately the
    // narrowest shape a row can be, so a test does not have to build a
    // `WorkItemRow` to assert a comparison.
    const withEverything = row({
      key: "full",
      grouping: 2,
      assignee: { fullName: "Adam Nafie" },
      reviewer: { fullName: "Ahmed Yehia" },
      components: [{ name: "Link Kachel" }],
    });

    for (const column of ["grouping", "assignee", "reviewer", "component"] as const) {
      for (const direction of ["asc", "desc"] as const) {
        expect(
          keys(sortRows([withNothing, withEverything], [{ column, direction }])),
          `${column} ${direction}`
        ).toEqual(["full", "empty"]);
      }
    }
  });

  /**
   * Status sorts by the display order the whole app already uses — work in
   * flight first, done last — not alphabetically, where `blocked` would open
   * the sprint and `in_progress` would sit in the middle.
   */
  it("sorts status by what needs attention, not by its name", () => {
    const rows = [
      row({ key: "done", status: "done" }),
      row({ key: "draft", status: "draft" }),
      row({ key: "flight", status: "in_progress" }),
    ];
    expect(keys(sortRows(rows, [{ column: "status", direction: "asc" }]))).toEqual([
      "flight",
      "draft",
      "done",
    ]);
  });

  it("sorts hours by what has been logged, numerically", () => {
    const rows = [
      row({ key: "nine", minutesLogged: 540 }),
      row({ key: "ninety", minutesLogged: 5400 }),
      row({ key: "half", minutesLogged: 30 }),
    ];
    expect(keys(sortRows(rows, [{ column: "hours", direction: "asc" }]))).toEqual([
      "half",
      "nine",
      "ninety",
    ]);
  });

  /**
   * A story with no criteria has no progress — that is different from 0%, and
   * it sorts with the other missing values rather than at the bottom of the
   * scale where it would look like the least-finished work in the sprint.
   */
  it("sorts criteria by progress, and no criteria is missing rather than zero", () => {
    const rows = [
      row({ key: "none", criteriaDone: 0, criteriaTotal: 0 }),
      row({ key: "half", criteriaDone: 2, criteriaTotal: 4 }),
      row({ key: "zero", criteriaDone: 0, criteriaTotal: 3 }),
    ];
    expect(keys(sortRows(rows, [{ column: "criteria", direction: "asc" }]))).toEqual([
      "zero",
      "half",
      "none",
    ]);
  });

  it("sorts keys by their number, not as text", () => {
    const rows = [row({ key: "COD-9" }), row({ key: "COD-10" }), row({ key: "COD-1" })];
    expect(keys(sortRows(rows, [{ column: "key", direction: "asc" }]))).toEqual([
      "COD-1",
      "COD-9",
      "COD-10",
    ]);
  });

  it("sorts people and components by name, case-insensitively", () => {
    const rows = [
      row({ key: "z", assignee: { fullName: "adam nafie" } }),
      row({ key: "a", assignee: { fullName: "Abdelrahman Elkhateeb" } }),
    ];
    expect(keys(sortRows(rows, [{ column: "assignee", direction: "asc" }]))).toEqual(["a", "z"]);
  });
});

describe("the panel's vocabulary", () => {
  it("never says asc or desc", () => {
    for (const column of SORTABLE_COLUMNS) {
      for (const direction of ["asc", "desc"] as const) {
        const said = directionLabel(column, direction).toLowerCase();
        expect(said).not.toContain("asc");
        expect(said).not.toContain("desc");
      }
    }
  });

  it("words each column by its own type", () => {
    expect(directionLabel("hours", "desc")).toBe("Sort high → low");
    expect(directionLabel("component", "asc")).toBe("A → Z");
    expect(directionLabel("deadline", "desc")).toBe("Latest → earliest");
    expect(directionLabel("assignee", "asc")).toBe("A → Z");
    expect(directionLabel("status", "asc")).toBe("In display order");
  });

  it("gives every sortable column a label and a kind", () => {
    for (const column of SORTABLE_COLUMNS) {
      expect(SORT_COLUMN_META[column].label.length).toBeGreaterThan(0);
      expect(directionLabel(column, "asc")).not.toBe(directionLabel(column, "desc"));
    }
  });
});

describe("editing the stack", () => {
  const stack = parseSort("deadline:asc,status:desc,hours:asc");

  it("reorders, because the stack is the priority", () => {
    expect(reorderSort(stack, 2, 0).map((k) => k.column)).toEqual(["hours", "deadline", "status"]);
    expect(reorderSort(stack, 0, 2).map((k) => k.column)).toEqual(["status", "hours", "deadline"]);
  });

  it("clamps a drop rather than rejecting it", () => {
    expect(reorderSort(stack, 0, 99).map((k) => k.column)).toEqual(["status", "hours", "deadline"]);
    expect(reorderSort(stack, 9, 0)).toEqual(stack);
    expect(reorderSort(stack, 1, 1)).toEqual(stack);
  });

  it("refuses a column that is already in the stack", () => {
    expect(setSortColumn(stack, 1, "deadline")).toEqual(stack);
    expect(setSortColumn(stack, 1, "type").map((k) => k.column)).toEqual([
      "deadline",
      "type",
      "hours",
    ]);
  });

  it("keeps a rule's place when only its direction changes", () => {
    const flipped = setSortDirection(stack, 0, "desc");
    expect(flipped[0]).toEqual({ column: "deadline", direction: "desc" });
    expect(flipped.map((k) => k.column)).toEqual(stack.map((k) => k.column));
  });

  it("adds the first unused column, and stops at the limit", () => {
    expect(addSort(stack)[3]).toEqual({ column: "key", direction: "asc" });
    const full = parseSort("key:asc,component:asc,status:asc,hours:asc");
    expect(full).toHaveLength(MAX_SORT_KEYS);
    expect(addSort(full)).toEqual(full);
  });

  it("round-trips whatever it builds through the URL", () => {
    const edited = setSortDirection(reorderSort(addSort(stack), 3, 0), 0, "desc");
    expect(parseSort(serializeSort(edited))).toEqual(edited);
  });
});

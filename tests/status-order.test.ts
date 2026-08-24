import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  STATUS_LABEL_CLIENT,
  WORK_ITEM_STATUSES,
  groupingHue,
  groupingStickyBg,
  parseStatusFilter,
  statusRank,
  type WorkItemStatus,
} from "@/lib/work-items";

/**
 * The status vocabulary is defined twice — once in Postgres, once in
 * TypeScript — because both sides need it and neither can import the other.
 * Two definitions of the same thing drift. These tests read the migrations and
 * compare, so the drift fails a test instead of quietly reordering a client's
 * report.
 *
 * Reading the SQL text rather than querying the database is deliberate: this
 * has to fail in CI on a machine with no Postgres, and a test that silently
 * skips when the database is absent is worse than no test.
 *
 * Migrations are append-only, so neither helper below may read a single file.
 * The enum is FOLDED — the `create type` establishes it and every later
 * `rename value` is replayed over it in filename order — and the rank function
 * is taken from the LAST migration that defines one. Reading only
 * `20260820120000_enums.sql`, as this test used to, meant a rename landing in a
 * later file was compared against the original SQL forever.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrationsInOrder(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS, name), "utf8"));
}

/** The rank function as the database will actually have it: the last one defined. */
function rankFunctionOrder(): WorkItemStatus[] {
  const defining = migrationsInOrder().filter((sql) =>
    sql.includes("function public.work_item_status_rank")
  );
  const sql = defining.at(-1);
  if (!sql) throw new Error("no migration defines work_item_status_rank");

  const body = sql.slice(
    sql.indexOf("function public.work_item_status_rank"),
    sql.indexOf("comment on function public.work_item_status_rank")
  );

  return [...body.matchAll(/when\s+'(\w+)'\s+then\s+(\d+)/g)]
    .map(([, status, rank]) => ({ status: status as WorkItemStatus, rank: Number(rank) }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.status);
}

/** The enum members, with every `rename value` replayed in order. */
function enumOrder(): WorkItemStatus[] {
  let members: string[] = [];

  for (const sql of migrationsInOrder()) {
    const start = sql.indexOf("create type work_item_status");
    if (start !== -1) {
      const declaration = sql.slice(start, sql.indexOf("create type work_item_type", start));
      members = [...declaration.matchAll(/'(\w+)'/g)].map(([, s]) => s);
    }

    // `rename value` preserves the member's position in the enum, so this is a
    // substitution in place — never a remove-and-append.
    const renames = sql.matchAll(
      /alter\s+type\s+work_item_status\s+rename\s+value\s+'(\w+)'\s+to\s+'(\w+)'/g
    );
    for (const [, from, to] of renames) {
      const at = members.indexOf(from);
      if (at === -1) throw new Error(`rename of unknown work_item_status value: ${from}`);
      members[at] = to;
    }
  }

  return members as WorkItemStatus[];
}

describe("status vocabulary", () => {
  it("SQL and TypeScript agree on the display order", () => {
    expect(rankFunctionOrder()).toEqual([...STATUS_DISPLAY_ORDER]);
  });

  it("SQL and TypeScript agree on the enum members", () => {
    expect(enumOrder()).toEqual([...WORK_ITEM_STATUSES]);
  });

  it("display order is not the enum declaration order", () => {
    // If these ever match it means someone 'tidied' the rank function into
    // declaration order, which silently reorders every board and report.
    expect([...STATUS_DISPLAY_ORDER]).not.toEqual([...WORK_ITEM_STATUSES]);
  });

  it("display order covers every status exactly once", () => {
    expect([...STATUS_DISPLAY_ORDER].sort()).toEqual([...WORK_ITEM_STATUSES].sort());
    expect(new Set(STATUS_DISPLAY_ORDER).size).toBe(WORK_ITEM_STATUSES.length);
  });

  it("work in flight sorts before unstarted, and done sorts last", () => {
    expect(statusRank("in_progress")).toBeLessThan(statusRank("ready"));
    expect(statusRank("in_peer_review")).toBeLessThan(statusRank("draft"));
    expect(statusRank("done")).toBe(WORK_ITEM_STATUSES.length - 1);
  });

  it("every status has an in-app label and a client-facing label", () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_LABEL_CLIENT[status]).toBeTruthy();
    }
  });

  it("client-facing labels never leak the internal vocabulary", () => {
    // A client reading "in_progress" or "in_peer_review" in a PDF is a
    // bug, not a style preference.
    for (const label of Object.values(STATUS_LABEL_CLIENT)) {
      expect(label).not.toMatch(/_/);
      expect(label).toMatch(/^[A-Z]/);
    }
  });
});

describe("status filter parsing", () => {
  it("reads the current vocabulary", () => {
    expect(parseStatusFilter("in_progress,ready")).toEqual(["in_progress", "ready"]);
  });

  it("maps every retired value forward", () => {
    // A link shared before the rename. Each of these was a real enum value.
    expect(parseStatusFilter("todo")).toEqual(["ready"]);
    expect(parseStatusFilter("dev_started")).toEqual(["in_progress"]);
    expect(parseStatusFilter("ready_for_peer_review")).toEqual(["in_peer_review"]);
    expect(parseStatusFilter("in_review")).toEqual(["in_qa"]);
  });

  it("keeps a pre-rename link filtering instead of showing the whole sprint", () => {
    // The failure this exists to prevent: unknown values are dropped, and an
    // empty filter means "everything", so the old link would have silently
    // widened rather than errored.
    expect(parseStatusFilter("dev_started,todo")).toEqual(["in_progress", "ready"]);
  });

  it("drops values that are not statuses at all", () => {
    expect(parseStatusFilter("nonsense")).toEqual([]);
    expect(parseStatusFilter("done,nonsense")).toEqual(["done"]);
    // A hand-edited query string still cannot smuggle anything in.
    expect(parseStatusFilter("'; drop table work_items; --")).toEqual([]);
  });

  it("collapses a retired value onto its replacement exactly once", () => {
    expect(parseStatusFilter("todo,ready")).toEqual(["ready"]);
  });

  it("is empty for an absent or blank filter", () => {
    expect(parseStatusFilter(null)).toEqual([]);
    expect(parseStatusFilter(undefined)).toEqual([]);
    expect(parseStatusFilter("")).toEqual([]);
    expect(parseStatusFilter(",,")).toEqual([]);
  });

  it("tolerates whitespace around a value", () => {
    expect(parseStatusFilter(" done , in_qa ")).toEqual(["done", "in_qa"]);
  });

  it("every retired value maps to a status that still exists", () => {
    for (const status of ["todo", "dev_started", "ready_for_peer_review", "in_review"]) {
      const [mapped] = parseStatusFilter(status);
      expect(WORK_ITEM_STATUSES).toContain(mapped);
    }
  });
});

describe("grouping hues", () => {
  it("is deterministic — the same integer is always the same hue", () => {
    for (const n of [1, 2, 3, 7, 42, 1000]) {
      expect(groupingHue(n)).toBe(groupingHue(n));
    }
  });

  it("pins 1 and 2 to the values in the design bundle", () => {
    expect(groupingHue(1)).toBe("#5b8cff");
    expect(groupingHue(2)).toBe("#12a594");
  });

  it("has no grouping hue for an ungrouped item", () => {
    expect(groupingHue(null)).toBeNull();
    expect(groupingHue(undefined)).toBeNull();
  });

  it("keeps generated hues out of the red/amber status band", () => {
    // A grouping colour that reads as a status signal is worse than no colour.
    for (let n = 3; n < 200; n += 1) {
      const hue = groupingHue(n);
      if (!hue?.startsWith("hsl(")) continue;
      const degrees = Number(hue.slice(4, hue.indexOf(" ")));
      expect(degrees).toBeGreaterThanOrEqual(160);
      expect(degrees).toBeLessThanOrEqual(300);
    }
  });

  it("uses an opaque sticky background for pinned groups", () => {
    // A translucent sticky column goes see-through over a tinted row.
    expect(groupingStickyBg(1)).toBe("var(--group-1-sticky)");
    expect(groupingStickyBg(2)).toBe("var(--group-2-sticky)");
    expect(groupingStickyBg(null)).toBe("var(--raised)");
  });
});

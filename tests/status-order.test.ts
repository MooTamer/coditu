import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STATUS_DISPLAY_ORDER,
  STATUS_LABEL,
  STATUS_LABEL_CLIENT,
  WORK_ITEM_STATUSES,
  groupingHue,
  groupingStickyBg,
  statusRank,
  type WorkItemStatus,
} from "@/lib/work-items";

/**
 * The status vocabulary is defined twice — once in Postgres, once in
 * TypeScript — because both sides need it and neither can import the other.
 * Two definitions of the same thing drift. These tests read the migration and
 * compare, so the drift fails a test instead of quietly reordering a client's
 * report.
 *
 * Reading the SQL text rather than querying the database is deliberate: this
 * has to fail in CI on a machine with no Postgres, and a test that silently
 * skips when the database is absent is worse than no test.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function rankFunctionOrder(): WorkItemStatus[] {
  const sql = readFileSync(join(MIGRATIONS, "20260820120000_enums.sql"), "utf8");
  const body = sql.slice(
    sql.indexOf("function public.work_item_status_rank"),
    sql.indexOf("comment on function public.work_item_status_rank")
  );

  return [...body.matchAll(/when\s+'(\w+)'\s+then\s+(\d+)/g)]
    .map(([, status, rank]) => ({ status: status as WorkItemStatus, rank: Number(rank) }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.status);
}

function enumOrder(): WorkItemStatus[] {
  const sql = readFileSync(join(MIGRATIONS, "20260820120000_enums.sql"), "utf8");
  const declaration = sql.slice(
    sql.indexOf("create type work_item_status"),
    sql.indexOf("create type work_item_type")
  );
  return [...declaration.matchAll(/'(\w+)'/g)].map(([, s]) => s as WorkItemStatus);
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
    expect(statusRank("dev_started")).toBeLessThan(statusRank("todo"));
    expect(statusRank("ready_for_peer_review")).toBeLessThan(statusRank("draft"));
    expect(statusRank("done")).toBe(WORK_ITEM_STATUSES.length - 1);
  });

  it("every status has an in-app label and a client-facing label", () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_LABEL_CLIENT[status]).toBeTruthy();
    }
  });

  it("client-facing labels never leak the internal vocabulary", () => {
    // A client reading "dev_started" or "ready_for_peer_review" in a PDF is a
    // bug, not a style preference.
    for (const label of Object.values(STATUS_LABEL_CLIENT)) {
      expect(label).not.toMatch(/_/);
      expect(label).toMatch(/^[A-Z]/);
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

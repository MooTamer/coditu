import { describe, expect, it } from "vitest";

import {
  buildPreview,
  mapDeadline,
  mapGrouping,
  mapHours,
  mapStatus,
  mapType,
  parseCsv,
} from "@/lib/import/notion";

/**
 * The importer's job is to refuse to guess. Every test here is about a value
 * that *could* be coerced into something plausible, and must not be.
 */

describe("CSV parsing", () => {
  it("keeps a quoted comma inside its cell", () => {
    // Splitting on commas shifts every field after this one, silently.
    const rows = parseCsv('Task,Status\n"Tabs with Cards: height, spacing",Done');
    expect(rows[1]).toEqual(["Tabs with Cards: height, spacing", "Done"]);
  });

  it("unescapes a doubled quote", () => {
    const rows = parseCsv('Task\n"He said ""no min-height"""');
    expect(rows[1][0]).toBe('He said "no min-height"');
  });

  it("keeps a newline inside a quoted cell", () => {
    const rows = parseCsv('Task,Status\n"Line one\nLine two",Todo');
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe("Line one\nLine two");
  });

  it("handles CRLF without producing empty rows", () => {
    expect(parseCsv("Task,Status\r\nOne,Todo\r\nTwo,Done")).toHaveLength(3);
  });

  it("strips a UTF-8 BOM so the first column still matches", () => {
    const rows = parseCsv("﻿Task,Status\nOne,Todo");
    expect(rows[0][0]).toBe("Task");
  });
});

describe("status and type mapping", () => {
  it("maps the labels the team actually writes", () => {
    expect(mapStatus("Dev Started")).toBe("in_progress");
    expect(mapStatus("Peer Review")).toBe("in_peer_review");
    expect(mapStatus("Not started")).toBe("ready");
    expect(mapType("CR: Change Request")).toBe("change_request");
    expect(mapType("Bug Fix")).toBe("bug_fix");
  });

  it("defaults an empty cell rather than failing the row", () => {
    expect(mapStatus("")).toBe("ready");
    expect(mapType("")).toBe("story");
  });

  it("refuses a status it does not know", () => {
    expect(mapStatus("Nearly there")).toBeNull();
    expect(mapType("Epic")).toBeNull();
  });
});

describe("deadline mapping", () => {
  it("converts Notion's D/M/YYYY", () => {
    expect(mapDeadline("23/08/2026").date).toBe("2026-08-23");
  });

  it("passes an ISO date straight through", () => {
    expect(mapDeadline("2026-08-23").date).toBe("2026-08-23");
  });

  it("flags an ambiguous date instead of picking one", () => {
    // 03/04/2026 is either 3 April or 4 March. Guessing is how a deadline
    // silently moves by a month.
    const result = mapDeadline("13/04/2026");
    expect(result.date).toBe("2026-04-13");

    const ambiguous = mapDeadline("04/13/2026");
    expect(ambiguous.date).toBeNull();
    expect(ambiguous.issue).toMatch(/ambiguous/);
  });

  it("flags a value that is not a date", () => {
    expect(mapDeadline("next Friday").issue).toBeTruthy();
  });

  it("never constructs a Date, so it cannot shift a day", () => {
    // The bug this guards: new Date("2026-08-23") is UTC midnight, which is the
    // 22nd anywhere west of Greenwich.
    for (const value of ["2026-01-01", "2026-12-31", "2026-08-23"]) {
      expect(mapDeadline(value).date).toBe(value);
    }
  });
});

describe("grouping mapping", () => {
  it("accepts an integer", () => {
    expect(mapGrouping("1").grouping).toBe(1);
    expect(mapGrouping("2").grouping).toBe(2);
  });

  it('flags "1a" rather than coercing it to 1', () => {
    // The team's real export contains this. Coercing it merges two groups.
    const result = mapGrouping("1a");
    expect(result.grouping).toBeNull();
    expect(result.issue).toMatch(/not an integer/);
  });

  it("treats an empty cell as no grouping, not an error", () => {
    expect(mapGrouping("").grouping).toBeNull();
    expect(mapGrouping("").issue).toBeUndefined();
  });
});

describe("hours to minutes", () => {
  it("converts at the boundary so nothing downstream sees a float", () => {
    expect(mapHours("7.5").minutes).toBe(450);
    expect(mapHours("0.5").minutes).toBe(30);
    expect(mapHours("2").minutes).toBe(120);
  });

  it("says so when a value had to be rounded", () => {
    const result = mapHours("1.333");
    expect(result.minutes).toBe(80);
    expect(result.issue).toMatch(/rounded/);
  });

  it("refuses nonsense and impossible days", () => {
    expect(mapHours("lots").issue).toBeTruthy();
    expect(mapHours("30").issue).toMatch(/more than a day/);
  });
});

describe("preview", () => {
  const CSV = [
    "Task,Status,Hours Worked,Assignee,Reviewer,Deadline,Story Type,Grouping",
    "Add optional titles to all webparts,Dev Started,7.5,Mohamed Tamer,Abdelrahman Elkhateeb,21/08/2026,Story,",
    "Tabs with Cards: height logic fix,Peer Review,2,Mohamed Tamer,Abdelrahman Elkhateeb,21/08/2026,Bug Fix,1",
    'Link Kachel changes,Peer Review,3,Mohamed Tamer,Abdelrahman Elkhateeb,22/08/2026,"CR: Change Request",1a',
    "Ghost row,Dev Started,1,Nobody At All,,23/08/2026,Story,2",
  ].join("\n");

  const PEOPLE = ["Mohamed Tamer", "Abdelrahman Elkhateeb", "Ahmed Yehia", "Adam Nafie"];

  it("maps the good rows and counts them", () => {
    const preview = buildPreview(CSV, PEOPLE);
    expect(preview.rows).toHaveLength(4);
    expect(preview.committable).toBe(2);
    expect(preview.skipped).toBe(2);
  });

  it("flags the 1a grouping row and does not commit it", () => {
    const preview = buildPreview(CSV, PEOPLE);
    const row = preview.rows.find((r) => r.title.startsWith("Link Kachel"))!;
    expect(row.issues.map((i) => i.message).join(" ")).toMatch(/not an integer/);
    expect(row.grouping).toBeNull();
  });

  it("flags a person who is not a profile", () => {
    const preview = buildPreview(CSV, PEOPLE);
    const row = preview.rows.find((r) => r.title === "Ghost row")!;
    expect(row.issues.map((i) => i.message).join(" ")).toMatch(/No profile named "Nobody At All"/);
    expect(row.issues.map((i) => i.column)).toContain("Assignee");
    expect(row.assigneeName).toBeNull();
  });

  it("converts the good rows' values correctly", () => {
    const preview = buildPreview(CSV, PEOPLE);
    const first = preview.rows[0];
    expect(first.status).toBe("in_progress");
    expect(first.minutesWorked).toBe(450);
    expect(first.deadline).toBe("2026-08-21");
    expect(first.assigneeName).toBe("Mohamed Tamer");
  });

  it("reports a column as unmatched when any of its rows failed", () => {
    const preview = buildPreview(CSV, PEOPLE);
    const grouping = preview.mappings.find((m) => m.from === "Grouping")!;
    expect(grouping.state).toBe("unmatched");

    const task = preview.mappings.find((m) => m.from === "Task")!;
    expect(task.state).toBe("mapped");
    expect(task.to).toBe("title");
  });

  it("copes with an empty file rather than throwing", () => {
    const preview = buildPreview("", PEOPLE);
    expect(preview.rows).toHaveLength(0);
    expect(preview.committable).toBe(0);
  });
});

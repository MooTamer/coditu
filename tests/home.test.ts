import { describe, expect, it } from "vitest";

import {
  busiest,
  dueThisSprint,
  loadOverTime,
  loadShare,
  logTimeTarget,
  mentionLine,
  weekStartOf,
  type LoggedDay,
  type MentionRow,
  type SprintScope,
} from "@/lib/home";
import { statusRank, type WorkItemStatus } from "@/lib/work-items";

/**
 * Workspace Home's arithmetic, against fixtures rather than against the shared
 * local database.
 *
 * The three things asserted here were each wrong in `e5097e3` and each wrong
 * *invisibly*: the page rendered, the browser check passed, and the numbers
 * were answers to different questions. A fixture is the only place the boundary
 * cases — another project's near deadline, a sprint with nothing logged — exist
 * on demand.
 */

const SCOPE: SprintScope = { projectSlug: "evim", sprintNumber: 17, endsOn: "2026-08-23" };

interface Row {
  key: string;
  projectSlug: string;
  sprintNumber: number;
  deadline: string | null;
  status: WorkItemStatus;
}

const row = (key: string, patch: Partial<Row> = {}): Row => ({
  key,
  projectSlug: "evim",
  sprintNumber: 17,
  deadline: "2026-08-20",
  status: "ready",
  ...patch,
});

describe("dueThisSprint", () => {
  it("keeps a row of the active sprint whose deadline falls on or before the end", () => {
    const rows = [row("COD-1", { deadline: "2026-08-20" }), row("COD-2", { deadline: "2026-08-23" })];
    expect(dueThisSprint(rows, SCOPE).map((r) => r.key)).toEqual(["COD-1", "COD-2"]);
  });

  it("drops a deadline after the sprint ends", () => {
    expect(dueThisSprint([row("COD-3", { deadline: "2026-08-24" })], SCOPE)).toEqual([]);
  });

  it("drops a row with no deadline", () => {
    expect(dueThisSprint([row("COD-4", { deadline: null })], SCOPE)).toEqual([]);
  });

  /**
   * The regression this file exists for. `getMyWork()` is workspace-wide, so
   * this row is genuinely assigned to the caller and genuinely due — it simply
   * is not this sprint's, and the tab claims to be.
   */
  it("drops another project's work even when its deadline is in range", () => {
    const other = row("ACME-9", { projectSlug: "acme", deadline: "2026-08-19" });
    expect(dueThisSprint([other], SCOPE)).toEqual([]);
  });

  it("drops another sprint of the SAME project", () => {
    const older = row("COD-5", { sprintNumber: 16, deadline: "2026-08-19" });
    expect(dueThisSprint([older], SCOPE)).toEqual([]);
  });

  it("is empty when there is no active sprint to be due within", () => {
    expect(dueThisSprint([row("COD-6")], null)).toEqual([]);
  });
});

describe("loadShare", () => {
  it("fills the busiest person's track completely", () => {
    expect(loadShare(480, 480)).toBe(100);
  });

  it("measures everybody else against that person, not against the total", () => {
    // 480 + 240 + 120. Against the total the busiest would read 57%.
    expect(loadShare(480, 480)).toBe(100);
    expect(loadShare(240, 480)).toBe(50);
    expect(loadShare(120, 480)).toBe(25);
  });

  it("does not divide by zero when nothing is logged", () => {
    expect(loadShare(0, 0)).toBe(0);
  });

  it("takes minutes, so an odd number does not drift", () => {
    expect(loadShare(95, 190)).toBe(50);
  });

  it("busiest is the largest entry, not the sum", () => {
    expect(busiest([{ minutesLogged: 480 }, { minutesLogged: 240 }])).toBe(480);
    expect(busiest([])).toBe(0);
  });
});

describe("logTimeTarget", () => {
  const ME = "profile-mt";
  interface SprintRow {
    key: string;
    status: WorkItemStatus;
    assignee: { id: string } | null;
  }
  const rank = (r: SprintRow) => statusRank(r.status);
  const item = (key: string, patch: Partial<SprintRow> = {}): SprintRow => ({
    key,
    status: "ready",
    assignee: { id: ME },
    ...patch,
  });

  it("offers the most advanced of your stories in the sprint", () => {
    const rows = [
      item("COD-9", { status: "ready" }),
      item("COD-8", { status: "in_progress" }),
      item("COD-7", { status: "draft" }),
    ];
    expect(logTimeTarget(rows, ME, rank)?.key).toBe("COD-8");
  });

  it("breaks a tie on the key, so the answer does not move between renders", () => {
    const rows = [item("COD-30", { status: "in_progress" }), item("COD-12", { status: "in_progress" })];
    expect(logTimeTarget(rows, ME, rank)?.key).toBe("COD-12");
    expect(logTimeTarget(rows.slice().reverse(), ME, rank)?.key).toBe("COD-12");
  });

  it("never offers somebody else's story", () => {
    const rows = [item("COD-1", { assignee: { id: "profile-ae" } }), item("COD-2", { assignee: null })];
    expect(logTimeTarget(rows, ME, rank)).toBeNull();
  });

  /**
   * Week 17 closed with every row `done`. The action has to survive that — time
   * is still logged against a finished story on the Monday after — and `done`
   * sorts last, so an open row still wins whenever there is one.
   */
  it("still offers a done story when the sprint has nothing else of yours", () => {
    expect(logTimeTarget([item("COD-5", { status: "done" })], ME, rank)?.key).toBe("COD-5");
    const mixed = [item("COD-5", { status: "done" }), item("COD-6", { status: "in_progress" })];
    expect(logTimeTarget(mixed, ME, rank)?.key).toBe("COD-6");
  });

  it("is null with nothing of yours in the sprint, so the action is not drawn", () => {
    expect(logTimeTarget([], ME, rank)).toBeNull();
  });
});

describe("mentionLine", () => {
  const base: MentionRow = {
    kind: "mention",
    itemKey: "COD-238",
    itemTitle: "Freeze the background when a modal is open",
    projectName: "EVIM",
    authorName: "Adam Nafie",
    preview: "the toggle default should stay as it is until Thursday",
    readAt: null,
  };

  it("names the comment's author, the place, and the body", () => {
    expect(mentionLine(base)).toEqual({
      author: "Adam Nafie",
      where: "COD-238 · EVIM",
      body: "the toggle default should stay as it is until Thursday",
      unread: true,
    });
  });

  it("marks a row read once it has been acknowledged", () => {
    expect(mentionLine({ ...base, readAt: "2026-08-27T09:00:00Z" }).unread).toBe(false);
  });

  /**
   * `assigned` and `review_requested` come from a trigger with no actor column.
   * There is nobody to name, so the row says what happened instead of
   * attributing it to somebody who may not have done it.
   */
  it("falls back to the verb and the item when the row records no actor", () => {
    const assigned = mentionLine({
      ...base,
      kind: "assigned",
      authorName: null,
      preview: null,
    });
    expect(assigned.author).toBe("Coditu");
    expect(assigned.body).toBe(
      "assigned this to you — Freeze the background when a modal is open"
    );
  });

  it("does not show a blank line when a comment previews as whitespace", () => {
    expect(mentionLine({ ...base, preview: "   " }).body).toBe(
      "mentioned you — Freeze the background when a modal is open"
    );
  });
});

/* ------------------------------------------------------------------------- *
 * PF-5 — average and cumulative load per person.
 * ------------------------------------------------------------------------- */

/**
 * Six weeks of Mondays, so a fixture can name a week rather than count days.
 * `W[0]` is the first working week; `W[5]` is the one containing `TODAY`.
 */
const W = [
  "2026-07-20",
  "2026-07-27",
  "2026-08-03",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
] as const;

/** A Wednesday: `W[5]` has started and has not finished. */
const TODAY = "2026-08-26";

const day = (personId: string, workedOn: string, minutes: number): LoggedDay => ({
  personId,
  workedOn,
  minutes,
});

describe("weekStartOf", () => {
  it("gives the Monday of the week, and is a fixed point on a Monday", () => {
    expect(weekStartOf("2026-08-23")).toBe("2026-08-17"); // a Sunday
    expect(weekStartOf("2026-08-17")).toBe("2026-08-17"); // the Monday itself
    expect(weekStartOf("2026-08-18")).toBe("2026-08-17");
  });

  it("crosses a month and a year boundary without a timezone", () => {
    expect(weekStartOf("2026-03-01")).toBe("2026-02-23");
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29");
  });
});

describe("loadOverTime", () => {
  it("averages over the working weeks since somebody's first, zero-hour weeks included", () => {
    // Three working weeks. `mt` logged in two of them and nothing in the third,
    // and the third still counts: the team worked that week and they did not.
    const rows = [
      day("mt", W[0], 600),
      day("mt", W[1], 600),
      day("ay", W[2], 120), // makes W[2] a working week
    ];
    const [mt] = loadOverTime(rows, TODAY).filter((p) => p.personId === "mt");
    expect(mt.weeks).toBe(3);
    expect(mt.cumulativeMinutes).toBe(1200);
    expect(mt.weeklyAverageMinutes).toBe(400);
  });

  it("does not charge somebody for the weeks before they joined", () => {
    const rows = [
      day("mt", W[0], 600),
      day("mt", W[1], 600),
      day("mt", W[2], 600),
      // Joined in the third week and logged the same amount that week.
      day("new", W[2], 600),
    ];
    const found = Object.fromEntries(loadOverTime(rows, TODAY).map((p) => [p.personId, p]));
    expect(found.mt.weeks).toBe(3);
    expect(found.mt.weeklyAverageMinutes).toBe(600);
    // One week of membership, not three — the whole point of the rule.
    expect(found.new.weeks).toBe(1);
    expect(found.new.weeklyAverageMinutes).toBe(600);
  });

  it("keeps the running week out of the average and reports it on its own", () => {
    const rows = [
      day("mt", W[4], 600),
      // W[5] contains TODAY and has not closed.
      day("mt", "2026-08-25", 300),
    ];
    const [mt] = loadOverTime(rows, TODAY);
    expect(mt.weeks).toBe(1);
    expect(mt.weeklyAverageMinutes).toBe(600);
    expect(mt.partialWeekMinutes).toBe(300);
    // Cumulative is a total, so it does not get to leave the running week out.
    expect(mt.cumulativeMinutes).toBe(900);
  });

  it("reports null rather than zero when there is no complete week to average", () => {
    // Everything this person has is in the week that has not finished. There is
    // no week to divide by, and `0.0 h/week` would be a claim about their pace
    // that the data cannot support.
    const [only] = loadOverTime([day("new", "2026-08-25", 480)], TODAY);
    expect(only.weeks).toBe(0);
    expect(only.weeklyAverageMinutes).toBeNull();
    expect(only.cumulativeMinutes).toBe(480);
    expect(only.partialWeekMinutes).toBe(480);
  });

  it("divides by nothing when nobody logged anything, and returns zero rows for no rows", () => {
    // Zero-minute entries are not a working week: the sum is what makes a week
    // count, so this divides by nothing rather than by zero.
    const all = loadOverTime([day("mt", W[0], 0), day("ay", W[1], 0)], TODAY);
    expect(all.map((p) => p.weeklyAverageMinutes)).toEqual([null, null]);
    expect(all.map((p) => p.weeks)).toEqual([0, 0]);
    expect(loadOverTime([], TODAY)).toEqual([]);
  });

  it("counts a week that carries time even when this person's own row is zero", () => {
    // The distinction the test above is the other half of: the week IS a
    // working week because `ay` logged in it, so `mt` averages 0 across it
    // rather than reporting "no data".
    const rows = [day("mt", W[0], 300), day("mt", W[1], 0), day("ay", W[1], 480)];
    const [, mt] = loadOverTime(rows, TODAY).sort((a, b) => a.personId.localeCompare(b.personId));
    expect(mt.personId).toBe("mt");
    expect(mt.weeks).toBe(2);
    expect(mt.weeklyAverageMinutes).toBe(150);
  });

  it("sums several days into the week they fall in", () => {
    const rows = [
      day("mt", "2026-07-20", 120), // Monday
      day("mt", "2026-07-24", 180), // Friday, same week
      day("mt", "2026-07-26", 60), // Sunday, still the same week
    ];
    const [mt] = loadOverTime(rows, TODAY);
    expect(mt.weeks).toBe(1);
    expect(mt.weeklyAverageMinutes).toBe(360);
  });

  it("orders by cumulative, busiest first, and breaks ties by id", () => {
    const rows = [day("b", W[0], 60), day("a", W[0], 600), day("c", W[0], 60)];
    expect(loadOverTime(rows, TODAY).map((p) => p.personId)).toEqual(["a", "b", "c"]);
  });
});

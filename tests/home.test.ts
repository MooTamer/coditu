import { describe, expect, it } from "vitest";

import {
  busiest,
  dueThisSprint,
  loadShare,
  logTimeTarget,
  mentionLine,
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

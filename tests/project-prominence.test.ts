import { describe, expect, it } from "vitest";

import { byProminence, type RankableProject } from "@/lib/projects";

/**
 * PF-3's ordering, against fixtures rather than against whichever five rows the
 * local database is holding.
 *
 * The point of the rule is that it does not name a client. These fixtures use
 * the real shape of the workspace — one long engagement with a running sprint,
 * one small one, three that have never had a sprint — and then check that the
 * order follows the WORK, by moving the sprint somewhere else and watching the
 * answer move with it.
 */
const project = (name: string, patch: Partial<RankableProject> = {}): RankableProject => ({
  name,
  activeSprint: null,
  sprintCount: 0,
  ...patch,
});

const order = (projects: RankableProject[]) =>
  [...projects].sort(byProminence).map((p) => p.name);

describe("byProminence", () => {
  const evim = project("MEINEvim components", { activeSprint: { number: 17 }, sprintCount: 15 });
  const converso = project("Converso dashboard", { sprintCount: 1 });
  const nile = project("Nile Atelier partner portal");
  const nvrmiss = project("NVRMiss landing");
  const ops = project("Ops Console");

  it("puts the project with the running sprint first, ahead of the alphabet", () => {
    expect(order([converso, evim, nile, nvrmiss, ops])).toEqual([
      "MEINEvim components",
      "Converso dashboard",
      "Nile Atelier partner portal",
      "NVRMiss landing",
      "Ops Console",
    ]);
  });

  it("follows the work, not the client — the sprint moving moves the order", () => {
    // The rule names no project. Give Converso the running sprint and it leads.
    const evimClosed = project("MEINEvim components", { sprintCount: 15 });
    const conversoActive = project("Converso dashboard", {
      activeSprint: { number: 2 },
      sprintCount: 2,
    });
    expect(order([evimClosed, conversoActive, ops])[0]).toBe("Converso dashboard");
  });

  it("ranks the long engagement over the one-off when neither is running", () => {
    const evimClosed = project("MEINEvim components", { sprintCount: 15 });
    expect(order([converso, evimClosed])).toEqual([
      "MEINEvim components",
      "Converso dashboard",
    ]);
  });

  it("falls back to the alphabet, so the tail does not depend on the query plan", () => {
    expect(order([ops, nvrmiss, nile])).toEqual([
      "Nile Atelier partner portal",
      "NVRMiss landing",
      "Ops Console",
    ]);
  });

  it("is a total order: sorting a shuffled list twice gives the same answer", () => {
    const all = [nile, evim, ops, converso, nvrmiss];
    expect(order(all)).toEqual(order([...all].reverse()));
  });
});

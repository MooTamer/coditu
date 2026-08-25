import { describe, expect, it } from "vitest";

import {
  projectSlugIn,
  spaceRowsFor,
  spaceStateFor,
  type SpaceProject,
} from "@/lib/project-spaces";

/**
 * What hangs under a project in the sidebar.
 *
 * Pinned here rather than looked at, for the same reason breadcrumbs are: the
 * tree is drawn once per project and a rule that is wrong for the project
 * nobody opened is wrong for a month. The seed's own shape is the interesting
 * case — MEINEvim runs one sprint and has fourteen closed ones behind it.
 */

const MEINEVIM: SpaceProject = {
  id: "p1",
  slug: "meinevim",
  name: "MEINEvim components",
  keyPrefix: "COD",
  activeSprint: { number: 17, name: "Sprint — Week 17" },
  sprints: [
    { number: 17, name: "Sprint — Week 17", status: "active" },
    { number: 16, name: "Sprint — Week 16", status: "closed" },
    { number: 15, name: "Sprint — Week 15", status: "closed" },
  ],
};

const QUIET: SpaceProject = {
  id: "p2",
  slug: "nile-atelier",
  name: "Nile Atelier partner portal",
  keyPrefix: "NIL",
  activeSprint: null,
  sprints: [],
};

describe("spaceRowsFor", () => {
  it("lists the open sprints and leaves the closed ones on the project page", () => {
    expect(spaceRowsFor(MEINEVIM, 41)).toEqual([
      {
        key: "sprint-17",
        glyph: "s17",
        label: "Week 17",
        href: "/app/projects/meinevim/sprints/17",
        meta: "active",
      },
      {
        key: "components",
        glyph: "reg",
        label: "Components",
        href: "/app/projects/meinevim/components",
        meta: "41",
      },
    ]);
  });

  it("keeps a planned sprint — open means workable, not started", () => {
    const planned: SpaceProject = {
      ...QUIET,
      sprints: [{ number: 1, name: "Sprint — Week 1", status: "planned" }],
    };
    expect(spaceRowsFor(planned, 0).map((row) => row.label)).toEqual(["Week 1", "Components"]);
  });

  it("orders sprints newest first, whatever order they arrive in", () => {
    const jumbled: SpaceProject = {
      ...QUIET,
      sprints: [
        { number: 4, name: "Sprint — Week 4", status: "planned" },
        { number: 9, name: "Sprint — Week 9", status: "active" },
        { number: 6, name: "Sprint — Week 6", status: "planned" },
      ],
    };
    expect(spaceRowsFor(jumbled, 0).map((row) => row.glyph)).toEqual(["s9", "s6", "s4", "reg"]);
  });

  it("always offers the registry, even at zero — it is where the first one is added", () => {
    expect(spaceRowsFor(QUIET, 0)).toEqual([
      {
        key: "components",
        glyph: "reg",
        label: "Components",
        href: "/app/projects/nile-atelier/components",
        meta: "0",
      },
    ]);
  });

  /**
   * The cap is the pathological case, and the point of this test is that it
   * does not truncate SILENTLY. Six open sprints is not a thing anybody does;
   * a sidebar that quietly showed five of them and looked complete would be.
   */
  it("says so when it caps, and offers the page that has them all", () => {
    const many: SpaceProject = {
      ...QUIET,
      sprints: Array.from({ length: 7 }, (_, n) => ({
        number: n + 1,
        name: `Sprint — Week ${n + 1}`,
        status: "planned" as const,
      })),
    };
    const rows = spaceRowsFor(many, 0);
    expect(rows.map((row) => row.label)).toEqual([
      "Week 7",
      "Week 6",
      "Week 5",
      "Week 4",
      "Week 3",
      "All sprints",
      "Components",
    ]);
    expect(rows.find((row) => row.key === "all-sprints")).toMatchObject({
      href: "/app/projects/nile-atelier",
      meta: "7",
    });
  });

  it("has no Notes row, because sprint notes have no address of their own", () => {
    expect(spaceRowsFor(MEINEVIM, 41).map((row) => row.label)).not.toContain("Notes");
  });
});

describe("spaceStateFor", () => {
  it("calls a project with a running sprint active", () => {
    expect(spaceStateFor(MEINEVIM)).toEqual({ label: "active", active: true });
  });

  /**
   * Converso is this project, and it is why the chip is a state rather than a
   * sprint name: its sprint is called *Converso review*, which at fifteen
   * characters crushed the project's own name to `Converso das…`. An earlier
   * version that looked only at the ACTIVE sprint said `no sprint` about it,
   * directly above a row naming the sprint it has.
   */
  it("calls a project with only a planned sprint planned, not sprintless", () => {
    const planned: SpaceProject = {
      ...QUIET,
      sprints: [{ number: 1, name: "Sprint — Converso review", status: "planned" }],
    };
    expect(spaceStateFor(planned)).toEqual({ label: "planned", active: false });
  });

  it("says no sprint only when there is genuinely none", () => {
    expect(spaceStateFor(QUIET)).toEqual({ label: "no sprint", active: false });
  });

  it("ignores closed sprints — a finished week is not a state", () => {
    const finished: SpaceProject = {
      ...QUIET,
      sprints: [{ number: 3, name: "Sprint — Week 3", status: "closed" }],
    };
    expect(spaceStateFor(finished)).toEqual({ label: "no sprint", active: false });
  });
});

describe("projectSlugIn", () => {
  it("finds the project in every project-scoped route", () => {
    for (const path of [
      "/app/projects/meinevim",
      "/app/projects/meinevim/components",
      "/app/projects/meinevim/components/link-kachel",
      "/app/projects/meinevim/sprints/17",
      "/app/projects/meinevim/sprints/17/items/COD-241",
    ]) {
      expect(projectSlugIn(path), path).toBe("meinevim");
    }
  });

  it("claims no project for the routes that belong to none", () => {
    for (const path of ["/app", "/app/projects", "/app/my-work", "/app/trash", "/login"]) {
      expect(projectSlugIn(path), path).toBeNull();
    }
  });
});

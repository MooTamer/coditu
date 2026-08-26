import { describe, expect, it } from "vitest";

import {
  activeProjectFilterCount,
  clearedProjectFilters,
  matchesProjectFilters,
  parseProjectFilters,
  parseTerms,
  type FilterableProject,
} from "@/lib/project-filters";
import { projectStateOf } from "@/lib/projects";

/**
 * The projects list's predicate, pinned.
 *
 * The same discipline as `sprint-filters.test.ts`: a filter that quietly widens
 * a shared link is worse than one that shows nothing, so every unrecognised
 * value is asserted to be dropped rather than approximated.
 */

const EVIM: FilterableProject = {
  name: "MEINEvim components",
  clientName: "EVIM",
  slug: "meinevim",
  activeSprint: { number: 17, name: "Sprint — Week 17" },
  sprints: [{ status: "active" }, { status: "closed" }],
};

const CONVERSO: FilterableProject = {
  name: "Converso dashboard",
  clientName: "Converso",
  slug: "converso",
  activeSprint: null,
  sprints: [{ status: "planned" }],
};

const QUIET: FilterableProject = {
  name: "Ops Console",
  clientName: "Internal · DevOps",
  slug: "ops-console",
  activeSprint: null,
  sprints: [],
};

const RETIRED: FilterableProject = { ...QUIET, name: "NVRMiss landing", slug: "nvrmiss", isArchived: true };

const ALL = [EVIM, CONVERSO, QUIET, RETIRED];
const surviving = (query: string) => {
  const spec = parseProjectFilters(new URLSearchParams(query));
  return ALL.filter((project) => matchesProjectFilters(project, spec)).map((p) => p.slug);
};

describe("projectStateOf", () => {
  it("derives the three states this schema can actually answer", () => {
    expect(projectStateOf(EVIM)).toBe("active");
    expect(projectStateOf(CONVERSO)).toBe("planned");
    expect(projectStateOf(QUIET)).toBe("none");
  });

  it("does not count a closed sprint as anything", () => {
    expect(projectStateOf({ activeSprint: null, sprints: [{ status: "closed" }] })).toBe("none");
  });
});

describe("parseProjectFilters", () => {
  it("reads nothing out of an empty query", () => {
    expect(parseProjectFilters(new URLSearchParams(""))).toEqual({
      terms: [],
      states: [],
      archived: false,
    });
  });

  /**
   * `paused` is the prototype's word and this schema has no column that could
   * answer it. Dropping it narrows by the states that ARE named rather than
   * inventing a fourth.
   */
  it("drops a state this app does not have", () => {
    expect(parseProjectFilters(new URLSearchParams("state=active,paused,nonsense")).states).toEqual([
      "active",
    ]);
  });

  it("drops a repeated state rather than drawing its chip twice", () => {
    expect(parseProjectFilters(new URLSearchParams("state=active,active")).states).toEqual(["active"]);
  });

  it("takes archived only from an explicit 1", () => {
    expect(parseProjectFilters(new URLSearchParams("archived=1")).archived).toBe(true);
    for (const raw of ["archived=0", "archived=true", "archived=yes", "archived="]) {
      expect(parseProjectFilters(new URLSearchParams(raw)).archived, raw).toBe(false);
    }
  });

  it("reads a plain search-params object as well as a URLSearchParams", () => {
    expect(parseProjectFilters({ q: "evim", state: "active" })).toEqual({
      terms: ["evim"],
      states: ["active"],
      archived: false,
    });
    // Next hands a repeated parameter through as an array; the first wins.
    expect(parseProjectFilters({ state: ["planned", "active"] }).states).toEqual(["planned"]);
  });
});

describe("parseTerms", () => {
  it("splits on whitespace and folds case", () => {
    expect(parseTerms("  EVIM   Kachel ")).toEqual(["evim", "kachel"]);
  });

  it("is empty for a blank box, which means no text filter at all", () => {
    expect(parseTerms("   ")).toEqual([]);
  });
});

describe("matchesProjectFilters", () => {
  it("hides archived projects until they are asked for", () => {
    expect(surviving("")).toEqual(["meinevim", "converso", "ops-console"]);
    expect(surviving("archived=1")).toEqual(["meinevim", "converso", "ops-console", "nvrmiss"]);
  });

  it("narrows by state, and by more than one at a time", () => {
    expect(surviving("state=active")).toEqual(["meinevim"]);
    expect(surviving("state=none")).toEqual(["ops-console"]);
    expect(surviving("state=active,planned")).toEqual(["meinevim", "converso"]);
  });

  /** Words in any order, because that is how a search box gets typed. */
  it("matches every term, in any order, across the name, the client and the slug", () => {
    expect(surviving("q=evim")).toEqual(["meinevim"]);
    expect(surviving("q=components+evim")).toEqual(["meinevim"]);
    expect(surviving("q=EVIM")).toEqual(["meinevim"]);
    expect(surviving("q=ops-console")).toEqual(["ops-console"]);
    expect(surviving("q=devops")).toEqual(["ops-console"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(surviving("q=nothing+here")).toEqual([]);
  });

  it("combines the three, and an archived project still has to match the rest", () => {
    expect(surviving("archived=1&q=nvrmiss")).toEqual(["nvrmiss"]);
    expect(surviving("archived=1&state=active")).toEqual(["meinevim"]);
  });
});

describe("activeProjectFilterCount", () => {
  it("counts a filled search box once however many words it holds", () => {
    expect(activeProjectFilterCount(parseProjectFilters(new URLSearchParams("q=one+two+three")))).toBe(1);
  });

  it("counts each state, and archived, because unexplained extra rows read as a bug", () => {
    expect(
      activeProjectFilterCount(parseProjectFilters(new URLSearchParams("q=a&state=active,planned&archived=1")))
    ).toBe(4);
  });

  it("is zero for an untouched list", () => {
    expect(activeProjectFilterCount(parseProjectFilters(new URLSearchParams("")))).toBe(0);
  });
});

describe("clearedProjectFilters", () => {
  it("removes every filter and keeps everything else the URL carries", () => {
    const cleared = clearedProjectFilters(
      new URLSearchParams("q=evim&state=active&archived=1&view=cards&highlight=x")
    );
    expect(cleared.toString()).toBe("view=cards&highlight=x");
  });
});

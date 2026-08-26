import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  NONE,
  activeFilterCount,
  matchesFilters,
  parseFilters,
  parseGroupingFilter,
  parsePeopleFilter,
  parseQuery,
  parseTypeFilter,
  type FilterableRow,
} from "@/lib/sprint-filters";

/**
 * The filters, asserted rather than clicked.
 *
 * The failure that matters here is not "the table shows too little" — that is
 * visible. It is a filter that quietly shows **more** than it says: an
 * unrecognised value dropped into an empty list means "show everything", and a
 * shared link then lies about what it is looking at.
 */

function row(over: Partial<FilterableRow> = {}): FilterableRow {
  return {
    status: "ready",
    type: "story",
    grouping: null,
    title: "Add optional titles to all webparts",
    description: "A unified optional title field on all webparts.",
    assignee: null,
    reviewer: null,
    ...over,
  };
}

describe("parseTypeFilter", () => {
  it("keeps what the enum has and drops the rest", () => {
    expect(parseTypeFilter("bug_fix,story")).toEqual(["bug_fix", "story"]);
    expect(parseTypeFilter("BUG_FIX")).toEqual(["bug_fix"]);
    expect(parseTypeFilter("epic,story")).toEqual(["story"]);
    expect(parseTypeFilter("epic")).toEqual([]);
    expect(parseTypeFilter("")).toEqual([]);
  });

  it("collapses a repeat rather than filtering twice", () => {
    expect(parseTypeFilter("story,story")).toEqual(["story"]);
  });
});

describe("parsePeopleFilter", () => {
  it("upper-cases initials and keeps the reserved none", () => {
    expect(parsePeopleFilter("mt,AE")).toEqual(["MT", "AE"]);
    expect(parsePeopleFilter("None")).toEqual([NONE]);
    expect(parsePeopleFilter("MT,none")).toEqual(["MT", NONE]);
  });

  /**
   * Deliberately NOT validated against the team. Initials nobody has match
   * nothing, which is an empty table — visibly wrong, and the right way round.
   * The failure worth preventing is a filter that matches more than it says.
   */
  it("keeps initials that belong to nobody, so the table goes empty rather than wide", () => {
    expect(parsePeopleFilter("ZZ")).toEqual(["ZZ"]);
  });
});

describe("parseGroupingFilter", () => {
  it("takes positive integers and none, and nothing else", () => {
    expect(parseGroupingFilter("1,2,none")).toEqual([1, 2, NONE]);
    expect(parseGroupingFilter("0")).toEqual([]);
    expect(parseGroupingFilter("-1")).toEqual([]);
    expect(parseGroupingFilter("1.5")).toEqual([]);
    expect(parseGroupingFilter("two")).toEqual([]);
  });
});

describe("parseQuery", () => {
  it("splits into lower-cased terms", () => {
    expect(parseQuery("Kachel  Height")).toEqual(["kachel", "height"]);
    expect(parseQuery("   ")).toEqual([]);
    expect(parseQuery(undefined)).toEqual([]);
  });

  it("caps the number of terms a hand-edited URL can ask for", () => {
    expect(parseQuery("a b c d e f g h i").length).toBeLessThanOrEqual(6);
  });
});

describe("matchesFilters", () => {
  it("passes everything when nothing is set", () => {
    expect(matchesFilters(row(), EMPTY_FILTERS)).toBe(true);
  });

  it("ORs within a dimension and ANDs across them", () => {
    const spec = parseFilters({ type: "bug_fix,chore", grouping: "2" });

    expect(matchesFilters(row({ type: "bug_fix", grouping: 2 }), spec)).toBe(true);
    expect(matchesFilters(row({ type: "chore", grouping: 2 }), spec)).toBe(true);
    // Right type, wrong grouping — every dimension has to agree.
    expect(matchesFilters(row({ type: "bug_fix", grouping: 1 }), spec)).toBe(false);
    expect(matchesFilters(row({ type: "story", grouping: 2 }), spec)).toBe(false);
  });

  it("matches a person by their initials, whatever case the URL used", () => {
    const spec = parseFilters({ assignee: "mt" });
    expect(matchesFilters(row({ assignee: { initials: "MT" } }), spec)).toBe(true);
    expect(matchesFilters(row({ assignee: { initials: "AE" } }), spec)).toBe(false);
    expect(matchesFilters(row({ assignee: null }), spec)).toBe(false);
  });

  /** "What has no reviewer" is a question about a sprint. "Who is AE" is not. */
  it("finds the empty seats with none, and mixes them with real people", () => {
    expect(matchesFilters(row({ reviewer: null }), parseFilters({ reviewer: "none" }))).toBe(true);
    expect(
      matchesFilters(row({ reviewer: { initials: "AE" } }), parseFilters({ reviewer: "none" }))
    ).toBe(false);

    const either = parseFilters({ reviewer: "AE,none" });
    expect(matchesFilters(row({ reviewer: null }), either)).toBe(true);
    expect(matchesFilters(row({ reviewer: { initials: "AE" } }), either)).toBe(true);
    expect(matchesFilters(row({ reviewer: { initials: "MT" } }), either)).toBe(false);
  });

  it("treats a story in no grouping as none", () => {
    const spec = parseFilters({ grouping: "none" });
    expect(matchesFilters(row({ grouping: null }), spec)).toBe(true);
    expect(matchesFilters(row({ grouping: 1 }), spec)).toBe(false);
  });

  /**
   * Terms, not a phrase: every word has to appear *somewhere* in the title or
   * the description, in any order. `kachel height` is a real search somebody
   * types, and a substring match on the whole phrase finds nothing.
   */
  it("requires every term, in either the title or the description", () => {
    const story = row({
      title: "Tabs with Cards: height logic fix",
      description: "Applies to the Link Kachel set as well.",
    });

    expect(matchesFilters(story, parseFilters({ q: "kachel height" }))).toBe(true);
    expect(matchesFilters(story, parseFilters({ q: "HEIGHT" }))).toBe(true);
    expect(matchesFilters(story, parseFilters({ q: "kachel newspart" }))).toBe(false);
  });

  it("searches a story with no description without falling over", () => {
    const story = row({ title: "Calendar", description: null });
    expect(matchesFilters(story, parseFilters({ q: "calendar" }))).toBe(true);
    expect(matchesFilters(story, parseFilters({ q: "nothing" }))).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts dimensions, not values — it is the badge on one button", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(parseFilters({ type: "story,bug_fix" }))).toBe(1);
    expect(activeFilterCount(parseFilters({ type: "story", assignee: "MT", q: "kachel" }))).toBe(3);
  });

  it("does not count a parameter that parsed to nothing", () => {
    expect(activeFilterCount(parseFilters({ type: "epic", grouping: "0", q: "  " }))).toBe(0);
  });
});

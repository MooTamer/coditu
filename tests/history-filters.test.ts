import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY_FILTERS,
  OUTSIDE,
  activeHistoryFilterCount,
  parseActorFilter,
  parseHistoryFilters,
  parseSurfaceFilter,
  toggleHref,
} from "@/lib/history-filters";

/**
 * The rule these all serve: **an unrecognised value is dropped, never guessed.**
 *
 * An empty filter means "show everything", so a parser that shrugged at a
 * value it did not understand and returned nothing would quietly widen
 * somebody's shared link — which is worse than showing them nothing, because
 * they cannot tell it happened. The sprint table's filters have said this since
 * they were built and these are the same promise for a different screen.
 */

describe("parseSurfaceFilter", () => {
  it("keeps only the surfaces this app has", () => {
    expect(parseSurfaceFilter("comment,sprint_notes")).toEqual(["sprint_notes", "comment"]);
  });

  it("drops what it does not recognise rather than guessing", () => {
    expect(parseSurfaceFilter("comment,client_message,DROP TABLE")).toEqual(["comment"]);
    expect(parseSurfaceFilter("nonsense")).toEqual([]);
  });

  it("returns display order, not the order somebody typed", () => {
    // Otherwise two links that filter to the same thing render their chips in
    // different orders, and the screen looks like it changed when it did not.
    expect(parseSurfaceFilter("comment,work_item_description")).toEqual([
      "work_item_description",
      "comment",
    ]);
  });

  it("cannot be made to hold a duplicate", () => {
    expect(parseSurfaceFilter("comment,comment,comment")).toEqual(["comment"]);
  });

  it("treats nothing, empty and whitespace as no filter", () => {
    for (const raw of [null, undefined, "", "  ", ",,,"]) {
      expect(parseSurfaceFilter(raw)).toEqual([]);
    }
  });
});

describe("parseActorFilter", () => {
  it("upper-cases initials, because a URL somebody typed is not a database value", () => {
    expect(parseActorFilter("mt,ae")).toEqual(["MT", "AE"]);
  });

  it("keeps the reserved token for a write with no session", () => {
    expect(parseActorFilter(OUTSIDE)).toEqual([OUTSIDE]);
    // And case-insensitively, for the same reason as initials.
    expect(parseActorFilter("OUTSIDE")).toEqual([OUTSIDE]);
  });

  it("drops anything that is not one to three letters", () => {
    // A uuid, an email and an injection attempt are all the same answer: this
    // is not a value this screen produces, so it never reaches the query.
    expect(parseActorFilter("a0000000-0000-4000-8000-000000000001")).toEqual([]);
    expect(parseActorFilter("mohamed@coditu.com")).toEqual([]);
    expect(parseActorFilter("MT,'); drop table profiles; --")).toEqual(["MT"]);
    expect(parseActorFilter("ABCD")).toEqual([]);
  });

  it("cannot be made to hold a duplicate, even through case", () => {
    expect(parseActorFilter("MT,mt,Mt")).toEqual(["MT"]);
  });
});

describe("parseHistoryFilters", () => {
  it("reads both parameters", () => {
    expect(parseHistoryFilters({ surface: "comment", actor: "mt" })).toEqual({
      surfaces: ["comment"],
      actors: ["MT"],
    });
  });

  it("takes the first when a parameter is repeated", () => {
    // `?actor=MT&actor=AE` is a URL nothing in this app builds, so there is no
    // right answer — but silently concatenating them would filter by a value
    // neither link asked for.
    expect(parseHistoryFilters({ actor: ["MT", "AE"] }).actors).toEqual(["MT"]);
  });

  it("is empty for an empty query", () => {
    expect(parseHistoryFilters({})).toEqual(EMPTY_HISTORY_FILTERS);
  });
});

describe("activeHistoryFilterCount", () => {
  it("counts every chip that is hiding something", () => {
    expect(activeHistoryFilterCount(EMPTY_HISTORY_FILTERS)).toBe(0);
    expect(activeHistoryFilterCount({ surfaces: ["comment"], actors: ["MT", "AE"] })).toBe(3);
  });
});

describe("toggleHref", () => {
  it("adds a value that is off", () => {
    expect(toggleHref(EMPTY_HISTORY_FILTERS, "surface", "comment")).toBe(
      "/app/history?surface=comment"
    );
  });

  it("removes a value that is on", () => {
    expect(toggleHref({ surfaces: ["comment"], actors: [] }, "surface", "comment")).toBe(
      "/app/history"
    );
  });

  it("keeps the other parameter while toggling one", () => {
    // The bug this prevents: filtering to a person, then clicking a surface,
    // and silently losing the person.
    expect(toggleHref({ surfaces: [], actors: ["MT"] }, "surface", "comment")).toBe(
      "/app/history?surface=comment&actor=MT"
    );
  });

  it("round-trips — toggling the same value twice is where you started", () => {
    const start = { surfaces: ["comment" as const], actors: ["MT"] };
    const once = toggleHref(start, "actor", "AE");
    const parsed = parseHistoryFilters(
      Object.fromEntries(new URLSearchParams(once.split("?")[1] ?? ""))
    );
    expect(toggleHref(parsed, "actor", "AE")).toBe("/app/history?surface=comment&actor=MT");
  });
});

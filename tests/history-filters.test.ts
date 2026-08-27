import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY_FILTERS,
  OUTSIDE,
  activeHistoryFilterCount,
  parseActionFilter,
  parseActorFilter,
  parseDate,
  parseHistoryFilters,
  parseProjectFilter,
  parseQuery,
  parseSurfaceFilter,
  toggleHref,
  MAX_QUERY,
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
      ...EMPTY_HISTORY_FILTERS,
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
    expect(
      activeHistoryFilterCount({ ...EMPTY_HISTORY_FILTERS, surfaces: ["comment"], actors: ["MT", "AE"] })
    ).toBe(3);

    // Every one of the six counts, and the two dates count separately —
    // "clear all 7" has to mean seven things a reader can see.
    expect(
      activeHistoryFilterCount({
        q: "governance",
        surfaces: ["page"],
        actors: ["MT"],
        projects: ["evim"],
        from: "2026-08-01",
        to: "2026-08-27",
        actions: ["restored"],
      })
    ).toBe(7);
  });
});

describe("toggleHref", () => {
  it("adds a value that is off", () => {
    expect(toggleHref(EMPTY_HISTORY_FILTERS, "surface", "comment")).toBe(
      "/app/history?surface=comment"
    );
  });

  it("removes a value that is on", () => {
    expect(
      toggleHref({ ...EMPTY_HISTORY_FILTERS, surfaces: ["comment"] }, "surface", "comment")
    ).toBe("/app/history");
  });

  it("keeps the other parameter while toggling one", () => {
    // The bug this prevents: filtering to a person, then clicking a surface,
    // and silently losing the person.
    expect(toggleHref({ ...EMPTY_HISTORY_FILTERS, actors: ["MT"] }, "surface", "comment")).toBe(
      "/app/history?surface=comment&actor=MT"
    );

    // And the four filters this audit added survive a toggle of a fifth. This
    // is the same bug one size larger: a filter bar that half-forgets itself.
    expect(
      toggleHref(
        {
          q: "governance",
          surfaces: [],
          actors: ["MT"],
          projects: ["evim"],
          from: "2026-08-01",
          to: "2026-08-27",
          actions: ["restored"],
        },
        "surface",
        "page"
      )
    ).toBe(
      "/app/history?q=governance&surface=page&actor=MT&project=evim&from=2026-08-01&to=2026-08-27&action=restored"
    );
  });

  it("round-trips — toggling the same value twice is where you started", () => {
    const start = { ...EMPTY_HISTORY_FILTERS, surfaces: ["comment" as const], actors: ["MT"] };
    const once = toggleHref(start, "actor", "AE");
    const parsed = parseHistoryFilters(
      Object.fromEntries(new URLSearchParams(once.split("?")[1] ?? ""))
    );
    expect(toggleHref(parsed, "actor", "AE")).toBe("/app/history?surface=comment&actor=MT");
  });
});


/**
 * The four filters `PLAN.md` §11 asked for and the build did not have.
 *
 * Each one is held to the same promise as the two that were already here: an
 * unrecognised value is dropped, never guessed, because an empty filter means
 * "show everything" and a link that quietly widens is a link that lies.
 */
describe("the search term", () => {
  it("trims, and an empty term is no search", () => {
    expect(parseQuery("  governance  ")).toBe("governance");
    expect(parseQuery("   ")).toBe("");
    expect(parseQuery(undefined)).toBe("");
  });

  it("is bounded, because it becomes an unanchored like pattern", () => {
    expect(parseQuery("x".repeat(500))).toHaveLength(MAX_QUERY);
  });

  it("keeps like metacharacters rather than stripping them", () => {
    // Dropping them would silently search for something else. Escaping happens
    // at the query, in `lib/data/revisions.ts`, where the pattern is built —
    // which is the only place that knows it is building one.
    expect(parseQuery("100%")).toBe("100%");
    expect(parseQuery("a_b")).toBe("a_b");
  });
});

describe("parseProjectFilter", () => {
  it("keeps slug-shaped values and lower-cases them", () => {
    expect(parseProjectFilter("EVIM,nile-atelier")).toEqual(["evim", "nile-atelier"]);
  });

  it("drops anything that is not a slug", () => {
    // The shape is all this can check — the module is imported by a client
    // component and cannot read the database. A slug no project has resolves to
    // no id and the screen says so.
    expect(parseProjectFilter("../etc,  ,%27")).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(parseProjectFilter("evim,EVIM,evim")).toEqual(["evim"]);
  });
});

describe("parseDate", () => {
  it("accepts a calendar date", () => {
    expect(parseDate("2026-08-27")).toBe("2026-08-27");
  });

  it("refuses a day that does not exist", () => {
    // `2026-02-31` matches the pattern and is not a day. Left in, it reaches
    // the query as `Invalid Date` and PostgREST answers 400.
    expect(parseDate("2026-02-31")).toBe("");
    expect(parseDate("2026-13-01")).toBe("");
  });

  it("refuses anything that is not one", () => {
    expect(parseDate("yesterday")).toBe("");
    expect(parseDate("2026-8-1")).toBe("");
    expect(parseDate(undefined)).toBe("");
  });
});

describe("parseActionFilter", () => {
  it("keeps the three actions in display order", () => {
    expect(parseActionFilter("restored,created")).toEqual(["created", "restored"]);
  });

  it("drops anything else", () => {
    expect(parseActionFilter("deleted,created")).toEqual(["created"]);
  });
});

describe("a range written backwards", () => {
  it("is read as the range between the two dates", () => {
    // Somebody who typed the later date into `from` meant the range, not an
    // empty screen. Obeying it literally returns nothing, however it is written.
    const spec = parseHistoryFilters({ from: "2026-08-27", to: "2026-08-01" });
    expect(spec.from).toBe("2026-08-01");
    expect(spec.to).toBe("2026-08-27");
  });

  it("leaves a one-ended range alone", () => {
    expect(parseHistoryFilters({ from: "2026-08-27" })).toMatchObject({
      from: "2026-08-27",
      to: "",
    });
  });
});

describe("every filter round-trips through the URL", () => {
  it("survives being parsed back out of the href it produced", () => {
    const spec = {
      q: "governance",
      surfaces: ["page" as const],
      actors: ["MT"],
      projects: ["evim"],
      from: "2026-08-01",
      to: "2026-08-27",
      actions: ["restored" as const],
    };
    // Toggle something on and back off: what comes out must be what went in.
    const once = toggleHref(spec, "action", "created");
    const parsed = parseHistoryFilters(
      Object.fromEntries(new URLSearchParams(once.split("?")[1] ?? ""))
    );
    expect(parsed.actions).toEqual(["created", "restored"]);
    const back = parseHistoryFilters(
      Object.fromEntries(new URLSearchParams(toggleHref(parsed, "action", "created").split("?")[1] ?? ""))
    );
    expect(back).toEqual(spec);
  });
});

describe("the page surface", () => {
  it("is a content type this screen can filter to", () => {
    // It was added by `20260827120000_page_revision_surface.sql`; a filter bar
    // that does not offer it is a filter bar that hides a whole surface.
    expect(parseSurfaceFilter("page")).toEqual(["page"]);
  });
});

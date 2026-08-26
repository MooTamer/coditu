import { describe, expect, it } from "vitest";

import {
  describeSpec,
  isEmptySpec,
  isSameView,
  searchFromSpec,
  specFromSearch,
  VIEW_PARAMS,
} from "@/lib/saved-views";
import { parseSpec } from "@/lib/saved-views-schema";

/**
 * A saved view is a saved question, and the question is a query string.
 *
 * The rule worth pinning is the one §5.5 states: the spec holds filter, sort and
 * mode and **never a row set**. Here that is the allowlist — so the test that
 * matters most is the one asserting nothing outside it survives, in either
 * direction.
 */

describe("the allowlist", () => {
  it("has no key that could hold a row set", () => {
    for (const key of ["items", "ids", "keys", "rows", "work_items"]) {
      expect(VIEW_PARAMS as readonly string[], key).not.toContain(key);
    }
  });

  it("drops anything it does not know, coming in from a URL", () => {
    const spec = specFromSearch("status=ready&items=COD-1,COD-2&page=3&sort=deadline:asc");
    expect(spec).toEqual({ status: "ready", sort: "deadline:asc" });
  });

  /**
   * Rows outlive the code that wrote them. A spec written by a newer version,
   * or edited straight into the database, should lose the part this version does
   * not understand rather than refuse to open.
   */
  it("drops anything it does not know, coming back out of the database", () => {
    expect(parseSpec({ status: "ready", items: ["COD-1"], nonsense: 3 })).toEqual({
      status: "ready",
    });
  });

  it("survives a spec that is not a spec at all", () => {
    for (const raw of [null, undefined, "ready", 42, [], { q: "" }, { q: 7 }]) {
      expect(parseSpec(raw), JSON.stringify(raw)).toEqual({});
    }
  });

  it("caps a value so a hand-written row cannot make an unopenable URL", () => {
    const long = "x".repeat(500);
    expect(specFromSearch(`q=${long}`).q!.length).toBe(200);
    expect(parseSpec({ q: long })).toEqual({});
  });
});

describe("searchFromSpec", () => {
  it("round-trips a whole view", () => {
    const search = "status=in_progress,ready&component=link-kachel&match=all&q=kachel&sort=deadline:asc&view=board";
    expect(searchFromSpec(specFromSearch(search))).toBe(new URLSearchParams(search).toString());
  });

  /**
   * Fixed order, not insertion order — otherwise two views saved from the same
   * screen produce different strings and `isSameView` starts lying.
   */
  it("writes the parameters in one order whatever order they arrived in", () => {
    const a = specFromSearch("sort=deadline:asc&status=ready");
    const b = specFromSearch("status=ready&sort=deadline:asc");
    expect(searchFromSpec(a)).toBe(searchFromSpec(b));
    expect(searchFromSpec(a).indexOf("status")).toBeLessThan(searchFromSpec(a).indexOf("sort"));
  });

  it("says nothing when there is nothing to say", () => {
    expect(searchFromSpec({})).toBe("");
    expect(isEmptySpec({})).toBe(true);
    expect(isEmptySpec(specFromSearch("density=compact"))).toBe(false);
  });
});

describe("isSameView", () => {
  it("ignores the parameters a view does not carry", () => {
    const spec = specFromSearch("status=ready");
    // `page` is not a view parameter, so a screen carrying one is still this view.
    expect(isSameView(spec, "?status=ready&page=2")).toBe(true);
    expect(isSameView(spec, "?status=ready&sort=deadline:asc")).toBe(false);
  });

  it("does not care what order the reader's URL happens to be in", () => {
    const spec = specFromSearch("status=ready&sort=deadline:asc");
    expect(isSameView(spec, "?sort=deadline:asc&status=ready")).toBe(true);
  });
});

describe("describeSpec", () => {
  it("counts the filters rather than listing them", () => {
    expect(describeSpec(specFromSearch("status=ready&type=bug_fix&q=kachel"))).toBe("3 filters");
    expect(describeSpec(specFromSearch("status=ready"))).toBe("1 filter");
  });

  it("says what a view does beyond filtering", () => {
    expect(describeSpec(specFromSearch("status=ready&sort=deadline:asc"))).toBe("1 filter · sorted");
    expect(describeSpec(specFromSearch("view=board"))).toBe("board");
  });

  it("has something to say about a view that filters nothing", () => {
    expect(describeSpec({})).toBe("the whole sprint");
  });

  /** `match` alone narrows nothing — it only qualifies a component filter. */
  it("does not count match as a filter of its own", () => {
    expect(describeSpec(specFromSearch("match=all"))).toBe("the whole sprint");
  });
});

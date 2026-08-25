import { describe, expect, it } from "vitest";

import { collapseUnchanged, diffLines, summariseDiff } from "@/lib/diff";

const marks = (before: string | null, after: string | null) =>
  diffLines(before, after).map((l) => `${l.mark[0]} ${l.text}`);

describe("diffLines", () => {
  it("reports nothing changed when nothing changed", () => {
    expect(marks("one\ntwo", "one\ntwo")).toEqual(["s one", "s two"]);
    expect(summariseDiff(diffLines("one\ntwo", "one\ntwo"))).toBe("formatting only");
  });

  it("finds an inserted line without calling the rest of the document new", () => {
    expect(marks("one\nthree", "one\ntwo\nthree")).toEqual(["s one", "a two", "s three"]);
  });

  it("finds a removed line", () => {
    expect(marks("one\ntwo\nthree", "one\nthree")).toEqual(["s one", "r two", "s three"]);
  });

  it("shows a replaced line as removed then added, in that order", () => {
    // The order is asserted deliberately: "was this, is now that" is how a
    // reader parses a replacement, and the tie-break in the walk is what
    // decides it.
    expect(marks("one\nold\nthree", "one\nnew\nthree")).toEqual([
      "s one",
      "r old",
      "a new",
      "s three",
    ]);
  });

  it("treats a null document as empty rather than throwing", () => {
    expect(marks(null, "written")).toEqual(["a written"]);
    expect(marks("deleted", null)).toEqual(["r deleted"]);
    expect(marks(null, null)).toEqual([]);
  });

  it("does not invent a trailing blank line", () => {
    // Every flattened document ends with a newline. Without the pop, every diff
    // would carry a phantom empty line that is always 'same' and always wrong
    // when one side lacks it.
    expect(marks("one\n", "one\ntwo\n")).toEqual(["s one", "a two"]);
  });

  it("normalises CRLF, so a Windows paste is not a whole-document rewrite", () => {
    expect(marks("one\r\ntwo", "one\ntwo")).toEqual(["s one", "s two"]);
  });

  it("degrades to wholesale replacement past the bound instead of hanging", () => {
    // 1201 lines each side is 1.44M LCS cells; the bound is what stops a pasted
    // log turning a history panel into a hung request.
    const big = Array.from({ length: 1201 }, (_, i) => `line ${i}`).join("\n");
    const out = diffLines(big, big);
    expect(out.filter((l) => l.mark === "same")).toHaveLength(0);
    expect(out.filter((l) => l.mark === "removed")).toHaveLength(1201);
    expect(out.filter((l) => l.mark === "added")).toHaveLength(1201);
  });

  it("summarises what happened in words a panel can print", () => {
    expect(summariseDiff(diffLines("a\nb", "a\nb\nc"))).toBe("1 line added");
    expect(summariseDiff(diffLines("a\nb\nc", "a"))).toBe("2 lines removed");
    expect(summariseDiff(diffLines("a\nold", "a\nnew"))).toBe("1 line added, 1 line removed");
  });
});

describe("collapseUnchanged", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

  it("keeps the changed lines and the context either side, and counts what it hid", () => {
    const before = long(30);
    const after = `${long(30)}\nsomething new`;
    const { lines, elided } = collapseUnchanged(diffLines(before, after), 2);

    // Two lines of context before the change, which sits at index 30.
    expect(lines.map((l) => l.text)).toEqual(["line 28", "line 29", "something new"]);
    // Reported rather than silent: an elision nobody is told about is
    // indistinguishable from a diff that missed something.
    expect(elided).toBe(28);
  });

  it("still renders something when only formatting changed", () => {
    const { lines, elided } = collapseUnchanged(diffLines(long(10), long(10)), 2);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.mark === "same")).toBe(true);
    expect(elided).toBe(6);
  });

  it("hides nothing when everything is close to a change", () => {
    const { lines, elided } = collapseUnchanged(diffLines("a\nb", "a\nc"), 2);
    expect(lines).toHaveLength(3);
    expect(elided).toBe(0);
  });
});

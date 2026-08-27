import { describe, expect, it } from "vitest";

import { blockChanges, summariseBlockChanges } from "@/lib/block-diff";

/**
 * The thing this was written for: **a revision whose text did not move still
 * changed something, and the panel has to be able to say what.**
 *
 * `lib/diff.ts` compares `plain_text`, so every one of the documents below
 * flattens identically before and after. The old panel showed `formatting only`
 * and then "nothing to compare" — a label, not an answer. Each test here is a
 * change a person actually made and expects to see named.
 */

const para = (text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("blockChanges", () => {
  it("names a mark that was added", () => {
    const changes = blockChanges(
      doc(para("Ship it")),
      doc(para("Ship it", [{ type: "bold" }]))
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].text).toBe("a paragraph: formatting none → bold");
  });

  it("names where a link now points", () => {
    // The href is invisible in the flattened text, so re-pointing a link was
    // the most silent edit this app could record.
    const changes = blockChanges(
      doc(para("the brief", [{ type: "link", attrs: { href: "https://a.example" } }])),
      doc(para("the brief", [{ type: "link", attrs: { href: "https://b.example" } }]))
    );
    expect(changes[0].text).toContain("link → https://b.example");
  });

  it("names a block whose type changed", () => {
    const changes = blockChanges(
      doc(para("Discuss before implementing")),
      doc({ type: "callout", attrs: { tone: "amber" }, content: [para("Discuss before implementing")] })
    );
    expect(changes[0].text).toBe("a paragraph became a callout");
  });

  it("names a heading whose level changed", () => {
    const changes = blockChanges(
      doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Scope" }] }),
      doc({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Scope" }] })
    );
    expect(changes[0].text).toBe("a sub-heading: level 1 → 2");
  });

  it("names a checklist item that was ticked", () => {
    const before = doc({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: false }, content: [para("Write the migration")] }],
    });
    const after = doc({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: true }, content: [para("Write the migration")] }],
    });
    expect(blockChanges(before, after)[0].text).toBe("a checklist item: ticked no → yes");
  });

  it("names a code block's language", () => {
    const before = doc({ type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "x" }] });
    const after = doc({ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "x" }] });
    expect(blockChanges(before, after)[0].text).toBe("a code block: language js → ts");
  });

  it("names a block that moved rather than reporting every block after it", () => {
    // Aligning by index would call this two rewrites. Aligning by text calls it
    // what it is.
    const changes = blockChanges(doc(para("one"), para("two")), doc(para("two"), para("one")));
    expect(changes.every((change) => change.text.includes("moved"))).toBe(true);
  });

  it("says nothing when nothing changed", () => {
    expect(blockChanges(doc(para("same")), doc(para("same")))).toEqual([]);
  });

  it("says nothing when a side is missing", () => {
    // A revision written before `doc` was stored, or version 1. Guessing at a
    // diff from one document is how a panel starts lying.
    expect(blockChanges(null, doc(para("x")))).toEqual([]);
    expect(blockChanges(doc(para("x")), undefined)).toEqual([]);
  });

  it("is bounded, and says so when it truncates", () => {
    const many = (mark: boolean) =>
      doc(...Array.from({ length: 30 }, (_, i) => para(`line ${i}`, mark ? [{ type: "bold" }] : undefined)));
    const changes = blockChanges(many(false), many(true));
    expect(changes).toHaveLength(13);
    // A silent truncation reads as "that was all of it".
    expect(changes[12].text).toBe("and 18 more formatting changes");
    expect(changes[12].position).toBeNull();
  });

  it("survives a document deeper than anything this app stores", () => {
    let node: unknown = para("deep");
    for (let i = 0; i < 200; i += 1) node = { type: "blockquote", content: [node] };
    expect(() => blockChanges(doc(node), doc(node))).not.toThrow();
  });
});

describe("summariseBlockChanges", () => {
  it("reads as the one change when there is one", () => {
    expect(summariseBlockChanges([{ position: 1, text: "a paragraph: formatting none → bold" }])).toBe(
      "a paragraph: formatting none → bold"
    );
  });

  it("counts when there are several", () => {
    expect(
      summariseBlockChanges([
        { position: 1, text: "a" },
        { position: 2, text: "b" },
      ])
    ).toBe("2 formatting changes");
  });

  it("is honest when a version really did match its predecessor", () => {
    // This is reachable now that a restore always writes a version: restoring
    // the version that is already current produces exactly this.
    expect(summariseBlockChanges([])).toBe("no visible change");
  });
});

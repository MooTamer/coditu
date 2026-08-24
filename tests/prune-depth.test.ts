import { describe, expect, it } from "vitest";

import { MAX_DEPTH, flattenToText, pruneToDepth } from "@/lib/comments/schema";

/**
 * The bound that exists because the renderer stopped being the only reader of a
 * stored document. See `pruneToDepth`'s own comment for the crash this prevents.
 */
describe("pruneToDepth", () => {
  const paragraph = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });

  it("leaves an ordinary document byte-for-byte alone", () => {
    const doc = {
      type: "doc",
      content: [
        paragraph("hello"),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("one")] }],
        },
      ],
    };
    expect(pruneToDepth(doc)).toEqual(doc);
  });

  it("keeps an image and every attribute the renderer reads", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/api/attachments/x/y.png", alt: "a screenshot", width: 800, height: 600 },
        },
      ],
    };
    expect(pruneToDepth(doc)).toEqual(doc);
  });

  it("keeps link marks and their href", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "coditu", marks: [{ type: "link", attrs: { href: "https://coditu.com" } }] },
          ],
        },
      ],
    };
    expect(pruneToDepth(doc)).toEqual(doc);
  });

  it("drops an attribute that is an object, because no real attribute is one", () => {
    const pruned = pruneToDepth({
      type: "doc",
      content: [{ type: "image", attrs: { src: "/a.png", nested: { deep: { deeper: 1 } } } }],
    }) as { content: Array<{ attrs: Record<string, unknown> }> };
    expect(pruned.content[0].attrs).toEqual({ src: "/a.png" });
  });

  it("cuts a document off at MAX_DEPTH", () => {
    // Built as a string for the same reason the e2e fixture is: JSON.stringify
    // recurses, so constructing 3,000 levels as objects is itself the crash.
    const depth = 3000;
    const deep = JSON.parse(
      `{"type":"doc","content":[` +
        `{"type":"paragraph","content":[`.repeat(depth) +
        `{"type":"text","text":"bottom"}` +
        `]}`.repeat(depth) +
        `]}`
    );

    const pruned = pruneToDepth(deep);

    // The whole point: the result can be serialised. Before the prune this line
    // threw `RangeError: Maximum call stack size exceeded`, which is exactly
    // what React did when it put the document in a client component's props.
    expect(() => JSON.stringify(pruned)).not.toThrow();

    let node = pruned as { content?: unknown[] };
    let levels = 0;
    while (Array.isArray(node.content) && node.content.length > 0) {
      node = node.content[0] as { content?: unknown[] };
      levels += 1;
    }
    expect(levels).toBe(MAX_DEPTH);
  });

  it("survives a document that is not a document at all", () => {
    expect(pruneToDepth("just a string")).toBeNull();
    expect(pruneToDepth(null)).toBeNull();
    expect(pruneToDepth({ nope: true })).toBeNull();
  });

  it("agrees with flattenToText about what is inside the bound", () => {
    const doc = { type: "doc", content: [paragraph("hello"), paragraph("world")] };
    expect(flattenToText(pruneToDepth(doc))).toBe(flattenToText(doc));
  });
});

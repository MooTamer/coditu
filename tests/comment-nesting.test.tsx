import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CommentBody } from "@/components/app/comment-body";
import { ALLOWED_NODES, INLINE_NODES, PHRASING_ONLY_NODES } from "@/lib/blocks/schema";

/**
 * The renderer must not emit invalid HTML, whatever the document says.
 *
 * `tests/comment-rendering.test.ts` attacks the pure helpers and leaves the
 * component to `e2e/comments.spec.ts`. That split had a hole in it: a stored
 * `paragraph` inside a `paragraph` rendered `<p><p>`, which is invalid HTML, so
 * the browser's parser closed the first `<p>` and built siblings while React's
 * tree still said nested — a hydration mismatch on every load of
 * `/app/projects/meinevim/sprints/17`. The e2e suite never saw it because no
 * spec asserted a clean console, and no unit test saw it because none of them
 * looked at markup.
 *
 * So these render. `renderToStaticMarkup` produces exactly the string the server
 * sends, which is the artefact that was wrong — a test that asserted on the
 * React tree instead would have passed while the page was broken.
 */

/** Elements that may contain phrasing content only. `<p>`, and the headings. */
const PHRASING_ONLY_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

/** Elements that are block-level, and therefore never legal inside those. */
const BLOCK_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "pre",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
];

/** No end tag, so they never open a scope. `<hr>` is both void and a block. */
const VOID_TAGS = ["br", "hr", "img", "input", "meta", "link", "source", "wbr"];

/**
 * The first block element found inside a phrasing-only one, or null.
 *
 * A string scan rather than a DOM parse, and deliberately: parsing the markup
 * would apply the very repair this is looking for. `document.body.innerHTML`
 * on `<p><p>x</p></p>` reports two siblings and nothing wrong.
 */
function blockInsidePhrasing(html: string): string | null {
  const open: string[] = [];
  const tags = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi;

  for (let match = tags.exec(html); match !== null; match = tags.exec(html)) {
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();

    if (closing) {
      const at = open.lastIndexOf(name);
      if (at !== -1) open.length = at;
      continue;
    }

    const enclosing = open.find((tag) => PHRASING_ONLY_TAGS.includes(tag));
    if (enclosing && BLOCK_TAGS.includes(name)) return `<${name}> inside <${enclosing}>`;
    if (!VOID_TAGS.includes(name)) open.push(name);
  }

  return null;
}

const text = (value: string) => ({ type: "text", text: value });

/** `doc > paragraph > paragraph > … > text`, `depth` levels of it. */
function nestedParagraphs(depth: number): unknown {
  let node: Record<string, unknown> = { type: "paragraph", content: [text("bottom of the well")] };
  for (let level = 1; level < depth; level += 1) node = { type: "paragraph", content: [node] };
  return { type: "doc", content: [node] };
}

describe("the scan itself", () => {
  // A detector that never fires would let every test below pass on a broken
  // renderer, which is the failure mode this whole file exists to close.
  it("finds the nesting that the DOM would have hidden", () => {
    expect(blockInsidePhrasing("<div><p><p>x</p></p></div>")).toBe("<p> inside <p>");
    expect(blockInsidePhrasing("<h3><ul><li>x</li></ul></h3>")).toBe("<ul> inside <h3>");
    expect(blockInsidePhrasing("<p>a<hr/>b</p>")).toBe("<hr> inside <p>");
  });

  it("passes markup that is actually well formed", () => {
    expect(blockInsidePhrasing("<div><p>a</p><p>b</p></div>")).toBeNull();
    // A `<br>` and a `<span>` are phrasing content, so they belong there.
    expect(blockInsidePhrasing("<p>a<br/><span>b</span></p>")).toBeNull();
    // A block inside a block is fine — only phrasing-only parents are policed.
    expect(blockInsidePhrasing("<blockquote><p>a</p></blockquote>")).toBeNull();
  });
});

describe("a block node inside a paragraph", () => {
  it("does not render a paragraph inside a paragraph", () => {
    const html = renderToStaticMarkup(<CommentBody doc={nestedParagraphs(2)} />);
    expect(blockInsidePhrasing(html)).toBeNull();
    // Fail closed, not fail silent: the words survive, the tag does not.
    expect(html).toContain("bottom of the well");
  });

  it("survives a chain of them without nesting once", () => {
    // The shape `e2e/comments.spec.ts` already stores at depth 3000, and the
    // shape that was sitting in `sprints.notes_json` when this was reported.
    const html = renderToStaticMarkup(<CommentBody doc={nestedParagraphs(20)} />);
    expect(blockInsidePhrasing(html)).toBeNull();
    expect(html).toContain("bottom of the well");
    // One paragraph opened, not twenty.
    expect((html.match(/<p[\s>]/g) ?? []).length).toBe(1);
  });

  it("does not render a list, a table or a rule inside a paragraph", () => {
    for (const block of [
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("listed")] }] }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [text("celled")] }] }] },
      { type: "horizontalRule" },
      { type: "codeBlock", content: [text("coded")] },
      { type: "blockquote", content: [{ type: "paragraph", content: [text("quoted")] }] },
      { type: "callout", attrs: { tone: "amber" }, content: [{ type: "paragraph", content: [text("called out")] }] },
      { type: "details", content: [{ type: "detailsSummary", content: [text("folded")] }] },
    ]) {
      const html = renderToStaticMarkup(
        <CommentBody doc={{ type: "doc", content: [{ type: "paragraph", content: [text("before "), block] }] }} />
      );
      expect(blockInsidePhrasing(html), `${block.type} inside a paragraph`).toBeNull();
      expect(html).toContain("before ");
    }
  });

  it("does not render a block inside a heading either", () => {
    // `<h3>` takes phrasing content too, and the heading case recurses the same
    // way the paragraph one does.
    const html = renderToStaticMarkup(
      <CommentBody
        doc={{
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 3 },
              content: [text("Heading "), { type: "paragraph", content: [text("and a paragraph")] }],
            },
          ],
        }}
      />
    );
    expect(blockInsidePhrasing(html)).toBeNull();
    expect(html).toContain("Heading ");
    expect(html).toContain("and a paragraph");
  });
});

describe("what a paragraph is still allowed to contain", () => {
  it("renders every inline node as itself", () => {
    const html = renderToStaticMarkup(
      <CommentBody
        doc={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "bold", marks: [{ type: "bold" }] },
                { type: "hardBreak" },
                { type: "mention", attrs: { label: "Yasmine" } },
                { type: "text", text: " see ", marks: [] },
                { type: "text", text: "the brief", marks: [{ type: "link", attrs: { href: "https://coditu.com" } }] },
              ],
            },
          ],
        }}
      />
    );

    expect(blockInsidePhrasing(html)).toBeNull();
    expect(html).toContain("<strong");
    expect(html).toContain("<br");
    expect(html).toContain("@Yasmine");
    expect(html).toContain('href="https://coditu.com"');
  });

  it("still draws the blocks that were never inside a paragraph", () => {
    // The containment rule must not cost the ordinary document anything.
    const html = renderToStaticMarkup(
      <CommentBody
        doc={{
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 3 }, content: [text("What we agreed")] },
            { type: "paragraph", content: [text("The first note.")] },
            { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("a point")] }] }] },
            { type: "callout", attrs: { tone: "jade" }, content: [{ type: "paragraph", content: [text("discuss first")] }] },
            { type: "horizontalRule" },
          ],
        }}
      />
    );

    expect(blockInsidePhrasing(html)).toBeNull();
    expect(html).toContain("<h3");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("<hr");
    expect(html).toContain("a point");
    expect(html).toContain("discuss first");
    // A `<p>` inside an `<li>` is legal HTML and is what a list item holds.
    expect(html).toMatch(/<li[^>]*>[\s\S]*<p[\s>]/);
  });
});

describe("the containment rule is complete", () => {
  // The companion to "every new type is in the allowlist" in
  // `comment-rendering.test.ts`. That one asks whether a node renders at all;
  // this one asks WHERE it may render, which is the half that was missing.
  //
  // Driven off `ALLOWED_NODES` rather than a list written out here, so a node
  // type added to the vocabulary is put inside a paragraph by this test whether
  // or not anybody remembered to think about it.
  it("holds for every node the allowlist admits", () => {
    // One bag of attributes covering every node that reads one — the renderer
    // takes what it recognises and ignores the rest.
    const attrs = { level: 3, tone: "amber", src: "/brand/mark.svg", alt: "a", label: "Nada", checked: true, open: true };

    for (const type of ALLOWED_NODES) {
      const html = renderToStaticMarkup(
        <CommentBody
          doc={{
            type: "doc",
            content: [{ type: "paragraph", content: [text("before "), { type, attrs, content: [text("inside")] }] }],
          }}
        />
      );
      expect(blockInsidePhrasing(html), `a ${type} inside a paragraph`).toBeNull();
      // The words are never the price of the fix.
      expect(html, `a ${type} inside a paragraph`).toContain("before ");
    }
  });

  it("names only nodes that render an inline element", () => {
    // Every one of these has a case in `comment-body.tsx` that emits text, a
    // `<br>`, a `<span>` or a `<button>`. Adding a node here that draws a block
    // would put that block back inside a `<p>`.
    expect([...INLINE_NODES].sort()).toEqual(["hardBreak", "image", "mention", "text"]);
    expect([...PHRASING_ONLY_NODES].sort()).toEqual(["heading", "paragraph"]);
  });

  it("keeps every inline node in the render allowlist", () => {
    for (const type of INLINE_NODES) expect(ALLOWED_NODES).toContain(type);
    for (const type of PHRASING_ONLY_NODES) expect(ALLOWED_NODES).toContain(type);
  });
});

/**
 * The block document schema — one format, every writing surface.
 *
 * Comments, acceptance criteria, client thread messages, story descriptions,
 * highlights and sprint notes are all the same shape. It lived at
 * `lib/comments/schema.ts` while comments were the only surface with a
 * document in them; the name stopped being true some time before it moved.
 *
 * This is the security boundary, and it is an ALLOWLIST. Every `*_json` column
 * is user-supplied and stored verbatim; anything not named here is not rendered.
 * A hostile document does not have to be rejected at write time to be safe —
 * the renderer walks known node types only, so an unknown node has nothing to
 * render it and falls through to its text content, or to nothing.
 *
 * See docs/05-DECISIONS.md — "Comment rendering: walk the JSON, never inject HTML".
 */

/**
 * The stored format's version, written beside every document as `*_version`.
 *
 * It is 1 and has never been anything else, which is exactly when a version
 * number is worth adding: the moment a second value exists, every row written
 * before it is indistinguishable from one written after, and the migration that
 * needs to tell them apart is the one that cannot.
 *
 * Adding a node type does NOT bump this. The renderer is fail-closed — an
 * unknown node renders its text content or nothing — so an old reader meeting a
 * new block degrades rather than breaks, and that is a property worth keeping
 * rather than versioning away. A bump is for a change that would make an old
 * document render WRONGLY: a different attribute meaning, a restructured tree.
 */
export const DOC_VERSION = 1;

/** Marks we render. Anything else on a text node is dropped. */
export const ALLOWED_MARKS = ["bold", "italic", "strike", "code", "link"] as const;
export type AllowedMark = (typeof ALLOWED_MARKS)[number];

/** Node types we render. Anything else renders as its text content, or nothing. */
export const ALLOWED_NODES = [
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "codeBlock",
  "image",
  "mention",

  // ── The design's remaining block types ────────────────────────────────────
  // A checklist. `taskItem.checked` is the only attribute that carries meaning,
  // and it is a boolean, so `pruneToDepth`'s primitives-only rule keeps it.
  "taskList",
  "taskItem",

  // A toggle. Three nodes rather than one because that is what the editor
  // produces: the summary is always visible and the content is what folds.
  "details",
  "detailsSummary",
  "detailsContent",

  // "Discuss before implementing", as a block anybody can write rather than a
  // convention only `work_items.highlight` could express.
  "callout",

  // Tables. `colwidth` is an ARRAY of numbers and is therefore dropped by
  // `pruneToDepth`, which reduces attributes to primitives — deliberately. It
  // is a cosmetic hint; losing it costs a column width and keeps the guarantee
  // that no attribute can carry a nested structure across the boundary.
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
] as const;
export type AllowedNode = (typeof ALLOWED_NODES)[number];

/**
 * The other half of the allowlist: not *whether* a node renders, but **where**.
 *
 * `ALLOWED_NODES` was flat, and a flat allowlist cannot say that a paragraph
 * inside a paragraph is not a document. It is not a theoretical shape —
 * `e2e/comments.spec.ts` stores a 3,000-deep chain of exactly that on purpose,
 * `documentSchema` validates the root node only (a recursive schema overflows
 * the stack on the input it exists to survive), and every `*_json` column is
 * jsonb, so anything that reaches a Server Action is stored as written.
 *
 * The consequence was invalid HTML. `<p><p>` is not nesting to a browser — the
 * parser closes the first `<p>` and builds siblings, so the DOM disagreed with
 * React's tree and the sprint page threw a hydration mismatch on every load.
 * Nothing caught it: the renderer's own tests read helpers rather than markup,
 * and no e2e spec asserted a clean console.
 *
 * These two lists are the rule. `INLINE_NODES` are the nodes whose case in
 * `comment-body.tsx` emits phrasing content — text, a `<br>`, a `<span>`, a
 * `<button>`. `PHRASING_ONLY_NODES` are the nodes whose own element accepts
 * nothing else: `<p>`, and the headings. A block node reached inside one of
 * those renders its text and no tag, which is the same fail-closed path an
 * unrecognised node has always taken.
 *
 * A `listItem`, a `tableCell` and a `<summary>` take flow content, so a
 * paragraph inside them is correct HTML and is left alone.
 */
export const INLINE_NODES = ["text", "hardBreak", "image", "mention"] as const;
export type InlineNode = (typeof INLINE_NODES)[number];

/** Nodes whose element accepts phrasing content only. */
export const PHRASING_ONLY_NODES = ["paragraph", "heading"] as const;

/** Does this node type render phrasing content, and so belong inside a `<p>`? */
export function isInlineNode(type: string): boolean {
  return (INLINE_NODES as readonly string[]).includes(type);
}

/** Does this node type render an element that accepts phrasing content only? */
export function isPhrasingOnlyNode(type: string): boolean {
  return (PHRASING_ONLY_NODES as readonly string[]).includes(type);
}

/**
 * Callout tones.
 *
 * An allowlist, because the value reaches a `style` attribute at the render edge
 * and `var(--anything)` would otherwise be an author's choice. Three, not the
 * five the prototype drew: `01-DESIGN-SYSTEM.md` §2 defines tone pairs for amber,
 * jade and slate, and those are the `--tone-*-fg` / `--tone-*-bg` variables that
 * exist. A fourth would resolve to an undefined variable, which is not an error —
 * the declaration is simply dropped and the callout renders with no edge at all.
 *
 * Defined here rather than in the renderer so the editor cannot offer a tone the
 * renderer will not draw.
 */
export const CALLOUT_TONES = ["amber", "jade", "slate"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** Languages the code block will highlight. Anything else renders unhighlighted. */
export const CODE_LANGUAGES = [
  "ts",
  "tsx",
  "js",
  "json",
  "sql",
  "bash",
  "css",
  "html",
  "python",
  "diff",
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export interface ProseMirrorNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: ProseMirrorNode[];
}

/**
 * Validates ONE node, not the tree — and **without zod**.
 *
 * Deliberately shallow, for the reason this has always been shallow: a
 * recursive schema walks the whole document while validating, so a deeply
 * nested `body_json` overflows the stack *inside the validator*, before any
 * depth guard of ours gets a chance to run. `body_json` is a jsonb column that
 * will happily store 5,000 nested paragraphs, so that is a denial of service
 * anybody with a comment box can trigger. Every walker below parses one level
 * and recurses itself, counting depth as it goes.
 *
 * **Hand-written rather than `z.object`, and that is a bundle decision.** This
 * module is reachable from the browser — the sprint notes panel, the item
 * fields and the composer all ask it whether a document is empty — and zod is
 * ~63KB gzipped. It arrived in the app shell exactly that way and took the
 * route from 69KB to 136KB against a 110KB budget. `lib/supabase/env.ts` avoids
 * zod for the same reason and says so.
 *
 * The semantics are the ones `z.object` gave: unknown keys are STRIPPED rather
 * than carried, so what a caller stores is only ever the five fields named here.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseNode(value: unknown): ProseMirrorNode | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.type !== "string") return null;

  const node: ProseMirrorNode = { type: value.type };

  if (value.text !== undefined) {
    if (typeof value.text !== "string") return null;
    node.text = value.text;
  }
  if (value.attrs !== undefined) {
    if (!isPlainObject(value.attrs)) return null;
    node.attrs = value.attrs;
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) return null;
    const marks: NonNullable<ProseMirrorNode["marks"]> = [];
    for (const mark of value.marks) {
      if (!isPlainObject(mark) || typeof mark.type !== "string") return null;
      marks.push(
        isPlainObject(mark.attrs) ? { type: mark.type, attrs: mark.attrs } : { type: mark.type }
      );
    }
    node.marks = marks;
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return null;
    node.content = value.content as ProseMirrorNode[];
  }

  return node;
}

/** Depth limit. A deeply nested document is a denial of service, not a comment. */
export const MAX_DEPTH = 24;



/**
 * A copy of the document with everything past `maxDepth` cut off.
 *
 * `comment-body.tsx` has always stopped rendering at `MAX_DEPTH`, so nothing
 * below it was ever on screen. This exists because the renderer stopped being
 * the only consumer: once a comment became editable, `item-detail.tsx` began
 * handing the stored document to a **client** component, and React serialises a
 * client component's props into the flight payload with a recursive
 * `JSON.stringify`. A 3,000-deep document then took the whole page down with
 *
 *     RangeError: Maximum call stack size exceeded    at stringify
 *
 * — a 500 on the item, not a badly-drawn comment, arriving through a boundary
 * the depth guard did not know existed. `body_json` is jsonb and will store any
 * depth at all, so the bound belongs where the document **leaves the server**,
 * not only where it is drawn.
 *
 * **Iterative on purpose.** A recursive pruner would overflow the stack on
 * precisely the input it exists to survive, which is the same trap
 * `e2e/comments.spec.ts` records for building its own fixture.
 *
 * `attrs` values are reduced to primitives for the same reason: they are jsonb
 * too, and every attribute this schema actually reads — `href`, `src`, `alt`,
 * `language`, `id`, `label`, `width`, `height` — is a string, a number or a
 * boolean. A nested object in there is not an attribute anyone meant.
 */
export function pruneToDepth(value: unknown, maxDepth: number = MAX_DEPTH): unknown {
  const root = parseNode(value);
  if (!root) return null;

  const primitives = (attrs: Record<string, unknown> | undefined) => {
    if (!attrs) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, attr] of Object.entries(attrs)) {
      const kind = typeof attr;
      if (attr === null || kind === "string" || kind === "number" || kind === "boolean") {
        out[key] = attr;
      }
    }
    return out;
  };

  const shallowCopy = (node: ProseMirrorNode): ProseMirrorNode => {
    const copy: ProseMirrorNode = { type: node.type };
    if (node.text !== undefined) copy.text = node.text;
    const attrs = primitives(node.attrs);
    if (attrs) copy.attrs = attrs;
    if (node.marks) {
      copy.marks = node.marks.map((mark) => {
        const markAttrs = primitives(mark.attrs);
        return markAttrs ? { type: mark.type, attrs: markAttrs } : { type: mark.type };
      });
    }
    return copy;
  };

  const rootCopy = shallowCopy(root);
  const queue: Array<{ from: ProseMirrorNode; to: ProseMirrorNode; depth: number }> = [
    { from: root, to: rootCopy, depth: 0 },
  ];

  while (queue.length > 0) {
    const { from, to, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    if (!Array.isArray(from.content)) continue;

    const kept: ProseMirrorNode[] = [];
    for (const child of from.content) {
      const parsed = parseNode(child);
      if (!parsed) continue;
      const childCopy = shallowCopy(parsed);
      kept.push(childCopy);
      queue.push({ from: parsed, to: childCopy, depth: depth + 1 });
    }
    if (kept.length > 0) to.content = kept;
  }

  return rootCopy;
}

/**
 * Flattens a document to plain text for `comments.body_text` — search, export,
 * and notification previews all read that column rather than walking jsonb.
 *
 * Written in the same transaction as `body_json`, and derived from the same
 * parsed value, so the two can never describe different comments.
 */
export function flattenToText(node: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) return "";
  const current = parseNode(node);
  if (!current) return "";

  if (current.type === "text") return current.text ?? "";
  if (current.type === "hardBreak") return "\n";
  if (current.type === "mention") {
    const label = current.attrs?.label;
    return typeof label === "string" ? `@${label}` : "@someone";
  }
  if (current.type === "image") {
    const alt = current.attrs?.alt;
    return typeof alt === "string" && alt ? `[image: ${alt}]` : "[image]";
  }

  const inner = (current.content ?? []).map((child) => flattenToText(child, depth + 1)).join("");

  // Block-level nodes get a trailing newline, so the flattened text still reads
  // as paragraphs inside a CSV cell or a Markdown export.
  // Block-level nodes get a trailing newline so the flattened text still reads
  // as paragraphs inside a CSV cell or a Markdown export. `taskItem` and the
  // table cells are here for the same reason a `listItem` is: without them a
  // three-item checklist flattens to one run-on line in the export a client
  // reads.
  const blocks = [
    "paragraph",
    "heading",
    "listItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "taskItem",
    "detailsSummary",
    "callout",
    "tableRow",
  ];
  return blocks.includes(current.type) ? `${inner}\n` : inner;
}

/** True when the document has no renderable text at all. */
export function isEmptyDocument(node: unknown): boolean {
  return flattenToText(node).trim().length === 0;
}

/** Extract mentioned profile ids. Mirrors what the database trigger does. */
export function collectMentionIds(node: unknown, depth = 0, found = new Set<string>()): string[] {
  if (depth > MAX_DEPTH) return [...found];
  const current = parseNode(node);
  if (!current) return [...found];
  if (current.type === "mention") {
    const id = current.attrs?.id;
    if (typeof id === "string" && UUID_RE.test(id)) found.add(id);
  }
  for (const child of current.content ?? []) collectMentionIds(child, depth + 1, found);
  return [...found];
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Whitespace and control characters, which are how `java\tscript:` and friends
 * slip past a naive prefix check — browsers strip them before resolving a URL.
 */
const UNSAFE_URL_CHARS = /[\s\u0000-\u001F\u007F]/;

/**
 * Is this a link we are willing to make clickable?
 *
 * `javascript:` and `data:` hrefs are script execution with extra steps, and a
 * stored comment is exactly where somebody would put one. Allowlist the three
 * schemes that make sense in a work thread and refuse everything else.
 */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (UNSAFE_URL_CHARS.test(trimmed)) return false;
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed);
}

/**
 * Is this an image source we are willing to render?
 *
 * Same-origin paths and http(s) URLs only. No `data:` URIs — they are a way to
 * smuggle an SVG, and an SVG is a document that can carry script.
 */
export function isSafeImageSrc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (UNSAFE_URL_CHARS.test(trimmed)) return false;
  return /^\//.test(trimmed) || /^https?:\/\//i.test(trimmed);
}


/**
 * A plain-text field, as the document it always meant.
 *
 * Every writing surface in this app predates the editor, and their rows are
 * still prose: 58 imported descriptions are multi-line requirement lists, and
 * fifteen sprints of notes are bullet lines somebody typed into a textarea.
 *
 * They are converted **on read** rather than rewritten. A bulk migration would
 * touch every row in two tables to produce paragraphs this function produces for
 * free, and it would invent a block structure for prose nobody wrote as blocks.
 *
 * `starsAreCallouts` is the sprint-notes convention: a whole paragraph wrapped in
 * `**` meant "discuss this before implementing", drawn by hand as an amber left
 * rule. It becomes the callout it always was. Descriptions never used it — they
 * have `highlight`, a column of their own — so it is off by default rather than
 * applied hopefully everywhere.
 */
export function documentFromText(
  text: string,
  options: { starsAreCallouts?: boolean } = {}
): ProseMirrorNode {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: paragraphs.map((paragraph) => {
      // `[\s\S]` rather than the `s` flag: tsconfig targets ES2017.
      const starred = options.starsAreCallouts
        ? /^\*\*([\s\S]+)\*\*$/.exec(paragraph)
        : null;
      const body: ProseMirrorNode = {
        type: "paragraph",
        // Single newlines inside a paragraph are line breaks, not paragraph
        // breaks. Collapsing them turned 58 requirement lists into one
        // unreadable run of text once already.
        content: withHardBreaks(starred ? starred[1] : paragraph),
      };
      return starred
        ? { type: "callout", attrs: { tone: "amber" }, content: [body] }
        : body;
    }),
  };
}

function withHardBreaks(paragraph: string): ProseMirrorNode[] {
  const lines = paragraph.split("\n");
  const nodes: ProseMirrorNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "hardBreak" });
    if (line) nodes.push({ type: "text", text: line });
  });
  return nodes;
}

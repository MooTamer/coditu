import type { ProseMirrorNode } from "@/lib/blocks/schema";

/**
 * What changed about a document that the text diff cannot see.
 *
 * ## The problem this exists to solve
 *
 * `lib/diff.ts` diffs `plain_text`, and its own header states the consequence:
 * *"a change that alters only formatting produces no diff lines."* Bolding a
 * word, turning a paragraph into a callout, ticking a checklist item, changing
 * a code block's language, adding a link — every one of those leaves the
 * flattened text identical, so the panel showed `formatting only` and then
 * *"nothing to compare"*.
 *
 * That is a label, not an answer. A version history whose whole purpose is
 * *"what did somebody do to this"* answering *"something, but not words"* is
 * the point at which a reader stops trusting it. **Every revision here has a
 * `doc`** — the block tree, stored beside the text in the same statement — and
 * it says exactly what happened.
 *
 * ## Blocks and properties, not a tree diff
 *
 * `lib/diff.ts` explains why it does not walk two ProseMirror trees: a block
 * that moved and gained a word is a move-plus-edit or a delete-plus-insert, and
 * every answer is wrong for some document. That argument still holds and this
 * does not attempt it.
 *
 * What this does instead is flatten each document to a **list of blocks with
 * their properties**, align them by the text they contain, and report the
 * property differences. Alignment by text is exactly the case the text diff
 * cannot handle and this one can: if the words are the same, the blocks
 * correspond, and anything different about them is a formatting change worth
 * naming. When the words *have* changed, `lib/diff.ts` already answered and
 * this stays quiet rather than guessing at a second story.
 *
 * ## Server-side only, by construction rather than by rule
 *
 * `/app/history` and the story panel both render on the server, and the diff
 * ships as HTML. This module imports one `type` and nothing else, so it cannot
 * pull anything into a client bundle even if somebody imports it from one —
 * the trap `lib/saved-views-schema.ts` was split to avoid.
 */

/** One human sentence about one property that changed. */
export interface BlockChange {
  /** 1-based, in reading order, for "paragraph 3". Null when it is not a position. */
  position: number | null;
  text: string;
}

const HEADING_WORD: Record<number, string> = {
  1: "a heading",
  2: "a sub-heading",
  3: "a small heading",
};

/** What a block type is called in a sentence. */
function blockWord(node: ProseMirrorNode): string {
  switch (node.type) {
    case "paragraph":
      return "a paragraph";
    case "heading": {
      const level = Number(node.attrs?.level);
      return HEADING_WORD[level] ?? "a heading";
    }
    case "bulletList":
      return "a bulleted list";
    case "orderedList":
      return "a numbered list";
    case "listItem":
      return "a list item";
    case "taskList":
      return "a checklist";
    case "taskItem":
      return "a checklist item";
    case "blockquote":
      return "a quote";
    case "callout":
      return "a callout";
    case "codeBlock":
      return "a code block";
    case "details":
      return "a toggle";
    case "detailsSummary":
      return "a toggle heading";
    case "horizontalRule":
      return "a divider";
    case "image":
      return "an image";
    case "table":
      return "a table";
    case "tableRow":
      return "a table row";
    default:
      return `a ${node.type}`;
  }
}

/** The blocks that carry meaning on their own, in reading order. */
const LEAF_CONTAINERS = new Set(["doc", "bulletList", "orderedList", "taskList", "details", "detailsContent", "table", "tableRow"]);

interface FlatBlock {
  node: ProseMirrorNode;
  /** The block's own text, flattened, for alignment. */
  text: string;
  /** Every mark on the block's text, as `bold` / `link:https://…`. */
  marks: string[];
}

function textOf(node: ProseMirrorNode, marks: Set<string>, depth = 0): string {
  if (depth > 24) return "";
  if (node.type === "text") {
    for (const mark of node.marks ?? []) {
      // The href is part of the mark: changing where a link points is a change
      // to the document, and it is invisible in the text.
      const href = mark.type === "link" ? String(mark.attrs?.href ?? "") : "";
      marks.add(href ? `link → ${href}` : mark.type);
    }
    return node.text ?? "";
  }
  if (node.type === "mention") {
    marks.add(`mention of ${String(node.attrs?.label ?? "somebody")}`);
    return `@${String(node.attrs?.label ?? "")}`;
  }
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map((child) => textOf(child, marks, depth + 1)).join("");
}

/**
 * Flattens a document to the blocks a reader would point at.
 *
 * Containers are descended into rather than reported, so a bulleted list is
 * three list items and not one list — which is the granularity somebody means
 * when they say "the second bullet".
 */
function flatten(node: unknown, out: FlatBlock[] = [], depth = 0): FlatBlock[] {
  if (depth > 24 || typeof node !== "object" || node === null) return out;
  const block = node as ProseMirrorNode;

  if (LEAF_CONTAINERS.has(block.type)) {
    for (const child of block.content ?? []) flatten(child, out, depth + 1);
    return out;
  }

  const marks = new Set<string>();
  const text = textOf(block, marks).trim();
  out.push({ node: block, text, marks: [...marks].sort() });

  // A toggle's body holds blocks of its own; a list item holds a paragraph.
  // Descend for those, having already recorded the container itself.
  if (block.type === "listItem" || block.type === "taskItem" || block.type === "detailsContent") {
    for (const child of block.content ?? []) {
      if (typeof child === "object" && child !== null && (child as ProseMirrorNode).type !== "paragraph") {
        flatten(child, out, depth + 1);
      }
    }
  }

  return out;
}

/** The properties of a block that a reader would notice changing. */
function propertiesOf(block: FlatBlock): Array<{ label: string; value: string }> {
  const props: Array<{ label: string; value: string }> = [];
  const attrs = block.node.attrs ?? {};

  if (block.node.type === "heading") props.push({ label: "level", value: String(attrs.level ?? 1) });
  if (block.node.type === "codeBlock")
    props.push({ label: "language", value: String(attrs.language ?? "none") });
  if (block.node.type === "callout")
    props.push({ label: "tone", value: String(attrs.tone ?? "slate") });
  if (block.node.type === "taskItem")
    props.push({ label: "ticked", value: attrs.checked ? "yes" : "no" });
  if (block.node.type === "details")
    props.push({ label: "open", value: attrs.open ? "yes" : "no" });
  if (block.node.type === "image") {
    props.push({ label: "image", value: String(attrs.src ?? "") });
    props.push({ label: "alt text", value: String(attrs.alt ?? "") });
  }

  return props;
}

/** `bold, italic` — or `none`, so a sentence about losing every mark reads. */
function markList(marks: string[]): string {
  return marks.length ? marks.join(", ") : "none";
}

const MAX_CHANGES = 12;

/**
 * Every property difference between two documents whose text is the same.
 *
 * Returns `[]` when either side is missing, when the flattened texts differ —
 * `lib/diff.ts` owns that case — or when nothing about the properties moved.
 *
 * The block lists are aligned by text rather than by index, so inserting a
 * divider does not report every paragraph after it as re-formatted. A block
 * whose text appears on one side only is reported as added or removed; the rest
 * are compared pairwise.
 */
export function blockChanges(before: unknown, after: unknown): BlockChange[] {
  if (!before || !after) return [];

  const a = flatten(before);
  const b = flatten(after);
  const changes: BlockChange[] = [];

  // Align by text. `used` stops one paragraph on the left matching two
  // identical paragraphs on the right.
  const used = new Array<boolean>(a.length).fill(false);

  b.forEach((right, index) => {
    const position = index + 1;
    const leftIndex = a.findIndex((left, i) => !used[i] && left.text === right.text && left.node.type === right.node.type);

    if (leftIndex === -1) {
      // No block on the left has this text *and* this type. Try text alone —
      // that is a block whose type changed, which is the most common
      // formatting-only edit there is.
      const retyped = a.findIndex((left, i) => !used[i] && left.text === right.text && left.text !== "");
      if (retyped !== -1) {
        used[retyped] = true;
        changes.push({
          position,
          text: `${blockWord(a[retyped].node)} became ${blockWord(right.node)}`,
        });
        return;
      }
      changes.push({ position, text: `${blockWord(right.node)} added` });
      return;
    }

    used[leftIndex] = true;
    const left = a[leftIndex];

    if (left.marks.join("|") !== right.marks.join("|")) {
      changes.push({
        position,
        text: `${blockWord(right.node)}: formatting ${markList(left.marks)} → ${markList(right.marks)}`,
      });
    }

    const leftProps = propertiesOf(left);
    const rightProps = propertiesOf(right);
    rightProps.forEach((prop, i) => {
      const was = leftProps[i];
      if (was && was.value !== prop.value) {
        changes.push({
          position,
          text: `${blockWord(right.node)}: ${prop.label} ${was.value || "empty"} → ${prop.value || "empty"}`,
        });
      }
    });

    if (leftIndex !== index && left.text !== "") {
      changes.push({ position, text: `${blockWord(right.node)} moved from ${leftIndex + 1} to ${position}` });
    }
  });

  a.forEach((left, i) => {
    if (!used[i] && left.text !== "") {
      changes.push({ position: i + 1, text: `${blockWord(left.node)} removed` });
    }
  });

  // Bounded, and it says so when it truncates. An unbounded list on a document
  // somebody reformatted wholesale is a wall nobody reads, and a silent
  // truncation reads as "that was all of it".
  if (changes.length > MAX_CHANGES) {
    const extra = changes.length - MAX_CHANGES;
    return [
      ...changes.slice(0, MAX_CHANGES),
      { position: null, text: `and ${extra} more formatting ${extra === 1 ? "change" : "changes"}` },
    ];
  }

  return changes;
}

/**
 * The summary line for a revision whose text did not move.
 *
 * `formatting only` was the whole answer before this, and it explained nothing.
 * Now it says which kind of formatting, and the panel lists each change
 * underneath.
 */
export function summariseBlockChanges(changes: BlockChange[]): string {
  if (changes.length === 0) return "no visible change";
  if (changes.length === 1) return changes[0].text;
  return `${changes.length} formatting changes`;
}

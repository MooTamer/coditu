import { Fragment, type ReactNode } from "react";
import { common, createLowlight } from "lowlight";

import { CommentImage } from "@/components/app/comment-image.client";
import {
  ALLOWED_MARKS,
  CODE_LANGUAGES,
  MAX_DEPTH,
  isSafeHref,
  isSafeImageSrc,
  parseNode,
  type ProseMirrorNode,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/**
 * Renders a stored comment.
 *
 * THIS IS THE SECURITY BOUNDARY. It walks the ProseMirror JSON and emits React
 * elements for node types it recognises. There is no HTML string anywhere in
 * this file, and no `dangerouslySetInnerHTML` — React escapes every text node
 * it renders, so a `<script>` in a comment is characters on a page, not a tag.
 *
 * The rule is fail-closed: an unrecognised node renders its text content, or
 * nothing. That is why a hostile document does not need to be rejected at write
 * time — there is nothing here that could execute it. See docs/05-DECISIONS.md.
 */

const lowlight = createLowlight(common);

/**
 * Callout tones, as an allowlist — the value reaches a `style` attribute, and
 * `var(--anything)` would otherwise be an author's choice.
 *
 * Three, not the prototype's five. `01-DESIGN-SYSTEM.md` §2 defines tone pairs
 * for amber, jade and slate only, and those are the `--tone-*-fg` / `--tone-*-bg`
 * variables that exist. A `rose` callout would have resolved to
 * `var(--tone-rose-fg)`, which is not defined, which is not an error — the
 * declaration is simply dropped and the callout renders with no edge at all.
 * Checked against `app/globals.css` rather than against the prototype.
 */
const CALLOUT_TONES = ["amber", "jade", "slate"] as const;
type CalloutTone = (typeof CALLOUT_TONES)[number];

/**
 * A table span, or undefined.
 *
 * `colspan` is a number in a jsonb column, which means it can be 0, -1,
 * 1e9, or the string "2". A span of a million is a browser hang, and React
 * passes whatever it is given straight to the DOM. Two is almost always the
 * answer; sixty-four is more columns than anybody puts in a comment.
 */
function spanOf(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 2 || value > 64) return undefined;
  return value;
}

export function CommentBody({ doc }: { doc: unknown }) {
  const root = parseNode(doc);
  if (!root) {
    // Malformed JSON is a rendering problem, not a reason to break the thread.
    return <p className="text-[13.5px] italic text-[var(--ink-faint)]">This comment could not be displayed.</p>;
  }

  return <div className="flex flex-col gap-2 text-[14px] leading-[1.55]">{renderNode(root, "0", 0)}</div>;
}

function renderChildren(node: ProseMirrorNode, key: string, depth: number): ReactNode {
  // Children arrive as `unknown` — the schema is shallow on purpose — so each
  // one is parsed as it is reached, with the depth counted here.
  return (node.content ?? []).map((child, index) => {
    const parsed = parseNode(child);
    return parsed ? renderNode(parsed, `${key}.${index}`, depth + 1) : null;
  });
}

function renderNode(node: ProseMirrorNode, key: string, depth: number): ReactNode {
  // A document nested deeper than this is not a comment somebody wrote.
  if (depth > MAX_DEPTH) return null;

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{renderChildren(node, key, depth)}</Fragment>;

    case "text":
      return applyMarks(node, key);

    case "hardBreak":
      return <br key={key} />;

    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap break-words text-[var(--ink-muted)]">
          {renderChildren(node, key, depth)}
        </p>
      );

    case "heading": {
      // Headings inside a comment are capped at h4 — a comment must not
      // introduce an h1 and wreck the page's heading order.
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 3), 3), 4);
      const Tag = (level === 3 ? "h3" : "h4") as "h3" | "h4";
      return (
        <Tag key={key} className="mt-1 text-[15px] font-semibold text-[var(--ink)]">
          {renderChildren(node, key, depth)}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul key={key} className="ml-5 list-disc text-[var(--ink-muted)]">
          {renderChildren(node, key, depth)}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="ml-5 list-decimal text-[var(--ink-muted)]">
          {renderChildren(node, key, depth)}
        </ol>
      );

    case "listItem":
      return (
        <li key={key} className="my-[2px]">
          {renderChildren(node, key, depth)}
        </li>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-l-2 pl-3 text-[var(--ink-muted)]"
          style={{ borderColor: "var(--hairline-strong)" }}
        >
          {renderChildren(node, key, depth)}
        </blockquote>
      );

    case "horizontalRule":
      return <hr key={key} className="border-[var(--hairline)]" />;

    case "codeBlock":
      return <CodeBlock key={key} node={node} />;

    case "image":
      return <ImageNode key={key} node={node} />;

    case "mention":
      return <MentionNode key={key} node={node} />;

    /* ── The design's remaining block types ────────────────────────────────
       Every one of them renders through the same walker, with the same rule:
       attributes are read one at a time and coerced, never spread. A spread
       would put whatever the document says onto a DOM element, which is how a
       stored `onClick` becomes a stored handler. */

    case "taskList":
      return (
        <ul key={key} className="ml-1 list-none">
          {renderChildren(node, key, depth)}
        </ul>
      );

    case "taskItem": {
      // Rendered, not interactive. This is a stored document being READ — the
      // checkbox is `disabled` so a reader cannot tick something that has no
      // write path behind it, and `aria-hidden` because the state is already in
      // the text for a screen reader.
      const checked = node.attrs?.checked === true;
      return (
        <li key={key} className="my-[2px] flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            disabled
            aria-hidden="true"
            tabIndex={-1}
            className="mt-[4px] size-[13px] shrink-0 accent-[var(--accent)]"
          />
          <span className={cn("min-w-0", checked && "text-[var(--ink-faint)] line-through")}>
            {renderChildren(node, key, depth)}
          </span>
        </li>
      );
    }

    case "details":
      // `open` is honoured on first paint and then belongs to the reader — a
      // stored document does not get to keep re-collapsing something somebody
      // opened.
      return (
        <details
          key={key}
          open={node.attrs?.open === true}
          className="rounded-panel border border-[var(--hairline)] px-3 py-2"
        >
          {renderChildren(node, key, depth)}
        </details>
      );

    case "detailsSummary":
      return (
        <summary key={key} className="cursor-pointer font-medium marker:text-[var(--ink-faint)]">
          {renderChildren(node, key, depth)}
        </summary>
      );

    case "detailsContent":
      return (
        <div key={key} className="mt-2 flex flex-col gap-2 text-[var(--ink-muted)]">
          {renderChildren(node, key, depth)}
        </div>
      );

    case "callout": {
      // The tone is an allowlist of its own, and it has to be: it reaches a
      // `style` attribute, and `var(--anything)` is a value an author could
      // otherwise choose. Unknown tones fall back to amber rather than
      // rendering nothing, because a callout nobody can see is worse than one
      // in the wrong colour.
      const tone = CALLOUT_TONES.includes(node.attrs?.tone as CalloutTone)
        ? (node.attrs?.tone as CalloutTone)
        : "amber";
      return (
        <div
          key={key}
          className="flex flex-col gap-1 rounded-panel border-l-2 px-3 py-2"
          style={{
            borderColor: `var(--tone-${tone}-fg)`,
            background: `var(--tone-${tone}-bg)`,
          }}
        >
          {renderChildren(node, key, depth)}
        </div>
      );
    }

    case "table":
      // Scrolls INSIDE its own box. A wide table in a comment must not make the
      // thread scroll sideways — the same rule the code block already follows.
      return (
        <div key={key} className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <tbody>{renderChildren(node, key, depth)}</tbody>
          </table>
        </div>
      );

    case "tableRow":
      return (
        <tr key={key} className="border-b border-[var(--hairline)] last:border-b-0">
          {renderChildren(node, key, depth)}
        </tr>
      );

    case "tableHeader":
      return (
        <th
          key={key}
          scope="col"
          colSpan={spanOf(node.attrs?.colspan)}
          rowSpan={spanOf(node.attrs?.rowspan)}
          className="border-r border-[var(--hairline)] px-[10px] py-[6px] text-left font-semibold last:border-r-0"
        >
          {renderChildren(node, key, depth)}
        </th>
      );

    case "tableCell":
      return (
        <td
          key={key}
          colSpan={spanOf(node.attrs?.colspan)}
          rowSpan={spanOf(node.attrs?.rowspan)}
          className="border-r border-[var(--hairline)] px-[10px] py-[6px] align-top text-[var(--ink-muted)] last:border-r-0"
        >
          {renderChildren(node, key, depth)}
        </td>
      );

    default:
      // Fail closed. An unknown node contributes its text content and nothing
      // else — no tag, no attributes, no behaviour.
      return <Fragment key={key}>{renderChildren(node, key, depth)}</Fragment>;
  }
}

/**
 * Text marks. Only the five in the allowlist are honoured; anything else on the
 * node is ignored, including marks that would carry a style or an event.
 */
function applyMarks(node: ProseMirrorNode, key: string): ReactNode {
  let element: ReactNode = node.text ?? "";

  for (const mark of node.marks ?? []) {
    if (!(ALLOWED_MARKS as readonly string[]).includes(mark.type)) continue;

    if (mark.type === "bold") element = <strong className="font-semibold text-[var(--ink)]">{element}</strong>;
    else if (mark.type === "italic") element = <em>{element}</em>;
    else if (mark.type === "strike") element = <s>{element}</s>;
    else if (mark.type === "code") {
      element = (
        <code className="rounded-[4px] bg-[var(--canvas)] px-[5px] py-[1px] font-mono text-[12.5px] text-[var(--ink)]">
          {element}
        </code>
      );
    } else if (mark.type === "link") {
      const href = mark.attrs?.href;
      // An unsafe href does not become an un-clickable link — it stays plain
      // text, so nothing about the rendering suggests it is followable.
      element = isSafeHref(href) ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer nofollow ugc"
          className="text-[var(--accent)] underline underline-offset-2"
        >
          {element}
        </a>
      ) : (
        element
      );
    }
  }

  return <Fragment key={key}>{element}</Fragment>;
}

/**
 * A code block, highlighted server-side with lowlight.
 *
 * lowlight returns a hast tree, which is walked into React elements the same
 * way the document is. It is never serialised to an HTML string — the point is
 * that no path in this file produces markup that has to be trusted.
 */
function CodeBlock({ node }: { node: ProseMirrorNode }) {
  const raw = (node.content ?? [])
    .map((child) => parseNode(child)?.text ?? "")
    .join("");
  const requested = node.attrs?.language;
  const language =
    typeof requested === "string" && (CODE_LANGUAGES as readonly string[]).includes(requested)
      ? requested
      : null;

  let highlighted: ReactNode = raw;
  if (language) {
    try {
      highlighted = renderHast(lowlight.highlight(language, raw), "hl");
    } catch {
      // An unregistered grammar or a malformed snippet renders unhighlighted.
      highlighted = raw;
    }
  }

  return (
    <div className="relative overflow-hidden rounded-inner border border-[var(--hairline)] bg-[var(--canvas)]">
      {language ? (
        <span className="absolute right-2 top-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          {language}
        </span>
      ) : null}
      {/* The block scrolls, so a long line never makes the whole thread scroll
          sideways. */}
      <pre className="overflow-x-auto p-3 pr-14">
        <code className="font-mono text-[12.5px] leading-[1.6] text-[var(--ink)]">{highlighted}</code>
      </pre>
    </div>
  );
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Walks lowlight's hast output into spans. Only class names survive. */
function renderHast(node: HastNode, key: string): ReactNode {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "root" || node.tagName === "span") {
    const className = node.properties?.className;
    const classes = Array.isArray(className) ? className.join(" ") : undefined;
    const children = (node.children ?? []).map((child, index) => renderHast(child, `${key}.${index}`));
    return node.type === "root" ? (
      <Fragment key={key}>{children}</Fragment>
    ) : (
      <span key={key} className={cn(classes && `hljs-${classes.replace(/^hljs-/, "")}`)}>
        {children}
      </span>
    );
  }
  return (node.children ?? []).map((child, index) => renderHast(child, `${key}.${index}`));
}

/**
 * An image in a document.
 *
 * `width` and `height` are the file's own, read from its header when it was
 * uploaded, and they are passed through so the thumbnail can reserve its box
 * before the bytes arrive — a thread that reflows while somebody is reading it
 * is the worst version of this feature. **Both are optional**: every image
 * posted before 2026-08-25 has neither, and an image that arrived through a
 * format the parser does not read has neither either.
 *
 * A number is taken only when it is a positive, finite one. A `width` of 0, of
 * NaN, or of `"800px"` would produce an aspect ratio that collapses the box to
 * nothing, and these attrs are stored user-supplied JSON like everything else
 * in this file.
 */
function ImageNode({ node }: { node: ProseMirrorNode }) {
  const src = node.attrs?.src;
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  if (!isSafeImageSrc(src)) return null;
  return (
    <CommentImage
      src={src}
      alt={alt}
      width={positiveInteger(node.attrs?.width)}
      height={positiveInteger(node.attrs?.height)}
    />
  );
}

function positiveInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * A mention renders as a chip, not a link.
 *
 * The stored node carries the profile UUID; the label is only what the author
 * saw when they typed it. Rendering the label as text means a later rename
 * shows the old name — which is correct for a historical record — while the id
 * is what `comment_mentions` and the notification were built from.
 */
function MentionNode({ node }: { node: ProseMirrorNode }) {
  const label = node.attrs?.label;
  return (
    <span
      className="rounded-[4px] px-[4px] py-[1px] font-medium"
      style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
    >
      @{typeof label === "string" && label ? label : "someone"}
    </span>
  );
}

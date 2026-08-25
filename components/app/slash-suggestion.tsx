"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";

/**
 * The `/` block menu.
 *
 * Built on the same suggestion plugin the `@` mention list uses, for the same
 * reason it was built that way: TipTap's suggestion lives inside ProseMirror's
 * own lifecycle, so this is plain DOM rather than a React portal — two renderers
 * fighting over one subtree is a worse cost than a hundred lines of
 * `createElement`.
 *
 * More importantly it means **one interaction language**. Arrow keys move, Enter
 * or Tab picks, Escape dismisses without inserting and does not travel on to
 * close the dialog behind it. Somebody who has learned `@` already knows `/`.
 *
 * ## `startOfLine`
 *
 * The menu opens only at the start of an empty block. Without that, "and/or",
 * "TypeScript 5/6" and every file path anybody pastes opens a block menu
 * mid-sentence. It is the difference between a shortcut and an ambush.
 */

export interface SlashItem {
  id: string;
  label: string;
  /** The mono hint on the right — `h3`, `lang`. Empty for most. */
  hint?: string;
  /** The design's own 24×24 path data. */
  icon: string;
  run: (editor: Editor, range: Range) => void;
}

export interface SlashOptions {
  /**
   * Called for "Image / attachment".
   *
   * The editor owns the file input, the upload, the placeholder node and the
   * failure path; the menu only knows that somebody asked. Passing a callback
   * keeps all of that in one place rather than giving this file a second
   * implementation of it.
   */
  onPickImage?: () => void;
  /** False in a composer with images turned off — the item is not offered. */
  images: boolean;
  /**
   * Told when the menu opens and closes.
   *
   * The editor's own `handleKeyDown` treats Escape as "step away" — blur without
   * discarding — and ProseMirror checks the view's props BEFORE any plugin's, so
   * that handler wins and this menu never sees the key. The editor needs to know
   * a menu is open in order to stand aside for one press.
   */
  onOpenChange?: (open: boolean) => void;
}

export function slashItems({ onPickImage, images }: SlashOptions): SlashItem[] {
  const items: SlashItem[] = [
    {
      id: "paragraph",
      label: "Text",
      icon: "M4 6h16M4 12h12M4 18h9",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: "heading",
      label: "Heading",
      hint: "h3",
      icon: "M6 4v16M18 4v16M6 12h12",
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      id: "bulletList",
      label: "Bulleted list",
      icon: "M5 7h.01M5 12h.01M5 17h.01M9 7h10M9 12h10M9 17h10",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "orderedList",
      label: "Numbered list",
      icon: "M4 6h1v4M4 17h2M9 8h10M9 16h10",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "taskList",
      label: "To-do list",
      icon: "M4 12l3 3 5-6M14 8h6M14 16h6",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      id: "details",
      label: "Toggle",
      icon: "M9 6l6 6-6 6",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setDetails().run(),
    },
    {
      id: "blockquote",
      label: "Quote",
      icon: "M7 6v12M11 8h6M11 12h6M11 16h4",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: "callout",
      label: "Callout",
      icon: "M12 8v5M12 16.5v.5M12 3l9 17H3z",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCallout("amber").run(),
    },
    {
      id: "horizontalRule",
      label: "Divider",
      icon: "M4 12h16",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: "codeBlock",
      label: "Code block",
      hint: "lang",
      icon: "M9 8l-4 4 4 4M15 8l4 4-4 4",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: "table",
      label: "Table",
      icon: "M4 6h16v12H4zM4 10h16M10 10v8",
      run: (editor, range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];

  if (images && onPickImage) {
    items.splice(10, 0, {
      id: "image",
      label: "Image / attachment",
      icon: "M4 6h16v12H4zM8 11a1 1 0 100-2 1 1 0 000 2M6 17l5-5 3 3 2-2 3 3",
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        onPickImage();
      },
    });
  }

  return items;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function buildSlashSuggestion(options: SlashOptions): Omit<SuggestionOptions, "editor"> {
  const all = slashItems(options);
  const announceOpen = (open: boolean) => options.onOpenChange?.(open);

  return {
    char: "/",
    // Only where a block begins. "and/or" and "src/lib/blocks" must not open a
    // menu, and they are far more common than the shortcut.
    startOfLine: true,
    allowSpaces: false,

    items: ({ query }) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return all;
      return all.filter(
        (item) => item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)
      );
    },

    command: ({ editor, range, props }) => {
      (props as SlashItem).run(editor, range);
    },

    render: () => {
      let element: HTMLDivElement | null = null;
      let items: SlashItem[] = [];
      let selected = 0;
      let commandFn: ((item: SlashItem) => void) | null = null;

      function paint() {
        if (!element) return;
        element.replaceChildren();

        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.textContent = "No block by that name.";
          empty.className = "px-3 py-2 text-[12.5px] text-[var(--ink-faint)]";
          element.append(empty);
          return;
        }

        items.forEach((item, index) => {
          const option = document.createElement("button");
          option.type = "button";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(index === selected));
          option.className = [
            "flex w-full items-center gap-[11px] px-3 py-2 text-left text-[13px]",
            index === selected ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]",
          ].join(" ");

          const box = document.createElement("span");
          box.className =
            "flex size-[22px] shrink-0 items-center justify-center rounded-chip border border-[var(--hairline)]";

          const svg = document.createElementNS(SVG_NS, "svg");
          svg.setAttribute("width", "12");
          svg.setAttribute("height", "12");
          svg.setAttribute("viewBox", "0 0 24 24");
          svg.setAttribute("fill", "none");
          svg.setAttribute("stroke", "currentColor");
          svg.setAttribute("stroke-width", "1.9");
          svg.setAttribute("aria-hidden", "true");
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", item.icon);
          svg.append(path);
          box.append(svg);

          const label = document.createElement("span");
          label.textContent = item.label;
          label.className = "min-w-0 flex-1 truncate";

          option.append(box, label);

          if (item.hint) {
            const hint = document.createElement("span");
            hint.textContent = item.hint;
            hint.className = "shrink-0 font-mono text-[9.5px] text-[var(--ink-faint)]";
            option.append(hint);
          }

          // `mousedown`, prevented — the same rule the toolbar buttons follow.
          // A click moves focus out of the editor first, and ProseMirror's
          // stored position goes with it.
          option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            pick(index);
          });
          element!.append(option);
        });
      }

      function pick(index: number) {
        const item = items[index];
        if (item && commandFn) commandFn(item);
      }

      function place(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!element || !clientRect) return;
        const rect = clientRect();
        if (!rect) return;

        // Below the caret unless there is no room, in which case above it. A
        // menu that opens off the bottom of a phone is a menu with two items.
        const height = element.offsetHeight || 280;
        const below = rect.bottom + window.scrollY + 6;
        const wouldOverflow = rect.bottom + height + 12 > window.innerHeight;
        element.style.top = wouldOverflow
          ? `${rect.top + window.scrollY - height - 6}px`
          : `${below}px`;
        element.style.left = `${rect.left + window.scrollX}px`;
      }

      return {
        onStart: (props) => {
          items = props.items as SlashItem[];
          selected = 0;
          commandFn = props.command as typeof commandFn;

          element = document.createElement("div");
          element.setAttribute("role", "listbox");
          element.setAttribute("aria-label", "Insert a block");
          element.className =
            "fixed z-[90] w-[300px] max-h-[264px] overflow-y-auto rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] py-1";
          element.style.position = "absolute";
          element.style.boxShadow = "var(--shadow-overlay)";
          document.body.append(element);

          paint();
          place(props.clientRect);
          announceOpen(true);
        },

        onUpdate: (props) => {
          items = props.items as SlashItem[];
          selected = Math.min(selected, Math.max(items.length - 1, 0));
          commandFn = props.command as typeof commandFn;
          paint();
          place(props.clientRect);
        },

        onKeyDown: (props) => {
          if (props.event.key === "ArrowDown") {
            selected = (selected + 1) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (props.event.key === "ArrowUp") {
            selected = (selected - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (props.event.key === "Enter" || props.event.key === "Tab") {
            pick(selected);
            return true;
          }
          if (props.event.key === "Escape") {
            // Dismiss the menu and stop there. Letting it travel on would close
            // the item dialog behind the composer, and the reader meant "not
            // this menu".
            props.event.stopPropagation();
            element?.remove();
            element = null;
            announceOpen(false);
            return true;
          }
          return false;
        },

        onExit: () => {
          element?.remove();
          element = null;
          announceOpen(false);
        },
      };
    },
  };
}

/** The plugin wrapper. `Mention` provides its own; a bare suggestion needs one. */
export const SlashMenu = Extension.create<{ suggestion: Omit<SuggestionOptions, "editor"> }>({
  name: "slashMenu",

  addOptions() {
    return { suggestion: buildSlashSuggestion({ images: false }) };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },
});

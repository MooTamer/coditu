import { Node, mergeAttributes } from "@tiptap/core";

import { CALLOUT_TONES, type CalloutTone } from "@/lib/blocks/schema";

/**
 * A callout — the "discuss before implementing" block, as something anybody can
 * write.
 *
 * ## Why it is a node and not a convention
 *
 * `work_items.highlight` is a whole column that exists to say one thing: stop
 * and talk to somebody before you build this. It earns that column because the
 * table, the item detail, the Markdown export and the PDF each render it
 * distinctly. But it can only be said once per story, only about the story as a
 * whole, and only by an admin or a lead.
 *
 * A callout is the same emphasis available mid-paragraph, in a comment, on a
 * criterion, in the sprint notes — wherever the sentence actually belongs. The
 * column stays; this is not a replacement for it.
 *
 * ## Hand-rolled, and it is about twenty lines
 *
 * There is no official callout extension because it is not a hard node: block
 * content, one enumerated attribute, no schema subtleties. `@tiptap/pro` is not
 * a dependency of this project and would not be worth becoming one for this.
 *
 * ## The tone is enumerated on the way IN as well as on the way out
 *
 * `parseHTML` is what runs when a document arrives from a paste or from stored
 * HTML, so it is a place an arbitrary string can enter the document. The
 * renderer allowlists the tone again at the far end — that one is the security
 * boundary and this one is not — but storing a value that will silently fail to
 * render is its own small betrayal, so it is refused here too.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  // `defining` keeps the callout when its contents are replaced wholesale — a
  // select-all-and-retype inside one should not dissolve the block around it.
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "amber" satisfies CalloutTone,
        parseHTML: (element) => {
          const tone = element.getAttribute("data-tone");
          return CALLOUT_TONES.includes(tone as CalloutTone) ? tone : "amber";
        },
        renderHTML: (attributes) => ({ "data-tone": String(attributes.tone ?? "amber") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": "", class: "coditu-callout" }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (tone: CalloutTone = "amber") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
      toggleCallout:
        (tone: CalloutTone = "amber") =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tone }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (tone?: CalloutTone) => ReturnType;
      toggleCallout: (tone?: CalloutTone) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Move the block the cursor is in, up or down among its siblings.
 *
 * ## Why this exists at all
 *
 * The design gives every block a drag handle. A drag handle on its own is a
 * feature half the team cannot use — the same argument that made the sprint
 * table's keyboard reorder a requirement rather than a fallback. `Alt+↑` and
 * `Alt+↓` are the keyboard half, and the handle will call the same commands, so
 * there is one implementation of "move a block" rather than two that drift.
 *
 * ## Top-level blocks only, deliberately
 *
 * Depth 1. Moving a list item within its list is already Tab, Shift+Tab and
 * Enter; a second gesture doing the same thing differently is how a list ends
 * up in a state nobody meant. What this moves is what the handle sits beside —
 * a paragraph, a heading, a code block, a callout, a table.
 *
 * ## The position arithmetic, written out because it is where this goes wrong
 *
 * Given three top-level children `[A, B, C]` and the cursor in `B`:
 *
 *   from  = before(B)          to = after(B)
 *   A occupies [from - A.nodeSize, from)
 *   C occupies [to, to + C.nodeSize)
 *
 * **Up.** Delete `B` first. The deletion is entirely after `A`, so `A`'s
 * positions do not move, and `B` is re-inserted at `from - A.nodeSize`.
 *
 * **Down.** Delete `B` first. Now `C` has slid back by `B.nodeSize` and starts
 * at `from`, so `B` is re-inserted at `from + C.nodeSize`.
 *
 * Both cases read the sibling's size from the document as it was *before* the
 * delete, which is why they are computed up front. Mapping the old positions
 * through `tr.mapping` afterwards would work too and is one more thing to get
 * subtly wrong; this way the arithmetic is four lines and can be checked by
 * reading it.
 */
export interface MoveBlockOptions {
  /**
   * Told where the block ended up, so the editor can say so out loud.
   *
   * A silent move is a move a screen-reader user cannot verify — they pressed a
   * key and the document is different in a way nothing announced. The sprint
   * table's drag reorder has the same requirement and dnd-kit provides it there;
   * here there is no library to provide it.
   */
  onMoved?: (position: number, total: number) => void;
}

function moveTopLevelBlock(direction: -1 | 1, options: MoveBlockOptions) {
  return ({
    state,
    dispatch,
  }: {
    state: import("@tiptap/pm/state").EditorState;
    dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void;
  }): boolean => {
    const { selection, doc } = state;
    const $from = selection.$from;

    // Depth 0 is the document itself — there is no block to move.
    if ($from.depth === 0) return false;

    const index = $from.index(0);
    const target = index + direction;
    if (target < 0 || target >= doc.childCount) return false;

    const node = doc.child(index);
    const sibling = doc.child(target);
    const from = $from.before(1);
    const to = $from.after(1);

    // `dispatch` absent means "can this run?" — answer without doing it, which
    // is what lets a key binding fall through to the next handler when it
    // cannot.
    if (!dispatch) return true;

    const tr = state.tr;
    tr.delete(from, to);
    const insertAt = direction < 0 ? from - sibling.nodeSize : from + sibling.nodeSize;
    tr.insert(insertAt, node);

    // Put the cursor back inside the block that moved, rather than leaving it
    // wherever the document shifted it to. `+ 1` steps past the node's own
    // opening token into its content.
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
    tr.scrollIntoView();
    dispatch(tr);

    options.onMoved?.(target + 1, doc.childCount);
    return true;
  };
}

export const MoveBlock = Extension.create<MoveBlockOptions>({
  name: "moveBlock",

  addOptions() {
    return { onMoved: undefined };
  },

  addCommands() {
    return {
      moveBlockUp:
        () =>
        ({ state, dispatch }) =>
          moveTopLevelBlock(-1, this.options)({ state, dispatch }),
      moveBlockDown:
        () =>
        ({ state, dispatch }) =>
          moveTopLevelBlock(1, this.options)({ state, dispatch }),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Alt rather than Mod: Cmd+↑/↓ is "jump to the start or end of the
      // document" on macOS and taking it would break a reflex.
      "Alt-ArrowUp": () => this.editor.commands.moveBlockUp(),
      "Alt-ArrowDown": () => this.editor.commands.moveBlockDown(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    moveBlock: {
      moveBlockUp: () => ReturnType;
      moveBlockDown: () => ReturnType;
    };
  }
}

/**
 * The unfinished-upload node's *name*, and the predicate that finds one.
 *
 * ## Why these two things are not in `uploading-image.client.tsx`
 *
 * They were, and it cost every reader of every story page **329 KB**.
 *
 * `uploading-image.client.tsx` defines a TipTap node with a React NodeView, so
 * it imports `@tiptap/core` and `@tiptap/react`, which pull `prosemirror-model`
 * and `prosemirror-view`. That is correct for a node view and it is why the
 * whole editor is loaded through `next/dynamic` from all six of its call sites.
 *
 * But `comment-composer.client.tsx` and `criteria-list.client.tsx` imported
 * **`hasPendingUpload`** from it — a fifteen-line pure function with no
 * dependencies — and they are ordinary client components on the story page,
 * imported statically. So the story page's client graph statically contained
 * TipTap, and Turbopack put it in a chunk that twenty-eight client modules
 * declared as a dependency, `next/link` and `favourite-star.client.tsx`
 * included. A reader who never opened a composer downloaded the editor.
 *
 * `06-PROGRESS.md` recorded the measurement and named a hypothesis — a
 * module-scope `dynamic()` preloaded on hydration under Turbopack. **That
 * hypothesis was wrong.** All six call sites are and always were behind
 * `next/dynamic`; the leak was a two-line import of a helper that happened to
 * live in the wrong file. Found by reading the built
 * `page_client-reference-manifest.js` and asking which client modules list the
 * 329 KB chunk among their own.
 *
 * ## The rule this is an instance of
 *
 * `lib/saved-views-schema.ts` states it for zod and this is the same shape one
 * layer down: **a module is only as light as its heaviest import**, and a
 * helper that lives beside a heavy dependency drags that dependency wherever it
 * goes. The only thing that will tell you is a production build.
 *
 * Nothing in this file may ever import TipTap, ProseMirror, or React.
 */

/** The node type an image occupies while it is still uploading. */
export const UPLOADING_IMAGE = "uploadingImage";

/**
 * True when a document still holds an image that has not landed yet.
 *
 * Bounded at 24, matching `lib/blocks/schema.ts`'s `MAX_DEPTH`: `body_json` is
 * a jsonb column that will happily store five thousand nested paragraphs, and an
 * unbounded recursive walk over one is a stack overflow anybody with a comment
 * box can trigger.
 */
export function hasPendingUpload(doc: unknown, depth = 0): boolean {
  if (depth > 24 || !doc || typeof doc !== "object") return false;
  const node = doc as { type?: string; content?: unknown[] };
  if (node.type === UPLOADING_IMAGE) return true;
  return (node.content ?? []).some((child) => hasPendingUpload(child, depth + 1));
}

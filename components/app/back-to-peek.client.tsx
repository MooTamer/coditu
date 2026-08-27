"use client";

import { Minimize2 } from "lucide-react";

import { BACK_TO_PEEK } from "@/components/app/peek-returner.client";

/**
 * "Back to side peek" — the prototype's second label for `toggleFull`.
 *
 * ## Why neither direction is an ordinary link
 *
 * The peek and the full page are the **same URL**. One is that URL intercepted
 * onto the sprint by `@modal/(.)items/[key]`, the other is that URL loaded
 * directly. So:
 *
 * - **Peek → full page** is a plain `<a>`: a hard navigation bypasses
 *   interception, which is the whole difference between the two states.
 * - **Full page → peek** is this, and it cannot be a link at all, because a
 *   navigation from a route to itself is a no-op.
 *
 * ## All this does is say so
 *
 * The navigation itself is two hops — replace the sprint, then push the story —
 * and this component is destroyed by the first one, so it cannot make the
 * second. `PeekReturner`, mounted in the segment layout **both** routes are
 * nested under, is what survives to do that. This dispatches one event and gets
 * out of the way.
 *
 * ## Below `md` it is not rendered at all
 *
 * The handoff's breakpoint table gives the story a *"Full-screen page"* below
 * 768px and a side peek only from 768 up. A control that offers to put a phone
 * back into a shape that phone does not have is a control that lies; the caller
 * hides it with `hidden md:inline-flex`.
 */
export function BackToPeek({
  itemHref,
  className,
}: {
  itemHref: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-back-to-peek
      onClick={() =>
        window.dispatchEvent(new CustomEvent(BACK_TO_PEEK, { detail: itemHref }))
      }
      className={className}
    >
      <Minimize2 size={13} strokeWidth={1.9} aria-hidden />
      Back to side peek
    </button>
  );
}

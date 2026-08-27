"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** What `BackToPeek` dispatches, and this listens for. */
export const BACK_TO_PEEK = "coditu:back-to-peek";

/**
 * Renders nothing. Puts the story back into its side peek.
 *
 * ## Why this is not in the button that starts it
 *
 * "Back to side peek" is a **two-hop navigation**: replace the sprint, then
 * push the story, because route interception is decided by the route you are
 * navigating *from* and the peek is the same URL as the full page. A soft
 * navigation to where you already are is a no-op, so the first hop is what
 * makes the second one mean anything.
 *
 * The button lives on the full page, and the full page is **destroyed by the
 * first hop**. Its effect never runs, so the second hop never happens: the
 * reader lands on the sprint with no panel, which is what the first version of
 * this did and what the local flow spec caught.
 *
 * This component is mounted in `sprints/[number]/layout.tsx`, which is the
 * segment **both** routes are nested under — so it survives the navigation
 * between them and is still there to make the second hop.
 *
 * ## A DOM event rather than a store
 *
 * The button and this are on opposite sides of a route boundary that is about
 * to be re-rendered, so there is no React tree they reliably share. A
 * `CustomEvent` on `window` needs no provider, costs nothing while nobody
 * presses the button, and carries exactly one string.
 *
 * ## `replace`, not `push`
 *
 * So the full page does not stay in the history stack underneath the peek.
 * Back from the peek then goes to the sprint, which is where Back from a peek
 * has always gone, rather than to the full page you just left.
 */
export function PeekReturner({ sprintHref }: { sprintHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const onReturn = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (typeof href !== "string") return;
      pending.current = href;
      router.replace(sprintHref, { scroll: false });
    };
    window.addEventListener(BACK_TO_PEEK, onReturn);
    return () => window.removeEventListener(BACK_TO_PEEK, onReturn);
  }, [router, sprintHref]);

  useEffect(() => {
    // The first render after the router has actually arrived at the sprint.
    // Until then a push to the story is a navigation to where we already are,
    // and the interception never happens.
    if (!pending.current || pathname !== sprintHref) return;
    const href = pending.current;
    pending.current = null;
    router.push(href, { scroll: false });
  }, [pathname, sprintHref, router]);

  return null;
}

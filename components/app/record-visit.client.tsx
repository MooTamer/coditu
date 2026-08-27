"use client";

import { useEffect } from "react";

import { recordVisit } from "@/lib/actions/recents";

/**
 * Renders nothing. Says that somebody opened this.
 *
 * ## The delay is the definition
 *
 * *Recently opened* has to mean opened, not passed through. Without the pause,
 * clicking the wrong story and pressing Back immediately puts it at the top of
 * the list, and a list whose first row is your last mistake is worse than no
 * list. 1.2 seconds is long enough that a mis-click leaves before it counts and
 * short enough that reading counts.
 *
 * The timeout is cleared on unmount, so a navigation away inside the window
 * records nothing at all.
 *
 * ## One `useEffect`, keyed on the href
 *
 * Not on the whole props object: `label` is derived on the server and is a new
 * string on every render, so an effect that depended on it would fire on every
 * re-render of the page rather than on every visit to it.
 */
export function RecordVisit({
  href,
  label,
  glyph,
}: {
  href: string;
  label: string;
  glyph: "COD" | "note" | "page" | "proj";
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Deliberately unawaited and deliberately swallowed. Nothing the reader is
      // doing depends on this, and a rejected promise from an effect is a
      // console error on every page.
      void recordVisit({ href, label, glyph }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
    // `label` and `glyph` are derived from `href` upstream; keying on all three
    // would re-run this on every re-render, which is a write per keystroke on a
    // page with an editor open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  return null;
}

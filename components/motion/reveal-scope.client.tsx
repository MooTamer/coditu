"use client";

import { useEffect } from "react";

/**
 * Releases every paused `[data-reveal-on-view]` element on the page.
 *
 * `<RevealObserver>` wraps one child, which is right when a single element
 * needs a reveal. A long marketing page has dozens, and wrapping each one costs
 * a component instance and an observer apiece for no benefit — so this mounts
 * once, finds them all, and hands them to a single `IntersectionObserver`.
 *
 * The pause itself is CSS, and it only applies while `<html>` carries the `js`
 * class. If this never hydrates the animations play on parse and the content is
 * simply visible: the observer is an enhancement, never a gate. Anything
 * already above the fold is released on the observer's first callback, which
 * fires immediately, so the hero does not wait for a scroll.
 *
 * `will-change` is set when an element is released and cleared on
 * `animationend`. Leaving it pinned would hold a compositor layer, and its
 * memory, for the life of the page.
 */
export function RevealScope({ root }: { root?: string }) {
  useEffect(() => {
    const scope = root ? document.querySelector(root) : document;
    const targets = Array.from(
      (scope ?? document).querySelectorAll<HTMLElement>("[data-reveal-on-view]")
    );
    if (targets.length === 0) return;

    const clearHint = (event: Event) => {
      (event.currentTarget as HTMLElement).style.willChange = "";
    };
    for (const target of targets) target.addEventListener("animationend", clearHint);

    const cleanup = () => {
      for (const target of targets) target.removeEventListener("animationend", clearHint);
    };

    if (typeof IntersectionObserver === "undefined") {
      for (const target of targets) target.setAttribute("data-revealed", "");
      return cleanup;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.style.willChange = "filter, transform, opacity";
          target.setAttribute("data-revealed", "");
          observer.unobserve(target);
        }
      },
      { threshold: 0.15, rootMargin: "-8% 0px" }
    );

    for (const target of targets) observer.observe(target);

    return () => {
      observer.disconnect();
      cleanup();
    };
  }, [root]);

  return null;
}

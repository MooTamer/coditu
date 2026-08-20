"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Releases a paused `[data-reveal-on-view]` child when it scrolls into view.
 *
 * The child is paused by CSS, and only while `<html>` carries the `js` class —
 * so if this component never hydrates, the animation simply plays on parse and
 * the content is visible. The observer is an enhancement, never a gate.
 *
 * `will-change` is set when the animation is released and removed on
 * `animationend`. Here the hint earns its keep: the element sits paused and
 * off-screen for an unknown length of time, so the browser has something to
 * prepare for. Leaving it set afterwards would pin a compositor layer — and its
 * memory — for the life of the page.
 */
export function RevealObserver({ repeat = false, children }: { repeat?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = ref.current;
    const target = host?.firstElementChild as HTMLElement | null;
    if (!target) return;

    const clearHint = () => {
      target.style.willChange = "";
    };
    target.addEventListener("animationend", clearHint);

    if (typeof IntersectionObserver === "undefined") {
      target.setAttribute("data-revealed", "");
      return () => target.removeEventListener("animationend", clearHint);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          target.style.willChange = "filter, transform, opacity";
          target.setAttribute("data-revealed", "");
          if (!repeat) observer.unobserve(entry.target);
        } else if (repeat) {
          target.removeAttribute("data-revealed");
        }
      },
      { threshold: 0.15, rootMargin: "-12% 0px" }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
      target.removeEventListener("animationend", clearHint);
    };
  }, [repeat]);

  // `display: contents` keeps this wrapper out of the layout entirely, so the
  // child's own grid/flex participation is unchanged.
  return (
    <span ref={ref} style={{ display: "contents" }}>
      {children}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signal trace: a scroll-linked path in the left gutter that threads the
 * page, branches at each section anchor, and doubles as the reading-progress
 * indicator.
 *
 * Three things this has to get right, and each is a bug if it does not:
 *
 *   - It lives in the gutter beside the 1240px measure. Below 1420px there is
 *     no gutter, so it would cross the text column — it is not rendered at all
 *     there rather than clipped or faded, because a half-visible rail beside
 *     body text reads as a rendering fault.
 *   - Under `prefers-reduced-motion` it is drawn in full and stops tracking
 *     scroll. It still marks the sections; it just does not move.
 *   - The per-frame write is `stroke-dashoffset` on one element inside a rAF,
 *     and nothing else. No React state changes while scrolling.
 *
 * Section nodes are read from the DOM (`[data-trace-section]`) rather than
 * passed in, so a section added to the page cannot forget to add its node.
 */

const LENGTH = 1000;

interface Node {
  label: string;
  /** Position along the trace, 0-1. */
  at: number;
  /** Resolved from the path itself, so a node always sits ON the curve. */
  x: number;
  y: number;
}

export function SignalTrace() {
  const trace = useRef<SVGPathElement>(null);
  const guide = useRef<SVGPathElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [visible, setVisible] = useState(false);

  // Two passes, in this order: decide whether the gutter exists at all, and
  // only then measure. They cannot be one effect — the SVG is not in the DOM
  // until `visible` is true, so a single pass would read a null ref on mount
  // and the nodes would never appear until the first resize.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1420px)");
    const sync = () => setVisible(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!visible) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const path = guide.current;
      if (!path) return;

      // Nodes are placed by arc length, not by y. The browser resolves the
      // point on the curve exactly, so a node can never float beside the line
      // where the path crosses between its two columns.
      const total = path.getTotalLength();
      const height = document.documentElement.scrollHeight;
      setNodes(
        Array.from(document.querySelectorAll<HTMLElement>("[data-trace-section]")).map((el) => {
          const at = Math.min(
            1,
            Math.max(0, (el.offsetTop + el.offsetHeight / 2) / Math.max(1, height))
          );
          const point = path.getPointAtLength(total * at);
          return { label: el.dataset.traceSection ?? "", at, x: point.x, y: point.y };
        })
      );
    };

    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const path = trace.current;
    if (!path) return;

    // Reduced motion keeps the trace — drawn in full, marking the sections —
    // and stops it tracking the scroll position.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      path.style.strokeDashoffset = "0";
      return;
    }

    let frame = 0;
    const read = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      path.style.strokeDashoffset = String(LENGTH * (1 - progress));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [visible]);

  if (!visible) return null;

  // The path weaves between two columns so it reads as a signal being routed
  // rather than a progress bar.
  const d =
    "M14 0 L14 160 C14 210 42 210 42 260 L42 520 C42 570 14 570 14 620 L14 1000";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 bottom-0 left-[34px] z-0 w-14"
    >
      <svg
        width="56"
        height="100%"
        viewBox="0 0 56 1000"
        preserveAspectRatio="none"
        fill="none"
      >
        <path ref={guide} d={d} stroke="var(--hairline-strong)" strokeWidth="1" />
        <path
          ref={trace}
          d={d}
          stroke="url(#traceGrad)"
          strokeWidth="1.5"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH}
        />
        {nodes.map((node) => (
          <circle
            key={node.label}
            cx={node.x}
            cy={node.y}
            r="3"
            fill="var(--canvas)"
            stroke="var(--signal-to)"
            strokeWidth="1.5"
          />
        ))}
        <defs>
          <linearGradient id="traceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--signal-from)" />
            <stop offset="1" stopColor="var(--signal-to)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

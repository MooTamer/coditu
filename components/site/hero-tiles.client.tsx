"use client";

import { useEffect, useRef } from "react";

import { hero } from "@/lib/marketing-content";

/**
 * The routed-signal panel under the hero, with the chips drifting against the
 * pointer at different depths.
 *
 * The drift is a client concern only: the panel, the path, and every chip are
 * in the server HTML at their resting position, and the pointer listener moves
 * them from there. With no JavaScript, or with reduced motion, it is a static
 * diagram — which is what it is anyway on a touch device.
 */
export function HeroTiles() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A coarse pointer has no hover position to track, and listening for
    // pointermove there just burns battery on every scroll-induced event.
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      const el = host.current;
      if (!el) return;

      const box = el.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return;

      const dx = (x - (box.left + box.width / 2)) / box.width;
      const dy = (y - (box.top + box.height / 2)) / box.height;
      for (const chip of el.querySelectorAll<HTMLElement>("[data-depth]")) {
        const depth = Number(chip.dataset.depth) || 0;
        chip.style.transform = `translate3d(${(dx * 22 * depth).toFixed(2)}px, ${(dy * 14 * depth).toFixed(2)}px, 0)`;
      }
    };

    const onPointer = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={host}
      className="cd-rise relative mt-[clamp(40px,5vw,72px)] h-[220px] overflow-hidden rounded-section border border-hairline bg-raised"
      style={{ animationDelay: "420ms" }}
    >
      <svg
        viewBox="0 0 1200 220"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        fill="none"
        aria-hidden
      >
        <path
          className="cd-draw"
          style={{ "--len": 1400 } as React.CSSProperties}
          d="M0 168 L180 168 C240 168 240 96 300 96 L560 96 C620 96 620 150 680 150 L900 150 C960 150 960 64 1020 64 L1200 64"
          stroke="url(#tileGrad)"
          strokeWidth="1.5"
          strokeDasharray="1400"
        />
        <path d="M300 96 L300 30" stroke="var(--hairline-strong)" strokeWidth="1" />
        <path d="M680 150 L680 200" stroke="var(--hairline-strong)" strokeWidth="1" />
        <defs>
          <linearGradient id="tileGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--signal-from)" />
            <stop offset="1" stopColor="var(--signal-to)" />
          </linearGradient>
        </defs>
      </svg>

      {hero.tiles.map((tile) => (
        <div
          key={tile.label}
          data-depth={tile.depth}
          style={{ left: tile.left, top: tile.top }}
          className="absolute flex items-center gap-2.5 rounded-pill border border-hairline-strong bg-overlay px-3.5 py-[9px]"
        >
          <span className="cd-pulse size-1.5 rounded-pill bg-accent" />
          <span className="font-mono text-xs tracking-[0.04em] whitespace-nowrap">{tile.label}</span>
        </div>
      ))}

      <div className="absolute top-[14%] right-[5%] hidden gap-[18px] font-mono text-xs tracking-[0.06em] text-ink-faint uppercase sm:flex">
        {hero.locations.map((city, index) => (
          <span key={city} className="flex gap-[18px]">
            {city}
            {index < hero.locations.length - 1 ? <span aria-hidden>·</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

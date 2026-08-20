"use client";

import { useState } from "react";

import { Reveal } from "@/components/motion/reveal";
import { usePrefersReducedMotion } from "@/components/motion/use-reveal";
import { reveal, type RevealTierName } from "@/lib/motion";
import { Mono } from "@/components/coditu/mono";

const TIERS: RevealTierName[] = ["micro", "surface", "section"];

/**
 * Replays every motion tier on demand. The point of the button is that a tier
 * is only judgeable in motion — a still frame of a blur fade-in tells you
 * nothing about whether the resolve reads.
 */
export function TierDemo() {
  const [run, setRun] = useState(0);
  const reduced = usePrefersReducedMotion();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="rounded-control border border-[var(--hairline-strong)] px-4 py-2 text-[13.5px] font-medium"
        >
          Replay all tiers
        </button>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          prefers-reduced-motion: {reduced ? "reduce — every tier is y 0 / blur 0 / 120ms" : "no-preference"}
        </Mono>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier, i) => (
          <Reveal
            key={`${tier}-${run}`}
            tier={tier}
            index={i}
            count={TIERS.length}
            className="rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4"
          >
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              {tier}
            </Mono>
            <p className="mt-2 text-[13.5px] text-[var(--ink-muted)]">
              y {reveal[tier].y} · blur {reveal[tier].blur} · {reveal[tier].duration * 1000}ms
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

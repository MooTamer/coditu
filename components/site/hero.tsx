import { Fragment } from "react";
import { ArrowRight } from "lucide-react";

import { SignalRule, SiteContainer } from "@/components/site/shell";
import { HeroTiles } from "@/components/site/hero-tiles.client";
import { hero, siteMeta } from "@/lib/marketing-content";

/**
 * The hero.
 *
 * The headline animates per word — `cd-word` staggered by index. It is a
 * Server Component and the animation is CSS with `animation-fill-mode: both`,
 * so the text is in the server HTML at its final position and the LCP element
 * paints whether or not JavaScript ever arrives. Reduced motion degrades the
 * per-word blur to a flat 120ms fade, globally, in `globals.css`.
 */
export function Hero() {
  return (
    <section id="top" className="pt-[clamp(48px,7vw,104px)] pb-[clamp(56px,6vw,96px)]">
      <SiteContainer>
        <div className="cd-rise flex items-center gap-3.5">
          <span className="font-mono text-xs tracking-[0.06em] text-accent uppercase">
            {hero.eyebrow}
          </span>
          <span className="h-px flex-1 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--signal-to)_50%,transparent),transparent)]" />
          <span className="font-mono text-xs tracking-[0.06em] text-ink-faint uppercase">
            {hero.region}
          </span>
        </div>

        <SignalRule gradientId="heroRule" className="mt-[26px] h-6" />

        <h1 className="mt-[34px] max-w-[20ch] text-display leading-[1.02] font-bold tracking-[-0.035em] text-pretty">
          {/* The space belongs BETWEEN the spans, not inside them: `cd-word` is
              `inline-block`, and an inline-block's trailing whitespace
              collapses — the headline renders as one unbroken word. */}
          {hero.headline.map((word, index) => (
            <Fragment key={`${word}-${index}`}>
              <span className="cd-word" style={{ animationDelay: `${120 + index * 45}ms` }}>
                {word}
              </span>
              {index < hero.headline.length - 1 ? " " : null}
            </Fragment>
          ))}
        </h1>

        <div className="mt-10 grid items-start gap-[clamp(24px,4vw,64px)] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <div className="cd-rise" style={{ animationDelay: "280ms" }}>
            <p className="max-w-[46ch] text-body leading-[1.6] text-ink-muted">{hero.lede}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#work"
                className="signal-gradient inline-flex h-12 items-center gap-2.5 rounded-control px-[22px] text-[15px] font-semibold text-[#07090E]"
              >
                See the work
                <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
              </a>
              <a
                href={`mailto:${siteMeta.email}`}
                className="inline-flex h-12 items-center rounded-control border border-hairline-strong px-[22px] text-[15px] font-semibold text-ink transition-[background-color] duration-[180ms] hover:bg-hairline"
              >
                Request a call
              </a>
            </div>
          </div>

          <ul
            className="cd-rise flex flex-col border-t border-hairline"
            style={{ animationDelay: "340ms" }}
          >
            {hero.points.map((point, index) => (
              <li key={point} className="flex gap-4 border-b border-hairline py-4">
                <span className="pt-[3px] font-mono text-xs text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-[15px] leading-[1.5] text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <HeroTiles />
      </SiteContainer>
    </section>
  );
}

import { ArrowRight, Globe2 } from "lucide-react";

import { HeroAnimated } from "@/components/landing/hero-animated";
import { Container } from "@/components/landing/container";
import { RevealAnimated } from "@/components/landing/reveal-animated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { marketingContent } from "@/lib/marketing-content";

export function Hero() {
  const { hero } = marketingContent;

  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-12">
      <Container>
        <div className="mx-auto flex min-w-0 max-w-5xl flex-col items-center text-center">
          <RevealAnimated>
            <Badge
              variant="secondary"
              className="rounded-full border border-black/10 bg-white/90 px-4 py-1 text-[11px] uppercase tracking-[0.14em]"
            >
              {hero.eyebrow}
            </Badge>
          </RevealAnimated>

          <RevealAnimated delayMs={90} className="mt-8 w-full">
            <HeroAnimated />
          </RevealAnimated>

          <RevealAnimated delayMs={150} className="mt-10">
            <h1 className="max-w-prose text-balance font-display text-3xl leading-[1.06] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {hero.title}
            </h1>
          </RevealAnimated>

          <RevealAnimated delayMs={220}>
            <p className="mx-auto mt-5 max-w-prose text-base leading-relaxed text-muted-foreground sm:max-w-3xl sm:text-lg">
              {hero.description}
            </p>
          </RevealAnimated>

          <RevealAnimated delayMs={280} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-semibold">
              <a href={hero.primaryCtaHref} className="inline-flex items-center gap-2">
                {hero.primaryCtaLabel}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 rounded-full border-black/10 bg-white/80 px-6 text-sm font-semibold"
            >
              <a href={hero.secondaryCtaHref}>{hero.secondaryCtaLabel}</a>
            </Button>
          </RevealAnimated>

          <RevealAnimated
            delayMs={320}
            className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <Globe2 className="size-3.5 text-foreground" />
            {hero.footnote}
          </RevealAnimated>
        </div>
      </Container>
    </section>
  );
}

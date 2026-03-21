import { ArrowRight, Globe2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AnchorLink } from "./anchor-link";
import { Container } from "./container";
import { FadeIn } from "./fade-in";
import { HeroAnimated } from "./hero-animated";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-12">
      <Container>
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <FadeIn>
            <Badge
              variant="secondary"
              className="rounded-full border border-black/10 bg-white/90 px-4 py-1 text-[11px] tracking-[0.14em] uppercase"
            >
              All-in-one digital partner
            </Badge>
          </FadeIn>

          <FadeIn delayMs={90} className="mt-8 w-full">
            <HeroAnimated />
          </FadeIn>

          <FadeIn delayMs={150} className="mt-10">
            <h1 className="font-display text-balance text-4xl leading-[1.04] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              All-in-one services for modern businesses
            </h1>
          </FadeIn>

          <FadeIn delayMs={220}>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              We build and ship end-to-end digital products globally for teams across Germany,
              Egypt, and the USA, from customer-facing platforms to critical internal systems.
            </p>
          </FadeIn>

          <FadeIn delayMs={280} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-semibold">
              <AnchorLink href="#work" className="inline-flex items-center gap-2">
                View our work
                <ArrowRight className="size-4" />
              </AnchorLink>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 rounded-full border-black/10 bg-white/80 px-6 text-sm font-semibold"
            >
              <AnchorLink href="#contact">Talk to us</AnchorLink>
            </Button>
          </FadeIn>

          <FadeIn
            delayMs={320}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <Globe2 className="size-3.5 text-foreground" />
            Built for teams worldwide
          </FadeIn>
        </div>
      </Container>
    </section>
  );
}

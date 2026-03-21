import { Card, CardContent, CardFooter } from "@/components/ui/card";

import { testimonials } from "../_lib/content";

import { FadeIn } from "./fade-in";
import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";

export function Testimonials() {
  return (
    <SectionShell id="testimonials" className="pt-8 sm:pt-12">
      <SectionHeading
        eyebrow="Testimonials"
        title="Trusted by teams that expect clear results"
        description="We partner closely with leadership and operations teams to deliver outcomes that hold up in production."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {testimonials.map((item, index) => (
          <FadeIn key={item.author} delayMs={index * 75}>
            <Card className="h-full rounded-3xl border-black/10 bg-white/85 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.4)]">
              <CardContent className="pt-2">
                <p className="text-sm leading-relaxed text-foreground">&ldquo;{item.quote}&rdquo;</p>
              </CardContent>
              <CardFooter className="mt-auto flex-col items-start gap-0.5 border-t border-black/10 pt-4">
                <p className="text-sm font-semibold text-foreground">{item.author}</p>
                <p className="text-xs text-muted-foreground">
                  {item.role}, {item.company}
                </p>
              </CardFooter>
            </Card>
          </FadeIn>
        ))}
      </div>
    </SectionShell>
  );
}

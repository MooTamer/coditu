import { RevealAnimated } from "@/components/landing/reveal-animated";
import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { marketingContent } from "@/lib/marketing-content";

export function Testimonials() {
  const { sections, testimonials } = marketingContent;

  return (
    <SectionShell id="testimonials" className="pt-8 sm:pt-12">
      <SectionHeading
        eyebrow={sections.testimonials.eyebrow}
        title={sections.testimonials.title}
        description={sections.testimonials.description}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {testimonials.map((item, index) => (
          <RevealAnimated key={item.author} delayMs={index * 75}>
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
          </RevealAnimated>
        ))}
      </div>
    </SectionShell>
  );
}

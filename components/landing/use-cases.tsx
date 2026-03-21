import { RevealAnimated } from "@/components/landing/reveal-animated";
import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iconMap } from "@/lib/icon-map";
import { marketingContent } from "@/lib/marketing-content";

export function UseCases() {
  const { sections, useCases } = marketingContent;

  return (
    <SectionShell id="use-cases" className="pt-8 sm:pt-12">
      <SectionHeading
        eyebrow={sections.useCases.eyebrow}
        title={sections.useCases.title}
        description={sections.useCases.description}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {useCases.map((item, index) => {
          const Icon = iconMap[item.icon];

          return (
            <RevealAnimated key={item.title} delayMs={index * 55}>
              <Card className="h-full rounded-3xl border-black/10 bg-white/80 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.45)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1">
                <CardHeader className="space-y-4">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-black/[0.03]">
                    <Icon className="size-5 text-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg leading-tight">{item.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {item.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {item.outcomes.map((outcome) => (
                    <Badge
                      key={outcome}
                      variant="outline"
                      className="rounded-full border-black/10 bg-white/90 px-2.5 py-1 text-[11px]"
                    >
                      {outcome}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </RevealAnimated>
          );
        })}
      </div>
    </SectionShell>
  );
}

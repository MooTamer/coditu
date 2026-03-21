import { RevealAnimated } from "@/components/landing/reveal-animated";
import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { marketingContent } from "@/lib/marketing-content";

export function Insights() {
  const { insights, sections } = marketingContent;

  return (
    <SectionShell id="insights">
      <SectionHeading
        eyebrow={sections.insights.eyebrow}
        title={sections.insights.title}
        description={sections.insights.description}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {insights.map((item, index) => (
          <RevealAnimated key={item.title} delayMs={index * 70}>
            <Card className="h-full rounded-3xl border-black/10 bg-white/85 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.38)] transition-transform duration-300 hover:-translate-y-1">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-black/10 bg-white px-3 py-1 text-[11px]"
                  >
                    {item.topic}
                  </Badge>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {item.readTime}
                  </span>
                </div>
                <CardTitle className="text-xl tracking-tight">{item.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{item.excerpt}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-xs font-semibold text-foreground">
                  {sections.insights.cardLabel}
                </span>
              </CardContent>
            </Card>
          </RevealAnimated>
        ))}
      </div>
    </SectionShell>
  );
}

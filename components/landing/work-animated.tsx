import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaCarousel } from "@/components/landing/media-carousel";
import type { WorkItem } from "@/lib/marketing-content";

interface WorkAnimatedProps {
  items: WorkItem[];
  cardLabel?: string;
}

export function WorkAnimated({ items, cardLabel }: WorkAnimatedProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <article
          key={item.title}
          className="transition-transform duration-300 hover:-translate-y-1.5"
        >
          <Card className="overflow-hidden rounded-3xl border-black/10 bg-white/85 pt-0 shadow-[0_24px_54px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <div className="relative h-64 overflow-hidden border-b border-black/10">
              <MediaCarousel
                images={item.images}
                className="h-full w-full rounded-none border-0 shadow-none"
              />
            </div>

            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  {item.industry}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  {item.outcome}
                </span>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl leading-tight tracking-tight">{item.title}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="rounded-full border-black/10 bg-white/90 px-3 py-1 text-[11px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </CardContent>

            <CardFooter className="justify-end">
              <span className="text-xs font-semibold text-foreground">{cardLabel}</span>
            </CardFooter>
          </Card>
        </article>
      ))}
    </div>
  );
}

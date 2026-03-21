import type { HTMLAttributes } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SectionHeadingProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-10 space-y-4 sm:mb-12",
        centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className
      )}
      {...props}
    >
      {eyebrow ? (
        <Badge
          variant="secondary"
          className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] tracking-[0.14em] uppercase"
        >
          {eyebrow}
        </Badge>
      ) : null}
      <h2 className="font-display text-3xl leading-tight tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

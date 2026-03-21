"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iconMap } from "@/lib/icon-map";
import type { ServiceItem } from "@/lib/marketing-content";
import { getRevealTransition, getRevealVariants, motionTokens } from "@/lib/motion";

interface ServicesAnimatedProps {
  items: ServiceItem[];
}

export function ServicesAnimated({ items }: ServicesAnimatedProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => {
        const Icon = iconMap[item.icon];

        return (
          <motion.div
            key={item.title}
            variants={getRevealVariants(reducedMotion)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            transition={
              getRevealTransition(reducedMotion, {
                delay: index * motionTokens.stagger.tight,
              })
            }
          >
            <Card className="group h-full rounded-3xl border-black/10 bg-white/85 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_56px_-34px_rgba(15,23,42,0.46)]">
              <CardHeader className="space-y-4">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-black/10 bg-black/[0.03] text-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl leading-tight tracking-tight">{item.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {item.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {item.bullets.map((bullet) => (
                  <Badge
                    key={bullet}
                    variant="outline"
                    className="rounded-full border-black/10 bg-white/85 px-3 py-1 text-[11px]"
                  >
                    {bullet}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

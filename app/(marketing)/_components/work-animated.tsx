"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkItem } from "../_lib/content";
import { getRevealTransition, getRevealVariants, motionTokens } from "../_lib/motion";

interface WorkAnimatedProps {
  items: WorkItem[];
}

export function WorkAnimated({ items }: WorkAnimatedProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item, index) => (
        <motion.article
          key={item.title}
          variants={getRevealVariants(reducedMotion, { yOffset: 14 })}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          transition={
            getRevealTransition(reducedMotion, {
              delay: index * motionTokens.stagger.tight,
            })
          }
          whileHover={
            reducedMotion
              ? undefined
              : {
                  y: -6,
                  transition: { duration: 0.25 },
                }
          }
        >
          <Card className="group overflow-hidden rounded-3xl border-black/10 bg-white/85 pt-0 shadow-[0_24px_54px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <div className="relative h-52 overflow-hidden border-b border-black/10">
              <Image
                src={item.imageSrc}
                alt={item.title}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </div>

            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  {item.industry}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  {item.outcome}
                </span>
              </div>
              <CardTitle className="text-2xl leading-tight tracking-tight">{item.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{item.summary}</CardDescription>
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
                {item.techStack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </CardContent>

            <CardFooter className="justify-end">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                View case
                <ArrowUpRight className="size-3.5" />
              </span>
            </CardFooter>
          </Card>
        </motion.article>
      ))}
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { ProcessStep } from "@/lib/marketing-content";
import { getRevealTransition, getRevealVariants, motionTokens } from "@/lib/motion";

interface ProcessAnimatedProps {
  items: ProcessStep[];
}

export function ProcessAnimated({ items }: ProcessAnimatedProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <ol className="grid min-w-0 gap-4 lg:grid-cols-5">
      {items.map((item, index) => (
        <motion.li
          key={item.step}
          className="relative min-w-0 overflow-hidden rounded-3xl border border-black/10 bg-white/85 p-6 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.45)]"
          variants={getRevealVariants(reducedMotion, { yOffset: 14, blur: 7 })}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.22 }}
          transition={
            getRevealTransition(reducedMotion, {
              delay: index * motionTokens.stagger.tight,
            })
          }
        >
          <div className="mb-4 inline-flex rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {item.step}
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sky-50/60 to-transparent" />
        </motion.li>
      ))}
    </ol>
  );
}

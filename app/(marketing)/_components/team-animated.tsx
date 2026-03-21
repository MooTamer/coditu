"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { TeamMember } from "../_lib/content";
import { getFloatTransition, getRevealTransition, getRevealVariants, motionTokens } from "../_lib/motion";

interface TeamAnimatedProps {
  members: TeamMember[];
}

const mapPoints = [
  { label: "Germany", className: "left-[29%] top-[30%]", delay: 0.15 },
  { label: "Egypt", className: "left-[53%] top-[45%]", delay: 0.2 },
  { label: "USA", className: "left-[72%] top-[28%]", delay: 0.25 },
];

export function TeamAnimated({ members }: TeamAnimatedProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <motion.aside
        className="relative overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-br from-white via-slate-50 to-blue-50/80 p-6 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.45)]"
        variants={getRevealVariants(reducedMotion)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.24 }}
        transition={getRevealTransition(reducedMotion)}
      >
        <p className="mb-3 text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">
          Distributed by design
        </p>
        <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Shared delivery across 3 regions
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Teams overlap daily and keep handoffs tight through a unified process and common technical standards.
        </p>

        <div className="relative mt-8 h-56 rounded-2xl border border-black/10 bg-white/85">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_35%,rgba(56,189,248,0.2),transparent_45%),radial-gradient(circle_at_72%_28%,rgba(59,130,246,0.16),transparent_46%),radial-gradient(circle_at_52%_48%,rgba(14,165,233,0.16),transparent_42%)]" />
          <svg
            viewBox="0 0 320 210"
            className="absolute inset-0 h-full w-full stroke-sky-300/70"
            fill="none"
            aria-hidden="true"
          >
            <path d="M84 76C116 118 166 122 224 75" strokeWidth="1.4" strokeDasharray="5 6" />
            <path d="M224 75C189 125 154 138 116 124" strokeWidth="1.4" strokeDasharray="5 6" />
          </svg>

          {mapPoints.map((point) => (
            <motion.div
              key={point.label}
              className={`absolute ${point.className}`}
              animate={
                reducedMotion
                  ? undefined
                  : {
                      scale: [1, 1.08, 1],
                    }
              }
              transition={getFloatTransition(reducedMotion, point.delay, 4.5)}
            >
              <span className="inline-flex rounded-full border border-sky-300/70 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                {point.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.aside>

      <div className="grid gap-4 sm:grid-cols-2">
        {members.map((member, index) => (
          <motion.article
            key={member.name}
            className="rounded-3xl border border-black/10 bg-white/90 p-5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.4)]"
            variants={getRevealVariants(reducedMotion, { yOffset: 12, blur: 6 })}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
            transition={
              getRevealTransition(reducedMotion, {
                delay: index * motionTokens.stagger.tight,
              })
            }
            whileHover={reducedMotion ? undefined : { y: -4, transition: { duration: 0.22 } }}
          >
            <div className="mb-3 flex items-center gap-3">
              <Avatar size="lg" className="border border-black/10 bg-sky-50">
                <AvatarFallback className="bg-transparent text-sm font-semibold text-foreground">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-semibold tracking-tight text-foreground">{member.name}</h4>
                <p className="text-xs text-muted-foreground">{member.role}</p>
              </div>
            </div>

            <p className="text-xs font-medium text-muted-foreground">{member.location}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {member.specialties.map((specialty) => (
                <Badge
                  key={specialty}
                  variant="outline"
                  className="rounded-full border-black/10 bg-white/85 px-2.5 py-1 text-[11px]"
                >
                  {specialty}
                </Badge>
              ))}
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { TeamMember, TeamRegion } from "@/lib/marketing-content";
import { getFloatTransition, getRevealTransition, getRevealVariants, motionTokens } from "@/lib/motion";

interface TeamAnimatedProps {
  summaryEyebrow: string;
  summaryTitle: string;
  summaryDescription: string;
  regions: TeamRegion[];
  members: TeamMember[];
}

export function TeamAnimated({
  summaryEyebrow,
  summaryTitle,
  summaryDescription,
  regions,
  members,
}: TeamAnimatedProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <motion.aside
        className="relative min-w-0 overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-br from-white via-slate-50 to-blue-50/80 p-6 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.45)]"
        variants={getRevealVariants(reducedMotion)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.24 }}
        transition={getRevealTransition(reducedMotion)}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          {summaryEyebrow}
        </p>
        <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {summaryTitle}
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {summaryDescription}
        </p>

        <div className="relative mt-8 h-56 rounded-2xl border border-black/10 bg-white/85">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_32%,rgba(56,189,248,0.2),transparent_45%),radial-gradient(circle_at_55%_48%,rgba(59,130,246,0.16),transparent_46%)]" />
          <svg
            viewBox="0 0 320 210"
            className="absolute inset-0 h-full w-full stroke-sky-300/70"
            fill="none"
            aria-hidden="true"
          >
            <path d="M110 86C135 108 156 118 180 116" strokeWidth="1.4" strokeDasharray="5 6" />
          </svg>

          {regions.map((point) => (
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

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {members.map((member, index) => (
          <motion.article
            key={member.name}
            className="min-w-0 rounded-3xl border border-black/10 bg-white/90 p-5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.4)]"
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
              <div className="min-w-0">
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

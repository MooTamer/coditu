"use client";

import { useMemo } from "react";
import type { ComponentType, MouseEventHandler } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Bot, Layers, Lightbulb, ShieldCheck, Workflow } from "lucide-react";

import { getFloatTransition, getRevealTransition, getRevealVariants } from "../_lib/motion";
import { cn } from "@/lib/utils";

interface FloatingTileData {
  id: string;
  label: string;
  positionClass: string;
  variant: "icon" | "avatar";
  icon?: ComponentType<{ className?: string }>;
  initials?: string;
  parallaxFactor: number;
  floatDistance: number;
  delay: number;
}

const floatingTiles: FloatingTileData[] = [
  {
    id: "tile-avatar-1",
    label: "Berlin",
    positionClass: "left-[2%] top-[24%]",
    variant: "avatar",
    initials: "DE",
    parallaxFactor: 0.34,
    floatDistance: 10,
    delay: 0.08,
  },
  {
    id: "tile-avatar-2",
    label: "Cairo",
    positionClass: "right-[2%] top-[18%]",
    variant: "avatar",
    initials: "EG",
    parallaxFactor: 0.42,
    floatDistance: 14,
    delay: 0.16,
  },
  {
    id: "tile-avatar-3",
    label: "Austin",
    positionClass: "left-[8%] bottom-[6%]",
    variant: "avatar",
    initials: "US",
    parallaxFactor: 0.4,
    floatDistance: 12,
    delay: 0.24,
  },
  {
    id: "tile-service-1",
    label: "Web Apps",
    positionClass: "left-[16%] top-[2%]",
    variant: "icon",
    icon: Layers,
    parallaxFactor: 0.38,
    floatDistance: 11,
    delay: 0.2,
  },
  {
    id: "tile-service-2",
    label: "Systems",
    positionClass: "right-[16%] top-[2%]",
    variant: "icon",
    icon: Workflow,
    parallaxFactor: 0.33,
    floatDistance: 13,
    delay: 0.26,
  },
  {
    id: "tile-service-3",
    label: "AI",
    positionClass: "right-[8%] bottom-[10%]",
    variant: "icon",
    icon: Bot,
    parallaxFactor: 0.46,
    floatDistance: 14,
    delay: 0.32,
  },
  {
    id: "tile-service-4",
    label: "SEO",
    positionClass: "left-[25%] bottom-[2%]",
    variant: "icon",
    icon: Lightbulb,
    parallaxFactor: 0.31,
    floatDistance: 10,
    delay: 0.36,
  },
];

interface FloatingTileProps {
  tile: FloatingTileData;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  reducedMotion: boolean;
}

function FloatingTile({ tile, pointerX, pointerY, reducedMotion }: FloatingTileProps) {
  const x = useTransform(pointerX, (value) => value * tile.parallaxFactor);
  const y = useTransform(pointerY, (value) => value * tile.parallaxFactor);
  const Icon = tile.icon;

  const revealVariants = useMemo(
    () => getRevealVariants(reducedMotion, { yOffset: 10, blur: 7, scale: 0.99 }),
    [reducedMotion]
  );

  return (
    <motion.div
      className={cn("absolute w-fit", tile.positionClass)}
      style={{ x, y }}
      variants={revealVariants}
      initial="hidden"
      animate="visible"
      transition={getRevealTransition(reducedMotion, { delay: tile.delay, duration: 0.52 })}
    >
      <motion.div
        className="rounded-2xl border border-white/70 bg-white/90 p-2 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl"
        animate={
          reducedMotion
            ? undefined
            : {
                y: [0, -tile.floatDistance, 0],
              }
        }
        transition={getFloatTransition(reducedMotion, tile.delay, 6)}
        whileHover={
          reducedMotion
            ? undefined
            : {
                scale: 1.03,
                y: -6,
              }
        }
      >
        {tile.variant === "icon" && Icon ? (
          <motion.div
            className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef4ff] to-[#e0ecff] text-slate-700"
            animate={
              reducedMotion
                ? undefined
                : {
                    rotate: [0, 5, -5, 0],
                  }
            }
            transition={{
              duration: 7.2,
              delay: tile.delay,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "loop",
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <Icon className="size-5" />
          </motion.div>
        ) : (
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#dbeafe] to-[#e2e8f0] text-sm font-semibold text-slate-700">
            {tile.initials}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function HeroAnimated() {
  const reducedMotion = useReducedMotion() ?? false;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const handlePointerMove: MouseEventHandler<HTMLDivElement> = (event) => {
    if (reducedMotion) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    animate(pointerX, x * 28, { duration: 0.42 });
    animate(pointerY, y * 28, { duration: 0.42 });
  };

  const handlePointerLeave = () => {
    if (reducedMotion) {
      return;
    }

    animate(pointerX, 0, { duration: 0.65 });
    animate(pointerY, 0, { duration: 0.65 });
  };

  return (
    <div
      className="relative h-[19rem] w-full overflow-hidden rounded-[2rem] border border-black/10 bg-[#f5f6fa] p-6 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)] sm:h-[23rem]"
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,rgba(59,130,246,0.12),transparent_42%),radial-gradient(circle_at_70%_80%,rgba(56,189,248,0.1),transparent_42%)]" />
      <div className="absolute left-1/2 top-[46%] h-px w-[78%] -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />

      <motion.div
        className="absolute left-1/2 top-[45%] flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.9rem] bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] text-white shadow-[0_24px_56px_-32px_rgba(109,40,217,0.7)]"
        variants={getRevealVariants(reducedMotion)}
        initial="hidden"
        animate="visible"
        transition={getRevealTransition(reducedMotion, { delay: 0.04 })}
      >
        <motion.div
          className="flex size-12 items-center justify-center rounded-full border border-white/65"
          animate={
            reducedMotion
              ? undefined
              : {
                  rotate: [0, 10, 0, -10, 0],
                  scale: [1, 1.04, 1],
                }
          }
          transition={{
            duration: 5.8,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "loop",
            ease: [0.32, 0.72, 0, 1],
          }}
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <motion.path
              d="M5 12.5L10.2 17.2L19.2 7.8"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.9, delay: 0.18, ease: [0.22, 1, 0.36, 1] }
              }
            />
          </motion.svg>
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute left-1/2 top-[12%] flex size-14 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/70 bg-white/95 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.45)]"
        variants={getRevealVariants(reducedMotion, { yOffset: 10, blur: 6 })}
        initial="hidden"
        animate="visible"
        transition={getRevealTransition(reducedMotion, { delay: 0.12 })}
      >
        <ShieldCheck className="size-6 text-violet-500" />
      </motion.div>

      {floatingTiles.map((tile) => (
        <FloatingTile
          key={tile.id}
          tile={tile}
          pointerX={pointerX}
          pointerY={pointerY}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}

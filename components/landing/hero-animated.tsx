"use client";

import { useEffect, useMemo, useState } from "react";
import type { MouseEventHandler } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { iconMap } from "@/lib/icon-map";
import { marketingContent, type HeroTile } from "@/lib/marketing-content";
import { getFloatTransition, getRevealTransition, getRevealVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface FloatingTileProps {
  tile: HeroTile;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  reducedMotion: boolean;
}

function FloatingTile({ tile, pointerX, pointerY, reducedMotion }: FloatingTileProps) {
  const x = useTransform(pointerX, (value) => value * tile.parallaxFactor);
  const y = useTransform(pointerY, (value) => value * tile.parallaxFactor);
  const Icon = tile.icon ? iconMap[tile.icon] : null;

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
        className="rounded-2xl border border-white/70 bg-white/90 p-1.5 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-2"
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
            className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef4ff] to-[#e0ecff] text-slate-700 sm:size-12"
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#dbeafe] to-[#e2e8f0] text-xs font-semibold text-slate-700 sm:size-12 sm:text-sm">
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
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(max-width: 639px)");
    const handleChange = () => setIsCompactViewport(media.matches);
    handleChange();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const heroTiles = isCompactViewport
    ? marketingContent.hero.tiles.slice(0, 4)
    : marketingContent.hero.tiles;

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
      className="relative h-[14.5rem] w-full overflow-hidden rounded-[2rem] border border-black/10 bg-[#f5f6fa] p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.45)] sm:h-[19rem] sm:p-6 lg:h-[23rem]"
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,rgba(59,130,246,0.12),transparent_42%),radial-gradient(circle_at_70%_80%,rgba(56,189,248,0.1),transparent_42%)]" />
      <div className="absolute left-1/2 top-[46%] h-px w-[78%] -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />

      <motion.div
        className="absolute left-1/2 top-[45%] flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] text-white shadow-[0_24px_56px_-32px_rgba(109,40,217,0.7)] sm:size-24 sm:rounded-[1.9rem]"
        variants={getRevealVariants(reducedMotion)}
        initial="hidden"
        animate="visible"
        transition={getRevealTransition(reducedMotion, { delay: 0.04 })}
      >
        <motion.div
          className="flex size-10 items-center justify-center rounded-full border border-white/65 sm:size-12"
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
          <ShieldCheck className="size-6" />
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute left-1/2 top-[12%] flex size-12 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/70 bg-white/95 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.45)] sm:size-14"
        variants={getRevealVariants(reducedMotion, { yOffset: 10, blur: 6 })}
        initial="hidden"
        animate="visible"
        transition={getRevealTransition(reducedMotion, { delay: 0.12 })}
      >
        <ShieldCheck className="size-6 text-violet-500" />
      </motion.div>

      {heroTiles.map((tile) => (
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

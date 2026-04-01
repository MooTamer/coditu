"use client";

import { useCallback, useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import { AnimatePresence, motion, type PanInfo, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { motionTokens } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface MediaCarouselImage {
  src: string;
  alt: string;
  objectPosition?: string;
}

interface MediaCarouselProps {
  images: MediaCarouselImage[];
  className?: string;
  autoPlayMs?: number;
  showDots?: boolean;
}

const DRAG_OFFSET_THRESHOLD = 64;
const DRAG_VELOCITY_THRESHOLD = 540;

function toLoopedIndex(nextIndex: number, total: number) {
  return (nextIndex + total) % total;
}

export function MediaCarousel({
  images,
  className,
  autoPlayMs = 4500,
  showDots = true,
}: MediaCarouselProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const total = images.length;
  const canCycle = total > 1;
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isPaused = isHovered || isFocused;
  const intervalMs = Math.max(1000, autoPlayMs);
  const normalizedActiveIndex = total ? toLoopedIndex(activeIndex, total) : 0;

  const paginate = useCallback(
    (step: number) => {
      if (!canCycle) {
        return;
      }

      setDirection(step >= 0 ? 1 : -1);
      setActiveIndex((current) => toLoopedIndex(current + step, total));
    },
    [canCycle, total]
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      if (!canCycle) {
        return;
      }

      const target = toLoopedIndex(nextIndex, total);
      if (target === normalizedActiveIndex) {
        return;
      }

      setDirection(target > normalizedActiveIndex ? 1 : -1);
      setActiveIndex(target);
    },
    [canCycle, normalizedActiveIndex, total]
  );

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!canCycle || reducedMotion) {
        return;
      }

      if (
        info.offset.x <= -DRAG_OFFSET_THRESHOLD ||
        info.velocity.x <= -DRAG_VELOCITY_THRESHOLD
      ) {
        paginate(1);
        return;
      }

      if (
        info.offset.x >= DRAG_OFFSET_THRESHOLD ||
        info.velocity.x >= DRAG_VELOCITY_THRESHOLD
      ) {
        paginate(-1);
      }
    },
    [canCycle, paginate, reducedMotion]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!canCycle) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        paginate(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        paginate(1);
      }
    },
    [canCycle, paginate]
  );

  const handleBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsFocused(false);
    }
  }, []);

  useEffect(() => {
    if (!canCycle || reducedMotion || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      paginate(1);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canCycle, intervalMs, isPaused, paginate, reducedMotion]);

  const currentImage = images[normalizedActiveIndex];
  if (!currentImage) {
    return null;
  }

  return (
    <div
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Project media gallery"
      className={cn(
        "group relative isolate aspect-video w-full overflow-hidden rounded-2xl border border-black/10 bg-slate-100/70 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_24px_44px_-34px_rgba(15,23,42,0.7)] focus-visible:ring-2 focus-visible:ring-sky-500/40",
        className
      )}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={handleBlurCapture}
      onKeyDown={handleKeyDown}
    >
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={`${currentImage.src}-${activeIndex}`}
          custom={direction}
          className="absolute inset-0  object-cover will-change-transform"
          variants={{
            enter: (step: 1 | -1) =>
              reducedMotion
                ? { x: 0, opacity: 1 }
                : { x: step > 0 ? 46 : -46, opacity: 0.8, scale: 0.992 },
            center: { x: 0, opacity: 1, scale: 1 },
            exit: (step: 1 | -1) =>
              reducedMotion
                ? { x: 0, opacity: 1 }
                : { x: step > 0 ? -42 : 42, opacity: 0.72, scale: 0.992 },
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  type: "spring",
                  stiffness: 280,
                  damping: 28,
                  mass: 0.9,
                  ease: motionTokens.easing.gentle,
                }
          }
          drag={canCycle && !reducedMotion ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.11}
          onDragEnd={handleDragEnd}
        >
          <Image
            src={currentImage.src}
            alt={currentImage.alt}
            fill
            suppressHydrationWarning
            sizes="(min-width: 1280px) 38rem, (min-width: 1024px) 44vw, 92vw"
            className="object-cover select-none"
            style={{ objectPosition: currentImage.objectPosition ?? "50% 50%" }}
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>


      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-neutral-600 to-transparent" />
      <div className="pointer-events-none absolute inset-0 " />

      {canCycle ? (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => paginate(-1)}
            className="absolute left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/78 text-slate-700 opacity-0 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.85)] backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/95 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:flex"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => paginate(1)}
            className="absolute right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/78 text-slate-700 opacity-0 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.85)] backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/95 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:flex"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      ) : null}

      {showDots && canCycle ? (
        <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2">
          {images.map((image, dotIndex) => {
            const isActive = dotIndex === normalizedActiveIndex;

            return (
              <button
                key={`${image.src}-${dotIndex}`}
                type="button"
                aria-label={`Go to image ${dotIndex + 1}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => goTo(dotIndex)}
                className="rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-300",
                    isActive
                      ? "w-5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.18)]"
                      : "w-1.5 bg-white/60 hover:bg-white/85"
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

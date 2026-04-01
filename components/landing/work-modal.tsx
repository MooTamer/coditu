"use client";

import { useEffect, useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "lucide-react";

import { MediaCarousel } from "@/components/landing/media-carousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkItem } from "@/lib/marketing-content";
import { motionTokens } from "@/lib/motion";

interface WorkModalProps {
  item: WorkItem | null;
  reducedMotion: boolean;
  onClose: () => void;
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [locked]);
}

export function WorkModal({ item, reducedMotion, onClose }: WorkModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = Boolean(item);
  useBodyScrollLock(isOpen);

  const detailsContainerVariants = reducedMotion
    ? {
        hidden: {},
        visible: {},
      }
    : {
        hidden: {},
        visible: {
          transition: {
            delayChildren: 0.08,
            staggerChildren: 0.05,
          },
        },
      };

  const detailItemVariants = reducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      };

  return (
    <AnimatePresence>
      {item ? (
        <DialogPrimitive.Root
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              onClose();
            }
          }}
        >
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reducedMotion ? 0.14 : 0.2,
                  ease: motionTokens.easing.smooth,
                }}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                closeButtonRef.current?.focus();
              }}
            >
              <motion.div
                layoutId={reducedMotion ? undefined : `work-card-${item.id}`}
                className="fixed inset-x-2 inset-y-3 z-50 flex max-h-[85svh] min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white/95 shadow-[0_34px_90px_-38px_rgba(2,6,23,0.7)] sm:inset-x-8 sm:inset-y-6 sm:max-h-[90svh] lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[min(88svh,54rem)] lg:max-h-[min(88svh,54rem)] lg:w-[min(92vw,72rem)] lg:-translate-x-1/2 lg:-translate-y-1/2"
                initial={reducedMotion ? { opacity: 0, scale: 0.995 } : { opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reducedMotion ? { opacity: 0, scale: 0.995 } : { opacity: 0, y: 14, scale: 0.985 }}
                transition={{
                  duration: reducedMotion ? 0.14 : 0.3,
                  ease: motionTokens.easing.smooth,
                }}
              >
                <DialogPrimitive.Title className="sr-only">{item.title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {item.summary}
                </DialogPrimitive.Description>

                <div className="relative h-[30svh] min-h-44 max-h-[26rem] overflow-hidden border-b border-black/10 sm:h-[34svh] sm:min-h-56 sm:max-h-[30rem]">
                  <motion.div
                    layoutId={reducedMotion ? undefined : `work-card-image-${item.id}`}
                    className="absolute inset-0"
                  >
                    <MediaCarousel
                      images={item.images}
                      className="h-full w-full rounded-none border-0 shadow-none"
                    />
                  </motion.div>

                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/45 to-transparent" />

                  <DialogPrimitive.Close asChild>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      aria-label="Close work details"
                      className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full border border-white/50 bg-white/88 text-slate-700 shadow-[0_12px_30px_-20px_rgba(15,23,42,0.8)] backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:top-4"
                    >
                      <XIcon className="size-5" />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                <motion.div
                  className="flex-1 overflow-y-auto p-4 sm:p-7"
                  variants={detailsContainerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  <motion.header className="space-y-4" variants={detailItemVariants}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        title={item.industry}
                        className="max-w-full truncate rounded-full px-3 py-1 text-[11px]"
                      >
                        {item.industry}
                      </Badge>
                      <span
                        title={item.outcome}
                        className="inline-flex max-w-full truncate rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
                      >
                        {item.outcome}
                      </span>
                    </div>
                    <h3 className="max-w-prose text-balance font-display text-2xl leading-tight font-semibold tracking-tight text-foreground sm:text-3xl">
                      {item.title}
                    </h3>
                    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:max-w-3xl sm:text-base">
                      {item.summary}
                    </p>
                  </motion.header>

                  <motion.div
                    className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
                    variants={detailItemVariants}
                  >
                    <section className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Problem to Impact
                      </h4>
                      <ul className="space-y-3">
                        {item.highlights.map((highlight) => (
                          <li
                            key={`${item.id}-${highlight.label}`}
                            className="rounded-2xl border border-black/10 bg-black/[0.03] px-4 py-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {highlight.label}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-foreground">
                              {highlight.detail}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <aside className="min-w-0 space-y-6">
                      <section className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Tags
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <Badge
                              key={`${item.id}-tag-${tag}`}
                              variant="outline"
                              className="rounded-full border-black/10 bg-white/90 px-3 py-1 text-[11px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Stack
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {item.stack.map((stackItem) => (
                            <span
                              key={`${item.id}-stack-${stackItem}`}
                              className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[11px] font-medium text-muted-foreground"
                            >
                              {stackItem}
                            </span>
                          ))}
                        </div>
                      </section>

                      {item.cta ? (
                        <section>
                          <Button
                            asChild
                            className="h-11 w-full rounded-full bg-slate-900 px-5 text-sm text-white hover:bg-slate-800 sm:w-auto"
                          >
                            <a href={item.cta.href}>{item.cta.label}</a>
                          </Button>
                        </section>
                      ) : null}
                    </aside>
                  </motion.div>
                </motion.div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : null}
    </AnimatePresence>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";

import { WorkModal } from "@/components/landing/work-modal";
import { Badge } from "@/components/ui/badge";
import type { WorkItem } from "@/lib/marketing-content";
import { motionTokens } from "@/lib/motion";

interface WorkGalleryClientProps {
  items: WorkItem[];
  cardLabel?: string;
}

const defaultCardLabel = "View details";

export function WorkGalleryClient({ items, cardLabel = defaultCardLabel }: WorkGalleryClientProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedItem =
    selectedItemId === null ? null : items.find((item) => item.id === selectedItemId) ?? null;

  return (
    <LayoutGroup id="work-gallery">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const previewImage = item.images[0];
          const cardLayoutId = reducedMotion ? undefined : `work-card-${item.id}`;
          const imageLayoutId = reducedMotion ? undefined : `work-card-image-${item.id}`;
          const combinedTags = Array.from(new Set([...item.tags, ...item.stack]));
          const visibleTags = combinedTags.slice(0, 5);

          return (
            <article key={item.id} className="min-w-0">
              <motion.button
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className="group min-w-0 w-full rounded-3xl text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                whileHover={reducedMotion ? undefined : { y: -6 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.25,
                  ease: motionTokens.easing.gentle,
                }}
              >
                <motion.div
                  layoutId={cardLayoutId}
                  className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-black/10 bg-white/85 shadow-[0_24px_54px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm"
                >
                  <motion.div
                    layoutId={imageLayoutId}
                    className="relative h-60 overflow-hidden border-b border-black/10 bg-slate-100 sm:h-64 lg:h-96"
                  >
                    {previewImage ? (
                      <Image
                        src={previewImage.src}
                        alt={previewImage.alt}
                        fill
                        suppressHydrationWarning
                        sizes="(min-width: 1440px) 40rem, (min-width: 1024px) 45vw, (min-width: 640px) 46vw, 92vw"
                        className="object-cover"
                        style={{ objectPosition: previewImage.objectPosition ?? "50% 50%" }}
                      />
                    ) : null}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-neutral-600/35 to-transparent" />
                  </motion.div>

                  <div className="flex min-w-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
                    <div className="flex min-h-[3rem] min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                      <Badge
                        variant="secondary"
                        title={item.industry}
                        className="max-w-full rounded-full px-3 py-1 text-[11px] sm:max-w-[40%]"
                      >
                        {item.industry}
                      </Badge>
                      <span
                        title={item.outcome}
                        className="line-clamp-2 inline-flex max-w-full whitespace-normal rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] leading-[1.32] font-medium text-emerald-800 sm:max-w-[68%]"
                      >
                        {item.outcome}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-2">
                      <h3 className="line-clamp-2 min-h-[3.2rem] text-xl leading-tight tracking-tight text-foreground sm:min-h-[3.6rem] sm:text-2xl">
                        {item.title}
                      </h3>
                      <p className="line-clamp-3 min-h-[3.9rem] text-sm leading-relaxed text-muted-foreground sm:min-h-16">
                        {item.summary}
                      </p>
                    </div>

                    <div className="min-w-0 space-y-3 pt-1">
                      <div className="flex max-h-[3.2rem] min-h-[3.2rem] min-w-0 flex-wrap content-start gap-2 overflow-hidden">
                        {visibleTags.map((tag) => (
                          <Badge
                            key={`${item.id}-tag-${tag}`}
                            variant="outline"
                            className="rounded-full border-black/10 bg-white/90 px-3 py-1 text-[11px] text-foreground/80"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {combinedTags.length > visibleTags.length ? (
                          <span className="rounded-full border border-black/10 bg-black/3 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            +{combinedTags.length - visibleTags.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-xs font-semibold text-foreground">
                        <span>{cardLabel}</span>
                        <ArrowUpRightIcon className="size-3.5" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.button>
            </article>
          );
        })}
      </div>

      <WorkModal
        item={selectedItem}
        reducedMotion={reducedMotion}
        onClose={() => setSelectedItemId(null)}
      />
    </LayoutGroup>
  );
}

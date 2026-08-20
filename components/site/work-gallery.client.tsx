"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { type WorkItem } from "@/lib/marketing-content";
import { staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Loaded when a card is clicked, not before. `ssr: false` because the dialog
// only ever exists in response to a click — there is nothing for the server to
// render, and asking it to render one would ship the markup to every reader.
const WorkModal = dynamic(() => import("./work-modal.client").then((m) => m.WorkModal), {
  ssr: false,
});

/**
 * The work gallery and its case-study modal.
 *
 * The cards are `<button>`s, not links: there is no per-project page to link
 * to, and a link that opens a dialog lies to anyone who middle-clicks it.
 *
 * The shared element is `view-transition-name` on the card's image and title —
 * where the browser supports it, the card's image is the modal's image, moving
 * and scaling between the two. Where it does not, the modal simply rises. The
 * name has to be unique per element on screen at once, so it is applied to the
 * opening card only and released when the modal closes.
 */
export function WorkGallery({ items }: { items: readonly WorkItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const opener = useRef<HTMLButtonElement | null>(null);

  const open = useCallback((entry: WorkItem, trigger: HTMLButtonElement) => {
    opener.current = trigger;
    setImageIndex(0);
    const run = () => setOpenId(entry.id);
    // A view transition where the browser has one, a plain open where it does
    // not. The card's image and title are the shared elements.
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(run);
    } else {
      run();
    }
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    // Focus goes back to the card that opened the dialog. Dropping it on
    // <body> sends a keyboard reader to the top of the page.
    opener.current?.focus();
  }, []);

  const item = items.find((candidate) => candidate.id === openId) ?? null;

  return (
    <>
      <div className="mt-8 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))]">
        {items.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={(event) => open(entry, event.currentTarget)}
            aria-haspopup="dialog"
            data-reveal="section"
            data-reveal-on-view
            style={{ animationDelay: `${staggerDelay(index, items.length) * 1000}ms` }}
            className={cn(
              "group flex cursor-pointer flex-col overflow-hidden rounded-section border border-hairline bg-raised p-0 text-left text-inherit",
              // 240ms is the bundle's number for this hover. §4 assigns hover
              // elevation to the `micro` tier, whose duration is 200ms — and on a
              // NUMBER the bundle wins. The tier still governs the shape: travel
              // and no blur.
              "transition-[border-color,transform] duration-[240ms] ease-[var(--ease-entrance)]",
              "hover:-translate-y-[3px] hover:border-hairline-strong",
              entry.wide && "xl:col-span-2"
            )}
          >
            <span className="relative block aspect-[16/9] overflow-hidden border-b border-hairline bg-overlay">
              <Image
                src={entry.images[0].src}
                alt={entry.images[0].alt}
                fill
                sizes="(max-width: 900px) 100vw, 620px"
                className="object-cover object-top"
                style={openId === entry.id ? { viewTransitionName: "work-image" } : undefined}
              />
              <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(7,9,14,0.55),transparent_55%)]" />
            </span>

            <span className="flex flex-col gap-3.5 p-6">
              <span className="flex flex-wrap items-center gap-2.5 font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
                <span className="text-accent">{entry.client}</span>
                <span aria-hidden>·</span>
                <span>{entry.industry}</span>
              </span>
              <span
                className="text-h4 leading-[1.25] font-bold tracking-[-0.015em]"
                style={openId === entry.id ? { viewTransitionName: "work-title" } : undefined}
              >
                {entry.title}
              </span>
              <span className="text-[15px] leading-[1.55] text-ink-muted">{entry.summary}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {entry.stack.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-chip border border-hairline px-2.5 py-1 font-mono text-[11px] text-ink-muted"
                  >
                    {chip}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      {item ? (
        <WorkModal
          item={item}
          imageIndex={imageIndex}
          onImageIndex={setImageIndex}
          onClose={close}
        />
      ) : null}
    </>
  );
}

"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";

import { siteMeta, type WorkItem } from "@/lib/marketing-content";
import { staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
  const dialog = useRef<HTMLDivElement>(null);

  const open = useCallback((item: WorkItem, trigger: HTMLButtonElement) => {
    opener.current = trigger;
    setImageIndex(0);
    const run = () => {
      setOpenId(item.id);
    };
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

  // Esc closes, Tab stays inside, and the page behind stops scrolling. The
  // scrollbar width is compensated so the layout does not jump.
  useEffect(() => {
    if (!item) return;

    const previousOverflow = document.body.style.overflow;
    const previousPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPad;
    };
  }, [item, close]);

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
          ref={dialog}
          item={item}
          imageIndex={imageIndex}
          onImageIndex={setImageIndex}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function WorkModal({
  ref,
  item,
  imageIndex,
  onImageIndex,
  onClose,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  item: WorkItem;
  imageIndex: number;
  onImageIndex: (index: number) => void;
  onClose: () => void;
}) {
  const image = item.images[imageIndex] ?? item.images[0];
  const many = item.images.length > 1;

  return (
    <div
      onClick={onClose}
      data-scrim
      className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto px-5 py-[clamp(16px,4vh,56px)]"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-modal-title"
        onClick={(event) => event.stopPropagation()}
        data-reveal="surface"
        className="w-full max-w-[1000px] overflow-hidden rounded-section border border-hairline-strong bg-overlay shadow-overlay"
      >
        <div className="relative aspect-[16/8] border-b border-hairline bg-[var(--canvas)]">
          <Image
            key={image.src}
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 1040px) 100vw, 1000px"
            className="object-cover object-top"
            style={{ viewTransitionName: "work-image" }}
            priority
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-control border border-hairline-strong bg-[color-mix(in_srgb,var(--overlay)_86%,transparent)] text-ink backdrop-blur-[8px]"
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>

          {many ? (
            <div className="absolute right-4 bottom-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onImageIndex((imageIndex - 1 + item.images.length) % item.images.length)}
                aria-label="Previous image"
                className="flex size-11 items-center justify-center rounded-control border border-hairline-strong bg-[color-mix(in_srgb,var(--overlay)_86%,transparent)] text-ink"
              >
                <ChevronLeft size={15} strokeWidth={2.2} aria-hidden />
              </button>
              <span aria-live="polite" className="px-1 font-mono text-xs text-ink-muted">
                {imageIndex + 1} / {item.images.length}
              </span>
              <button
                type="button"
                onClick={() => onImageIndex((imageIndex + 1) % item.images.length)}
                aria-label="Next image"
                className="flex size-11 items-center justify-center rounded-control border border-hairline-strong bg-[color-mix(in_srgb,var(--overlay)_86%,transparent)] text-ink"
              >
                <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-9 p-[clamp(24px,3vw,40px)] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div>
            <p className="flex flex-wrap items-center gap-2.5 font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
              <span className="text-accent">{item.client}</span>
              <span aria-hidden>·</span>
              <span>{item.industry}</span>
            </p>
            <h3
              id="work-modal-title"
              className="mt-3.5 text-h3 leading-[1.12] font-bold tracking-[-0.024em]"
              style={{ viewTransitionName: "work-title" }}
            >
              {item.title}
            </h3>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {item.stack.map((chip) => (
                <span
                  key={chip}
                  className="rounded-chip border border-hairline px-2.5 py-[5px] font-mono text-[11px] text-ink-muted"
                >
                  {chip}
                </span>
              ))}
            </div>
            <a
              href={`mailto:${siteMeta.email}`}
              className="signal-gradient mt-7 inline-flex h-12 items-center gap-2.5 rounded-control px-[22px] text-[15px] font-semibold text-[#07090E]"
            >
              Request a call
              <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
            </a>
          </div>

          <dl className="flex flex-col gap-[22px]">
            <Fact label="Problem" tone="var(--amber-text)" body={item.problem} />
            <Fact label="Solution" tone="var(--accent)" body={item.solution} />
            <Fact label="Impact" tone="var(--jade)" body={item.impact} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, tone, body }: { label: string; tone: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-[18px]">
      <dt
        className="font-mono text-[11px] tracking-[0.06em] uppercase"
        style={{ color: tone }}
      >
        {label}
      </dt>
      <dd className="text-[15px] leading-[1.6] text-ink">{body}</dd>
    </div>
  );
}

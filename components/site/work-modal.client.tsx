"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";

import { siteMeta, type WorkItem } from "@/lib/marketing-content";

/**
 * The case-study dialog.
 *
 * Its own module so the gallery can `next/dynamic` it: nobody sees this until
 * they click a card, and the marketing route is the one with a JS budget. Same
 * reasoning as TipTap in the app — a reader who never opens it never downloads
 * it.
 */
export function WorkModal({
  item,
  imageIndex,
  onImageIndex,
  onClose,
}: {
  item: WorkItem;
  imageIndex: number;
  onImageIndex: (index: number) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const image = item.images[imageIndex] ?? item.images[0];
  const many = item.images.length > 1;

  // The dialog owns its own focus behaviour, and it has to: this module is
  // loaded on demand, so the gallery cannot reach into a panel that does not
  // exist yet. A trap living in the parent would silently do nothing on the
  // first open of a session and work on every one after — the worst kind of
  // bug, because it never reproduces for the person who wrote it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPad;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      data-scrim
      style={{ paddingBottom: "max(clamp(16px, 4vh, 56px), env(safe-area-inset-bottom))" }}
      className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto px-5 pt-[clamp(16px,4vh,56px)]"
    >
      <div
        ref={panel}
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
            {/* `--tone-jade-fg`, not the raw `--jade` hue. The functional
                hues are identical in both themes by design, and #23c97f on the
                white overlay is about 2:1 — it only ever passed because the
                page opened dark. Its sibling tones already use the themed text
                pair; this one was the odd one out. */}
            <Fact label="Impact" tone="var(--tone-jade-fg)" body={item.impact} />
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

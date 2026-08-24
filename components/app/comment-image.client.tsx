"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from "lucide-react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Mono } from "@/components/coditu/mono";

/**
 * An image inside a story thread: a thumbnail, and a viewer when you ask for
 * one.
 *
 * ── Why it is small ────────────────────────────────────────────────────────
 * It used to render at its natural width, capped only by the column. A
 * screenshot of a web part is 2400px wide, so one pasted image pushed the rest
 * of the thread a full screen down and the conversation stopped being readable
 * as a conversation. A thumbnail keeps the thread a thread; the picture is one
 * click away and then it is as big as the screen allows.
 *
 * The height is `clamp(88px, 22vw, 132px)` and the width follows the picture,
 * so a row of screenshots stays a row on a phone and a wide panorama does not
 * become a hairline. `max-w-full` is what stops that same panorama from
 * overflowing a 320px column.
 *
 * ── Why the box exists before the bytes ────────────────────────────────────
 * `width` and `height` are the file's own, read from its header at upload time.
 * With them the thumbnail reserves exactly the right box and the thread does
 * not move when the image arrives — a thread that jumps while you are reading
 * it is the worst version of this feature. Without them (every image posted
 * before 2026-08-25) the box is a sensible default and the picture settles into
 * it; that is the degradation, and it is why nothing here treats them as
 * required.
 *
 * ── Why the viewer is `DialogShell` ────────────────────────────────────────
 * Because everything hard about a modal is already solved in it and was solved
 * for a recorded bug each time: the focus trap, the scroll lock that survives a
 * finger on iOS, focus returning to the thumbnail you opened it from, and the
 * bottom-sheet shape below `md`. A bespoke lightbox is those four bugs again.
 *
 * ── Why it is portalled ────────────────────────────────────────────────────
 * The thread renders INSIDE the item dialog's panel, which is
 * `overflow: hidden` — so a `position: fixed` scrim rendered in place is
 * clipped to the comment column and the "full screen" picture opens inside a
 * 300px box. Portalling to `<body>` is the same fix `cell-popover.client.tsx`
 * needs for its menus, for the same reason.
 *
 * Plain `<img>` rather than `next/image`: the source is `/api/attachments/…`,
 * a route that signs a fresh storage URL per request after checking the
 * reader — the optimiser could not cache that usefully and would only add a
 * second thing to invalidate.
 */

/** A default shape for an image whose dimensions were never recorded. */
const FALLBACK_ASPECT = "16 / 10";

/** What the viewer needs to know about one picture. */
interface Slide {
  src: string;
  alt: string;
}

/**
 * Every image in the same item, in document order.
 *
 * Read out of the DOM rather than threaded through a context, and that is a
 * deliberate trade. The thread is rendered on the SERVER — `comment-body.tsx`
 * is the security boundary and it stays there — so a client context would need
 * every image to register itself on mount and would still be wrong for the two
 * frames before it did. The DOM already holds the answer, in the right order,
 * including images inside acceptance criteria, and it is correct the instant
 * somebody clicks.
 */
function collectSlides(from: HTMLElement | null): Slide[] {
  if (!from) return [];
  const scope = from.closest("[data-image-scope]") ?? document.body;
  return [...scope.querySelectorAll<HTMLElement>("[data-thread-image]")]
    .map((node) => ({
      src: node.dataset.src ?? "",
      alt: node.dataset.alt ?? "",
    }))
    .filter((slide) => slide.src);
}

export function CommentImage({
  src,
  alt,
  width = null,
  height = null,
}: {
  src: string;
  alt: string;
  /** The file's own dimensions, when they were recorded. */
  width?: number | null;
  height?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const name = alt.trim();
  const aspect = width && height ? `${width} / ${height}` : FALLBACK_ASPECT;

  const openViewer = useCallback(() => {
    const found = collectSlides(buttonRef.current);
    const at = found.findIndex((slide) => slide.src === src);
    setSlides(found.length ? found : [{ src, alt: name }]);
    setIndex(at === -1 ? 0 : at);
    setOpen(true);
  }, [src, name]);

  /**
   * Escape closes the picture and NOT the item behind it.
   *
   * The thread lives inside the item dialog, which is also a `DialogShell`
   * listening for Escape on the document. Two bubble-phase listeners on the
   * same target both fire, so one press would close the picture and the item
   * under it. Catching it in the CAPTURE phase and stopping it there means the
   * innermost thing closes and nothing else hears about it — the same rule
   * `cell-popover.client.tsx` follows for its menus.
   *
   * The arrow keys ride along, for the same reason: they move between the
   * pictures in this item and nothing behind should act on them.
   */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (slides.length < 2) return;
      if (event.key === "ArrowRight") {
        event.stopPropagation();
        event.preventDefault();
        setIndex((at) => (at + 1) % slides.length);
      }
      if (event.key === "ArrowLeft") {
        event.stopPropagation();
        event.preventDefault();
        setIndex((at) => (at - 1 + slides.length) % slides.length);
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, slides.length]);

  /**
   * A source that 404s.
   *
   * Quiet, and honest: a bordered box the size the picture would have been,
   * with the alt text under it. Not the browser's broken-image glyph, which
   * looks like the app is broken, and not nothing, which looks like the person
   * never attached anything.
   *
   * This is a real state and not a theoretical one — every image posted before
   * the stable-reference fix carries an expired signed URL until the data
   * migration reaches it.
   */
  if (failed) {
    return (
      <span
        className="my-1 inline-flex max-w-full flex-col items-center justify-center gap-1 rounded-inner border border-dashed border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-center align-top"
        style={{ height: "clamp(88px, 22vw, 132px)", aspectRatio: aspect }}
      >
        <ImageOff size={14} strokeWidth={1.8} className="text-[var(--ink-faint)]" aria-hidden />
        <Mono size="meta" className="text-[var(--ink-faint)]">
          image unavailable
        </Mono>
        {name ? (
          <span className="line-clamp-2 text-[11px] leading-tight text-[var(--ink-faint)]">{name}</span>
        ) : null}
      </span>
    );
  }

  const current = slides[index] ?? { src, alt: name };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openViewer}
        aria-haspopup="dialog"
        aria-label={name ? `Open image: ${name}` : "Open image"}
        // Read by `collectSlides` when any image in this item is opened, so the
        // arrows traverse the whole item in document order.
        data-thread-image=""
        data-src={src}
        data-alt={name}
        className="group/thumb relative my-1 inline-flex max-w-full overflow-hidden rounded-inner border border-[var(--hairline)] bg-[var(--canvas)] align-top"
        style={{ height: "clamp(88px, 22vw, 132px)", aspectRatio: loaded ? undefined : aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          width={width ?? undefined}
          height={height ?? undefined}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="block h-full w-auto max-w-full object-cover"
        />

        {/* A quiet shimmer while the bytes are on their way. It occupies the
            box the image will occupy, so nothing moves when it arrives. */}
        {!loaded ? (
          <span
            aria-hidden
            className="absolute inset-0 animate-pulse bg-[var(--hairline)] motion-reduce:animate-none"
          />
        ) : null}

        {/* The affordance. Shown on hover and on keyboard focus — a control
            that only reveals itself to a mouse is a control half the team does
            not have. Never on a coarse pointer, where there is no hover to
            reveal it and tapping the picture is the obvious thing anyway. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[6px] top-[6px] flex size-[22px] items-center justify-center rounded-[6px] bg-[var(--overlay)] text-[var(--ink-muted)] opacity-0 transition-opacity duration-[var(--dur-micro)] group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100 [@media(pointer:coarse)]:hidden"
        >
          <Maximize2 size={12} strokeWidth={2} />
        </span>
      </button>

      {open
        ? createPortal(
            <DialogShell
              label={current.alt || "Image"}
              onClose={() => setOpen(false)}
              // Above the item dialog (60) and above a cell popover (80): this
              // is opened from inside one and must not appear beneath it.
              zIndex={90}
              maxWidth={1200}
              header={
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Mono
                    size="eyebrow"
                    className="block min-w-0 flex-1 truncate normal-case tracking-normal text-[var(--ink-muted)]"
                  >
                    {current.alt || "Image"}
                  </Mono>
                  {slides.length > 1 ? (
                    <Mono size="meta" className="shrink-0 tabular-nums text-[var(--ink-faint)]">
                      {index + 1} / {slides.length}
                    </Mono>
                  ) : null}
                </span>
              }
            >
              <Viewer
                slide={current}
                count={slides.length}
                onPrevious={() => setIndex((at) => (at - 1 + slides.length) % slides.length)}
                onNext={() => setIndex((at) => (at + 1) % slides.length)}
                onClose={() => setOpen(false)}
              />
            </DialogShell>,
            document.body
          )
        : null}
    </>
  );
}

/**
 * The open picture, and the two gestures that move it.
 *
 * **Pinch is not touched.** No `touch-action: none`, no `preventDefault` on a
 * multi-touch sequence — a two-finger gesture is handed straight to the
 * browser, because zooming into a screenshot of somebody's SCSS is the single
 * most useful thing this viewer does on a phone and trapping the gesture to
 * implement a worse version of it is a bad trade.
 *
 * So swipe only ever considers a **one-finger** sequence: horizontally to move
 * between pictures, downwards to close. Both thresholds are generous, and a
 * gesture that is mostly one and slightly the other does nothing rather than
 * guessing.
 */
function Viewer({
  slide,
  count,
  onPrevious,
  onNext,
  onClose,
}: {
  slide: Slide;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const start = useRef<{ x: number; y: number; single: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A new picture is a new load, and the shimmer has to come back or the
  // previous one appears to still be there while the next one arrives.
  // Adjusted during render rather than in an effect: an effect would paint one
  // frame of the OLD picture's "loaded" state under the new one's src.
  const [shownSrc, setShownSrc] = useState(slide.src);
  if (slide.src !== shownSrc) {
    setShownSrc(slide.src);
    setLoaded(false);
    setFailed(false);
  }

  const SWIPE_X = 60;
  const SWIPE_DOWN = 90;

  return (
    <div
      className="relative flex items-center justify-center p-3"
      onTouchStart={(event) => {
        if (event.touches.length !== 1) {
          // A second finger means a pinch. Abandon the gesture entirely rather
          // than tracking one of the two fingers.
          start.current = null;
          return;
        }
        const touch = event.touches[0];
        start.current = { x: touch.clientX, y: touch.clientY, single: true };
      }}
      onTouchMove={(event) => {
        if (event.touches.length > 1) start.current = null;
      }}
      onTouchEnd={(event) => {
        const from = start.current;
        start.current = null;
        if (!from?.single) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - from.x;
        const dy = touch.clientY - from.y;

        if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (count > 1) (dx < 0 ? onNext : onPrevious)();
          return;
        }
        if (dy > SWIPE_DOWN && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
      }}
    >
      {failed ? (
        <p className="flex flex-col items-center gap-2 px-6 py-16 text-center text-[13.5px] text-[var(--ink-faint)]">
          <ImageOff size={18} strokeWidth={1.8} aria-hidden />
          This image is not here any more.
          {slide.alt ? <span className="text-[12.5px]">{slide.alt}</span> : null}
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.src}
            alt={slide.alt}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            // Capped by the viewport rather than the natural size, so a
            // 2400px screenshot fits and a 200px icon is not stretched
            // into a blur.
            className="h-auto max-h-[76dvh] w-auto max-w-full rounded-inner"
          />
          {!loaded ? (
            <span
              role="status"
              className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center font-mono text-[11px] text-[var(--ink-faint)]"
            >
              loading…
            </span>
          ) : null}
        </>
      )}

      {count > 1 ? (
        <>
          <ViewerArrow side="left" onClick={onPrevious} />
          <ViewerArrow side="right" onClick={onNext} />
        </>
      ) : null}
    </div>
  );
}

function ViewerArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous image" : "Next image"}
      className={`absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[var(--hairline-strong)] bg-[var(--overlay)] text-[var(--ink-muted)] hover:text-[var(--ink)] ${
        side === "left" ? "left-2" : "right-2"
      }`}
      style={{ boxShadow: "var(--shadow-overlay)" }}
    >
      <Icon size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}

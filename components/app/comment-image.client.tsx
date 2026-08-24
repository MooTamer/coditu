"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2 } from "lucide-react";

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
 * Plain `<img>` rather than `next/image`: the source is a signed URL into a
 * private Supabase bucket that expires in an hour, so the optimiser could not
 * cache it usefully and would need every future storage host allowlisted in
 * next.config just to render a comment attachment.
 */
export function CommentImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  /**
   * Escape closes the picture and NOT the item behind it.
   *
   * The thread lives inside the item dialog, which is also a `DialogShell`
   * listening for Escape on the document. Two bubble-phase listeners on the
   * same target both fire, so one press would close the picture and the item
   * under it. Catching it in the CAPTURE phase and stopping it there means the
   * innermost thing closes and nothing else hears about it — the same rule
   * `cell-popover.client.tsx` follows for its menus.
   */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const name = alt.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={name ? `Open image: ${name}` : "Open image"}
        className="group/thumb relative my-1 inline-flex max-w-full overflow-hidden rounded-inner border border-[var(--hairline)] bg-[var(--canvas)] align-top"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          className="block h-[clamp(88px,22vw,132px)] w-auto max-w-full object-cover"
        />

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
              label={name || "Image"}
              onClose={() => setOpen(false)}
              // Above the item dialog (60) and above a cell popover (80): this
              // is opened from inside one and must not appear beneath it.
              zIndex={90}
              maxWidth={1200}
              header={
                <Mono
                  size="eyebrow"
                  className="block min-w-0 truncate normal-case tracking-normal text-[var(--ink-muted)]"
                >
                  {name || "Image"}
                </Mono>
              }
            >
              <div className="flex items-center justify-center p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={name}
                  // Capped by the viewport rather than the natural size, so a
                  // 2400px screenshot fits and a 200px icon is not stretched
                  // into a blur.
                  className="h-auto max-h-[76dvh] w-auto max-w-full rounded-inner"
                />
              </div>
            </DialogShell>,
            document.body
          )
        : null}
    </>
  );
}

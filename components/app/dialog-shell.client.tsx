"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useMounted } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * Everything the browser will Tab to.
 *
 * `[contenteditable]` is on the list because ProseMirror's editing surface is
 * tabbable without carrying a `tabindex`, and a trap that does not know about
 * it computes the wrong "last" element — Tab then walks straight past the
 * editor and out of the dialog into the page behind.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * `offsetParent` is null for anything `position: fixed`, so it reports plenty of
 * visible elements as hidden. Measure instead.
 */
function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * The modal shell every dialog in the app is built on.
 *
 * Focus is trapped, `Esc` closes, body scroll is locked, and focus returns to
 * whatever opened it. That last one is the part most modals get wrong: closing
 * a dialog and dropping focus back to `<body>` sends a keyboard user to the top
 * of the page, and they have to tab all the way back to the row they were on.
 *
 * **Below `md` it is a bottom sheet**: full width, against the bottom edge,
 * rounded at the top only, at least 60dvh tall. Above `md` it is the centred
 * dialog it has always been. One component, because everything that is hard
 * about it — the focus trap, `Esc`, the scroll lock, focus return, the height
 * cap — is identical in both, and each of those was written for a recorded bug.
 *
 * ## `variant="peek"` — the third shape, and the one the handoff asks for
 *
 * The returned prototype carries both states of the story panel in one object:
 *
 * ```js
 * peekJustify: full ? "center"                       : "flex-end",
 * peekWidth:   full ? (narrow ? "100%" : "min(1080px, 94vw)")
 *                   : "min(620px, 96vw)",
 * peekMargin:  full ? (narrow ? "0" : "24px")        : "0",
 * peekRadius:  full ? (narrow ? "0" : "18px")        : "18px 0 0 18px",
 * ```
 *
 * `flex-end` at `min(620px, 96vw)`, full height, rounded on the left only, is a
 * **side peek** — a panel docked to the right edge. Coditu shipped only the
 * second state, and `05-DECISIONS.md` recorded that as a deferred divergence.
 * It is not deferred any more.
 *
 * Everything hard is still shared, which is the whole reason this is a variant
 * and not a second component: the focus trap, `Esc`, the scroll lock, focus
 * return and the height cap are identical, and each was written for a bug that
 * would come straight back in a copy.
 *
 * **Below `md` the peek is still the sheet.** The handoff's breakpoint table
 * says the story is a *"Full-screen page"* below 768 and a *"Side peek at 620px"*
 * from 768 up — so the peek geometry is applied at `md` and above only, and the
 * mobile shape is unchanged.
 *
 * The panel is capped at the height of the scrim's content box and scrolls its
 * own body. Letting the panel grow to its content and scrolling the SCRIM
 * instead reads as a dialog sliced off by the bottom of the screen: a long
 * thread starts with its header on-screen and its footer nowhere, and the close
 * button scrolls away with it. Capping the panel means the frame is always
 * whole and only the contents move.
 */
export function DialogShell({
  label,
  onClose,
  header,
  footer,
  children,
  maxWidth = 1080,
  zIndex = 60,
  variant = "dialog",
}: {
  /** Accessible name for the dialog. */
  label: string;
  onClose: () => void;
  /** Rendered in the fixed header, before the close button. */
  header: ReactNode;
  /** Pinned below the scrolling body. Where a dialog's actions belong — a
   *  Create button that scrolls out of sight is a Create button nobody finds. */
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  zIndex?: number;
  /**
   * `dialog` is the centred panel every dialog in this app has always been.
   * `peek` is the handoff's 620px side peek: docked right, full height, rounded
   * on the left only, at `md` and above. Below `md` both are the bottom sheet.
   */
  variant?: "dialog" | "peek";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;

    /**
     * ── The scroll lock, and the version of it that was wrong ──────────────
     *
     * `body { overflow: hidden }` stops a WHEEL. It does not stop a **touch**
     * on iOS Safari, which is how a person reading a long thread in a sheet
     * ends up watching the sprint table slide about behind it.
     *
     * The usual fix for that is to take the body out of flow — `position:
     * fixed` at a negative offset — and restore the scroll on the way out.
     * **It was tried here and it is wrong for this app**, measured rather than
     * argued: an item sheet is an INTERCEPTED route, so it arrives by client
     * navigation and leaves through `router.back()`, and the router does its
     * own scroll restoration on that. Pinning the body collapses the document
     * to the viewport, and the two then fight — from 900px down the list, the
     * old lock came back to exactly 900 and the fixed-body one landed on 596,
     * then 1251, then 442 on three consecutive runs.
     *
     * So the document scroll is never touched. `overflow: hidden` handles the
     * wheel; `touch-action: none` on the scrim is what handles the finger — a
     * touch that starts anywhere in the viewport starts on the scrim, and the
     * browser performs no panning for it. The panel's own scroller opts back in
     * with `touch-action: pan-y` and keeps its `overscroll-behavior: contain`,
     * so a flick that reaches the end of the thread is not handed to the page.
     */
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    // Compensate for the scrollbar we are about to remove, or the page shifts
    // sideways underneath the scrim as the dialog opens.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        isVisible
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      // Return focus to whatever opened this. Guarded, because the opener may
      // have been unmounted by a revalidation while the dialog was open.
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [close]);

  /**
   * ── Portalled to `document.body`, and it is not optional ───────────────────
   *
   * `position: fixed` resolves against the nearest ancestor with a `filter`, a
   * `transform`, `backdrop-filter`, `contain` or a `will-change` that names one
   * of them — not against the viewport. `<Reveal>` sets **both** a transform and
   * `filter: blur(0px)`, and `blur(0px)` is a filter value rather than `none`,
   * so the containing block survives the animation and never goes away.
   *
   * Mounting a dialog anywhere inside a revealed section therefore gave a scrim
   * of 1046×65 pinned to the filter bar instead of one covering the screen. It
   * rendered, it was in the accessibility tree, it had a role and a label, and
   * on screen it was a grey stripe. Every static check passed.
   *
   * `cell-popover.client.tsx` already portals for the same class of reason —
   * escaping the table's scroll box — so this is the house answer, applied to
   * the primitive rather than to each caller.
   */
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div
      onClick={close}
      data-scrim
      data-variant={variant}
      // `touch-action: none` is half the scroll lock — see the note above. The
      // bottom gutter lives in `globals.css`, keyed on `[data-scrim]`, because
      // it differs by breakpoint and an inline style cannot hold a media query:
      // a sheet sits against the bottom edge with only the home indicator's
      // inset beneath it, where a centred dialog wants a real margin.
      style={{ zIndex, touchAction: "none" }}
      // Below `md` the panel is pushed to the BOTTOM of the scrim and given no
      // horizontal gutter: `items-end` plus `px-0`, which is what turns the
      // same component into a sheet. Above `md` it is the centred-at-the-top
      // dialog it has always been, unchanged.
      className={cn(
        "fixed inset-0 flex items-end justify-center overflow-y-auto px-0",
        // The peek is docked to the right edge and fills the height, so it takes
        // no top padding and no horizontal gutter — a 24px gap would make it a
        // floating panel rather than a docked one.
        variant === "peek"
          ? "md:items-stretch md:justify-end md:px-0 md:pt-0"
          : "pt-[clamp(12px,3vh,40px)] md:items-start md:px-4"
      )}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // A docked panel arrives from the edge it is docked to; a centred one
        // rises. Below `md` both are the sheet and both rise — see `globals.css`.
        data-reveal={variant === "peek" ? "peek" : "surface"}
        // `max-h-full` resolves against the scrim's content box — inset-0 minus
        // its own padding — so the panel can never reach an edge. `min-h-0` on
        // the scroller below is what actually lets it shrink: a flex child
        // defaults to `min-height: auto`, refuses to go below its content, and
        // pushes the overflow back out of the panel it was supposed to stay in.
        // Below `md`: full width, square-cornered at the bottom because it is
        // against the edge of the screen, and at least 60dvh so a sheet that
        // opens with two lines in it still reads as a sheet rather than a
        // toast. `maxWidth` is ignored there — a 1080px cap on a 390px screen
        // is not a cap.
        className={cn(
          "flex max-h-full w-full flex-col overflow-hidden border border-[var(--hairline-strong)] bg-[var(--overlay)] outline-none",
          // `rounded-b-none` is not redundant. `rounded-t-*` sets only the two
          // TOP corners, and `globals.css` gives every `:focus-visible`
          // element `border-radius: 4px` as a shorthand — which lands on the
          // two corners the utility left alone. WebKit treats the programmatic
          // `.focus()` this panel takes as the trap's anchor as focus-visible
          // where Chromium does not, so on iOS the sheet grew 4px bottom
          // corners floating above the edge of the screen. Naming all four
          // corners is what stops the shorthand reaching any of them.
          "min-h-[60dvh] rounded-t-section rounded-b-none md:min-h-0",
          variant === "peek"
            // `rounded-r-none` for the same reason `rounded-b-none` is spelled
            // out above: `globals.css` gives every `:focus-visible` element a
            // 4px radius shorthand, and it lands on whichever corners a
            // one-sided utility left alone. WebKit treats the programmatic
            // `.focus()` the trap takes as focus-visible; Chromium does not. So
            // every corner is named.
            //
            // The width is a `md:` UTILITY rather than the inline style below,
            // and that is not a stylistic preference: an inline `maxWidth`
            // cannot hold a media query, so `min(620px, 96vw)` applied on a
            // phone too and made the sheet 374px wide on a 390px screen —
            // caught by *"an item opens against the bottom edge, full width"*.
            // Below `md` the peek is the sheet, and a sheet is full width.
            ? "md:h-full md:max-h-full md:max-w-[min(620px,96vw)] md:rounded-l-section md:rounded-r-none"
            : "md:rounded-section"
        )}
        style={{
          boxShadow: "var(--shadow-overlay)",
          // Ignored for a peek, whose width is the utility above. `undefined`
          // rather than a number, so nothing inline can win over the media
          // query that is doing the work.
          maxWidth: variant === "peek" ? undefined : maxWidth,
        }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--raised)] px-5 py-[14px]">
          {header}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="ml-auto flex size-[34px] shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {/* `overscroll-contain` so reaching the end does not hand the wheel to
            the page behind the scrim, and `touch-action: pan-y` to opt back in
            to the vertical panning the scrim's `touch-action: none` just took
            away from everything inside it. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ touchAction: "pan-y" }}
        >
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--raised)] px-5 py-[14px]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

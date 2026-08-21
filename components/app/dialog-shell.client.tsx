"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;

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

  return (
    <div
      onClick={close}
      data-scrim
      style={{
        zIndex,
        paddingBottom: "max(clamp(12px, 3vh, 40px), env(safe-area-inset-bottom))",
      }}
      className="fixed inset-0 flex items-start justify-center overflow-y-auto px-4 pt-[clamp(12px,3vh,40px)]"
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-reveal="surface"
        // `max-h-full` resolves against the scrim's content box — inset-0 minus
        // its own padding — so the panel can never reach an edge. `min-h-0` on
        // the scroller below is what actually lets it shrink: a flex child
        // defaults to `min-height: auto`, refuses to go below its content, and
        // pushes the overflow back out of the panel it was supposed to stay in.
        className="flex max-h-full w-full flex-col overflow-hidden rounded-section border border-[var(--hairline-strong)] bg-[var(--overlay)] outline-none"
        style={{ boxShadow: "var(--shadow-overlay)", maxWidth }}
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
            the page behind the scrim. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--raised)] px-5 py-[14px]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

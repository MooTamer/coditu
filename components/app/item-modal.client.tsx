"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { Mono } from "@/components/coditu/mono";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The item detail modal.
 *
 * Focus is trapped, `Esc` closes, body scroll is locked, and focus returns to
 * whatever opened it. That last one is the part most modals get wrong: closing
 * a dialog and dropping focus back to `<body>` sends a keyboard user to the top
 * of the page, and they have to tab all the way back to the row they were on.
 */
export function ItemModal({ itemKey, children }: { itemKey: string; children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    // Compensate for the scrollbar we are about to remove, or the page shifts
    // sideways underneath the scrim as the modal opens.
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
        (el) => el.offsetParent !== null
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
      // Return focus to the row that opened this. Guarded, because the opener
      // may have been unmounted by a revalidation while the modal was open.
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [close]);

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 py-[clamp(12px,3vh,40px)]"
      style={{ background: "var(--scrim)", backdropFilter: "blur(10px)" }}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Work item ${itemKey}`}
        tabIndex={-1}
        data-reveal="surface"
        className="w-full max-w-[1080px] overflow-hidden rounded-section border border-[var(--hairline-strong)] bg-[var(--overlay)] outline-none"
        style={{ boxShadow: "var(--shadow-overlay)" }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] bg-[var(--raised)] px-5 py-[14px]">
          <Mono size="key" className="text-[var(--accent)]">
            {itemKey}
          </Mono>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="ml-auto flex size-[34px] items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

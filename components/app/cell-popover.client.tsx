"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * The editing affordance for one table cell.
 *
 * Two things about it are load-bearing.
 *
 * **The trigger fills the cell.** Not the value inside it — the cell. Aiming at
 * a 13px name to change an assignee is a target the size of the word, and the
 * rest of the column looks inert while being the obvious place to click. The
 * `<td>` gives up its padding to the button, which takes the whole box.
 *
 * **The panel is portalled to `<body>`.** The table lives inside
 * `overflow: auto`, and an absolutely-positioned menu inside a scroll container
 * is clipped by it: open the status menu on the last row and the bottom half is
 * simply gone. A fixed panel positioned from the trigger's rect escapes that,
 * and it can flip up or clamp sideways when it would otherwise leave the
 * viewport — which on a narrow screen is most of the time.
 */
const GAP = 6;
const MARGIN = 8;

/**
 * The two shapes the trigger takes.
 *
 * `cell` fills a table cell, taking the padding the `<td>` gave up. `field`
 * looks like the form controls in the New item dialog and sits in a normal
 * flow — same popover, same keyboard path, same portal. A second popover
 * implementation for the dialog would be a second set of Escape, focus and
 * clipping bugs to find.
 */
const TRIGGER: Record<"cell" | "field", string> = {
  cell: "flex h-full w-full cursor-pointer items-center px-4 text-left",
  field:
    "flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-control border " +
    "border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-left text-[14px]",
};

export function CellPopover({
  label,
  value,
  disabled,
  disabledReason,
  align = "start",
  width = 200,
  busy,
  variant = "cell",
  className,
  children,
}: {
  /** Announced on the trigger: "Status: peer review. Change status." */
  label: string;
  /** What the cell shows when it is not being edited. */
  value: ReactNode;
  disabled?: boolean;
  /** Why, in words. A control that disappears reads as a bug. */
  disabledReason?: string;
  align?: "start" | "end";
  width?: number;
  busy?: boolean;
  variant?: "cell" | "field";
  className?: string;
  /** The editor. Gets `close` so a chosen option can dismiss the panel. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const height = panel.offsetHeight;
    const panelWidth = panel.offsetWidth;

    // Below by default; above when below would run off the bottom AND there is
    // more room up there. Never both — a panel that flips into less space is
    // just a differently clipped panel.
    const below = rect.bottom + GAP;
    const above = rect.top - GAP - height;
    const fitsBelow = below + height <= window.innerHeight - MARGIN;
    const top = fitsBelow || above < MARGIN ? below : above;

    const raw = align === "end" ? rect.right - panelWidth : rect.left;
    const left = Math.min(
      Math.max(raw, MARGIN),
      Math.max(MARGIN, window.innerWidth - panelWidth - MARGIN)
    );

    setPosition({ top, left });
  }, [align]);

  // Measure after the panel exists, before the browser paints it — otherwise it
  // renders once at 0,0 and jumps.
  //
  // The stale position from the previous open is deliberately NOT cleared here.
  // Clearing it is a setState in an effect body — a cascading render for no
  // gain, because a layout effect runs after the DOM mutation and before the
  // browser paints, so the panel is measured and moved in the same commit it
  // was created in. Nothing stale is ever on screen.
  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // The item modal listens for Escape on the document. Without this, one
      // press closes the menu AND the dialog behind it.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }

    // Capture, so the table's own scroll container is heard as well as the
    // window's — the panel is fixed, so it does not travel with either.
    const reposition = () => place();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  if (disabled) {
    return (
      <span
        title={disabledReason}
        aria-disabled="true"
        className={cn(
          variant === "cell"
            ? "flex h-full w-full items-center px-4"
            : "flex h-[38px] w-full items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[14px] text-[var(--ink-muted)]",
          className
        )}
      >
        {value}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          // The task cell's stretched link sits behind these; without this a
          // click on the assignee opens the item instead of the menu.
          event.stopPropagation();
          setOpen((was) => !was);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy}
        aria-label={label}
        // The hover and open surface is `--canvas`, the same tone the row
        // already hovers to, and the open state is marked with an inset rule
        // rather than a darker fill. It has to be: an unassigned cell's text is
        // `--ink-faint`, which clears 4.5:1 on `--canvas` by about 0.03, and
        // laying a 10% black wash over it drops it under AA. axe caught it.
        className={cn(
          TRIGGER[variant],
          "transition-colors duration-[var(--dur-micro)] hover:bg-[var(--canvas)]",
          open && "bg-[var(--canvas)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
          className
        )}
      >
        {value}
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              data-cell-popover
              data-reveal="surface"
              onClick={(event) => event.stopPropagation()}
              className="fixed z-[80] overflow-hidden rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] p-1"
              style={{
                width,
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                // Hidden until measured, rather than rendered off-screen and
                // moved: a menu that flickers in from the corner is worse than
                // one that appears a frame later.
                visibility: position ? "visible" : "hidden",
                boxShadow: "var(--shadow-overlay)",
                maxHeight: `calc(100dvh - ${MARGIN * 2}px)`,
                overflowY: "auto",
              }}
            >
              {children(close)}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/**
 * Roving focus for a list of options inside a popover.
 *
 * Arrow keys, Home and End. A menu you can open with the keyboard and then only
 * traverse with Tab is a menu that works by accident.
 */
export function optionListKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  if (buttons.length === 0) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    buttons[(index + 1) % buttons.length]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    buttons[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    buttons[buttons.length - 1]?.focus();
  }
}

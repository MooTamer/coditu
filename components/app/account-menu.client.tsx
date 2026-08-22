"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LogOut, Settings } from "lucide-react";

import { PersonAvatar, type AvatarPerson } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import { signOut } from "@/lib/actions/auth";

/**
 * Who you are signed in as, and the two things you can do about it.
 *
 * ── Why this had to exist ──────────────────────────────────────────────────
 * `signOut` was reachable from exactly one place: the ⌘K palette. The palette's
 * trigger carries `hidden … sm:flex`, and ⌘K is not a gesture a phone has — so
 * **on a phone there was no way to sign out at all.** Settings was worse: it
 * rendered, it worked, and nothing anywhere linked to it, so the only way in
 * was to type the URL, which inside an installed PWA is not possible either.
 *
 * The palette is untouched. It simply stops being the only home for either.
 *
 * ── Why it is hand-rolled ──────────────────────────────────────────────────
 * `radix-ui` is already a dependency and its DropdownMenu would do all of this.
 * It is not used because this component lands in the **app shell**, which is at
 * 106.6KB of a 110KB gated budget — Radix's menu drags in popper, focus-scope,
 * dismissable-layer and roving-focus behind it, and the first thing anyone would
 * notice is `npm run budgets` going red.
 *
 * So it follows the pattern this repo already worked out for menus, in
 * `cell-popover.client.tsx`: a panel portalled to `<body>` and positioned from
 * the trigger's own rect. The reason there was `overflow: auto` clipping a
 * table menu; the reason here is the topbar's `sticky` + `z-30` stacking
 * context, which does the same thing to anything that tries to escape it.
 */

const GAP = 8;
const MARGIN = 8;

export interface AccountIdentity extends AvatarPerson {
  email: string | null;
  role: string;
}

export function AccountMenu({ me }: { me: AccountIdentity }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const [signingOut, startSignOut] = useTransition();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    []
  );

  /**
   * Measured from the TRIGGER, never from the panel — which is what lets the
   * position be known before the panel exists.
   *
   * `cell-popover.client.tsx` has to measure its own panel (its width and
   * height decide whether it flips or clamps) so it renders one hidden frame
   * first. Copying that here was a real bug and it cost an hour: on the *first*
   * open `position` is null, the panel paints `visibility: hidden`, and
   * `.focus()` on a hidden element silently does nothing — so the menu opened
   * with focus still on the trigger. On the second open the stale position from
   * the first made it visible and focus worked, which is exactly the shape of
   * bug that gets called "flaky".
   *
   * This panel is a fixed 262px anchored to the trigger's right edge, so the
   * trigger's own rect is all there is to know. Position is set in the same
   * event that opens it, the panel is never hidden, and focus lands every time.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.bottom + GAP,
      // Right-aligned to the trigger, clamped so it cannot leave a 390px
      // screen — where this control sits about 16px from the edge.
      right: Math.max(MARGIN, window.innerWidth - rect.right),
    });
  }, []);

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (!was) place();
      return !was;
    });
  }, [place]);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // A click elsewhere is a click on something else — do not steal the focus
      // back to the trigger on the way out.
      close(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    }

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
  }, [open, close, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        // The name is the label, not "account menu": a screen reader user
        // hearing "Mohamed Tamer, menu" knows both whose account it is and that
        // it opens — which matters on a shared machine.
        aria-label={`${me.fullName} — account`}
        // 44px on every pointer, not just a coarse one. This is the control that
        // holds the only way to sign out on a phone.
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-[var(--canvas)]"
      >
        <PersonAvatar person={me} size={28} fontSize={11} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              data-account-menu
              data-reveal="surface"
              className="fixed z-[80] w-[262px] overflow-hidden rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)]"
              style={{
                top: position?.top ?? 0,
                right: position?.right ?? 0,
                boxShadow: "var(--shadow-overlay)",
              }}
            >
              {/* Who, before what. Deliberately outside the `role="menu"`
                  below: a menu whose children are not all menu items is an
                  `aria-required-children` violation, and axe is a gate here. */}
              <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
                <PersonAvatar person={me} size={34} fontSize={13} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{me.fullName}</span>
                  {me.email ? (
                    <Mono size="meta" className="truncate text-[var(--ink-faint)]">
                      {me.email}
                    </Mono>
                  ) : null}
                  <Mono size="meta" className="text-[var(--ink-muted)]">
                    {me.role}
                  </Mono>
                </span>
              </div>

              <div
                role="menu"
                aria-label="Account"
                onKeyDown={menuKeyDown}
                className="flex flex-col p-1"
              >
                <Link
                  role="menuitem"
                  data-autofocus
                  href="/app/settings"
                  prefetch={false}
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center gap-3 rounded-control px-3 text-[13.5px] font-medium hover:bg-[var(--canvas)]"
                >
                  <Settings size={15} strokeWidth={1.9} aria-hidden />
                  Settings
                </Link>

                <button
                  role="menuitem"
                  type="button"
                  disabled={signingOut}
                  aria-busy={signingOut}
                  onClick={() => startSignOut(() => void signOut())}
                  className="flex h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-left text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:opacity-60"
                >
                  <LogOut size={15} strokeWidth={1.9} aria-hidden />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/**
 * Arrows, Home and End across the two items.
 *
 * A `role="menu"` that can only be traversed with Tab is a menu that works by
 * accident — assistive technology switches to application mode on the role and
 * stops passing Tab through in the first place. Both items stay tabbable as
 * well, because this is a popover on a page and not a modal.
 */
function menuKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']")];
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    items[(index + 1) % items.length]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    items[(index - 1 + items.length) % items.length]?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    items[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    items[items.length - 1]?.focus();
  }
}

"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

import { CoditusMark } from "@/components/coditu/coditus-mark";
import { cn } from "@/lib/utils";

/**
 * One navigation destination, with a pending state that arrives on the next
 * frame instead of when the server does.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Every route under `/app` is dynamic and none of them are prefetched. That is
 * deliberate and measured — `rail.client.tsx` carries the numbers — but it left
 * a real hole: a tap produced *nothing at all* until the whole server render
 * came back. On a desk that is 270ms and forgivable. On a phone on mobile data
 * it is long enough to tap the same item twice.
 *
 * `useLinkStatus()` closes it, and the one rule about it is structural: it must
 * be read by a component rendered INSIDE the `<Link>`, not by the one that
 * renders the Link. Hence the split below — `NavLink` renders the anchor,
 * `NavBody` is its child and is the only thing that may ask.
 *
 * ── Why the pending frame is not just a spinner ─────────────────────────────
 * `prefers-reduced-motion` stops `.cd-spin` outright, so a spinner alone would
 * be an invisible pending state for exactly the readers least able to tolerate
 * an unexplained delay. So the *surface* changes too: the tapped item takes the
 * active background immediately, which is a static change and reads the same
 * either way. The mark is the confirmation, not the message.
 */
export function NavLink({
  href,
  label,
  active,
  className,
  pendingClassName,
  children,
}: {
  href: string;
  /** The `title`, and what the destination is called. */
  label: string;
  active: boolean;
  /** Geometry for the inner box — the anchor itself carries no padding. */
  className?: string;
  /** Added to the inner box while the navigation is in flight. */
  pendingClassName?: string;
  /** Receives the pending flag so an icon slot can swap to the mark. */
  children: (pending: boolean) => ReactNode;
}) {
  return (
    <Link
      href={href}
      /**
       * Not prefetched, and this is measured rather than assumed — the full
       * numbers are in `rail.client.tsx`. Turning it back on would restore 28
       * speculative server renders per sprint-page view to buy 8ms of
       * navigation. The pending state below is what that 8ms was really for.
       */
      prefetch={false}
      title={label}
      aria-current={active ? "page" : undefined}
      className="block rounded-control outline-offset-2"
    >
      <NavBody className={className} pendingClassName={pendingClassName}>
        {children}
      </NavBody>
    </Link>
  );
}

function NavBody({
  className,
  pendingClassName,
  children,
}: {
  className?: string;
  pendingClassName?: string;
  children: (pending: boolean) => ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      // A stable hook for the specs. "Is it pending" is otherwise only visible
      // as a computed background colour, which is exactly the kind of assertion
      // that goes green for the wrong reason.
      data-nav-pending={pending ? "" : undefined}
      className={cn(className, pending && pendingClassName)}
    >
      {children(pending)}
    </span>
  );
}

/**
 * The icon slot: the destination's own icon, or the rotating Coditu mark while
 * that destination is being fetched.
 *
 * The mark is the app's only spinner — see `globals.css` — so nothing new is
 * introduced here. `aria-hidden` on both: the link already says where it goes,
 * and swapping its accessible name mid-navigation would announce "Loading" over
 * the top of a reader who is already moving.
 */
export function NavIcon({
  Icon,
  pending,
  size = 18,
  strokeWidth = 1.7,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  pending: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  if (!pending) return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />;

  // 20px is the mark's stated minimum — below it the aperture closes up and it
  // stops reading as the mark at all (01-DESIGN-SYSTEM.md §7). An 18px icon
  // slot therefore gets a 20px mark that bleeds a pixel each side into the gap,
  // rather than a 18px mark that is no longer the mark. `shrink-0` because a
  // flex item larger than its container is otherwise squashed back down to it.
  return <CoditusMark size={Math.max(size, MARK_MIN)} spin className="shrink-0" />;
}

/** `01-DESIGN-SYSTEM.md` §7: "Minimum sizes: mark 20px". */
const MARK_MIN = 20;

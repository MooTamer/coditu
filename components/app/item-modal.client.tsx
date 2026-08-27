"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Mono } from "@/components/coditu/mono";

/**
 * The story side peek.
 *
 * Everything modal about it — focus trap, `Esc`, scroll lock, focus return, and
 * the capped panel that scrolls its own body — lives in `DialogShell`, which
 * this and the New item dialog share. Two copies of a focus trap is two copies
 * that drift, and the one that drifts is always the one without the specs.
 *
 * ## It is a peek now, and it has a way out of itself
 *
 * The returned handoff's breakpoint table asks for a *"Side peek at 620px with
 * an Open-as-full-page action"* from 768px up, and the prototype's own header
 * carries `toggleFull` with the label *"Open as full page"* / *"Back to side
 * peek"*. Coditu had the centred dialog and a close button, and
 * `05-DECISIONS.md` recorded both absences as deferred divergences. Neither is
 * deferred any more.
 *
 * ## "Open as full page" is a plain `<a>`, and that is the whole trick
 *
 * The prototype toggles a boolean because it is one file with no router. Here
 * the peek **is a URL** — an intercepted route — and the full page is *the same
 * URL* rendered without the interception. So a `<Link>` to it does nothing at
 * all: the router is already on that URL, and a soft navigation to where you
 * are is a no-op. (It was a `<Link replace>` for an hour and the peek simply
 * stayed open; the local flow spec found it.)
 *
 * **Route interception is bypassed by a hard navigation**, which is exactly
 * what a plain anchor performs. One document request, the non-intercepted route
 * renders, and the address bar was already right — so the link somebody copies
 * from either state opens the peek for whoever they send it to.
 *
 * The cost is a full page load, which is the correct cost: the full page is a
 * different render of the same data, and pretending otherwise is what produced
 * a control that did nothing.
 *
 * `BackToPeek` on the full page is the mirror image and needs the opposite
 * trick — see `back-to-peek.client.tsx`.
 */
export function ItemModal({
  itemKey,
  fullHref,
  children,
}: {
  itemKey: string;
  /** The same story, as a page. */
  fullHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  return (
    <DialogShell
      variant="peek"
      label={`Work item ${itemKey}`}
      onClose={close}
      header={
        <>
          <Mono size="key" className="text-[var(--accent)]">
            {itemKey}
          </Mono>
          <a
            href={fullHref}
            data-open-full-page
            // 34px to match the close button beside it; both are above the
            // 44px floor only at the row's height, which is why the row is
            // `py-[14px]`. On a phone the peek is the sheet and this is the
            // first control a thumb meets, so it takes the full 44.
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--hairline)] px-[11px] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] md:min-h-[34px]"
          >
            <Maximize2 size={13} strokeWidth={1.9} aria-hidden />
            <span className="hidden sm:inline">Open as full page</span>
            <span className="sm:hidden">Full page</span>
          </a>
        </>
      }
    >
      {children}
    </DialogShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { CoditusLockup } from "@/components/coditu/coditus-mark";
import { ThemeToggle } from "@/components/app/theme-toggle.client";
import { nav } from "@/lib/marketing-content";
import { cn } from "@/lib/utils";

/**
 * The sticky site header.
 *
 * It shrinks from 88px to 64px past 120px of scroll and grows a hairline, both
 * of which the design drives from a scroll listener. That listener writes
 * `data-condensed` on the element and CSS does the rest, so the transition is
 * off the main thread and there is no per-frame style write.
 *
 * Below `md` the links collapse into a sheet. The sheet is a plain
 * `<dialog>`-less panel rather than a portal: it is inside the header, so focus
 * order already matches reading order and Esc has one obvious handler.
 */
export function SiteNav({ email }: { email: string }) {
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setCondensed(window.scrollY > 120);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The sheet closes on Esc and on any navigation, and it must never be left
  // open behind a resize into the desktop layout.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => media.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onChange);
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b",
        "bg-[color-mix(in_srgb,var(--canvas)_82%,transparent)] backdrop-blur-[16px] backdrop-saturate-[160%]",
        "transition-[border-color] duration-[220ms]",
        condensed ? "border-hairline" : "border-transparent"
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-[88px] max-w-[1240px] items-center gap-4 px-[var(--site-gutter)]",
          "transition-[height] duration-[220ms] ease-[var(--ease-entrance)]",
          condensed && "h-16"
        )}
      >
        <Link
          href="#top"
          aria-label="Coditu — back to top"
          className="flex min-h-11 min-w-0 shrink-0 items-center rounded-control"
        >
          <CoditusLockup markSize={30} className="cd-mark-hover" />
        </Link>

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-0.5 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-pill px-3.5 py-2 text-[15px] text-ink-muted transition-colors duration-[160ms] hover:bg-hairline hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5 md:ml-0">
          <ThemeToggle className="size-11" />

          <a
            href={`mailto:${email}`}
            className="signal-gradient hidden h-11 items-center rounded-control px-5 text-[15px] font-semibold text-[#07090E] transition-transform duration-[200ms] ease-[var(--ease-entrance)] hover:-translate-y-0.5 sm:inline-flex"
          >
            Request a call
          </a>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-nav-sheet"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex size-11 items-center justify-center rounded-control border border-hairline text-ink-muted transition-colors hover:bg-hairline hover:text-ink md:hidden"
          >
            {open ? <X size={17} strokeWidth={1.7} aria-hidden /> : <Menu size={17} strokeWidth={1.7} aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="site-nav-sheet"
          // The sheet reaches the bottom of the screen on a phone, so its last
          // link must clear the home indicator.
          style={{
            paddingLeft: "max(var(--site-gutter), env(safe-area-inset-left))",
            paddingRight: "max(var(--site-gutter), env(safe-area-inset-right))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          className="border-t border-hairline bg-[var(--canvas)] pt-4 md:hidden"
        >
          <nav aria-label="Sections" className="flex flex-col">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center border-b border-hairline text-[17px] text-ink last:border-b-0"
              >
                {item.label}
              </a>
            ))}
            <a
              href={`mailto:${email}`}
              onClick={() => setOpen(false)}
              className="signal-gradient mt-4 flex h-12 items-center justify-center rounded-control text-[15px] font-semibold text-[#07090E] sm:hidden"
            >
              Request a call
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

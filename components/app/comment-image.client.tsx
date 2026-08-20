"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * An inline comment image, with a keyboard-navigable lightbox.
 *
 * Plain `<img>` rather than `next/image`: the source is a signed URL into a
 * private Supabase bucket that expires in an hour, so the optimiser could not
 * cache it usefully and would need every future storage host allowlisted in
 * next.config just to render a comment attachment.
 */
export function CommentImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block max-w-full overflow-hidden rounded-inner border border-[var(--hairline)]"
        aria-label={alt ? `Open image: ${alt}` : "Open image"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block h-auto max-w-full" loading="lazy" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Image"}
          onClick={close}
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: "var(--scrim)", backdropFilter: "blur(10px)" }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close image"
            autoFocus
            className="absolute right-4 top-4 flex size-[34px] items-center justify-center rounded-control border border-[var(--hairline-strong)] bg-[var(--overlay)] text-[var(--ink)]"
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-inner"
          />
        </div>
      ) : null}
    </>
  );
}

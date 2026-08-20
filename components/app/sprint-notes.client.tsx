"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Mono } from "@/components/coditu/mono";
import { calendarDate } from "@/lib/format";

/**
 * The sprint notes panel.
 *
 * It has to read as a written note, never as a form field — so: prose at
 * 15px/1.65, no border box, no label, and the "discuss before implementing"
 * convention rendered as a 2px amber left rule rather than a callout component.
 *
 * Markdown here is deliberately minimal. The notes are one or two paragraphs
 * with at most a bolded line, and pulling in a markdown pipeline to render that
 * would ship a parser to every sprint page for no gain. Anything richer belongs
 * in a comment, which has a real editor.
 */
export function SprintNotes({
  notes,
  author,
  writtenOn,
}: {
  notes: string;
  author: string | null;
  writtenOn: string | null;
}) {
  const [open, setOpen] = useState(true);
  const paragraphs = notes.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--canvas)]">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-[10px] px-6 py-[14px] text-left"
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms" }}
        />
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Sprint notes
        </Mono>
        {author ? (
          <span className="text-[13.5px] text-[var(--ink-muted)]">
            written by {author}
            {writtenOn ? ` · ${calendarDate(writtenOn)}` : ""}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="max-w-[78ch] pb-6 pl-[50px] pr-6">
          {paragraphs.map((paragraph, index) => {
            // A whole paragraph wrapped in ** is the highlight convention: it
            // means "discuss this before implementing".
            // [\s\S] rather than the `s` flag: tsconfig targets ES2017, which predates it.
            const highlight = /^\*\*([\s\S]+)\*\*$/.exec(paragraph);
            if (highlight) {
              return (
                <p
                  key={index}
                  className="mt-[14px] border-l-2 pl-4 text-[15px] leading-[1.65] text-[var(--ink)] first:mt-0"
                  style={{ borderColor: "var(--amber)" }}
                >
                  {highlight[1]}
                </p>
              );
            }
            return (
              <p key={index} className="mt-[14px] text-[15px] leading-[1.65] text-[var(--ink)] first:mt-0">
                {paragraph}
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useId, useState } from "react";

import { SectionHead, SiteSection } from "@/components/site/shell";
import { faq } from "@/lib/marketing-content";

/**
 * The FAQ.
 *
 * A plus that rotates into a minus, and one answer open at a time — which is
 * the design's behaviour, not an accordion library's. The answer stays in the
 * DOM when collapsed via `hidden`, so browser find-in-page can still reach it
 * and the panel does not have to be re-created to be read.
 */
export function Faq() {
  const [open, setOpen] = useState(0);
  const base = useId();

  return (
    <SiteSection id="faq" label="FAQ">
      <SectionHead id="faq-title" n="07" title="Common questions" />

      <div className="mt-5 max-w-[900px]">
        {faq.map((entry, index) => {
          const expanded = open === index;
          const panelId = `${base}-panel-${index}`;
          const buttonId = `${base}-button-${index}`;

          return (
            <div key={entry.question} className="border-b border-hairline">
              <h3>
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? -1 : index)}
                  className="flex w-full cursor-pointer items-center gap-[18px] py-[22px] text-left text-[17px] font-medium tracking-[-0.01em] text-ink"
                >
                  <span aria-hidden className="relative size-[18px] shrink-0">
                    <span className="absolute top-2 left-0 h-[1.5px] w-[18px] bg-accent" />
                    <span
                      className="absolute top-2 left-0 h-[1.5px] w-[18px] bg-accent transition-transform duration-[240ms] ease-[var(--ease-entrance)]"
                      style={{ transform: expanded ? "rotate(0deg)" : "rotate(90deg)" }}
                    />
                  </span>
                  {entry.question}
                </button>
              </h3>
              <p
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!expanded}
                className="max-w-[68ch] pb-6 pl-9 text-[15px] leading-[1.6] text-ink-muted"
              >
                {entry.answer}
              </p>
            </div>
          );
        })}
      </div>
    </SiteSection>
  );
}

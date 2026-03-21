import { faqItems } from "../_lib/content";

import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function Faq() {
  return (
    <SectionShell id="faq" className="pt-8 sm:pt-12">
      <SectionHeading
        eyebrow="FAQ"
        title="Answers before we start"
        description="Common questions about scope, timelines, and how we deliver all-in-one digital engagement."
      />

      <div className="rounded-3xl border border-black/10 bg-white/90 px-5 py-2 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.4)] sm:px-8">
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item, index) => (
            <AccordionItem key={item.question} value={`item-${index}`}>
              <AccordionTrigger className="py-5 text-base font-medium tracking-tight">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionShell>
  );
}

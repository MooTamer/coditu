import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { marketingContent } from "@/lib/marketing-content";

export function Faq() {
  const { faq, sections } = marketingContent;

  return (
    <SectionShell id="faq" className="pt-8 sm:pt-12">
      <SectionHeading
        eyebrow={sections.faq.eyebrow}
        title={sections.faq.title}
        description={sections.faq.description}
      />

      <div className="rounded-3xl border border-black/10 bg-white/90 px-5 py-2 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.4)] sm:px-8">
        <Accordion type="single" collapsible className="w-full">
          {faq.map((item, index) => (
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

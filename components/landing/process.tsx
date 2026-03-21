import { ProcessAnimated } from "@/components/landing/process-animated";
import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { marketingContent } from "@/lib/marketing-content";

export function Process() {
  const { processSteps, sections } = marketingContent;

  return (
    <SectionShell id="process">
      <SectionHeading
        eyebrow={sections.process.eyebrow}
        title={sections.process.title}
        description={sections.process.description}
      />
      <ProcessAnimated items={processSteps} />
    </SectionShell>
  );
}

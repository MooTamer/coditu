import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { WorkAnimated } from "@/components/landing/work-animated";
import { marketingContent } from "@/lib/marketing-content";

export function Work() {
  const { sections, workItems } = marketingContent;

  return (
    <SectionShell id="work">
      <SectionHeading
        eyebrow={sections.work.eyebrow}
        title={sections.work.title}
        description={sections.work.description}
      />
      <WorkAnimated items={workItems} cardLabel={sections.work.cardLabel} />
    </SectionShell>
  );
}

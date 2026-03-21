import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { ServicesAnimated } from "@/components/landing/services-animated";
import { marketingContent } from "@/lib/marketing-content";

export function Services() {
  const { sections, services } = marketingContent;

  return (
    <SectionShell id="services">
      <SectionHeading
        eyebrow={sections.services.eyebrow}
        title={sections.services.title}
        description={sections.services.description}
      />
      <ServicesAnimated items={services} />
    </SectionShell>
  );
}

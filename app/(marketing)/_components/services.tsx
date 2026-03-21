import { services } from "../_lib/content";

import { ServicesAnimated } from "./services-animated";
import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";

export function Services() {
  return (
    <SectionShell id="services">
      <SectionHeading
        eyebrow="Services"
        title="One team for product, systems, and growth"
        description="We combine software delivery, automation, SEO, and AI capabilities so your business moves with one cohesive digital partner."
      />
      <ServicesAnimated items={services} />
    </SectionShell>
  );
}

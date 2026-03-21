import { workItems } from "../_lib/content";

import { WorkAnimated } from "./work-animated";
import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";

export function Work() {
  return (
    <SectionShell id="work">
      <SectionHeading
        eyebrow="Selected Work"
        title="Digital products shipped with measurable outcomes"
        description="A snapshot of products, portals, and business systems delivered for teams that need velocity without sacrificing quality."
      />
      <WorkAnimated items={workItems} />
    </SectionShell>
  );
}

import { processSteps } from "../_lib/content";

import { ProcessAnimated } from "./process-animated";
import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";

export function Process() {
  return (
    <SectionShell id="process">
      <SectionHeading
        eyebrow="Process"
        title="A clear delivery rhythm from discovery to scale"
        description="Our process keeps decisions explicit and outcomes measurable, with consistent communication across distributed teams."
      />
      <ProcessAnimated items={processSteps} />
    </SectionShell>
  );
}

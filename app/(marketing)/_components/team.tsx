import { teamMembers } from "../_lib/content";

import { TeamAnimated } from "./team-animated";
import { SectionHeading } from "./section-heading";
import { SectionShell } from "./section-shell";

export function Team() {
  return (
    <SectionShell id="team">
      <SectionHeading
        eyebrow="Team"
        title="Distributed experts working as one product unit"
        description="A cross-functional team operating across Germany, Egypt, and the USA with shared standards and accountable ownership."
      />
      <TeamAnimated members={teamMembers} />
    </SectionShell>
  );
}

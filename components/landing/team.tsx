import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { TeamAnimated } from "@/components/landing/team-animated";
import { marketingContent } from "@/lib/marketing-content";

export function Team() {
  const { sections, team } = marketingContent;

  return (
    <SectionShell id="team">
      <SectionHeading
        eyebrow={sections.team.eyebrow}
        title={sections.team.title}
        description={sections.team.description}
      />
      <TeamAnimated
        summaryEyebrow={team.summaryEyebrow}
        summaryTitle={team.summaryTitle}
        summaryDescription={team.summaryDescription}
        regions={team.regions}
        members={team.members}
      />
    </SectionShell>
  );
}

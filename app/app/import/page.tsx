import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
import { ImportPanel } from "@/components/app/import-panel.client";
import { Reveal } from "@/components/motion/reveal";
import { listProjects, listSprintsForProject } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const projects = await listProjects();
  const active = projects.find((project) => project.activeSprint) ?? null;

  // Invariant 1: an import goes into a specific sprint, which decides the
  // project. There is no "import into the app".
  let sprintId: string | null = null;
  let sprintName: string | null = null;
  if (active?.activeSprint) {
    const sprints = await listSprintsForProject(active.id);
    const sprint = sprints.find((s) => s.number === active.activeSprint!.number);
    sprintId = sprint?.id ?? null;
    sprintName = sprint ? `${active.clientName} · ${sprint.name}` : null;
  }

  return (
    <PageShell measure="import">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">Import from Notion</h1>
        <p className="mt-2 max-w-[70ch] text-[14.5px] leading-[1.55] text-[var(--ink-muted)]">
          Drop the CSV export. Columns are mapped below; anything unmatched is flagged and skipped
          until you fix it. Nothing is written until you commit.
        </p>
        {sprintName ? (
          <p className="mt-1 text-[13.5px] text-[var(--ink-faint)]">
            Rows will be created in {sprintName}.
          </p>
        ) : (
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--tone-amber-fg)" }}>
            No project has an open sprint, so there is nowhere to import into yet.
          </p>
        )}
      </Reveal>

      <Reveal tier="section" delay={0.06}>
        <ImportPanel
          sprintId={sprintId}
          sprintName={sprintName}
          canCommit={profile.role === "admin" || profile.role === "lead"}
        />
      </Reveal>
    </PageShell>
  );
}

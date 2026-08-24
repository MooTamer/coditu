import Link from "next/link";

import { ClientMark } from "@/components/app/client-mark";
import { ProjectAdmin, ProjectRowControls } from "@/components/app/project-admin.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { listArchivedProjects, listClients, listProjects } from "@/lib/data/projects";
import { hoursOrDash } from "@/lib/format";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [projects, clients, archived, profile] = await Promise.all([
    listProjects(),
    listClients(),
    listArchivedProjects(),
    getCurrentProfile(),
  ]);

  // Admin or lead, matching the `leads insert/update projects` policies. The
  // controls simply do not render for an engineer; RLS refuses their write
  // anyway, and a button that always fails is worse than no button.
  const canManage = profile?.role === "admin" || profile?.role === "lead";

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Projects</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Every project, its client, and where its sprint stands.
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.05}>
        <ProjectAdmin
          projects={projects}
          clients={clients}
          archived={archived}
          canManage={canManage}
        />
      </Reveal>

      <Reveal tier="section" delay={0.075} className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
        {projects.map((project, index) => (
          <div
            key={project.id}
            className="flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-4 last:border-b-0"
          >
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-chip border border-[var(--hairline)]">
              <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={13} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{project.name}</span>
              <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
                {project.clientName}
                {project.scope ? ` · ${project.scope}` : ""}
              </Mono>
            </span>

            {project.activeSprint ? (
              <Link
                href={`/app/projects/${project.slug}/sprints/${project.activeSprint.number}`}
                className="shrink-0"
              >
                <ToneChip tone="jade">{project.activeSprint.name.replace("Sprint — ", "")}</ToneChip>
              </Link>
            ) : (
              <ToneChip tone="slate" className="shrink-0">
                no open sprint
              </ToneChip>
            )}

            <Mono size="meta" className="w-[72px] shrink-0 text-right text-[var(--ink-muted)]">
              {project.sprintCount || "—"} sprints
            </Mono>
            <Mono size="meta" className="w-[64px] shrink-0 text-right text-[var(--ink-muted)]">
              {hoursOrDash(project.minutesLogged)} h
            </Mono>

            {canManage ? <ProjectRowControls project={project} /> : null}

            {/* index is only used to keep the key stable when two projects share a name */}
            <span className="sr-only">{index}</span>
          </div>
        ))}

        {projects.length === 0 ? (
          <p className="px-5 py-4 text-[13.5px] text-[var(--ink-faint)]">
            No projects yet.
            {canManage ? " Add the client first, then open the project above." : ""}
          </p>
        ) : null}
      </Reveal>
    </main>
  );
}

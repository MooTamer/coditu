import { notFound } from "next/navigation";

import { ClientMark } from "@/components/app/client-mark";
import { SprintManager } from "@/components/app/sprint-manager.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project?.name ?? "Project" };
}

/**
 * A project and its sprints.
 *
 * This is where sprints are managed, because a sprint belongs to a project —
 * invariant 1 — and "which sprint is running" is a question about the project,
 * not about any one sprint. The empty case is not a dead end any more either:
 * a project with no sprints is exactly where you need to be able to open one.
 */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [project, profile] = await Promise.all([getProjectBySlug(slug), getCurrentProfile()]);
  if (!project) notFound();
  if (!profile) notFound();

  const sprints = await listSprintsForProject(project.id);
  const canManage = profile.role === "admin" || profile.role === "lead";

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <div className="flex items-center gap-[10px]">
          <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {project.clientName}
          </Mono>
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.022em]">{project.name}</h1>
        {project.scope ? (
          <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">{project.scope}</p>
        ) : null}
      </Reveal>

      <Reveal tier="section" delay={0.075} as="section" aria-labelledby="sprints">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="sprints" className="text-[16px] font-bold tracking-[-0.015em]">
            Sprints
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {canManage ? "one active at a time" : "managed by an admin or lead"}
          </Mono>
        </div>

        <div className="mt-4">
          <SprintManager
            projectId={project.id}
            slug={project.slug}
            sprints={sprints}
            canManage={canManage}
          />
        </div>
      </Reveal>
    </main>
  );
}

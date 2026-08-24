import { notFound } from "next/navigation";

import Link from "next/link";

import { ClientMark } from "@/components/app/client-mark";
import { SprintManager } from "@/components/app/sprint-manager.client";
import { ComponentIcon } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { listComponentSummaries } from "@/lib/data/components";
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

  const [sprints, components] = await Promise.all([
    listSprintsForProject(project.id),
    listComponentSummaries(project.id),
  ]);
  const canManage = profile.role === "admin" || profile.role === "lead";

  // The five most recently worked, as a way in rather than a summary — the
  // registry page is one click away and is the place that lists them all.
  const recent = [...components]
    .filter((component) => !component.isArchived && component.lastSprintNumber !== null)
    .sort((a, b) => (b.lastSprintNumber ?? 0) - (a.lastSprintNumber ?? 0) || b.itemCount - a.itemCount)
    .slice(0, 5);

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

      <Reveal tier="section" delay={0.06} as="section" aria-labelledby="components">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="components" className="text-[16px] font-bold tracking-[-0.015em]">
            Components
          </h2>
          <Link
            href={`/app/projects/${project.slug}/components`}
            className="text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--accent)]"
          >
            {components.length ? `all ${components.length} →` : "set them up →"}
          </Link>
        </div>

        {recent.length ? (
          <ul className="mt-3 flex list-none flex-wrap gap-[10px]">
            {recent.map((component) => (
              <li key={component.id}>
                <Link
                  href={`/app/projects/${project.slug}/components/${component.slug}`}
                  prefetch={false}
                  className="flex items-center gap-2 rounded-pill border border-[var(--hairline)] bg-[var(--raised)] py-[6px] pl-3 pr-[14px] text-[13px] hover:border-[var(--hairline-strong)]"
                >
                  <ComponentIcon icon={component.icon} kind={component.kind} size={14} />
                  <span className="font-medium">{component.name}</span>
                  <Mono size="meta" className="text-[var(--ink-faint)]">
                    {component.itemCount}
                  </Mono>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
            Nothing has been attributed to a component yet. Pick one on an item and its history
            starts collecting here.
          </p>
        )}
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

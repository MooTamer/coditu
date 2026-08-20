import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientMark } from "@/components/app/client-mark";
import { NoSprint } from "@/components/app/no-sprint";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { dateRange, hours } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const sprints = await listSprintsForProject(project.id);
  if (sprints.length === 0) return <NoSprint project={project} />;

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

      <Reveal
        tier="section"
        delay={0.075}
        className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
      >
        {sprints.map((sprint) => (
          <Link
            key={sprint.id}
            href={`/app/projects/${project.slug}/sprints/${sprint.number}`}
            className="flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-4 last:border-b-0 hover:bg-[var(--canvas)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{sprint.name}</span>
              <Mono size="meta" className="block text-[var(--ink-faint)]">
                {dateRange(sprint.startsOn, sprint.endsOn)}
              </Mono>
            </span>

            <ToneChip tone={sprint.status === "active" ? "jade" : "slate"} className="shrink-0">
              {sprint.status}
            </ToneChip>

            <Mono size="meta" className="w-[68px] shrink-0 text-right text-[var(--ink-muted)]">
              {sprint.itemCount} items
            </Mono>
            <Mono size="meta" className="w-[96px] shrink-0 text-right text-[var(--ink-muted)]">
              {hours(sprint.minutesLogged)} / {hours(sprint.estimateMinutes)} h
            </Mono>
          </Link>
        ))}
      </Reveal>
    </main>
  );
}

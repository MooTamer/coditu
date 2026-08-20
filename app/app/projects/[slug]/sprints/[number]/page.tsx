import { notFound } from "next/navigation";

import { NoSprint } from "@/components/app/no-sprint";
import { Mono } from "@/components/coditu/mono";
import { StatusChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { getProjectBySlug, listSprintsForProject } from "@/lib/data/projects";
import { hours } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.clientName} · Sprint ${number}` : "Sprint" };
}

export default async function SprintPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const sprints = await listSprintsForProject(project.id);
  const sprint = sprints.find((s) => s.number === Number(number));

  // A real screen, not a spinner: the project exists, this sprint does not.
  if (!sprint) return <NoSprint project={project} />;

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal
        tier="section"
        as="section"
        className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-center gap-[10px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            sprint {sprint.number} · {sprint.status}
          </Mono>
        </div>
        <h1 className="mt-[10px] text-[26px] font-bold tracking-[-0.024em]">{sprint.name}</h1>
        <Mono size="key" className="mt-[10px] block text-[var(--ink-muted)]">
          {sprint.startsOn} → {sprint.endsOn}
        </Mono>
        <Mono size="metric" className="mt-5 block">
          {hours(sprint.minutesLogged)} / {hours(sprint.estimateMinutes)} h
        </Mono>
        <Mono size="meta" className="mt-2 block text-[var(--ink-faint)]">
          {sprint.itemCount} items
        </Mono>
      </Reveal>

      {/* Step 7 replaces this with the real table. */}
      <Reveal
        tier="section"
        delay={0.075}
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status="dev_started" />
          <StatusChip status="ready_for_peer_review" />
          <StatusChip status="todo" />
          <StatusChip status="draft" />
        </div>
        <p className="mt-4 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          The sprint table lands in step 7 — columns, sticky header and task column, grouping
          treatment, the pinned sum row, URL-held filters, and the container-query card layout below
          900px.
        </p>
      </Reveal>
    </main>
  );
}

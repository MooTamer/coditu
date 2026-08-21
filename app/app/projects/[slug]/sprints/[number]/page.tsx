import { notFound } from "next/navigation";

import { FilterBar } from "@/components/app/filter-bar.client";
import { NoSprint } from "@/components/app/no-sprint";
import { SprintBoard } from "@/components/app/sprint-board";
import { SprintCards } from "@/components/app/sprint-cards";
import { SprintHeader } from "@/components/app/sprint-header";
import { SprintRealtime } from "@/components/app/realtime.client";
import { SprintTable } from "@/components/app/sprint-table.client";
import { Reveal } from "@/components/motion/reveal";
import { getProjectBySlug } from "@/lib/data/projects";
import { daysRemaining, getBurnUp, getSprint, getSprintMembers } from "@/lib/data/sprint";
import { getCurrentProfile } from "@/lib/supabase/server";
import { WORK_ITEM_STATUSES, type WorkItemStatus } from "@/lib/work-items";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.clientName} · Sprint ${number}` : "Sprint" };
}

export default async function SprintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; number: string }>;
  searchParams: Promise<{ status?: string; view?: string; density?: string }>;
}) {
  const [{ slug, number }, query] = await Promise.all([params, searchParams]);

  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const sprint = await getSprint(project.id, Number(number));
  // A real screen, not a spinner: the project exists, this sprint does not.
  if (!sprint) return <NoSprint project={project} />;

  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const [burn, members] = await Promise.all([
    getBurnUp(sprint.id, sprint.startsOn, sprint.endsOn),
    getSprintMembers(sprint.id),
  ]);

  // Filters are read from the URL and validated against the enum, so a
  // hand-edited query string cannot smuggle in a status that does not exist.
  const requested = (query.status ?? "")
    .split(",")
    .filter((value): value is WorkItemStatus => WORK_ITEM_STATUSES.includes(value as WorkItemStatus));

  const visible = requested.length
    ? sprint.items.filter((item) => requested.includes(item.status))
    : sprint.items;

  const isBoard = query.view === "board";
  const rowHeight = query.density === "compact" ? 44 : 52;
  const canAssign = profile.role === "admin" || profile.role === "lead";
  const basePath = `/app/projects/${slug}/sprints/${number}`;

  return (
    // `@container` so the table can switch to cards on its OWN width. The rail
    // pinning open changes that width without the viewport moving at all.
    <main className="@container flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      {/* This sprint only. Renders nothing — it subscribes, coalesces bursts
          through a 120ms buffer, and unsubscribes when the route changes. */}
      <SprintRealtime sprintId={sprint.id} />
      {/* No wrapper reveal: as one block the header clears §4's ~40vh blur
          ceiling, so it staggers its own three columns instead — which is the
          remedy §4 gives for exactly this case. */}
      <SprintHeader
        project={project}
        sprint={sprint}
        burn={burn}
        daysLeft={daysRemaining(sprint.endsOn)}
        members={members}
      />

      <Reveal tier="section" delay={0.06}>
        <FilterBar availableStatuses={[...new Set(sprint.items.map((item) => item.status))]} />
      </Reveal>

      {/* The body reveals once, as a single group — never per row on a filter
          or sort, which is where a table visibly hitches. `flat` because the
          group clears the ~40vh ceiling and blurring it would cost an
          offscreen composite pass over the whole table every frame. */}
      <Reveal tier="section" delay={0.12} flat>
        {isBoard ? (
          <SprintBoard rows={visible} basePath={basePath} />
        ) : (
          <>
            <SprintTable
              rows={visible}
              allRows={sprint.items}
              basePath={basePath}
              canReorder={canAssign}
              currentProfileId={profile.id}
              canAssign={canAssign}
              rowHeight={rowHeight}
            />
            <SprintCards rows={visible} allRows={sprint.items} basePath={basePath} />
          </>
        )}
      </Reveal>
    </main>
  );
}

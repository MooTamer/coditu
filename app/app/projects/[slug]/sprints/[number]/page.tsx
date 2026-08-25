import { notFound } from "next/navigation";

import { FilterBar } from "@/components/app/filter-bar.client";
import { NoSprint } from "@/components/app/no-sprint";
import { SprintBoard } from "@/components/app/sprint-board";
import { SprintCards } from "@/components/app/sprint-cards";
import { SprintHeader } from "@/components/app/sprint-header";
import { SprintRealtime } from "@/components/app/realtime.client";
import { SprintTable } from "@/components/app/sprint-table.client";
import { Reveal } from "@/components/motion/reveal";
import {
  matchesComponentFilter,
  parseComponentFilter,
  parseComponentMatch,
} from "@/lib/components";
import { listComponents } from "@/lib/data/components";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getProjectBySlug } from "@/lib/data/projects";
import {
  daysRemaining,
  getBurnUp,
  getSprint,
  getSprintMembers,
  todayInCairo,
} from "@/lib/data/sprint";
import { getAppSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/supabase/server";
import { parseStatusFilter } from "@/lib/work-items";

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
  searchParams: Promise<{
    status?: string;
    view?: string;
    density?: string;
    component?: string;
    match?: string;
  }>;
}) {
  const [{ slug, number }, query] = await Promise.all([params, searchParams]);

  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const sprint = await getSprint(project.id, Number(number));
  // A real screen, not a spinner: the project exists, this sprint does not.
  if (!sprint) return <NoSprint project={project} />;

  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const [burn, members, people, components, settings] = await Promise.all([
    getBurnUp(sprint.id, sprint.startsOn, sprint.endsOn),
    getSprintMembers(sprint.id),
    // The assignee and reviewer menus. Request-cached, so the shell's copy and
    // this one are a single query.
    listActiveProfiles(),
    // This project's registry, for the row pickers. Invariant 1: it is fetched
    // for the project the URL resolved to, so a row can only ever be attributed
    // to something belonging to the client whose sprint this is.
    listComponents(project.id),
    // The image cap the notes editor enforces. From `app_settings`, because a
    // number in a `const` is a change request that needs a deploy.
    getAppSettings(),
  ]);

  // Filters are read from the URL and validated against the enum, so a
  // hand-edited query string cannot smuggle in a status that does not exist.
  // `parseStatusFilter` also maps the values retired by the rename, so a link
  // shared before it still filters instead of quietly showing the whole sprint.
  const requested = parseStatusFilter(query.status);

  // The component filter is a list of SLUGS, each validated against THIS
  // project's registry — a hand-edited query string naming another client's
  // component resolves to nothing and is simply not applied, rather than
  // silently matching. `match` says whether a story needs one of them or all.
  const requestedComponents = parseComponentFilter(query.component);
  const activeComponents = requestedComponents
    .map((slug) => components.find((component) => component.slug === slug))
    .filter((component): component is (typeof components)[number] => component !== undefined);
  const match = parseComponentMatch(query.match);

  const activeSlugs = activeComponents.map((component) => component.slug);

  const visible = sprint.items.filter(
    (item) =>
      (requested.length === 0 || requested.includes(item.status)) &&
      matchesComponentFilter(
        item.components.map((component) => component.slug),
        activeSlugs,
        match
      )
  );

  // Only what this sprint actually touches, plus whatever is being filtered on
  // — so the menu cannot offer a component that would empty the table.
  const sprintComponents = components.filter(
    (component) =>
      activeSlugs.includes(component.slug) ||
      sprint.items.some((item) =>
        item.components.some((tagged) => tagged.id === component.id)
      )
  );

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
        canEdit={canAssign}
        people={people}
        maxImageBatch={settings.maxImageBatch}
      />

      <Reveal tier="section" delay={0.06}>
        <FilterBar
          availableStatuses={[...new Set(sprint.items.map((item) => item.status))]}
          components={sprintComponents}
          activeComponents={activeComponents}
          match={match}
          projectSlug={slug}
        />
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
              people={people}
              components={components}
              projectSlug={slug}
              today={todayInCairo()}
            />
            <SprintCards rows={visible} allRows={sprint.items} basePath={basePath} />
          </>
        )}
      </Reveal>
    </main>
  );
}

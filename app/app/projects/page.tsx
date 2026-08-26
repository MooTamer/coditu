import Link from "next/link";

import { ClientMark } from "@/components/app/client-mark";
import { PersonAvatar } from "@/components/app/person-avatar";
import { ProjectAdmin, ProjectRowControls } from "@/components/app/project-admin.client";
import { ProjectFilters } from "@/components/app/project-filters.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { hoursOrDash } from "@/lib/format";
import { listClients, listProjectOverviews } from "@/lib/data/projects";
import { matchesProjectFilters, parseProjectFilters } from "@/lib/project-filters";
import { projectStateOf } from "@/lib/projects";
import { getCurrentProfile } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects" };

/**
 * Every project, filtered by the URL.
 *
 * ## The filtering is here, on the server
 *
 * `?q=evim&state=active&archived=1` is read here and the rows that survive are
 * the rows that are rendered — so this screen ships no row-rendering JavaScript
 * at all, and the client bundle is one control bar. The sprint table filters in
 * the browser for a reason it has and this does not: it re-sorts, re-tints and
 * re-sums a live board between renders.
 *
 * ## Archived projects are rows in this list, not a list underneath it
 *
 * They used to be a separate `Archived` section in the admin panel, which meant
 * an archived project appeared in a different place, with a different shape,
 * and the search and state filters could not see it. It is one list behind a
 * toggle now, and the row's own control restores it.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const [projects, clients, profile] = await Promise.all([
    listProjectOverviews(),
    listClients(),
    getCurrentProfile(),
  ]);

  // Admin or lead, matching the `leads insert/update projects` policies. The
  // controls simply do not render for an engineer; RLS refuses their write
  // anyway, and a button that always fails is worse than no button.
  const canManage = profile?.role === "admin" || profile?.role === "lead";

  const filters = parseProjectFilters(params);
  const shown = projects.filter((project) => matchesProjectFilters(project, filters));

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
          liveCount={projects.filter((project) => !project.isArchived).length}
          archivedCount={projects.filter((project) => project.isArchived).length}
          clients={clients}
          canManage={canManage}
        />
      </Reveal>

      <Reveal tier="section" delay={0.065} as="section" aria-label="Filter projects">
        <ProjectFilters total={projects.length} shown={shown.length} />
      </Reveal>

      <Reveal
        tier="section"
        delay={0.075}
        className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
      >
        {shown.map((project) => {
          const state = projectStateOf(project);
          return (
            <div
              key={project.id}
              data-project-row
              data-project-slug={project.slug}
              className={cn(
                "flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-4 last:border-b-0",
                // Archived rows are present, legible and visibly not current.
                // Half-opacity would take the client's name below 4.5:1; a
                // stated word does not.
                project.isArchived && "bg-[var(--canvas)]"
              )}
            >
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-chip border border-[var(--hairline)]">
                <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={13} />
              </span>

              {/* Twice the share and a floor of 180px. Measured at 1440 with
                  both this and the activity column on `flex-1`: the longest
                  CONTENT won, so `MEINEvim components` rendered at 102px while
                  a sentence about it rendered at 371. The name is the thing
                  somebody is looking for. */}
              <span className="min-w-[180px] flex-[2]">
                <Link
                  href={`/app/projects/${project.slug}`}
                  prefetch={false}
                  className="block truncate text-[14px] font-medium hover:text-[var(--accent)]"
                >
                  {project.name}
                </Link>
                <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
                  {project.clientName}
                  {project.scope ? ` · ${project.scope}` : ""}
                </Mono>
              </span>

              {project.isArchived ? (
                <ToneChip tone="slate" className="shrink-0">
                  archived
                </ToneChip>
              ) : project.activeSprint ? (
                <Link
                  href={`/app/projects/${project.slug}/sprints/${project.activeSprint.number}`}
                  prefetch={false}
                  className="shrink-0"
                >
                  <ToneChip tone="jade">{project.activeSprint.name.replace("Sprint — ", "")}</ToneChip>
                </Link>
              ) : (
                <ToneChip tone="slate" className="shrink-0">
                  {state === "planned" ? "planned" : "no open sprint"}
                </ToneChip>
              )}

              {/* Who is actually on it — read from the seats on its items
                  rather than from a membership table, because there is none
                  and the seats are the fact.

                  Gone below `sm` with the counts: four unlabelled circles cost
                  a whole wrapped line, and what a phone has room to say about a
                  project is its name, its state, and what happened last. */}
              <span className="hidden shrink-0 items-center sm:flex" aria-label={teamLabel(project.team)}>
                {project.team.slice(0, 4).map((person, index) => (
                  <span
                    key={person.id}
                    // Overlapped, so a ring is what keeps the one behind
                    // readable rather than a shape merging into its neighbour.
                    className={cn(
                      "rounded-pill ring-2 ring-[var(--raised)]",
                      index > 0 && "-ml-[6px]"
                    )}
                  >
                    <PersonAvatar person={person} size={22} fontSize={9} title={person.fullName} />
                  </span>
                ))}
                {project.team.length > 4 ? (
                  <Mono size="meta" className="ml-[6px] text-[var(--ink-faint)]">
                    +{project.team.length - 4}
                  </Mono>
                ) : null}
                {project.team.length === 0 ? (
                  <Mono size="meta" className="text-[var(--ink-faint)]">
                    nobody yet
                  </Mono>
                ) : null}
              </span>

              {/* `— components` and `1 sprints` were both on screen before
                  somebody read the row out loud. A count of nothing is a
                  sentence, not a dash with a plural after it.

                  Gone below `sm`, where the row wraps: three counts cost two
                  extra lines each, which made five projects 1270px of scrolling
                  on a phone. They are on the project's own page, one tap away,
                  and the name, its state and what happened last are what a
                  phone is for. */}
              <Mono size="meta" className="hidden w-[104px] shrink-0 text-right text-[var(--ink-muted)] sm:block">
                {countLabel(project.componentCount, "component")}
              </Mono>
              <Mono size="meta" className="hidden w-[88px] shrink-0 text-right text-[var(--ink-muted)] sm:block">
                {countLabel(project.sprintCount, "sprint")}
              </Mono>
              <Mono size="meta" className="hidden w-[72px] shrink-0 text-right text-[var(--ink-muted)] sm:block">
                {project.minutesLogged ? `${hoursOrDash(project.minutesLogged)} h` : "no hours"}
              </Mono>

              {/* Bounded by days, not by row count — see `listProjectOverviews`.
                  "Nothing recent" is a true statement about a window; "no
                  activity" would be a claim about all of history that a capped
                  query cannot make. */}
              {/* `lg:basis-0`, not `lg:basis-auto`, and the row wraps rather
                  than shrinks so the difference is visible: with an `auto`
                  basis this cell's hypothetical size is its whole sentence —
                  345px for MEINEvim — which pushed the row's own controls onto
                  a second line at 1440. At zero it takes what is left and
                  truncates, which is what a trailing cell should do. Full-width
                  below `lg`, where it genuinely deserves its own line. */}
              <span className="min-w-0 flex-1 basis-full truncate text-[12.5px] text-[var(--ink-faint)] lg:basis-0">
                {project.recentActivity ? (
                  <>
                    <Mono size="meta" className="text-[var(--ink-muted)]">
                      {project.recentActivity.key}
                    </Mono>{" "}
                    {project.recentActivity.sentence}
                  </>
                ) : (
                  "nothing recent"
                )}
              </span>

              {canManage ? (
                <ProjectRowControls project={project} isArchived={project.isArchived} />
              ) : null}
            </div>
          );
        })}

        {shown.length === 0 ? (
          <p className="px-5 py-4 text-[13.5px] text-[var(--ink-faint)]">
            {projects.length === 0
              ? canManage
                ? "No projects yet. Add the client first, then open the project above."
                : "No projects yet."
              : "No project matches those filters."}
          </p>
        ) : null}
      </Reveal>
    </main>
  );
}

/** `41 components`, `1 sprint`, `no sprints`. */
function countLabel(n: number, noun: string): string {
  if (n === 0) return `no ${noun}s`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One accessible name for the stack of faces, rather than four unlabelled ones. */
function teamLabel(team: Array<{ fullName: string }>): string {
  if (team.length === 0) return "Nobody is on this project yet";
  return `On this project: ${team.map((person) => person.fullName).join(", ")}`;
}

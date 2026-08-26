import { notFound } from "next/navigation";

import Link from "next/link";

import { ClientMark } from "@/components/app/client-mark";
import { PersonAvatar } from "@/components/app/person-avatar";
import { SprintManager } from "@/components/app/sprint-manager.client";
import { ComponentIcon } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { CAPABILITY_LABEL } from "@/lib/client-access";
import { getProjectClientAccess } from "@/lib/data/client-access";
import { listComponentSummaries } from "@/lib/data/components";
import {
  getProjectBySlug,
  listProjectActivity,
  listProjectTeam,
  listSprintsForProject,
} from "@/lib/data/projects";
import { listSavedViews } from "@/lib/data/saved-views";
import { timestamp } from "@/lib/format";
import { PROJECT_STATE_LABEL, projectStateOf } from "@/lib/projects";
import { describeSpec, searchFromSpec } from "@/lib/saved-views";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project?.name ?? "Project" };
}

/**
 * A project: what it is, what is in it, and who can see it.
 *
 * ## Two columns, and what earns the right-hand one
 *
 * The design puts a 320px column beside the main one. What goes in it here is
 * the four things that are *about* the project rather than *in* it — the views
 * saved against it, who is on it, how much of it a client can see, and what
 * happened last. Every one is real data; the design's fifth panel, project
 * pages, is not built because there is no project-scoped document route to put
 * in it, and a panel of links to nothing is furniture.
 *
 * **1400px, and the number is measured rather than chosen.** The design says
 * 1180; at 1180 the app's own sidebar has just taken 268px, so the page has 912
 * and a 320px aside would leave the sprint manager 568. Forced on and measured,
 * counting elements whose `scrollWidth` exceeds their `clientWidth`:
 *
 * ```
 * 1280   main 606   many clipped — `Sprint — Week 16` renders 37px of 119
 * 1320   main 644   14 clipped
 * 1360   main 683    7 clipped
 * 1400   main 721    nothing clipped
 * ```
 *
 * So `min-[1400px]`, which keeps both columns on the 1440 laptop this team
 * actually uses and stacks them below — the same shape every other two-column
 * screen here degrades into. `2xl` would have been the safe standard choice and
 * would have given up the two columns at exactly the width they work at.
 */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [project, profile] = await Promise.all([getProjectBySlug(slug), getCurrentProfile()]);
  if (!project) notFound();
  if (!profile) notFound();

  const [sprints, components, team, activity, clientAccess, views] = await Promise.all([
    listSprintsForProject(project.id),
    listComponentSummaries(project.id),
    listProjectTeam(project.id),
    listProjectActivity(project.id),
    getProjectClientAccess(project.id),
    listSavedViews(project.id, profile.id),
  ]);

  const canManage = profile.role === "admin" || profile.role === "lead";
  const state = projectStateOf(project);

  // The five most recently worked, as a way in rather than a summary — the
  // registry page is one click away and is the place that lists them all.
  const recent = [...components]
    .filter((component) => !component.isArchived && component.lastSprintNumber !== null)
    .sort((a, b) => (b.lastSprintNumber ?? 0) - (a.lastSprintNumber ?? 0) || b.itemCount - a.itemCount)
    .slice(0, 5);

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {project.clientName}
          </Mono>
          {project.clientUrl ? (
            <a
              href={project.clientUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
            >
              {project.clientUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {/* The prefix every story key in this project carries. It is on this
              screen because it is the one fact about a project that people say
              out loud and cannot look up anywhere else. */}
          {project.keyPrefix ? (
            <Mono
              size="meta"
              className="rounded-chip border border-[var(--hairline)] px-[6px] py-[1px] text-[var(--ink-faint)]"
            >
              {project.keyPrefix}-
            </Mono>
          ) : null}
        </div>

        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.022em]">{project.name}</h1>
        {project.scope ? (
          <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">{project.scope}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {project.activeSprint ? (
            <Link
              href={`/app/projects/${project.slug}/sprints/${project.activeSprint.number}`}
              prefetch={false}
              className="inline-flex h-[34px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-[14px] text-[13.5px] font-medium hover:bg-[var(--raised)]"
            >
              Open {project.activeSprint.name.replace("Sprint — ", "")}
            </Link>
          ) : (
            /* Present and explaining itself, never hidden — the same rule
               Export and New item follow in the topbar. */
            <span
              title="Sprints belong to a project, and this one has none running"
              className="inline-flex h-[34px] cursor-not-allowed items-center gap-2 rounded-control border border-[var(--hairline)] px-[14px] text-[13.5px] font-medium text-[var(--ink-faint)]"
            >
              No sprint running
            </span>
          )}

          <ToneChip tone={state === "active" ? "jade" : state === "planned" ? "amber" : "slate"}>
            {PROJECT_STATE_LABEL[state]}
          </ToneChip>
        </div>
      </Reveal>

      <div className="grid gap-5 min-[1400px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
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
        </div>

        <Reveal tier="section" delay={0.09} as="aside" aria-label="About this project">
          <div className="flex flex-col gap-4">
            <Panel title="Saved views" meta={views.length ? `${views.length}` : undefined}>
              {views.length ? (
                <ul className="flex list-none flex-col">
                  {views.map((view) => {
                    const search = searchFromSpec(view.spec);
                    // A view saved against a sprint goes to that sprint; one
                    // saved against the project follows whichever is running,
                    // which is what `/app/sprint` resolves. Neither invents an
                    // address the reader cannot get back to.
                    const target = view.sprintId
                      ? sprints.find((sprint) => sprint.id === view.sprintId)
                      : sprints.find((sprint) => sprint.status === "active");
                    const href = target
                      ? `/app/projects/${project.slug}/sprints/${target.number}${search ? `?${search}` : ""}`
                      : null;

                    return (
                      <li key={view.id}>
                        {href ? (
                          <Link
                            href={href}
                            prefetch={false}
                            className="flex flex-col gap-[2px] rounded-control px-2 py-[7px] hover:bg-[var(--canvas)]"
                          >
                            <ViewLabel view={view} />
                          </Link>
                        ) : (
                          <span
                            title="The sprint this view was saved against is gone"
                            className="flex cursor-not-allowed flex-col gap-[2px] px-2 py-[7px] opacity-60"
                          >
                            <ViewLabel view={view} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty>
                  Nothing saved yet. Filter a sprint the way you keep filtering it, then save the
                  question rather than the answer.
                </Empty>
              )}
            </Panel>

            <Panel title="Team" meta={team.length ? `${team.length}` : undefined}>
              {team.length ? (
                <ul className="flex list-none flex-col gap-[10px]">
                  {team.map((person) => (
                    <li key={person.id} className="flex items-center gap-[10px]">
                      <PersonAvatar person={person} size={24} fontSize={10} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{person.fullName}</span>
                      <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                        {person.role}
                      </Mono>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>
                  Nobody holds a seat on an item here yet. This reads the assignees and reviewers on
                  the work, because that is the fact — there is no membership list to keep in step
                  with it.
                </Empty>
              )}
            </Panel>

            <Panel title="Client access">
              {clientAccess.contacts > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] text-[var(--ink-muted)]">
                    {clientAccess.contacts === 1
                      ? "One client contact can see this project."
                      : `${clientAccess.contacts} client contacts can see this project.`}
                  </p>
                  <ul className="flex list-none flex-wrap gap-[6px]">
                    {clientAccess.capabilities.map((capability) => (
                      <li key={capability}>
                        <Mono
                          size="meta"
                          className="rounded-chip border border-[var(--hairline)] px-[6px] py-[2px] text-[var(--ink-faint)]"
                        >
                          {CAPABILITY_LABEL[capability]}
                        </Mono>
                      </li>
                    ))}
                  </ul>
                  {/* A count and what it allows, never the addresses — an
                      outside person's email does not belong on a screen that
                      gets shown in a stand-up. `/app/clients` is where they are
                      managed. */}
                  <Link
                    href="/app/clients"
                    prefetch={false}
                    className="text-[12.5px] font-medium text-[var(--ink-muted)] hover:text-[var(--accent)]"
                  >
                    Manage access →
                  </Link>
                </div>
              ) : (
                <Empty>Nothing here is visible outside the company.</Empty>
              )}
            </Panel>

            <Panel title="Latest activity">
              {activity.length ? (
                <ul className="flex list-none flex-col gap-[10px]">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex flex-col gap-[2px]">
                      <span className="text-[12.5px] text-[var(--ink-muted)]">
                        {entry.href ? (
                          <Link
                            href={entry.href}
                            prefetch={false}
                            className="font-mono text-[11px] text-[var(--ink)] hover:text-[var(--accent)]"
                          >
                            {entry.key}
                          </Link>
                        ) : (
                          <Mono size="meta">{entry.key}</Mono>
                        )}{" "}
                        {entry.sentence}
                      </span>
                      <Mono size="meta" className="text-[var(--ink-faint)]">
                        {timestamp(entry.at)}
                      </Mono>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nothing has happened on this project yet.</Empty>
              )}
            </Panel>
          </div>
        </Reveal>
      </div>
    </main>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const id = `panel-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      data-project-panel={id}
      className="rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4"
    >
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id={id} className="text-[13px] font-semibold">
          {title}
        </h2>
        {meta ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {meta}
          </Mono>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-[1.55] text-[var(--ink-faint)]">{children}</p>;
}

function ViewLabel({ view }: { view: { name: string; spec: Parameters<typeof describeSpec>[0]; isShared: boolean } }) {
  return (
    <>
      <span className="truncate text-[13px] font-medium">{view.name}</span>
      <Mono size="meta" className="text-[var(--ink-faint)]">
        {describeSpec(view.spec)}
        {view.isShared ? " · shared" : ""}
      </Mono>
    </>
  );
}

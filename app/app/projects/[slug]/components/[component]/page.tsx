import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientVisibilityPanel } from "@/components/app/client-visibility-panel.client";
import { ComponentSettings } from "@/components/app/component-admin.client";
import { ComponentIcon } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { StatusChipDot, ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { COMPONENT_KIND_LABEL, COMPONENT_KIND_TONE } from "@/lib/components";
import { getComponentDossier, type ComponentItem } from "@/lib/data/components";
import { listClientThreads } from "@/lib/data/client-threads";
import { getProjectBySlug } from "@/lib/data/projects";
import { hours } from "@/lib/format";
import { getCurrentProfile } from "@/lib/supabase/server";
import { TYPE_LABEL } from "@/lib/work-items";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; component: string }>;
}) {
  const { slug, component } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: "Component" };
  const dossier = await getComponentDossier(project.id, component);
  return { title: dossier ? `${dossier.name} · ${project.clientName}` : "Component" };
}

/**
 * One component, and everything that has ever happened to it.
 *
 * This is the page the registry exists for. "What have we done to the
 * Newspart" was a question you answered by scrolling fifteen sprints and
 * trusting that everyone had spelled it the same way; here it is a list,
 * grouped by the sprint the work happened in, newest first.
 *
 * Invariant 1: the component is fetched by this project's id AND the slug from
 * the URL — never by the slug alone. Two clients may both have something called
 * "Calendar", and one of them must not be able to read the other's history by
 * guessing a URL.
 */
export default async function ComponentPage({
  params,
}: {
  params: Promise<{ slug: string; component: string }>;
}) {
  const { slug, component } = await params;

  const [project, profile] = await Promise.all([getProjectBySlug(slug), getCurrentProfile()]);
  if (!project) notFound();
  if (!profile) notFound();

  const dossier = await getComponentDossier(project.id, component);
  if (!dossier) notFound();

  const canManage = profile.role === "admin" || profile.role === "lead";

  // Threads on THIS component, out of the project's. One query rather than a
  // per-component RPC parameter: a project has a few dozen threads at most, and
  // `client_thread_list` is already the one place the read rule lives.
  const threads = (await listClientThreads(project.id)).filter(
    (thread) => thread.componentId === dossier.id
  );

  // Grouped by sprint, in the order `getComponentDossier` already sorted them —
  // newest sprint first, and the fixed status display order inside each.
  const sprints: Array<{ number: number; name: string; items: ComponentItem[] }> = [];
  for (const item of dossier.items) {
    const last = sprints.at(-1);
    if (last && last.number === item.sprint.number) last.items.push(item);
    else sprints.push({ number: item.sprint.number, name: item.sprint.name, items: [item] });
  }

  return (
    <main className="@container flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          <Link
            href={`/app/projects/${project.slug}/components`}
            className="hover:text-[var(--ink)]"
          >
            {project.name} · components
          </Link>
        </Mono>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-[10px] text-[22px] font-bold tracking-[-0.022em]">
              <ComponentIcon
                icon={dossier.icon}
                kind={dossier.kind}
                size={20}
                className="text-[var(--ink)]"
              />
              <span className="min-w-0 truncate">{dossier.name}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <ToneChip tone={COMPONENT_KIND_TONE[dossier.kind]}>
                {COMPONENT_KIND_LABEL[dossier.kind]}
              </ToneChip>
              <Mono size="meta" className="text-[var(--ink-muted)]">
                {dossier.itemCount} {dossier.itemCount === 1 ? "item" : "items"} · {dossier.openCount} open
              </Mono>
              <Mono size="meta" className="text-[var(--ink-muted)]">
                {hours(dossier.minutesLogged)} / {hours(dossier.estimateMinutes)} h
              </Mono>
              {dossier.isArchived ? (
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  retired — kept for its history
                </Mono>
              ) : null}
            </div>
          </div>

          <ComponentSettings component={dossier} canEdit={canManage} />
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.075} flat>
        {sprints.length === 0 ? (
          <p className="rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-6 text-[14px] text-[var(--ink-muted)]">
            Nothing has been attributed to this component yet. Pick it on an item — in the table, or
            when the item is created — and the work will collect here.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sprints.map((sprint) => (
              <section key={sprint.number} aria-labelledby={`sprint-${sprint.number}`}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 id={`sprint-${sprint.number}`} className="text-[15px] font-bold tracking-[-0.015em]">
                    <Link
                      href={`/app/projects/${project.slug}/sprints/${sprint.number}?component=${dossier.slug}`}
                      prefetch={false}
                      className="hover:text-[var(--accent)]"
                    >
                      {sprint.name}
                    </Link>
                  </h2>
                  <Mono size="meta" className="text-[var(--ink-faint)]">
                    {sprint.items.length} {sprint.items.length === 1 ? "item" : "items"} ·{" "}
                    {hours(sprint.items.reduce((total, item) => total + item.minutesLogged, 0))} h
                  </Mono>
                </div>

                <ul className="mt-3 flex list-none flex-col overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--raised)]">
                  {sprint.items.map((item) => (
                    <li
                      key={item.id}
                      className="border-b border-[var(--hairline)] last:border-b-0"
                    >
                      <Link
                        href={`/app/projects/${project.slug}/sprints/${sprint.number}/items/${item.key}`}
                        prefetch={false}
                        // Wraps to two lines below ~520px instead of truncating
                        // the title away: on a phone the title is the only part
                        // of this row worth reading.
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-[var(--canvas)]"
                      >
                        <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                          {item.key}
                        </Mono>
                        <span className="min-w-[min(100%,14ch)] flex-1 text-[14px] font-medium">
                          {item.title}
                        </span>
                        <Mono size="meta" className="shrink-0 text-[var(--ink-muted)]">
                          {TYPE_LABEL[item.type]}
                        </Mono>
                        <Mono size="meta" className="shrink-0 text-[var(--ink-muted)]">
                          {item.minutesLogged > 0 ? `${hours(item.minutesLogged)} h` : "—"}
                        </Mono>
                        <span className="shrink-0">
                          <StatusChipDot status={item.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Reveal>
      <Reveal tier="section" delay={0.08} as="section" aria-label="Client visibility">
        <ClientVisibilityPanel
          componentId={dossier.id}
          componentName={dossier.name}
          projectSlug={project.slug}
          componentSlug={dossier.slug}
          published={dossier.clientPublished}
          summary={dossier.clientSummary}
          items={dossier.items.map((item) => ({
            id: item.id,
            key: item.key,
            title: item.title,
            clientTitle: item.clientTitle,
            published: item.clientPublished,
          }))}
          threads={threads}
          canManage={canManage}
        />
      </Reveal>

    </main>
  );
}

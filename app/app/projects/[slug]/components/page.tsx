import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientMark } from "@/components/app/client-mark";
import { NewComponentButton } from "@/components/app/component-admin.client";
import { ComponentIcon } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { listComponentSummaries } from "@/lib/data/components";
import { getProjectBySlug } from "@/lib/data/projects";
import { COMPONENT_KIND_LABEL, COMPONENT_KIND_TONE, type ComponentKind } from "@/lib/components";
import { hours } from "@/lib/format";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `${project.name} · Components` : "Components" };
}

/**
 * The registry: everything this project is made of.
 *
 * A project's work is a stream of small changes to a fixed set of things, and
 * until this page existed the set only lived in the delivery repository and in
 * people's heads. Here it is a list, with what each one has cost and when it
 * was last touched.
 *
 * A Server Component with two client islands (adding one, and each card's
 * link is a plain anchor) — the grid itself ships no JavaScript.
 *
 * Responsive by grid rather than by breakpoint: `auto-fill` with a
 * `minmax(min(300px,100%),1fr)` track gives four columns on a wide monitor and
 * one at 320px, without a media query and without a second markup path to keep
 * in step.
 */
export default async function ComponentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [project, profile] = await Promise.all([getProjectBySlug(slug), getCurrentProfile()]);
  if (!project) notFound();
  if (!profile) notFound();

  const components = await listComponentSummaries(project.id);
  const canManage = profile.role === "admin" || profile.role === "lead";

  const live = components.filter((component) => !component.isArchived);
  const retired = components.filter((component) => component.isArchived);
  const counts = live.reduce<Record<ComponentKind, number>>(
    (total, component) => ({ ...total, [component.kind]: (total[component.kind] ?? 0) + 1 }),
    { react: 0, spfx: 0 }
  );

  return (
    <main className="@container flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <div className="flex items-center gap-[10px]">
          <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            <Link href={`/app/projects/${project.slug}`} className="hover:text-[var(--ink)]">
              {project.name}
            </Link>
          </Mono>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold tracking-[-0.022em]">Components</h1>
            <p className="mt-1 text-[13.5px] text-[var(--ink-muted)]">
              {live.length} in use — {counts.spfx} {COMPONENT_KIND_LABEL.spfx}
              {counts.spfx === 1 ? "" : "s"}, {counts.react} {COMPONENT_KIND_LABEL.react}
              {retired.length ? ` · ${retired.length} retired` : ""}
            </p>
          </div>
          {canManage ? <NewComponentButton projectSlug={project.slug} /> : null}
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.075} flat>
        {components.length === 0 ? (
          <p className="rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-6 text-[14px] text-[var(--ink-muted)]">
            Nothing is registered for this project yet. Add the first component and it becomes
            pickable everywhere an item is created.
          </p>
        ) : (
          <ul className="grid list-none gap-[10px] [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
            {[...live, ...retired].map((component) => (
              <li key={component.id} className="min-w-0">
                <Link
                  href={`/app/projects/${project.slug}/components/${component.slug}`}
                  prefetch={false}
                  className="flex h-full flex-col gap-3 rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4 hover:border-[var(--hairline-strong)]"
                  style={{ opacity: component.isArchived ? 0.6 : 1 }}
                >
                  {/* The name gets the whole first line. Sharing it with the
                      kind chip cost about a hundred pixels, which is the
                      difference between "EVIM Anniversaries" and "EVIM
                      Anniversa…" in a four-column grid — and telling similar
                      names apart is the only thing this card is for. */}
                  <span className="flex min-w-0 items-center gap-2">
                    <ComponentIcon icon={component.icon} kind={component.kind} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                      {component.name}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <ToneChip tone={COMPONENT_KIND_TONE[component.kind]} className="shrink-0">
                      {COMPONENT_KIND_LABEL[component.kind]}
                    </ToneChip>

                    {/* Nothing attributed yet is one fact, not three zeroes.
                        Most of the registry is in that state on the day it
                        lands, and "0 items 0 open 0.0 h" wraps the card to two
                        lines to say nothing. */}
                    {component.itemCount === 0 ? (
                      <Mono size="meta" className="text-[var(--ink-faint)]">
                        {component.isArchived ? "retired" : "no items yet"}
                      </Mono>
                    ) : (
                      <>
                        <Mono size="meta" className="text-[var(--ink-muted)]">
                          {component.itemCount} {component.itemCount === 1 ? "item" : "items"} ·{" "}
                          {component.openCount} open
                        </Mono>
                        <Mono size="meta" className="text-[var(--ink-muted)]">
                          {hours(component.minutesLogged)} h
                        </Mono>
                        <Mono size="meta" className="ml-auto text-[var(--ink-faint)]">
                          {component.lastSprintNumber === null
                            ? "—"
                            : `week ${component.lastSprintNumber}`}
                        </Mono>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </main>
  );
}

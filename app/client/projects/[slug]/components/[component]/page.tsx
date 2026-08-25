import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { ProgressLine } from "@/components/client/progress-line";
import { Reveal } from "@/components/motion/reveal";
import {
  getClientComponent,
  getClientProject,
  listClientWork,
} from "@/lib/data/client";
import { calendarDate, hoursLabel } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; component: string }>;
}) {
  const { slug, component } = await params;
  const project = await getClientProject(slug);
  if (!project) return { title: "Not found" };

  const found = await getClientComponent(project.id, component);
  return { title: found?.name ?? "Not found" };
}

/**
 * One component, and everything about it this client has been shown.
 *
 * ── `notFound()` for both cases, deliberately ──────────────────────────────
 *
 * A slug this contact may not see and a slug that does not exist produce the
 * same 404. A 403 on the first would confirm the component is real, which is
 * how a client with one project's URL discovers the shape of another's. The
 * same reasoning `getWorkItem` already applies to cross-project item keys.
 *
 * The lookup goes project-then-component, and the project comes from
 * `getClientProject`, which resolves out of the granted list — so an ungranted
 * slug cannot get past the first line, and the component query is never even
 * asked with an id this session has no claim to.
 */
export default async function ClientComponentPage({
  params,
}: {
  params: Promise<{ slug: string; component: string }>;
}) {
  const { slug, component: componentSlug } = await params;

  const project = await getClientProject(slug);
  if (!project) notFound();

  const component = await getClientComponent(project.id, componentSlug);
  if (!component) notFound();

  const work = await listClientWork(project.id, component.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <Link
          href="/client"
          prefetch={false}
          className="inline-flex h-11 items-center gap-2 -ml-2 rounded-control px-2 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ink)]"
        >
          <ArrowLeft size={15} strokeWidth={2} aria-hidden />
          Overview
        </Link>

        <h1 className="mt-2 text-[24px] font-bold tracking-[-0.022em]">{component.name}</h1>

        {component.summary ? (
          <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
            {component.summary}
          </p>
        ) : null}
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section" aria-label="Progress">
        <div className="max-w-[62ch] rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-5">
          <ProgressLine done={component.doneCount} total={component.itemCount} label="Progress" />

          {component.minutesLogged !== null ? (
            <p className="mt-4 text-[13px] tabular-nums text-[var(--ink-faint)]">
              {hoursLabel(component.minutesLogged)} logged against this component
            </p>
          ) : null}
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.1} as="section" aria-labelledby="the-work">
        <h2 id="the-work" className="text-[16px] font-bold tracking-[-0.015em]">
          The work
        </h2>

        {work.length === 0 ? (
          <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
            Nothing has been published on this component yet. As each piece is ready to show, it
            will appear here.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {work.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4"
              >
                <div className="flex items-start gap-3">
                  {/* The tick is decorative — the state is already in words in
                      the chip below, so a screen reader hearing it twice would
                      be noise. */}
                  <span
                    aria-hidden
                    className={
                      item.isDone
                        ? "mt-[3px] inline-flex size-[17px] shrink-0 items-center justify-center rounded-full bg-[var(--jade)] text-white"
                        : "mt-[3px] inline-flex size-[17px] shrink-0 items-center justify-center rounded-full border border-[var(--hairline-strong)]"
                    }
                  >
                    {item.isDone ? <Check size={11} strokeWidth={3} /> : null}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[14.5px] font-medium leading-[1.45] break-words">
                      {item.title}
                    </p>

                    {item.summary ? (
                      <p className="text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
                        {item.summary}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-[29px]">
                  <span className="inline-flex items-center rounded-chip bg-[var(--tone-slate-bg)] px-2 py-[3px] text-[12px] font-medium text-[var(--tone-slate-fg)]">
                    {item.statusLabel}
                  </span>

                  {item.deadline ? (
                    <span className="text-[12.5px] tabular-nums text-[var(--ink-faint)]">
                      due {calendarDate(item.deadline)}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </main>
  );
}

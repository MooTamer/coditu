import { ComponentCard } from "@/components/client/component-card";
import { ProgressLine } from "@/components/client/progress-line";
import { Reveal } from "@/components/motion/reveal";
import {
  getClientCurrentSprint,
  listClientComponents,
  listClientProjects,
} from "@/lib/data/client";
import { calendarDate } from "@/lib/format";
import { getClientContact } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

/** The first name, for a greeting. "Cara Contact" → "Cara"; one word stays whole. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * The client overview — "here is where things stand".
 *
 * ── The shape of the page follows how many projects there are ───────────────
 *
 * Most contacts have exactly one. Making them tap through a list of one to
 * reach it is the kind of navigation that exists because a data model has more
 * than one of something, not because a person needs a choice. So one project
 * renders inline and several render as a list.
 *
 * ── What is not here ───────────────────────────────────────────────────────
 *
 * No sprint number. No item keys. No statuses in the plural — the progress line
 * says "5 of 8 done" rather than breaking the work into six states a client has
 * no use for. The sprint's `notes` are not fetched at all: they are addressed to
 * the team and begin "please work this sprint on the issues in the order they
 * are sorted in".
 */
export default async function ClientOverviewPage() {
  const contact = await getClientContact();
  if (!contact) return null;

  const projects = await listClientProjects();

  // Independent reads, in parallel — the same shape the internal shell uses.
  // Both are scoped to one project by the RPC, so there is no cross-project
  // filtering to get wrong here.
  const [sprint, components] =
    projects.length === 1
      ? await Promise.all([
          getClientCurrentSprint(projects[0].id),
          listClientComponents(projects[0].id),
        ])
      : [null, []];

  return (
    <main className="flex flex-1 flex-col gap-7 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">
          Hello, {firstName(contact.full_name)}.
        </h1>
        {projects.length > 0 ? (
          <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
            Here is where things stand{projects.length === 1 ? ` on ${projects[0].name}` : ""}.
          </p>
        ) : null}
      </Reveal>

      {projects.length === 0 ? (
        <Reveal tier="section" delay={0.06} as="section" aria-labelledby="nothing-yet">
          <div className="max-w-[62ch] rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-5">
            <h2 id="nothing-yet" className="text-[16px] font-bold tracking-[-0.015em]">
              Your access is still being set up
            </h2>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
              Nothing has been shared with you yet. When the Coditu team publishes work on your
              projects, it will appear here — what moved this week, where each piece of the build
              has got to, and anything we need your input on.
            </p>
            <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
              You do not need to do anything. Whoever invited you will let you know when it is
              ready.
            </p>
          </div>
        </Reveal>
      ) : null}

      {projects.length > 1 ? (
        <Reveal tier="section" delay={0.06} as="section" aria-labelledby="your-projects">
          <h2 id="your-projects" className="text-[16px] font-bold tracking-[-0.015em]">
            Your projects
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <a
                  href={`/client/projects/${project.slug}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-card border border-[var(--hairline)] bg-[var(--raised)] px-4 py-3 text-[15px] font-medium hover:border-[var(--hairline-strong)]"
                >
                  {project.name}
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      ) : null}

      {sprint ? (
        <Reveal tier="section" delay={0.1} as="section" aria-labelledby="right-now">
          <h2 id="right-now" className="text-[16px] font-bold tracking-[-0.015em]">
            Right now
          </h2>

          <div className="mt-4 max-w-[62ch] rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-5">
            {/* A heading, not a bold paragraph. It is the title of this card,
                the component cards below already use h3, and a screen reader
                navigating by heading should be able to reach "what is happening
                right now" without reading the section to get there. */}
            <h3 className="text-[15.5px] font-bold tracking-[-0.014em]">{sprint.name}</h3>

            {sprint.goal ? (
              <p className="mt-2 text-[14.5px] leading-[1.6] text-[var(--ink-muted)]">
                {sprint.goal}
              </p>
            ) : null}

            <p className="mt-2 text-[13px] tabular-nums text-[var(--ink-faint)]">
              {calendarDate(sprint.startsOn)} → {calendarDate(sprint.endsOn)}
            </p>

            <div className="mt-5">
              <ProgressLine
                done={sprint.doneItems}
                total={sprint.totalItems}
                label="This sprint"
              />
            </div>
          </div>
        </Reveal>
      ) : null}

      {components.length > 0 ? (
        <Reveal tier="section" delay={0.14} as="section" aria-labelledby="the-build">
          <h2 id="the-build" className="text-[16px] font-bold tracking-[-0.015em]">
            What we are building
          </h2>

          {/* One column on a phone, two from `sm`. Not `auto-fill` with a
              minmax: at 320px a 280px minimum overflows, which is the exact
              bug the sprint table already had. */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {components.map((component) => (
              <ComponentCard
                key={component.id}
                component={component}
                href={`/client/projects/${projects[0].slug}/components/${component.slug}`}
              />
            ))}
          </div>
        </Reveal>
      ) : null}

      {projects.length === 1 && components.length === 0 ? (
        <Reveal tier="section" delay={0.1} as="section">
          <p className="max-w-[62ch] text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
            Nothing has been published on {projects[0].name} yet. As each piece of the build is
            ready to show, it will appear here.
          </p>
        </Reveal>
      ) : null}
    </main>
  );
}

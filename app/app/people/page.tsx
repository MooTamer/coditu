import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getTeamLoad } from "@/lib/data/my-work";
import { listProjects, listSprintsForProject } from "@/lib/data/projects";
import { hours } from "@/lib/format";

export const metadata = { title: "People" };

/**
 * Team load for the active sprint.
 *
 * Capacity is stated as capacity, not as a target — a bar at 30% is not a
 * person underperforming, it is a person with room. The copy says so, because
 * a progress bar with no framing invites exactly the wrong reading.
 */
export default async function PeoplePage() {
  const projects = await listProjects();
  const active = projects.find((project) => project.activeSprint) ?? null;

  if (!active?.activeSprint) {
    return (
      <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
        <Reveal tier="section" as="header">
          <h1 className="text-[26px] font-bold tracking-[-0.024em]">People</h1>
          <p className="mt-2 max-w-[70ch] text-[14.5px] text-[var(--ink-muted)]">
            Load is measured against a sprint, and no project has an open one right now — so there is
            nothing to measure rather than a table of zeroes.
          </p>
        </Reveal>
      </main>
    );
  }

  const sprints = await listSprintsForProject(active.id);
  const sprint = sprints.find((s) => s.number === active.activeSprint!.number)!;
  const people = await getTeamLoad(sprint.id);

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">People</h1>
        <p className="mt-2 text-[14.5px] text-[var(--ink-muted)]">
          Load for {sprint.name}. Capacity is weekly, not a target.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        as="section"
        className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
      >
        {people.map((person) => {
          const percent =
            person.capacityMinutes > 0
              ? Math.min(Math.round((person.minutesLogged / person.capacityMinutes) * 100), 100)
              : 0;

          return (
            <div
              key={person.id}
              className="grid items-center gap-5 border-b border-[var(--hairline)] px-5 py-[18px] last:border-b-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-pill border border-[var(--hairline-strong)]">
                  <Mono size="meta">{person.initials}</Mono>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{person.fullName}</span>
                  <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
                    {person.role}
                  </Mono>
                </span>
              </div>

              <div>
                <Mono size="meta" className="block text-[var(--ink-faint)]">
                  assigned
                </Mono>
                <Mono size="key" className="block text-[15px]">
                  {person.assigned}
                </Mono>
              </div>

              <div>
                <Mono size="meta" className="block text-[var(--ink-faint)]">
                  review queue
                </Mono>
                <Mono size="key" className="block text-[15px]">
                  {person.reviewQueue}
                </Mono>
              </div>

              <div>
                <span className="flex items-baseline justify-between gap-2">
                  <Mono size="meta" className="text-[var(--ink-faint)]">
                    logged / capacity
                  </Mono>
                  <Mono size="meta" className="text-[var(--ink)]">
                    {hours(person.minutesLogged)} / {hours(person.capacityMinutes)}
                  </Mono>
                </span>
                <span
                  className="mt-2 block h-[6px] overflow-hidden rounded-pill bg-[var(--canvas)]"
                  role="img"
                  aria-label={`${person.fullName}: ${hours(person.minutesLogged)} of ${hours(
                    person.capacityMinutes
                  )} hours, ${percent} percent of capacity`}
                >
                  <span
                    className="block h-full"
                    style={{ width: `${percent}%`, background: "linear-gradient(90deg, #2B57FF, #21E2C6)" }}
                  />
                </span>
              </div>
            </div>
          );
        })}

        {people.length === 0 ? (
          <p className="px-5 py-[18px] text-[13.5px] text-[var(--ink-faint)]">
            Nobody is on this sprint yet.
          </p>
        ) : null}
      </Reveal>
    </main>
  );
}

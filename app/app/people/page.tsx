import { notFound } from "next/navigation";

import { AllowlistPanel } from "@/components/app/allowlist-panel.client";
import { TeamPanel, type TeamRow } from "@/components/app/team-panel.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getAllowlist } from "@/lib/data/allowlist";
import { getTeamLoad } from "@/lib/data/my-work";
import { listTeam } from "@/lib/data/profiles";
import { listProjects, listSprintsForProject } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "People" };

/**
 * The team, and who is allowed to join it.
 *
 * Two things live here because they are the same job: this is where an admin
 * decides who has access and what they may do with it. Load sits alongside
 * them because it is the answer to "who has room" — the question that usually
 * prompts the other two.
 *
 * Capacity is stated as capacity, not as a target. A bar at 30% is a person
 * with room, not a person underperforming.
 */
export default async function PeoplePage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const isAdmin = profile.role === "admin";

  const [team, projects, allowlist] = await Promise.all([
    listTeam(),
    listProjects(),
    // RLS returns nothing to anyone but an admin, and the section below says so
    // in words rather than rendering an empty list.
    isAdmin ? getAllowlist() : Promise.resolve([]),
  ]);

  const active = projects.find((project) => project.activeSprint) ?? null;
  let rows: TeamRow[] = team.map((person) => ({ ...person, load: null }));
  let sprintName: string | null = null;

  if (active?.activeSprint) {
    const sprints = await listSprintsForProject(active.id);
    const sprint = sprints.find((s) => s.number === active.activeSprint!.number);
    if (sprint) {
      sprintName = sprint.name;
      const load = await getTeamLoad(sprint.id);
      const byId = new Map(load.map((person) => [person.id, person]));
      rows = team.map((person) => {
        const own = byId.get(person.id);
        return {
          ...person,
          load: own
            ? {
                assigned: own.assigned,
                reviewQueue: own.reviewQueue,
                minutesLogged: own.minutesLogged,
              }
            : null,
        };
      });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">People</h1>
        <p className="mt-2 max-w-[72ch] text-[14.5px] text-[var(--ink-muted)]">
          {sprintName
            ? `Load for ${sprintName}. Capacity is weekly, not a target.`
            : "No project has an open sprint right now, so there is no load to measure — the team and its access are still here."}
        </p>
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section" aria-labelledby="team">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="team" className="text-[16px] font-bold tracking-[-0.015em]">
            The team
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {isAdmin ? "role and access are yours to change" : "roles are set by an admin"}
          </Mono>
        </div>

        <div className="mt-4">
          <TeamPanel
            rows={rows}
            isAdmin={isAdmin}
            currentProfileId={profile.id}
            hasSprint={sprintName !== null}
          />
        </div>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.12}
        as="section"
        aria-labelledby="allowlist"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="allowlist" className="text-[16px] font-bold tracking-[-0.015em]">
            Who can sign up
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {isAdmin ? `${allowlist.length} invited` : "admin only"}
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Coditu is invite-only. An address has to be on this list before anyone can create an account
          with it — enforced by a trigger on the user table, so it holds no matter what a form sends.
          Anyone else who tries is told they are not authorized.
        </p>

        <div className="mt-5">
          {isAdmin ? (
            <AllowlistPanel rows={allowlist} />
          ) : (
            // Present and explained, never hidden. A control that disappears
            // reads as a bug; one that says why reads as an answer.
            <p className="text-[13.5px] text-[var(--ink-muted)]">
              Only an admin can invite people. Ask one of them to add the address.
            </p>
          )}
        </div>
      </Reveal>
    </main>
  );
}

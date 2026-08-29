import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
import { AllowlistPanel } from "@/components/app/allowlist-panel.client";
import { TeamPanel, type TeamRow } from "@/components/app/team-panel.client";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { ToneChip } from "@/components/coditu/status-chip";
import { ACCESS_EVENT_LABEL } from "@/lib/access-events";
import { listAccessEvents } from "@/lib/data/access-events";
import { getAllowlist } from "@/lib/data/allowlist";
import { timestamp } from "@/lib/format";
import { CAPABILITIES, ROLES, ROLE_LABEL, SAFETY_RULES } from "@/lib/roles";
import { getTeamLoad } from "@/lib/data/my-work";
import { listTeam } from "@/lib/data/profiles";
import { listProjects, listSprintsForProject } from "@/lib/data/projects";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata = { title: "People" };

/**
 * The team, who is allowed to join it, what each role may do, and every change
 * anybody has made to any of that.
 *
 * These live together because they are the same job: this is where an admin
 * decides who has access and what they may do with it. Load sits alongside them
 * because it is the answer to "who has room" — the question that usually prompts
 * the other two.
 *
 * Capacity is stated as capacity, not as a target. A bar at 30% is a person with
 * room, not a person underperforming.
 *
 * ## Client contacts are NOT here, and that is a decision on the record
 *
 * The design puts them in a tab on this screen. `05-DECISIONS.md` put them on
 * `/app/clients` before the design arrived, with an argument that still holds:
 * People is about the team, that is about somebody who does not work here, and
 * the email-and-note form on this page grants nothing while the one there grants
 * everything a client sees. Sharing a screen would make both worse. The design
 * loses this one on behaviour, which is the rule `CLAUDE.md` states.
 *
 * ## Four sections, not the design's six
 *
 * `Deactivated` is not a section because deactivated people are already in the
 * team list, ordered last, with the control to bring them back. And there is no
 * `Invitations` state machine: this app allowlists an address and the person
 * signs up. Inventing pending / expired / withdrawn states to fill a tab would
 * be inventing a feature.
 */
export default async function PeoplePage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const isAdmin = profile.role === "admin";

  const canSeeHistory = profile.role === "admin" || profile.role === "lead";

  const [team, projects, allowlist, history] = await Promise.all([
    listTeam(),
    listProjects(),
    // RLS returns nothing to anyone but an admin, and the section below says so
    // in words rather than rendering an empty list.
    isAdmin ? getAllowlist() : Promise.resolve([]),
    // Same shape: the policy is what decides, and an engineer is told why
    // rather than shown an empty list.
    canSeeHistory ? listAccessEvents() : Promise.resolve([]),
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
    <PageShell measure="people">
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

      <Reveal
        tier="section"
        delay={0.14}
        as="section"
        aria-labelledby="roles"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="roles" className="text-[16px] font-bold tracking-[-0.015em]">
            Roles and what they may do
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {ROLE_LABEL[profile.role as keyof typeof ROLE_LABEL] ?? profile.role} · yours
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Every line is enforced by a policy, a trigger or a server-side check — this table decides
          nothing, it only says what the rules already are. The last column names where each one
          actually lives, so a reader who suspects this has gone stale knows which to trust.
        </p>

        {/* Its own scroll container. A five-column table has no phone layout,
            and the page body must not scroll sideways.

            `tabIndex` and a name on the container, not decoration: a region
            that scrolls and cannot be focused is unreachable by keyboard, and
            axe says so as `scrollable-region-focusable`. It shipped in W9 and
            W10's first full `--workers=1` run is what found it — the W9 gate
            ran the a11y and access specs, and this table only overflows at
            390px, which is `mobile.spec.ts`. Confirmed at `aa33663` before
            being called a regression. */}
        <div
          className="mt-5 -mx-2 overflow-x-auto px-2"
          tabIndex={0}
          role="group"
          aria-labelledby="roles"
        >
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--hairline)]">
                <th scope="col" className="pb-2 text-[12.5px] font-medium text-[var(--ink-muted)]">
                  Capability
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="w-[86px] pb-2 text-center text-[12.5px] font-medium text-[var(--ink-muted)]"
                  >
                    {ROLE_LABEL[role]}
                  </th>
                ))}
                <th scope="col" className="pb-2 pl-4 text-[12.5px] font-medium text-[var(--ink-muted)]">
                  Enforced by
                </th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((capability) => (
                <tr key={capability.what} className="border-b border-[var(--hairline)] last:border-b-0">
                  <th scope="row" className="py-[10px] pr-4 text-[13px] font-normal">
                    {capability.what}
                  </th>
                  {ROLES.map((role) => (
                    <td key={role} className="py-[10px] text-center">
                      {/* A word, not a tick. Colour and shape alone would make
                          this table unreadable to anybody who cannot see the
                          difference, and `yes`/`no` is two characters. */}
                      <Mono
                        size="meta"
                        className={capability[role] ? "text-[var(--tone-jade-fg)]" : "text-[var(--ink-faint)]"}
                      >
                        {capability[role] ? "yes" : "no"}
                      </Mono>
                    </td>
                  ))}
                  <td className="py-[10px] pl-4">
                    <Mono size="meta" className="text-[var(--ink-faint)]">
                      {capability.enforcedBy}
                    </Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-6 flex list-none flex-col gap-3">
          {SAFETY_RULES.map((rule) => (
            <li key={rule.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <ToneChip tone={rule.tone} className="shrink-0">
                {rule.label}
              </ToneChip>
              <span className="min-w-[240px] flex-1 text-[13px] leading-[1.55] text-[var(--ink-muted)]">
                {rule.body}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.16}
        as="section"
        aria-labelledby="history"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="history" className="text-[16px] font-bold tracking-[-0.015em]">
            Latest access changes
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {canSeeHistory ? `${history.length}` : "admin and lead only"}
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Written by database triggers rather than by the screens that cause them, so a change made
          from a console or a script is in here too. Nothing in this application can write, edit or
          remove a line of it — there is no grant to do so.
        </p>

        <div className="mt-5">
          {!canSeeHistory ? (
            <p className="text-[13.5px] text-[var(--ink-muted)]">
              Access history names capabilities that are an admin&rsquo;s and a lead&rsquo;s. The team
              list above stays visible to everybody — that is what the workspace is for.
            </p>
          ) : history.length === 0 ? (
            <p className="text-[13.5px] text-[var(--ink-faint)]">
              Nothing has changed yet. The first role, invitation or grant will appear here.
            </p>
          ) : (
            <ul data-access-history className="flex list-none flex-col">
              {history.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--hairline)] py-[10px] last:border-b-0"
                >
                  <Mono
                    size="meta"
                    className="w-[112px] shrink-0 rounded-chip border border-[var(--hairline)] px-[6px] py-[2px] text-center text-[var(--ink-faint)]"
                  >
                    {ACCESS_EVENT_LABEL[event.kind]}
                  </Mono>
                  <span className="min-w-[240px] flex-1 text-[13px]">{event.sentence}</span>
                  <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
                    {timestamp(event.at)}
                  </Mono>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>
    </PageShell>
  );
}

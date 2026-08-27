import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/app/page-shell";
import { PersonAvatar } from "@/components/app/person-avatar";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Mono } from "@/components/coditu/mono";
import { Recents } from "@/components/app/recents.client";
import { Reveal } from "@/components/motion/reveal";
import { getMyWork, getTeamLoad, type PersonLoad } from "@/lib/data/my-work";
import { listNotifications } from "@/lib/data/notifications";
import { listProjects } from "@/lib/data/projects";
import { listRecents } from "@/lib/data/recents";
import { daysRemaining, getSprint, statusDistribution } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { getCurrentProfile } from "@/lib/supabase/server";
import { greeting, todayInCairo, todayLabel } from "@/lib/today";

export const metadata = { title: "Home" };

/**
 * What a notification is about, in words.
 *
 * `notifications.kind` is an enum and the row carries no sentence, so the
 * phrasing lives here — one place, rather than a `case` in every surface that
 * grows a notification list later.
 */
const NOTIFICATION_VERB: Record<"mention" | "assigned" | "review_requested", string> = {
  mention: "Mentioned you",
  assigned: "Assigned to you",
  review_requested: "Waiting on your review",
};

/**
 * `/app` — the workspace, rather than a redirect to somewhere else in it.
 *
 * It used to be a router: find a project with an active sprint and send you
 * there. That was right when the sprint was the only screen worth landing on,
 * and it stopped being right once there were nine. It also answered the wrong
 * question — "which sprint is active" rather than "what should I look at" —
 * and the two have different answers on any day somebody is reviewing rather
 * than building.
 *
 * **The redirect survives as the fallback it always should have been.** With no
 * active sprint anywhere, this page has no sprint card to render, and the rest
 * of it — your queue, your mentions — is still the right landing place, so it
 * simply says so.
 *
 * ## Everything here is real
 *
 * The design's Home shows Week 17 numbers, five recents and three favourites.
 * Those are demonstration content. What this renders is `getMyWork`,
 * `listNotifications`, `listProjects` and `getSprint` — the same readers the
 * screens they link to use, so a number here can never disagree with the number
 * you get when you click it.
 *
 * Favourites, recents and project spaces are not built yet: they need a table
 * nobody has designed, and a Home that invented them would be showing the
 * prototype's furniture rather than this team's work.
 */
export default async function WorkspaceHomePage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const [projects, myWork, notifications, recents] = await Promise.all([
    listProjects(),
    getMyWork(),
    listNotifications(),
    // Where this person has been. Scoped to the caller by RLS, not by a filter
    // — see `lib/data/recents.ts`.
    listRecents(),
  ]);

  const withSprint = projects.find((project) => project.activeSprint);
  // `getSprint` takes the project's ID, not its slug. Both are `string`, so
  // passing the slug typechecks perfectly and fails at the database with
  // `22P02 invalid input syntax for type uuid` — which is only visible by
  // opening the page. It was written that way here first.
  const sprint =
    withSprint?.activeSprint
      ? await getSprint(withSprint.id, withSprint.activeSprint.number)
      : null;
  const load = sprint ? await getTeamLoad(sprint.id) : [];

  const unread = notifications.filter((n) => !n.readAt);

  const today = todayInCairo();
  const overdue = Boolean(sprint?.endsOn && sprint.endsOn < today);
  const left = sprint ? daysRemaining(sprint.endsOn) : null;

  return (
    <PageShell measure="home">
      <Reveal tier="section">
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          {todayLabel()}
        </Mono>
        <h1 className="mt-1 text-[24px] font-medium tracking-[-0.015em] text-[var(--ink)]">
          {greeting(profile.full_name)}
        </h1>
      </Reveal>

      {sprint && withSprint ? (
        <Reveal
          tier="section"
          delay={0.06}
          className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                active sprint · {withSprint.clientName}
              </Mono>
              <h2 className="mt-[2px] text-[18px] font-medium text-[var(--ink)]">{sprint.name}</h2>
            </div>
            <Link
              href={`/app/projects/${withSprint.slug}/sprints/${sprint.number}`}
              className="rounded-chip border border-[var(--hairline)] px-3 py-[6px] text-[12.5px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              Open sprint
            </Link>
          </div>

          {sprint.goal ? (
            <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
              {sprint.goal}
            </p>
          ) : null}

          <Mono size="meta" className="mt-2 block text-[11.5px] text-[var(--ink-faint)]">
            {sprint.startsOn ? calendarDate(sprint.startsOn) : "no start date"}
            {sprint.endsOn ? ` → ${calendarDate(sprint.endsOn)}` : ""}
            {/* Stated as a fact, not as an alarm — a sprint that has run out is
                a planning conversation, not a red banner. But it has to be the
                RIGHT fact: `daysRemaining` clamps at zero, so a sprint that
                ended two days ago reads "0 days left", which is what this said
                until the page was opened. Comparing the ISO dates as strings is
                exact here; both are calendar dates in Cairo. */}
            {overdue ? " · ended" : left !== null ? ` · ${left} days left` : ""}
          </Mono>

          <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <div>
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                status · {sprint.items.length} {sprint.items.length === 1 ? "story" : "stories"}
              </Mono>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {statusDistribution(sprint.items).map((slice) => (
                  <li key={slice.status} className="flex items-center gap-[6px]">
                    {/* The chip already says the status. Printing
                        `STATUS_LABEL` beside it renders "in progress in
                        progress 3", which is what it did until somebody
                        opened the page. */}
                    <StatusChipDot status={slice.status} />
                    <Mono size="meta" className="tabular-nums text-[11.5px] text-[var(--ink-muted)]">
                      {slice.count}
                    </Mono>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                hours
              </Mono>
              {/* Invariant 2: minutes everywhere, divided by 60 at the render
                  edge and nowhere else. `hours()` is that edge. */}
              <p className="mt-1 text-[20px] font-medium tabular-nums text-[var(--ink)]">
                {hours(sprint.items.reduce((total, item) => total + item.minutesLogged, 0))}
                <span className="ml-1 text-[12.5px] font-normal text-[var(--ink-faint)]">
                  / {hours(sprint.items.reduce((total, item) => total + item.estimateMinutes, 0))}{" "}
                  estimated
                </span>
              </p>
              {load.length > 0 ? (
                <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {load.map((person: PersonLoad) => (
                    <li key={person.id} className="flex items-center gap-[6px]">
                      <PersonAvatar
                        person={{ ...person, avatarUrl: null }}
                        size={18}
                      />
                      <Mono size="meta" className="text-[11.5px] text-[var(--ink-faint)]">
                        {hours(person.minutesLogged)}
                      </Mono>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </Reveal>
      ) : (
        <Reveal
          tier="section"
          delay={0.06}
          className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
        >
          <p className="text-[13.5px] text-[var(--ink-muted)]">
            No sprint is active. <Link href="/app/projects" className="underline">Projects</Link> is
            where the next one gets planned.
          </p>
        </Reveal>
      )}

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <Reveal
          tier="section"
          delay={0.12}
          className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              my work
            </Mono>
            <Link
              href="/app/my-work"
              className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              open view →
            </Link>
          </div>

          <MyWorkList
            heading="Assigned to me"
            items={myWork?.assigned ?? []}
            empty="Nothing assigned — the sprint board is the place to pick something up."
          />
          <MyWorkList
            heading="Waiting on my review"
            items={myWork?.awaitingMyReview ?? []}
            empty="Nothing waiting on you."
          />
        </Reveal>

        <Reveal
          tier="section"
          delay={0.18}
          className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
        >
          <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            mentions &amp; discussion
            {unread.length > 0 ? ` · ${unread.length} unread` : ""}
          </Mono>

          {notifications.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
              Nobody has needed you yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {notifications.slice(0, 6).map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/app/projects/${note.projectSlug}/sprints/${note.sprintNumber}/items/${note.itemKey}`}
                    className="flex items-start gap-[10px] rounded-inner px-2 py-[6px] hover:bg-[var(--canvas)]"
                  >
                    <Mono size="meta" className="mt-[2px] shrink-0 text-[11px] text-[var(--ink-faint)]">
                      {note.itemKey}
                    </Mono>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[var(--ink)]">
                        {NOTIFICATION_VERB[note.kind]} · {note.itemTitle}
                      </span>
                      {note.preview ? (
                        <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                          {note.preview}
                        </span>
                      ) : null}
                    </span>
                    {!note.readAt ? (
                      <span
                        aria-hidden="true"
                        className="mt-[6px] size-[6px] shrink-0 rounded-full bg-[var(--jade)]"
                      />
                    ) : null}
                    <span className="sr-only">{note.readAt ? "" : " — unread"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Reveal>

        <Reveal
          tier="section"
          delay={0.24}
          className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
        >
          {/* `PLAN.md` §2's fourth Home section, and the prototype's own panel.
              Renders nothing at all until somebody has opened something, which
              is why there is no empty state to look at on a fresh workspace. */}
          <Recents items={recents} />
          {recents.length === 0 ? (
            <>
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                recently opened
              </Mono>
              <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
                Stories, notes and pages you open turn up here.
              </p>
            </>
          ) : null}
        </Reveal>
      </div>
    </PageShell>
  );
}

/**
 * One queue.
 *
 * The empty string is the design's own — *"Nothing in this queue — the sprint
 * board is the place to pick something up"* — because an empty queue is a
 * normal Tuesday and telling somebody where to go next is more use than an
 * illustration of a box.
 */
function MyWorkList({
  heading,
  items,
  empty,
}: {
  heading: string;
  items: Awaited<ReturnType<typeof getMyWork>> extends infer T
    ? T extends { assigned: infer A }
      ? A
      : never
    : never;
  empty: string;
}) {
  return (
    <section className="mt-3">
      <Mono size="meta" className="text-[11.5px] text-[var(--ink-muted)]">
        {heading} · {items.length}
      </Mono>
      {items.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-[var(--ink-faint)]">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {items.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/projects/${item.projectSlug}/sprints/${item.sprintNumber}/items/${item.key}`}
                className="flex items-center gap-[10px] rounded-inner px-2 py-[6px] hover:bg-[var(--canvas)]"
              >
                <Mono size="meta" className="shrink-0 text-[11px] text-[var(--ink-faint)]">
                  {item.key}
                </Mono>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">
                  {item.title}
                </span>
                <StatusChipDot status={item.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

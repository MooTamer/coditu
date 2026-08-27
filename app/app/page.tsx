import Link from "next/link";
import { notFound } from "next/navigation";

import { HomeQuickActions } from "@/components/app/home-quick-actions.client";
import { HomeWorkTabs } from "@/components/app/home-work-tabs.client";
import { OnlineNow } from "@/components/app/online-now.client";
import { PageShell } from "@/components/app/page-shell";
import { Mono } from "@/components/coditu/mono";
import { Recents } from "@/components/app/recents.client";
import { Reveal } from "@/components/motion/reveal";
import { getMyWork, getTeamLoad, type PersonLoad } from "@/lib/data/my-work";
import { listNotifications } from "@/lib/data/notifications";
import { listProjectActivity, listProjects } from "@/lib/data/projects";
import { listActiveProfiles } from "@/lib/data/profiles";
import { listRecents } from "@/lib/data/recents";
import { daysRemaining, getSprint, statusDistribution } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { STATUS_BAR_COLOR, STATUS_LABEL } from "@/lib/work-items";
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

  const [projects, myWork, notifications, recents, people] = await Promise.all([
    listProjects(),
    getMyWork(),
    listNotifications(),
    // Where this person has been. Scoped to the caller by RLS, not by a filter
    // — see `lib/data/recents.ts`.
    listRecents(),
    // The roster the `Online now` card lists. Presence itself is a socket; this
    // is who there is to be present.
    listActiveProfiles(),
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

  /**
   * The activity feed, scoped to the project whose sprint is active.
   *
   * Invariant 1: nothing is global. There is no workspace-wide activity query
   * and this does not invent one — it asks the same question the rest of this
   * screen asks, about the same project, and says so in its heading. RLS scopes
   * the read on top of that.
   */
  const activity = withSprint ? await listProjectActivity(withSprint.id, 6) : [];

  const slices = sprint ? statusDistribution(sprint.items) : [];
  const sprintHref =
    sprint && withSprint ? `/app/projects/${withSprint.slug}/sprints/${sprint.number}` : null;
  const canCreate = profile.role === "admin" || profile.role === "lead";

  const unread = notifications.filter((n) => !n.readAt);

  const today = todayInCairo();
  const overdue = Boolean(sprint?.endsOn && sprint.endsOn < today);
  const left = sprint ? daysRemaining(sprint.endsOn) : null;

  return (
    <PageShell measure="home">
      <Reveal
        tier="section"
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            {todayLabel()}
          </Mono>
          <h1 className="mt-[6px] text-[26px] font-bold tracking-[-0.024em] text-[var(--ink)]">
            {greeting(profile.full_name)}
          </h1>
        </div>
        <HomeQuickActions
          sprintHref={sprintHref}
          notesHref={sprintHref ? `${sprintHref}/notes` : null}
          canCreate={canCreate}
        />
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

          <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))]">
            <div className="min-w-0">
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Goal
              </Mono>
              {/* `sprints.goal` is the sentence the rest of this card is
                  evidence for. It was rendered above, loose under the name; the
                  handoff makes it the first of three columns. */}
              <p className="mt-2 max-w-[44ch] text-[13.5px] leading-[1.5] text-[var(--ink)]">
                {sprint.goal ?? (
                  <span className="text-[var(--ink-faint)]">No goal written for this sprint.</span>
                )}
              </p>
              <Mono size="meta" className="mt-3 block text-[11px] text-[var(--ink-faint)]">
                {sprint.startsOn ? calendarDate(sprint.startsOn) : "no start date"}
                {sprint.endsOn ? ` → ${calendarDate(sprint.endsOn)}` : ""}
              </Mono>
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-[10px]">
                <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                  Status
                </Mono>
                <Mono size="meta" className="tabular-nums text-[var(--ink-muted)]">
                  {sprint.items.length} {sprint.items.length === 1 ? "story" : "stories"}
                </Mono>
              </div>

              {/* The handoff's stacked bar. One span per status, width by
                  share, and a `role="img"` label naming every slice — the bar
                  is colour, and colour alone says nothing. */}
              <div
                role="img"
                aria-label={`Status distribution: ${slices
                  .map((slice) => `${STATUS_LABEL[slice.status]} ${slice.count}`)
                  .join(", ")}`}
                className="mt-[10px] flex h-[10px] overflow-hidden rounded-pill bg-[var(--canvas)]"
              >
                {slices.map((slice) => (
                  <span
                    key={slice.status}
                    title={`${STATUS_LABEL[slice.status]} — ${slice.count}`}
                    style={{ width: `${slice.share}%`, background: STATUS_BAR_COLOR[slice.status] }}
                  />
                ))}
              </div>

              <ul className="mt-[10px] flex list-none flex-wrap gap-x-3 gap-y-[6px]">
                {slices.map((slice) => (
                  <li key={slice.status} className="flex items-center gap-[6px]">
                    <span
                      aria-hidden
                      className="size-[7px] rounded-[2px]"
                      style={{ background: STATUS_BAR_COLOR[slice.status] }}
                    />
                    <Mono size="meta" className="tabular-nums text-[var(--ink-muted)]">
                      {STATUS_LABEL[slice.status]} {slice.count}
                    </Mono>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Hours
              </Mono>
              {/* Invariant 2: minutes everywhere, divided by 60 at the render
                  edge and nowhere else. `hours()` is that edge. */}
              <div className="mt-2 flex items-baseline gap-2">
                <Mono size="metric" className="tabular-nums text-[var(--ink)]">
                  {hours(sprint.items.reduce((total, item) => total + item.minutesLogged, 0))}
                </Mono>
                <Mono size="key" className="text-[var(--ink-faint)]">
                  / {hours(sprint.items.reduce((total, item) => total + item.estimateMinutes, 0))} h
                  estimated
                </Mono>
              </div>

              {load.length > 0 ? (
                <ul className="mt-3 flex list-none flex-col gap-[7px]">
                  {load.map((person: PersonLoad) => {
                    // Share of the sprint's logged time, not of a capacity —
                    // the bar says who did how much of what was done, which is
                    // the only thing these two numbers can honestly compare.
                    const total = load.reduce((sum, p) => sum + p.minutesLogged, 0);
                    const pct = total > 0 ? Math.round((person.minutesLogged / total) * 100) : 0;
                    return (
                      <li key={person.id} className="flex items-center gap-2">
                        <Mono size="meta" className="w-[22px] shrink-0 text-[var(--ink-faint)]">
                          {person.initials}
                        </Mono>
                        <span className="h-[5px] flex-1 overflow-hidden rounded-pill bg-[var(--canvas)]">
                          <span
                            className="block h-full rounded-pill"
                            style={{ width: `${pct}%`, background: "var(--group-1)" }}
                          />
                        </span>
                        <Mono size="meta" className="shrink-0 tabular-nums text-[var(--ink-muted)]">
                          {hours(person.minutesLogged)}
                        </Mono>
                      </li>
                    );
                  })}
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

      {/* The handoff's two columns: the work on the left, the workspace on the
          right. `data-home-grid` becomes `minmax(0,1fr) 320px` at 1180px in
          `globals.css`; below that this stays one flowing column. */}
      <div data-home-grid className="flex flex-col gap-5">
        <div className="flex min-w-0 flex-col gap-5">
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

          <div className="mt-3">
            <HomeWorkTabs
              assigned={myWork?.assigned ?? []}
              reviewing={myWork?.awaitingMyReview ?? []}
              sprintEndsOn={sprint?.endsOn ?? null}
            />
          </div>
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

        </div>

        {/* The 320px right column. At 1180 and above it sits beside the work;
            below, it flows underneath it — one column, in this order. */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal tier="section" delay={0.24}>
            <OnlineNow me={{ id: profile.id }} people={people} />
          </Reveal>

          <Reveal
            tier="section"
            delay={0.28}
            className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
          >
            {/* Renders nothing at all until somebody has opened something,
                which is why there is no empty state on a fresh workspace. */}
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

          {withSprint ? (
            <Reveal
              tier="section"
              delay={0.32}
              className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
            >
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Activity · {withSprint.name}
              </Mono>
              {/* Named, not "Activity" alone: invariant 1 says nothing here is
                  global, and a heading that implied otherwise would be the
                  first thing to mislead somebody with two clients open. */}
              {activity.length ? (
                <ul className="mt-3 flex list-none flex-col gap-[11px]">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex gap-[10px]">
                      <span
                        aria-hidden
                        className="mt-[6px] size-[6px] shrink-0 rounded-pill bg-[var(--hairline-strong)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] leading-[1.45] text-[var(--ink)]">
                          {entry.href ? (
                            <Link href={entry.href} className="hover:text-[var(--accent)]">
                              {entry.sentence}
                            </Link>
                          ) : (
                            entry.sentence
                          )}
                        </span>
                        <Mono size="meta" className="block text-[var(--ink-faint)]">
                          {calendarDate(entry.at.slice(0, 10))}
                        </Mono>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
                  Nothing has happened on this project yet.
                </p>
              )}
            </Reveal>
          ) : null}
        </div>
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

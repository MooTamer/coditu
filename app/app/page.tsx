import Link from "next/link";
import { notFound } from "next/navigation";

import { HomeQuickActions } from "@/components/app/home-quick-actions.client";
import { HomeWorkTabs } from "@/components/app/home-work-tabs.client";
import { MarkAllRead } from "@/components/app/mark-all-read.client";
import { OnlineNow } from "@/components/app/online-now.client";
import { PageShell } from "@/components/app/page-shell";
import { PersonAvatar } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import { Recents } from "@/components/app/recents.client";
import { Reveal } from "@/components/motion/reveal";
import {
  getMyWork,
  getProjectLoadOverTime,
  getTeamLoad,
  type PersonLoad,
} from "@/lib/data/my-work";
import { listNotifications } from "@/lib/data/notifications";
import { listProjectActivity, listProjects } from "@/lib/data/projects";
import { listActiveProfiles } from "@/lib/data/profiles";
import { listRecents } from "@/lib/data/recents";
import { daysRemaining, getSprint, statusDistribution } from "@/lib/data/sprint";
import { calendarDate, hours, timestamp } from "@/lib/format";
import {
  busiest,
  loadOverTime,
  loadShare,
  logTimeTarget,
  mentionLine,
  type SprintScope,
} from "@/lib/home";
import { STATUS_BAR_COLOR, STATUS_LABEL, statusRank } from "@/lib/work-items";
import { getCurrentProfile } from "@/lib/supabase/server";
import { greeting, todayInCairo, todayLabel } from "@/lib/today";

export const metadata = { title: "Home" };

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
 * ## The layout is the source's
 *
 * `design/project/Coditu Workspace.dc.html` opens `homeCols` **before** the
 * column that holds Active sprint, My work and Mentions — so the right-hand
 * 320px track begins level with the sprint card, not below it. The build put
 * the card outside the grid entirely, which meant the right column started
 * alongside My work and everything in it sat a card lower than it is drawn.
 *
 * ## Everything here is real
 *
 * The design's Home shows Week 17 numbers, five recents and three favourites.
 * Those are demonstration content. What this renders is `getMyWork`,
 * `listNotifications`, `listProjects` and `getSprint` — the same readers the
 * screens they link to use, so a number here can never disagree with the number
 * you get when you click it.
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
    // The roster the `Online now` card lists. Presence itself is a socket
    // joined by the shell; this is who there is to be present.
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
  // Cairo, once. Two calls could straddle midnight and disagree by a day.
  const today = todayInCairo();

  /**
   * One round for the three reads that depend only on what the first round
   * already resolved. They were three sequential awaits — the waterfall PF-9
   * measured on the peek route and fixed there, growing back here.
   */
  const [load, activity, loggedDays] = await Promise.all([
    sprint ? getTeamLoad(sprint.id) : Promise.resolve([]),
    /**
     * The activity feed, scoped to the project whose sprint is active.
     *
     * Invariant 1: nothing is global. There is no workspace-wide activity query
     * and this does not invent one — it asks the same question the rest of this
     * screen asks, about the same project, and says so in its heading. RLS
     * scopes the read on top of that.
     */
    withSprint ? listProjectActivity(withSprint.id, 6) : Promise.resolve([]),
    // PF-5: every logged day on this project, for the weekly average and the
    // cumulative total beside each person's bar.
    withSprint ? getProjectLoadOverTime(withSprint.id) : Promise.resolve([]),
  ]);

  const overTime = new Map(
    loadOverTime(loggedDays, today).map((person) => [person.personId, person])
  );

  const slices = sprint ? statusDistribution(sprint.items) : [];
  const sprintHref =
    sprint && withSprint ? `/app/projects/${withSprint.slug}/sprints/${sprint.number}` : null;
  const canCreate = profile.role === "admin" || profile.role === "lead";

  /**
   * The active sprint as an address, not just a date.
   *
   * Everything on this page that claims to be "this sprint's" is filtered
   * through it. `getMyWork()` reads the caller's work across the **whole
   * workspace**, so a predicate that knew only `endsOn` admitted another
   * client's story with a near deadline — see `lib/home.ts`.
   */
  const scope: SprintScope | null =
    sprint?.endsOn && withSprint
      ? { projectSlug: withSprint.slug, sprintNumber: sprint.number, endsOn: sprint.endsOn }
      : null;

  const assigned = myWork?.assigned ?? [];
  // From the SPRINT's own rows, not from the workspace-wide assigned list: a
  // row that is not in this sprint is not in that array, so the scope is
  // structural. It also survives a closed week, where every row is `done` and
  // the assigned list is empty while people are still logging Friday's hours.
  const logTimeItem = sprint
    ? logTimeTarget(sprint.items, profile.id, (item) => statusRank(item.status))
    : null;

  const unread = notifications.filter((note) => !note.readAt);

  const overdue = Boolean(sprint?.endsOn && sprint.endsOn < today);
  const left = sprint ? daysRemaining(sprint.endsOn) : null;

  // Every bar is read against the busiest person, which is what the source
  // divides by. Minutes throughout; `hours()` is the only division by 60.
  const mostLogged = busiest(load);

  const sprintCard =
    sprint && withSprint ? (
      <Reveal
        tier="section"
        delay={0.06}
        data-active-sprint
        className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
      >
        {/* One header row, as the source draws it: the eyebrow, the sprint's
            name, how long is left, and Open sprint pushed to the end. The goal
            is NOT here — it is the first of the three columns below, and
            rendering it in both places printed a non-empty goal twice. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            active sprint · {withSprint.clientName}
          </Mono>
          {/* The card is a section and the sprint is its title, so the NAME
              carries the level rather than the eyebrow above it: an eyebrow
              reading "active sprint" names the kind of card, not this one. */}
          <h2 className="min-w-0 text-[18px] font-medium">
            {/* 44px on a coarse pointer, the app's usual pair. The link used to
                be the flex item itself and measured 153x22 once it was wrapped;
                `mobile.spec.ts`'s sweep caught it on `/app`. It is the card's
                primary link and a thumb has to hit it. */}
            <Link
              href={sprintHref!}
              className="inline-flex min-h-11 items-center text-[var(--ink)] hover:text-[var(--accent)] md:min-h-0"
            >
              {sprint.name}
            </Link>
          </h2>
          {/* Stated as a fact, not as an alarm — a sprint that has run out is a
              planning conversation, not a red banner. But it has to be the
              RIGHT fact: `daysRemaining` clamps at zero, so a sprint that ended
              two days ago reads "0 days left" without this. */}
          {/* "Sprint — Week 17 · ended", read straight through — the same
              separator the eyebrow above and the date line below already use.
              The chip on its own said "ended" beside a name with nothing
              joining the two, which reads as a badge for something else. */}
          <span className="flex items-baseline gap-[6px]">
            <span aria-hidden className="text-[11px] text-[var(--ink-faint)]">
              ·
            </span>{" "}
            <Mono
              size="meta"
              className="rounded-chip bg-[var(--tone-amber-bg)] px-2 py-[3px] text-[var(--tone-amber-fg)]"
            >
              {overdue ? "ended" : left !== null ? `${left} days left` : "no end date"}
            </Mono>
          </span>
          <Link
            href={sprintHref!}
            className="ml-auto rounded-chip border border-[var(--hairline)] px-3 py-[6px] text-[12.5px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Open sprint
          </Link>
        </div>

        <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))]">
          <div className="min-w-0">
            <Mono as="h3" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              Goal
            </Mono>
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
              <Mono as="h3" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Status
              </Mono>
              <Mono size="meta" className="tabular-nums text-[var(--ink-muted)]">
                {sprint.items.length} {sprint.items.length === 1 ? "story" : "stories"}
              </Mono>
            </div>

            {/* The handoff's stacked bar. One span per status, width by share,
                and a `role="img"` label naming every slice — the bar is colour,
                and colour alone says nothing. */}
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

            {/* The legend is the source's `s.filter` — every entry opens the
                sprint filtered to that status. It was a `<ul>` of inert spans,
                which looked identical and did nothing; the row was signed off
                on the presence of `role="img"`, which is the bar, not this. */}
            <ul className="mt-[10px] flex list-none flex-wrap gap-x-3 gap-y-[6px]">
              {slices.map((slice) => (
                <li key={slice.status}>
                  <Link
                    href={`${sprintHref}?status=${slice.status}`}
                    data-status-legend={slice.status}
                    className="flex min-h-11 items-center gap-[6px] rounded-control px-1 text-[var(--ink-muted)] hover:bg-[var(--tint)] hover:text-[var(--ink)] md:min-h-[28px]"
                  >
                    <span
                      aria-hidden
                      className="size-[7px] shrink-0 rounded-[2px]"
                      style={{ background: STATUS_BAR_COLOR[slice.status] }}
                    />
                    <Mono size="meta" className="tabular-nums">
                      {STATUS_LABEL[slice.status]} {slice.count}
                    </Mono>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <Mono as="h3" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
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
                  // Against the BUSIEST person, which is the comparison the
                  // source draws — `maxLoad`, not the sum. Dividing by the
                  // total answered a different question and left every bar
                  // short of its track.
                  const pct = loadShare(person.minutesLogged, mostLogged);
                  // PF-5. Absent when this person has logged nothing on the
                  // project at all, which is a different thing from zero and
                  // reads as one below.
                  const history = overTime.get(person.id);
                  return (
                    <li key={person.id} data-load-bar={person.id} data-load-pct={pct}>
                      <span className="flex items-center gap-2">
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
                      </span>
                      {/* PF-5, beside the bar rather than instead of it: the bar
                          is this SPRINT against the busiest person, and these
                          two are the same person across the whole project. An
                          average with no week count beside it is a number
                          nobody can check, so the count travels with it. */}
                      <Mono
                        size="meta"
                        data-load-history={person.id}
                        data-load-average={history?.weeklyAverageMinutes ?? ""}
                        data-load-weeks={history?.weeks ?? 0}
                        data-load-cumulative={history?.cumulativeMinutes ?? 0}
                        className="mt-[3px] block pl-[30px] tabular-nums text-[var(--ink-faint)]"
                      >
                        {history?.weeklyAverageMinutes != null
                          ? `${hours(history.weeklyAverageMinutes)} h/wk · ${history.weeks} wks`
                          : "no full week yet"}
                        {" · "}
                        {hours(history?.cumulativeMinutes ?? 0)} h total
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
        data-active-sprint
        className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
      >
        <p className="text-[13.5px] text-[var(--ink-muted)]">
          No sprint is active. <Link href="/app/projects" className="underline">Projects</Link> is
          where the next one gets planned.
        </p>
      </Reveal>
    );

  return (
    <PageShell measure="home">
      <Reveal tier="section" className="flex flex-wrap items-end justify-between gap-4">
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
          logTime={
            logTimeItem && sprintHref
              ? { href: `${sprintHref}/items/${logTimeItem.key}#log-time`, itemKey: logTimeItem.key }
              : null
          }
          canCreate={canCreate}
        />
      </Reveal>

      {/* The handoff's two columns: the work on the left, the workspace on the
          right, and the grid opens ABOVE the sprint card so the right column
          begins level with it. `data-home-grid` becomes `minmax(0,1fr) 320px`
          at 1180px in `globals.css`; below that this stays one flowing
          column, in this order. */}
      <div data-home-grid className="flex flex-col gap-5">
        <div data-home-left className="flex min-w-0 flex-col gap-5">
          {sprintCard}

          <Reveal
            tier="section"
            delay={0.12}
            className="rounded-section border border-[var(--hairline)] bg-[var(--overlay)] p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Mono as="h2" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
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
                assigned={assigned}
                reviewing={myWork?.awaitingMyReview ?? []}
                scope={scope}
              />
            </div>
          </Reveal>

          {/* Mentions & discussion, as the source composes it: a face, who,
              where, when, and the line itself — with the unread rows tinted and
              dotted, and `mark all read` calling the action that already
              existed. It used to be an item key and a verb. */}
          <Reveal
            tier="section"
            delay={0.18}
            data-mentions
            className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--overlay)]"
          >
            <div className="flex flex-wrap items-center gap-[10px] border-b border-[var(--hairline)] p-5 py-3">
              <Mono as="h2" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                mentions &amp; discussion
              </Mono>
              {unread.length > 0 ? (
                <Mono
                  size="meta"
                  data-mentions-unread={unread.length}
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-[rgba(43,87,255,0.12)] px-[5px] text-[var(--accent)]"
                >
                  {unread.length}
                </Mono>
              ) : null}
              <MarkAllRead unread={unread.length} />
            </div>

            {notifications.length === 0 ? (
              <p className="p-5 text-[13px] text-[var(--ink-faint)]">Nobody has needed you yet.</p>
            ) : (
              <ul className="list-none">
                {notifications.slice(0, 6).map((note) => {
                  const line = mentionLine(note);
                  return (
                    <li key={note.id}>
                      <Link
                        href={`/app/projects/${note.projectSlug}/sprints/${note.sprintNumber}/items/${note.itemKey}`}
                        data-mention
                        data-unread={line.unread ? "true" : "false"}
                        className={`flex gap-3 border-b border-[var(--hairline)] px-5 py-3 last:border-b-0 hover:bg-[var(--tint)] ${
                          line.unread ? "bg-[var(--tint)]" : ""
                        }`}
                      >
                        <PersonAvatar
                          person={
                            note.authorName
                              ? {
                                  fullName: note.authorName,
                                  initials: note.authorInitials ?? "··",
                                  avatarUrl: note.authorAvatarUrl,
                                }
                              : null
                          }
                          size={26}
                          fontSize={9.5}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[13px] font-semibold text-[var(--ink)]">
                              {line.author}
                            </span>
                            <Mono size="meta" className="text-[var(--ink-faint)]">
                              {line.where}
                            </Mono>
                            <Mono size="meta" className="text-[var(--ink-faint)]">
                              {timestamp(note.createdAt)}
                            </Mono>
                          </span>
                          <span className="mt-[3px] block truncate text-[13px] leading-[1.5] text-[var(--ink-muted)]">
                            {line.body}
                          </span>
                        </span>
                        {line.unread ? (
                          <>
                            <span
                              aria-hidden
                              className="mt-[9px] size-[7px] shrink-0 rounded-pill bg-[var(--accent)]"
                            />
                            <span className="sr-only"> — unread</span>
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>
        </div>

        {/* The 320px right column. At 1180 and above it sits beside the work,
            starting level with the sprint card; below, it flows underneath. */}
        <div data-home-right className="flex min-w-0 flex-col gap-5">
          <Reveal tier="section" delay={0.24}>
            <OnlineNow people={people} />
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
                <Mono as="h2" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
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
              <Mono as="h2" size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
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

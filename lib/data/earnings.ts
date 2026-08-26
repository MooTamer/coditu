import "server-only";

import { cache } from "react";

import { meetsThreshold, potCents, splitEqually, type Share } from "@/lib/earnings";
import { getAppSettings, type AppSettings } from "@/lib/settings";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * What every sprint pays, and what has been agreed.
 *
 * ## Invariant 1, and how this does not break it
 *
 * Invariant 1 says nothing is global and no query may return an item outside
 * the active project's scope. Earnings aggregate **across** projects — a
 * person's money is the sum of their shares in every sprint they worked — so
 * the resolution, recorded as an ADR, is this:
 *
 * > The earnings model aggregates **sprint-level totals, never work items**.
 * > `/app/earnings` lists sprints and money; it does not list, link to, or leak
 * > a single item title, key, client name or component. Each sprint row is
 * > still scoped to its own project by construction. Invariant 1 is about
 * > items; this view never touches one.
 *
 * Read the queries below with that in mind: `v_sprint_minutes` aggregates by
 * `(sprint, person)` and nothing here selects a `work_items` column. If a
 * design draft ever starts wanting to show "which items made this money", the
 * answer is no — that is the invariant talking.
 *
 * ## Where money may appear
 *
 * `/app/earnings` and `/app/settings`. Nowhere under `/app/projects/**`, and
 * not in any export. `e2e/earnings.spec.ts` asserts it twice: once against the
 * rendered output of every shared screen, and once as a **source-level grep**
 * proving nothing under `app/app/projects/` or `lib/export/` imports this
 * module — because a rendered assertion proves today's markup and the grep
 * proves the next person cannot add it by accident.
 */

export interface EarningsParticipant {
  profileId: string;
  fullName: string;
  initials: string;
  avatarUrl: string | null;
  isDeveloper: boolean;
  isActive: boolean;
  minutesLogged: number;
  /** Their share of the sprint's total minutes, 0–100, rounded for display. */
  sharePct: number;
  /** True when the app proposes them: a developer at or above the threshold. */
  proposed: boolean;
}

export interface ConfirmedShare {
  profileId: string;
  fullName: string;
  initials: string;
  avatarUrl: string | null;
  minutesLogged: number;
  shareCents: number;
}

export interface ConfirmedPayout {
  id: string;
  confirmedAt: string;
  confirmedByName: string;
  totalMinutes: number;
  hourlyRateCents: number;
  potCents: number;
  usdEgpRateMicros: number | null;
  usdEgpSource: "live" | "manual" | null;
  shares: ConfirmedShare[];
}

export interface SprintEarnings {
  sprintId: string;
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
  startsOn: string | null;
  endsOn: string | null;
  /**
   * False for a sprint before `payout_from_sprint_id`. Such a sprint shows
   * "not tracked" — never zero. Zero is a claim; "not tracked" is the truth.
   */
  tracked: boolean;
  /** Live, recomputed on every render from the time entries as they stand. */
  totalMinutes: number;
  potCents: number;
  participants: EarningsParticipant[];
  /** The provisional split, if it were confirmed exactly as proposed. */
  proposedShares: Share[];
  /** The live confirmation, if there is one. */
  confirmed: ConfirmedPayout | null;
  /**
   * Set when the minutes have moved since the confirmation was taken. The
   * confirmed figures keep being shown; they do not silently drift.
   */
  staleByMinutes: number | null;
}

/** A minute logged by somebody who is not a developer. It counts toward the
 *  pot and takes no share — the confirmation screen says so by name. */
export interface NonParticipantNote {
  fullName: string;
  minutesLogged: number;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part * 1000) / whole) / 10;
}

/**
 * Every sprint's earnings, newest first.
 *
 * One pass over four small tables rather than a query per sprint: there are
 * sixteen sprints today and there will be sixty, and sixty round trips on a
 * hosted database is a screen nobody opens twice.
 */
export const listSprintEarnings = cache(async (): Promise<{
  settings: AppSettings;
  sprints: SprintEarnings[];
  nonParticipants: Map<string, NonParticipantNote[]>;
}> => {
  const supabase = await createClient();
  const settings = await getAppSettings();

  const [{ data: sprints }, { data: minutes }, { data: profiles }, { data: payouts }] =
    await Promise.all([
      supabase
        .from("sprints")
        .select("id, number, name, status, starts_on, ends_on")
        .order("starts_on", { ascending: false, nullsFirst: false })
        .order("number", { ascending: false }),
      supabase.from("v_sprint_minutes").select("sprint_id, profile_id, minutes_logged"),
      supabase
        .from("profiles")
        .select("id, full_name, initials, avatar_url, is_developer, is_active"),
      supabase
        .from("sprint_payouts")
        .select(
          "id, sprint_id, confirmed_at, confirmed_by, total_minutes, hourly_rate_cents, pot_cents, usd_egp_rate_micros, usd_egp_source, superseded_at, sprint_payout_shares ( profile_id, minutes_logged, share_cents )"
        )
        .is("superseded_at", null),
    ]);

  const person = new Map((profiles ?? []).map((p) => [p.id, p]));

  // The effective-from sprint. Everything before it in the ordering below is
  // "not tracked" — and the ordering is by start date, because sprint numbers
  // restart per project and would put Converso's Week 1 before EVIM's Week 17.
  const from = (sprints ?? []).find((s) => s.id === settings.payoutFromSprintId) ?? null;
  const trackedFrom = from?.starts_on ?? null;

  const byPayout = new Map(
    (payouts ?? []).map((row) => [row.sprint_id, row])
  );

  const nonParticipants = new Map<string, NonParticipantNote[]>();

  const rows: SprintEarnings[] = (sprints ?? []).map((sprint) => {
    // A view's columns are all nullable to the type generator, because a view
    // has no NOT NULL. `profile_id` cannot actually be null here — the view
    // groups by it — so the rows that would have one are dropped rather than
    // coerced, which keeps the impossible case impossible instead of asserted
    // away.
    const forSprint = (minutes ?? []).filter(
      (m): m is { sprint_id: string; profile_id: string; minutes_logged: number | null } =>
        m.sprint_id === sprint.id && m.profile_id !== null
    );
    const totalMinutes = forSprint.reduce((sum, m) => sum + (m.minutes_logged ?? 0), 0);

    const participants: EarningsParticipant[] = forSprint
      .map((m) => {
        const p = person.get(m.profile_id);
        const minutesLogged = m.minutes_logged ?? 0;
        return {
          profileId: m.profile_id,
          fullName: p?.full_name ?? "somebody who has left",
          initials: p?.initials ?? "—",
          avatarUrl: p?.avatar_url ?? null,
          isDeveloper: Boolean(p?.is_developer),
          isActive: Boolean(p?.is_active),
          minutesLogged,
          sharePct: pct(minutesLogged, totalMinutes),
          proposed:
            Boolean(p?.is_developer) &&
            meetsThreshold(minutesLogged, totalMinutes, settings.payoutShareThresholdPct),
        };
      })
      .sort((a, b) => b.minutesLogged - a.minutesLogged);

    const others = participants.filter((p) => !p.isDeveloper && p.minutesLogged > 0);
    if (others.length) {
      nonParticipants.set(
        sprint.id,
        others.map((p) => ({ fullName: p.fullName, minutesLogged: p.minutesLogged }))
      );
    }

    const pot = potCents({ totalMinutes, hourlyRateCents: settings.hourlyRateCents });
    const proposedShares = splitEqually(
      pot,
      participants.filter((p) => p.proposed).map((p) => ({
        profileId: p.profileId,
        minutesLogged: p.minutesLogged,
      }))
    );

    const payout = byPayout.get(sprint.id) ?? null;
    const confirmed: ConfirmedPayout | null = payout
      ? {
          id: payout.id,
          confirmedAt: payout.confirmed_at,
          confirmedByName: person.get(payout.confirmed_by)?.full_name ?? "an admin",
          totalMinutes: payout.total_minutes,
          hourlyRateCents: payout.hourly_rate_cents,
          potCents: payout.pot_cents,
          usdEgpRateMicros: payout.usd_egp_rate_micros,
          usdEgpSource: (payout.usd_egp_source as "live" | "manual" | null) ?? null,
          shares: (payout.sprint_payout_shares ?? [])
            .map((share) => {
              // A deactivated person keeps every share they were confirmed
              // for, and this list is where that promise is kept — `listTeam`
              // includes them and so does this.
              const p = person.get(share.profile_id);
              return {
                profileId: share.profile_id,
                fullName: p?.full_name ?? "somebody who has left",
                initials: p?.initials ?? "—",
                avatarUrl: p?.avatar_url ?? null,
                minutesLogged: share.minutes_logged,
                shareCents: share.share_cents,
              };
            })
            .sort((a, b) => b.shareCents - a.shareCents || a.fullName.localeCompare(b.fullName)),
        }
      : null;

    const tracked =
      Boolean(settings.payoutFromSprintId) &&
      (sprint.id === settings.payoutFromSprintId ||
        (trackedFrom !== null && (sprint.starts_on ?? "") >= trackedFrom));

    return {
      sprintId: sprint.id,
      number: sprint.number,
      name: sprint.name,
      status: sprint.status,
      startsOn: sprint.starts_on,
      endsOn: sprint.ends_on,
      tracked,
      totalMinutes,
      potCents: pot,
      participants,
      proposedShares,
      confirmed,
      // Loudly, not silently. A confirmation whose minutes have moved keeps
      // showing its own figures and says so — an admin re-confirms, which
      // supersedes rather than overwrites.
      staleByMinutes:
        confirmed && confirmed.totalMinutes !== totalMinutes
          ? totalMinutes - confirmed.totalMinutes
          : null,
    };
  });

  return { settings, sprints: rows, nonParticipants };
});

export interface MyCurrentSprint {
  name: string;
  /**
   * What the equal split would hand you if it were confirmed as proposed.
   *
   * **Null when you take no share, never zero.** A non-developer, or a
   * developer below the threshold, is not in `proposedShares` at all — and
   * `$0.00` claims the split was computed for you and came to nothing, which is
   * a different statement from "you are not in it". Same rule as `tracked`
   * further up this file, and the same rule the history rows follow.
   */
  cents: number | null;
  /** Your own minutes on it, and the team's. */
  minutesLogged: number;
  totalMinutes: number;
  /** Your share of the team's minutes, 0-100, as `listSprintEarnings` rounds it. */
  sharePct: number;
  /** Whether the app proposes you — a developer at or above the threshold. */
  proposed: boolean;
  /** The pot, before it is divided. */
  potCents: number;
  /**
   * How many the pot would be divided among, and how many people logged
   * anything at all.
   *
   * Counts, not names. The prototype's calculation block lists each excluded
   * colleague and their hours; this screen is somebody's own money and does
   * not need to hand them a roster to explain the arithmetic. Pot ÷
   * participants is the whole sum, and the difference between the two numbers
   * is what says "other people's minutes counted and took no share".
   */
  participantCount: number;
  contributorCount: number;
}

export interface MyConfirmedPayout {
  name: string;
  cents: number;
  at: string;
  minutesLogged: number;
}

/**
 * One person's own figures.
 *
 * The provisional amount for whichever tracked sprint is running, the last one
 * that was actually confirmed, and enough of the surrounding facts for
 * `/app/earnings` to show its arithmetic rather than assert a number.
 *
 * **Nothing here computes anything.** Every value is lifted out of
 * `listSprintEarnings`, which is the one place the pot, the threshold and the
 * split are worked out. A second calculation that agreed today would be a
 * second calculation to keep agreeing, and this screen and the confirmation
 * screen disagreeing about somebody's share is the failure that matters most.
 */
export const getMyEarnings = cache(async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const { sprints, settings } = await listSprintEarnings();
  const tracked = sprints.filter((s) => s.tracked);

  const current = tracked.find((s) => s.status === "active") ?? tracked[0] ?? null;
  const mine = current?.proposedShares.find((s) => s.profileId === profile.id) ?? null;
  const meOnCurrent = current?.participants.find((p) => p.profileId === profile.id) ?? null;

  const lastConfirmed = tracked.find((s) => s.confirmed) ?? null;
  const lastMine =
    lastConfirmed?.confirmed?.shares.find((s) => s.profileId === profile.id) ?? null;

  return {
    settings,
    isDeveloper: Boolean(profile.is_developer),
    current: current
      ? ({
          name: current.name,
          cents: mine?.shareCents ?? null,
          minutesLogged: meOnCurrent?.minutesLogged ?? 0,
          totalMinutes: current.totalMinutes,
          sharePct: meOnCurrent?.sharePct ?? 0,
          proposed: Boolean(meOnCurrent?.proposed),
          potCents: current.potCents,
          participantCount: current.proposedShares.length,
          contributorCount: current.participants.filter((p) => p.minutesLogged > 0).length,
        } satisfies MyCurrentSprint)
      : null,
    lastConfirmed:
      lastConfirmed && lastMine
        ? ({
            name: lastConfirmed.name,
            cents: lastMine.shareCents,
            at: lastConfirmed.confirmed!.confirmedAt,
            minutesLogged: lastMine.minutesLogged,
          } satisfies MyConfirmedPayout)
        : null,
  };
});

export type MyEarningsState = "provisional" | "confirmed" | "changed" | "not tracked";

export interface MyEarningsRow {
  sprintId: string;
  name: string;
  state: MyEarningsState;
  /** Your minutes on that sprint. Null when it was never tracked. */
  minutesLogged: number | null;
  /** Your share, in cents. Null when there is nothing to show — never zero. */
  cents: number | null;
  /** Who confirmed it and when, for the rows that were. */
  confirmedAt: string | null;
  confirmedByName: string | null;
}

/**
 * Every sprint, from one person's side of it.
 *
 * The same rows `listSprintEarnings` builds, narrowed to you: your minutes,
 * your share, and which of the four states the sprint is in. Nothing is
 * recomputed and nothing is re-queried — `listSprintEarnings` is `cache()`d per
 * request, so this is a second reading of one answer.
 *
 * **Null, never zero, on a sprint that was not tracked.** Zero is a claim about
 * money that was never counted; the column renders an em dash and the legend
 * says what that means. Same rule the board has had since the earnings model
 * was built.
 */
export const listMyEarningsHistory = cache(async (): Promise<MyEarningsRow[]> => {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const { sprints } = await listSprintEarnings();

  return sprints.map((sprint) => {
    if (!sprint.tracked) {
      return {
        sprintId: sprint.sprintId,
        name: sprint.name,
        state: "not tracked" as const,
        minutesLogged: null,
        cents: null,
        confirmedAt: null,
        confirmedByName: null,
      };
    }

    const mine = sprint.participants.find((p) => p.profileId === profile.id) ?? null;
    const confirmedShare =
      sprint.confirmed?.shares.find((s) => s.profileId === profile.id) ?? null;
    const provisional =
      sprint.proposedShares.find((s) => s.profileId === profile.id) ?? null;

    // A confirmation whose minutes have moved keeps showing the figure it was
    // taken at and says it has changed. The snapshot is what somebody agreed
    // to; the drift is news, not a correction.
    const state: MyEarningsState = sprint.confirmed
      ? sprint.staleByMinutes !== null
        ? "changed"
        : "confirmed"
      : "provisional";

    return {
      sprintId: sprint.sprintId,
      name: sprint.name,
      state,
      minutesLogged: mine?.minutesLogged ?? 0,
      cents: sprint.confirmed
        ? (confirmedShare?.shareCents ?? null)
        : (provisional?.shareCents ?? null),
      confirmedAt: sprint.confirmed?.confirmedAt ?? null,
      confirmedByName: sprint.confirmed?.confirmedByName ?? null,
    };
  });
});

import "server-only";

import { cache } from "react";

import { cairoDate } from "@/lib/format";
import { todayInCairo } from "@/lib/today";

import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/schema";
import { statusRank, type WorkItemStatus, type WorkItemType } from "@/lib/work-items";

/**
 * The sprint read model.
 *
 * Invariant 1 is enforced by the shape of this query, not by a filter the
 * caller remembers to add: items are always fetched BY sprint id, and the
 * sprint is always resolved from a project slug. There is no way to ask this
 * module for "all items".
 */

export interface WorkItemRow {
  id: string;
  key: string;
  title: string;
  description: string | null;
  highlight: string | null;
  status: WorkItemStatus;
  type: WorkItemType;
  deadline: string | null;
  estimateMinutes: number;
  minutesLogged: number;
  grouping: number | null;
  orderIndex: number;
  assignee: PersonRef | null;
  reviewer: PersonRef | null;
  criteriaDone: number;
  criteriaTotal: number;
}

export interface PersonRef {
  id: string;
  fullName: string;
  initials: string;
}

export interface SprintDetail {
  id: string;
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
  startsOn: string | null;
  endsOn: string | null;
  goal: string | null;
  notes: string | null;
  notesAuthor: PersonRef | null;
  notesWrittenOn: string | null;
  items: WorkItemRow[];
}

/**
 * The sprint query, in two shapes.
 *
 * The tail is shared, so the twenty columns that are not in question cannot
 * drift between them; the heads differ by exactly the one column that can be
 * absent. They are separate literals rather than one built at runtime because
 * supabase-js infers the row type from the literal type of the select string —
 * hand it a computed string and every field comes back as `GenericStringError`.
 */
const SPRINT_TAIL = `created_at,
     notes_author:profiles!sprints_notes_author_id_fkey ( id, full_name, initials ),
     work_items (
       id, key, title, description, highlight, status, type, deadline,
       estimate_minutes, minutes_logged, grouping, order_index,
       assignee:profiles!work_items_assignee_id_fkey ( id, full_name, initials ),
       reviewer:profiles!work_items_reviewer_id_fkey ( id, full_name, initials ),
       acceptance_criteria ( is_done )
     )` as const;

const SPRINT_HEAD = "id, number, name, status, starts_on, ends_on, goal, notes, " as const;

const SPRINT_SELECT = `${SPRINT_HEAD}${SPRINT_TAIL}` as const;
const SPRINT_SELECT_WITH_WRITTEN_AT = `${SPRINT_HEAD}notes_written_at, ${SPRINT_TAIL}` as const;

export const getSprint = cache(
  async (projectId: string, number: number): Promise<SprintDetail | null> => {
    const supabase = await createClient();

    // Ask for `notes_written_at` first. A database that has not been migrated
    // yet says so, and the second read leaves the column out — the notes date
    // then falls back to the sprint's start, which is what it was before the
    // column existed. See `isMissingColumn`.
    const rich = await supabase
      .from("sprints")
      .select(SPRINT_SELECT_WITH_WRITTEN_AT)
      .eq("project_id", projectId)
      .eq("number", number)
      .maybeSingle();

    if (rich.error && !isMissingColumn(rich.error.code)) throw rich.error;

    let notesWrittenAt: string | null = rich.data?.notes_written_at ?? null;
    let data = rich.data as Omit<NonNullable<typeof rich.data>, "notes_written_at"> | null;

    if (rich.error) {
      const plain = await supabase
        .from("sprints")
        .select(SPRINT_SELECT)
        .eq("project_id", projectId)
        .eq("number", number)
        .maybeSingle();

      if (plain.error) throw plain.error;
      data = plain.data;
      notesWrittenAt = null;
    }

    if (!data) return null;

    const items: WorkItemRow[] = (data.work_items ?? [])
      .map((item) => {
        const criteria = item.acceptance_criteria ?? [];
        return {
          id: item.id,
          key: item.key,
          title: item.title,
          description: item.description,
          highlight: item.highlight,
          status: item.status as WorkItemStatus,
          type: item.type as WorkItemType,
          deadline: item.deadline,
          estimateMinutes: item.estimate_minutes ?? 0,
          minutesLogged: item.minutes_logged ?? 0,
          grouping: item.grouping,
          orderIndex: item.order_index,
          assignee: toPerson(item.assignee),
          reviewer: toPerson(item.reviewer),
          criteriaDone: criteria.filter((c) => c.is_done).length,
          criteriaTotal: criteria.length,
        };
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      id: data.id,
      number: data.number,
      name: data.name,
      status: data.status,
      startsOn: data.starts_on,
      endsOn: data.ends_on,
      goal: data.goal,
      notes: data.notes,
      notesAuthor: toPerson(data.notes_author),
      // `notes_written_at` follows the text; `starts_on` is the fallback for
      // rows written before notes could be edited, which is what the panel has
      // always shown for them. The timestamp is reduced to the calendar date it
      // fell on IN CAIRO — invariant 5, and not a `slice(0, 10)`, which is the
      // UTC date and reads as yesterday for anything written before 02:00.
      notesWrittenOn: cairoDate(notesWrittenAt) ?? data.starts_on,
      items,
    };
  }
);

function toPerson(row: { id: string; full_name: string; initials: string } | null): PersonRef | null {
  return row ? { id: row.id, fullName: row.full_name, initials: row.initials } : null;
}

/* -------------------------------------------------------------------------- */

export interface StatusSlice {
  status: WorkItemStatus;
  count: number;
  /** Percentage of the sprint, as a number. Rendered as a flex-basis. */
  share: number;
}

/**
 * Status distribution for the header bar, in the fixed display order — so the
 * bar reads left-to-right as "in flight → not started → done", the same order
 * the board and every export use.
 */
export function statusDistribution(items: WorkItemRow[]): StatusSlice[] {
  const counts = new Map<WorkItemStatus, number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);

  const total = items.length || 1;
  return [...counts.entries()]
    .sort(([a], [b]) => statusRank(a) - statusRank(b))
    .map(([status, count]) => ({ status, count, share: (count / total) * 100 }));
}

export interface BurnPoint {
  /** Day-of-month label, as text — never parsed into a Date. */
  label: string;
  date: string;
  cumulativeMinutes: number;
}

/**
 * Cumulative hours logged per sprint day.
 *
 * Dates are walked as strings. `starts_on` and `ends_on` are calendar dates
 * with no timezone, and handing either to `new Date()` shifts the whole series
 * by a day for anyone west of UTC — see invariant 5.
 */
export const getBurnUp = cache(async (sprintId: string, startsOn: string | null, endsOn: string | null) => {
  if (!startsOn || !endsOn) return [] as BurnPoint[];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select("minutes, worked_on, work_items!inner ( sprint_id )")
    .eq("work_items.sprint_id", sprintId);

  if (error) throw error;

  const perDay = new Map<string, number>();
  for (const entry of data ?? []) {
    const day = entry.worked_on;
    perDay.set(day, (perDay.get(day) ?? 0) + entry.minutes);
  }

  const points: BurnPoint[] = [];
  let cumulative = 0;
  for (const date of eachCalendarDay(startsOn, endsOn)) {
    cumulative += perDay.get(date) ?? 0;
    points.push({ date, label: date.slice(8, 10), cumulativeMinutes: cumulative });
  }
  return points;
});

/**
 * Walks calendar days inclusively without ever constructing a Date from the
 * string. UTC arithmetic on a Date built from `Date.UTC` is safe because it
 * never touches a local timezone in either direction.
 */
export function eachCalendarDay(from: string, to: string): string[] {
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);

  const days: string[] = [];
  let cursor = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);

  // A sprint is a week or two; the guard is only here so a bad range cannot
  // spin forever.
  for (let i = 0; cursor <= end && i < 400; i += 1) {
    const d = new Date(cursor);
    days.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    );
    cursor += 86_400_000;
  }
  return days;
}

/** Whole days from today to `endsOn`, floored at zero. Never negative. */
export function daysRemaining(endsOn: string | null, today = todayInCairo()): number | null {
  if (!endsOn) return null;
  const days = eachCalendarDay(today, endsOn).length - 1;
  return Math.max(days, 0);
}



export interface SprintMember {
  initials: string;
  fullName: string;
  minutes: number;
}

/**
 * Everyone with a stake in the sprint, and what they have actually logged.
 *
 * The avatar tooltips in the header carry these numbers, and they have to be
 * real: the design bundle's own per-person figures were the thing that caught
 * a mis-attributed time entry in the seed.
 */
export const getSprintMembers = cache(async (sprintId: string): Promise<SprintMember[]> => {
  const supabase = await createClient();

  const [{ data: entries }, { data: items }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("minutes, profiles!inner ( id, full_name, initials ), work_items!inner ( sprint_id )")
      .eq("work_items.sprint_id", sprintId),
    supabase
      .from("work_items")
      .select(
        `assignee:profiles!work_items_assignee_id_fkey ( id, full_name, initials ),
         reviewer:profiles!work_items_reviewer_id_fkey ( id, full_name, initials )`
      )
      .eq("sprint_id", sprintId),
  ]);

  const members = new Map<string, SprintMember>();

  // Anyone holding or reviewing an item belongs in the row even with zero
  // hours — "assigned but nothing logged" is information, not an absence.
  for (const item of items ?? []) {
    for (const person of [item.assignee, item.reviewer]) {
      if (person && !members.has(person.id)) {
        members.set(person.id, { initials: person.initials, fullName: person.full_name, minutes: 0 });
      }
    }
  }

  for (const entry of entries ?? []) {
    const person = entry.profiles;
    const existing = members.get(person.id);
    if (existing) existing.minutes += entry.minutes;
    else members.set(person.id, { initials: person.initials, fullName: person.full_name, minutes: entry.minutes });
  }

  return [...members.values()].sort((a, b) => b.minutes - a.minutes);
});

/** Re-exported: it lives in `lib/today.ts` so client code can reach it too. */
export { todayInCairo };

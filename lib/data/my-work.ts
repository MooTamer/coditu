import "server-only";

import { cache } from "react";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { todayInCairo } from "@/lib/data/sprint";
import type { WorkItemStatus } from "@/lib/work-items";

export interface MyWorkItem {
  id: string;
  key: string;
  title: string;
  status: WorkItemStatus;
  minutesLogged: number;
  estimateMinutes: number;
  deadline: string | null;
  projectSlug: string;
  sprintNumber: number;
}

export interface MyWork {
  fullName: string;
  minutesThisWeek: number;
  weeklyCapacityMinutes: number;
  assigned: MyWorkItem[];
  awaitingMyReview: MyWorkItem[];
}

/** Monday of the current week, in Cairo, as a calendar date. */
export function startOfWeek(today = todayInCairo()): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 is Sunday. Shift so Monday is the first day.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * The signed-in person's own work.
 *
 * "Assigned to me" excludes done: the question this page answers is what is
 * still on your plate, and a finished item is not. The review queue is
 * specifically `in_peer_review` — an item in `changes_requested` is back
 * with its author, not waiting on you.
 */
export const getMyWork = cache(async (): Promise<MyWork | null> => {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const weekStart = startOfWeek();

  const select = `id, key, title, status, minutes_logged, estimate_minutes, deadline,
                  sprints!inner ( number, projects!inner ( slug ) )`;

  const [assigned, review, hours] = await Promise.all([
    supabase.from("work_items").select(select).eq("assignee_id", profile.id).neq("status", "done"),
    supabase
      .from("work_items")
      .select(select)
      .eq("reviewer_id", profile.id)
      .eq("status", "in_peer_review"),
    supabase
      .from("time_entries")
      .select("minutes")
      .eq("profile_id", profile.id)
      .gte("worked_on", weekStart),
  ]);

  type Row = NonNullable<typeof assigned.data>[number];
  const toItem = (row: Row): MyWorkItem => ({
    id: row.id,
    key: row.key,
    title: row.title,
    status: row.status as WorkItemStatus,
    minutesLogged: row.minutes_logged ?? 0,
    estimateMinutes: row.estimate_minutes ?? 0,
    deadline: row.deadline,
    projectSlug: row.sprints.projects.slug,
    sprintNumber: row.sprints.number,
  });

  return {
    fullName: profile.full_name,
    minutesThisWeek: (hours.data ?? []).reduce((total, entry) => total + entry.minutes, 0),
    weeklyCapacityMinutes: profile.weekly_capacity_minutes,
    assigned: (assigned.data ?? []).map(toItem),
    awaitingMyReview: (review.data ?? []).map(toItem),
  };
});

export interface PersonLoad {
  id: string;
  fullName: string;
  initials: string;
  role: string;
  assigned: number;
  reviewQueue: number;
  minutesLogged: number;
  capacityMinutes: number;
}

/**
 * Team load for one sprint.
 *
 * Reads `v_person_load`, which is `security_invoker` — so the numbers are the
 * caller's own view of the data, not the view's owner's.
 */
export const getTeamLoad = cache(async (sprintId: string): Promise<PersonLoad[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_person_load")
    .select(
      "profile_id, full_name, initials, role, assigned_count, review_queue_count, minutes_logged, weekly_capacity_minutes"
    )
    .eq("sprint_id", sprintId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.profile_id!,
      fullName: row.full_name!,
      initials: row.initials!,
      role: row.role!,
      assigned: Number(row.assigned_count ?? 0),
      reviewQueue: Number(row.review_queue_count ?? 0),
      minutesLogged: Number(row.minutes_logged ?? 0),
      capacityMinutes: Number(row.weekly_capacity_minutes ?? 0),
    }))
    .sort((a, b) => b.minutesLogged - a.minutesLogged || a.fullName.localeCompare(b.fullName));
});

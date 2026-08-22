import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/work-items";

export interface ProfileRef {
  id: string;
  fullName: string;
  initials: string;
  /** Null means no picture: every avatar falls back to the initials. */
  avatarUrl: string | null;
  role: AppRole;
}

/**
 * Active profiles, for the mention list and the assignee pickers.
 *
 * Deactivated people are excluded: you should not be able to assign work to
 * someone who has left, and mentioning them would create a notification nobody
 * will ever read. Historical mentions of them still render, because the stored
 * node carries their id and the renderer does not consult this list.
 */
export const listActiveProfiles = cache(async (): Promise<ProfileRef[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, initials, avatar_url, role")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    initials: row.initials,
    avatarUrl: row.avatar_url,
    role: row.role as AppRole,
  }));
});

export interface TeamMember extends ProfileRef {
  isActive: boolean;
  /** Invariant 2: minutes. Divided by 60 at the render edge only. */
  weeklyCapacityMinutes: number;
}

/**
 * Everyone, including deactivated people.
 *
 * `listActiveProfiles` above is the right list for assigning work and for the
 * mention menu; this is the right list for administering the team, because an
 * admin has to be able to see — and undo — a deactivation. RLS gates the
 * *reader*, not the row: any active member may read `profiles`, so nothing here
 * is a wider window than the app already had.
 *
 * Active first, then alphabetical. A deactivated person sinking to the bottom
 * of the list is the ordering that matches how often anyone needs them.
 */
export const listTeam = cache(async (): Promise<TeamMember[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, initials, avatar_url, role, is_active, weekly_capacity_minutes")
    .order("is_active", { ascending: false })
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    initials: row.initials,
    avatarUrl: row.avatar_url,
    role: row.role as AppRole,
    isActive: row.is_active,
    weeklyCapacityMinutes: row.weekly_capacity_minutes,
  }));
});

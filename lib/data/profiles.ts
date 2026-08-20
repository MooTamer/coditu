import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/work-items";

export interface ProfileRef {
  id: string;
  fullName: string;
  initials: string;
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
    .select("id, full_name, initials, role")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    initials: row.initials,
    role: row.role as AppRole,
  }));
});

import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingRelation } from "@/lib/supabase/schema";

/**
 * Where this person has been.
 *
 * The accidental list, beside `favourites`' deliberate one. `PLAN.md` §2 asks
 * Workspace Home for *"Recently opened stories, projects, and notes"*, and the
 * returned prototype's sidebar carries the same panel.
 *
 * Returns `[]` rather than throwing when the table is not there yet — migrations
 * reach production by hand, and a shell that 500s because a convenience panel
 * has not been applied is a worse failure than a shell with no convenience
 * panel.
 */

export interface RecentView {
  href: string;
  label: string;
  glyph: string;
  openedAt: string;
}

/** How many the sidebar shows. The prototype's own number. */
export const RECENTS_SHOWN = 5;

export const listRecents = cache(async (limit = RECENTS_SHOWN): Promise<RecentView[]> => {
  const supabase = await createClient();

  // RLS scopes this to the caller; there is deliberately no `profile_id` filter
  // here. A filter would read as the thing keeping one person's list private,
  // and it is not — the policy is, and a reader who believed the filter might
  // one day remove it.
  const { data, error } = await supabase
    .from("recent_views")
    .select("href, label, glyph, opened_at")
    .order("opened_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    href: row.href,
    label: row.label,
    glyph: row.glyph,
    openedAt: row.opened_at,
  }));
});

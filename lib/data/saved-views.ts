import "server-only";

import { cache } from "react";

import { parseSpec } from "@/lib/saved-views-schema";
import type { ViewSpec } from "@/lib/saved-views";
import { createClient } from "@/lib/supabase/server";

/**
 * The saved views for one project.
 *
 * RLS decides what comes back — a member's own views plus everybody's shared
 * ones — so this query says nothing about visibility and cannot disagree with
 * the policy. `is_shared` is selected only so the menu can say which is which.
 *
 * The spec is re-validated on the way out by `parseSpec`. A stored row is not
 * more trustworthy than a URL: it can outlive a rename, a removed filter, or
 * somebody editing the table by hand.
 */
export interface SavedView {
  id: string;
  name: string;
  spec: ViewSpec;
  isShared: boolean;
  /** Null when the view follows whichever sprint is open. */
  sprintId: string | null;
  owner: { id: string; fullName: string; initials: string };
  /** Whether the reader may rename, share or delete it. */
  mine: boolean;
}

export const listSavedViews = cache(
  async (projectId: string, viewerId: string): Promise<SavedView[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("saved_views")
      .select("id, name, spec, is_shared, sprint_id, profiles!saved_views_owner_id_fkey (id, full_name, initials)")
      .eq("project_id", projectId)
      .order("name");

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      spec: parseSpec(row.spec),
      isShared: row.is_shared,
      sprintId: row.sprint_id,
      owner: {
        id: row.profiles?.id ?? "",
        fullName: row.profiles?.full_name ?? "somebody",
        initials: row.profiles?.initials ?? "??",
      },
      // Not "am I an admin" — an admin may also delete a shared view, and the
      // policy says so, but the menu calls that what it is rather than
      // pretending the view is theirs.
      mine: row.profiles?.id === viewerId,
    }));
  }
);

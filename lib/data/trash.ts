import "server-only";

import { cache } from "react";

import { isMissingRelation } from "@/lib/supabase/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * What is in the bin.
 *
 * Everything here comes from `trash_list()`, a `security definer` function, and
 * that is not incidental. A deleted story is invisible to every SELECT this app
 * can make — that is what the read policy is for, and it is why deleting one
 * needed no list, export or total to learn about it. A trash screen therefore
 * cannot be a query; it has to be a function that is allowed to look.
 *
 * The function also decides who sees what and who may put it back, so nothing
 * on this side re-derives either. `canRestore` arrives per row.
 */

export interface TrashEntry {
  kind: "work_item" | "comment" | "page";
  entityId: string;
  title: string;
  /** A story's key, or a page's slug. */
  itemKey: string;
  /** Null for a workspace page, which belongs to no project. */
  projectSlug: string | null;
  /** `Workspace` for a workspace page — `trash_list()` supplies the word. */
  projectName: string;
  /** Null for a page: it has never belonged to a sprint. */
  sprintNumber: number | null;
  /** Hours at stake if this is purged. Null for a comment. */
  minutesLogged: number | null;
  deletedAt: string;
  canRestore: boolean;
}

interface TrashRow {
  kind: "work_item" | "comment" | "page";
  entity_id: string;
  title: string;
  item_key: string;
  project_slug: string | null;
  project_name: string;
  sprint_number: number | null;
  minutes_logged: number | null;
  deleted_at: string;
  can_restore: boolean;
}

export const getTrash = cache(async (): Promise<TrashEntry[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trash_list");

  if (error) {
    // `42883` — the migration has not reached this database yet. An empty bin
    // is a better answer than a 500 on a page whose whole job is reassurance,
    // and migrations reach production by hand.
    if (isMissingRelation(error.code)) return [];
    throw error;
  }

  return ((data ?? []) as TrashRow[]).map((row) => ({
    kind: row.kind,
    entityId: row.entity_id,
    title: row.title,
    itemKey: row.item_key,
    projectSlug: row.project_slug,
    projectName: row.project_name,
    sprintNumber: row.sprint_number,
    minutesLogged: row.minutes_logged,
    deletedAt: row.deleted_at,
    canRestore: row.can_restore,
  }));
});

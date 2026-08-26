import "server-only";

import { cache } from "react";

import type { FavouriteRow } from "@/lib/favourites";
import { searchFromSpec } from "@/lib/saved-views";
import { parseSpec } from "@/lib/saved-views-schema";
import { createClient } from "@/lib/supabase/server";

/**
 * What the reader has starred.
 *
 * ## One query, because this runs on every page
 *
 * The favourites section lives in the sidebar, so this is part of the shell's
 * per-request work — the same reason `listProjectOverviews` exists separately
 * from `listProjects`. Three reads joined in TypeScript would be three round
 * trips on every navigation; PostgREST embeds all three targets in one.
 *
 * ## RLS is the whole of the visibility rule
 *
 * The policy on `favourites` returns only the reader's own rows, and each
 * embedded target is filtered by its own policy on the way out. A favourite
 * pointing at something the reader may no longer read comes back with a null
 * embed and is dropped here — which is the system working, not an error.
 *
 * The spec is re-validated by `parseSpec` on the way out, for the reason
 * `listSavedViews` gives: a stored row is not more trustworthy than a URL.
 */
export const listFavourites = cache(async (profileId: string): Promise<FavouriteRow[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("favourites")
    .select(
      `id, created_at,
       saved_views ( name, spec, sprint_id,
                     projects!inner ( slug ),
                     sprints ( number ) ),
       work_items ( key, sprints!inner ( number, projects!inner ( slug ) ) ),
       components ( name, slug, projects!inner ( slug ) )`
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows: FavouriteRow[] = [];

  for (const row of data ?? []) {
    if (row.saved_views) {
      const view = row.saved_views;
      rows.push({
        id: row.id,
        kind: "saved_view",
        name: view.name,
        projectSlug: view.projects?.slug ?? "",
        sprintNumber: view.sprints?.number ?? null,
        search: searchFromSpec(parseSpec(view.spec)),
        componentSlug: null,
      });
      continue;
    }

    if (row.work_items) {
      const item = row.work_items;
      rows.push({
        id: row.id,
        kind: "work_item",
        name: item.key,
        projectSlug: item.sprints?.projects?.slug ?? "",
        sprintNumber: item.sprints?.number ?? null,
        search: "",
        componentSlug: null,
      });
      continue;
    }

    if (row.components) {
      const component = row.components;
      rows.push({
        id: row.id,
        kind: "component",
        name: component.name,
        projectSlug: component.projects?.slug ?? "",
        sprintNumber: null,
        search: "",
        componentSlug: component.slug,
      });
    }
  }

  return rows;
});

/**
 * Which of these things the reader has already starred, for the controls.
 *
 * A set of ids rather than a boolean per call: a page showing twelve stories
 * would otherwise ask twelve times, and the answer is one small query for all of
 * them.
 */
export const listFavouritedTargets = cache(async (profileId: string): Promise<Set<string>> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("favourites")
    .select("saved_view_id, work_item_id, component_id")
    .eq("profile_id", profileId);

  if (error) throw error;

  const starred = new Set<string>();
  for (const row of data ?? []) {
    for (const id of [row.saved_view_id, row.work_item_id, row.component_id]) {
      if (id) starred.add(id);
    }
  }
  return starred;
});

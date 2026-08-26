"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Starring and un-starring.
 *
 * Invariant 3, as everywhere: zod-validate → re-check authorization
 * server-side → write → revalidate. The browser never writes with the anon key.
 *
 * ## Authorization is the policy, and there is no branch here
 *
 * The policies on `favourites` say `profile_id = auth.uid()`, so a write that is
 * not the reader's own matches no row. There is no `if (row.profile_id === me)`
 * below for the same reason `saved-views.ts` has none: two places deciding the
 * same thing is how they come to disagree.
 *
 * What this action *does* re-check is that the target exists and is readable —
 * because the insert would otherwise succeed against an id the reader cannot
 * see, and a `23503` surfaced as "that did not save" is a worse answer than a
 * check that can say why.
 *
 * ## Why the whole sidebar is revalidated
 *
 * A favourite is drawn in the shell, which every route renders. `revalidatePath`
 * with `layout` is the one call that reaches it from wherever the star was
 * clicked — the item page, the component page, or the view menu.
 */

const uuid = z.string().uuid();

const input = z.object({
  kind: z.enum(["saved_view", "work_item", "component"]),
  targetId: uuid,
});

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** What the control should show now, so the caller need not guess. */
  starred?: boolean;
}

/** The table each kind points at, and the column that holds it. */
const TARGET = {
  saved_view: { table: "saved_views", column: "saved_view_id" },
  work_item: { table: "work_items", column: "work_item_id" },
  component: { table: "components", column: "component_id" },
} as const;

export async function toggleFavourite(raw: unknown): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not something that can be starred." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in to keep favourites." };

  const { kind, targetId } = parsed.data;
  const target = TARGET[kind];
  const supabase = await createClient();

  // Readable by this reader, through their own policies. An id they cannot see
  // is not one they may star.
  const { data: exists, error: lookupError } = await supabase
    .from(target.table)
    .select("id")
    .eq("id", targetId)
    .maybeSingle();

  if (lookupError) return { ok: false, error: "That could not be starred." };
  if (!exists) return { ok: false, error: "That is not there any more." };

  const { data: already, error: readError } = await supabase
    .from("favourites")
    .select("id")
    .eq("profile_id", profile.id)
    .eq(target.column, targetId)
    .maybeSingle();

  if (readError) return { ok: false, error: "That could not be starred." };

  if (already) {
    const { error } = await supabase.from("favourites").delete().eq("id", already.id);
    if (error) return { ok: false, error: "That could not be un-starred." };
    revalidatePath("/app", "layout");
    return { ok: true, starred: false };
  }

  // Written out per kind rather than through a computed key: the row's shape is
  // three optional columns and a check that exactly one is set, and a computed
  // key erases that into an index signature the generated types cannot accept.
  // Spelling it out is also the version somebody reading this can check against
  // the constraint.
  const row: {
    profile_id: string;
    saved_view_id?: string;
    work_item_id?: string;
    component_id?: string;
  } = { profile_id: profile.id };
  if (kind === "saved_view") row.saved_view_id = targetId;
  else if (kind === "work_item") row.work_item_id = targetId;
  else row.component_id = targetId;

  const { error } = await supabase.from("favourites").insert(row);

  if (error) return { ok: false, error: "That could not be starred." };
  revalidatePath("/app", "layout");
  return { ok: true, starred: true };
}

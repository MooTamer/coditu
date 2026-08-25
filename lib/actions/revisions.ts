"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Putting an earlier version of a document back.
 *
 * This action is thin on purpose. It validates its input, finds the paths to
 * revalidate, and calls `restore_document_revision`. **It does not decide who
 * may restore anything**, and that is the design rather than an omission: the
 * RPC is `security invoker`, so the caller's own policies and
 * `guard_work_item_columns` answer the question, exactly as they do when the
 * same person edits the same document by hand. A check here would be a second
 * copy of a rule that already exists in two places, and the second copy is the
 * one that goes stale — see `05-DECISIONS.md`.
 *
 * What it does do is turn the database's `42501` into a sentence, because
 * "permission denied for function" is not something to show anybody.
 */

export interface RestoreResult {
  ok: boolean;
  error?: string;
  /** The version number the restore produced, so the toast can name it. */
  revisionNo?: number;
}

const restoreInput = z.object({
  surface: z.enum([
    "work_item_description",
    "work_item_highlight",
    "sprint_notes",
    "acceptance_criterion",
    "comment",
  ]),
  entityId: z.string().uuid(),
  revisionNo: z.number().int().positive().max(32767),
  /** Only for revalidation — the write re-derives everything it needs itself. */
  itemKey: z.string().max(40).optional(),
  projectSlug: z.string().max(80).optional(),
  sprintNumber: z.number().int().positive().max(9999).optional(),
});

export async function restoreRevision(input: unknown): Promise<RestoreResult> {
  const parsed = restoreInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a version we recognise." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_document_revision", {
    p_surface: parsed.data.surface,
    p_entity_id: parsed.data.entityId,
    p_revision_no: parsed.data.revisionNo,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "You cannot change that, so you cannot put an earlier version back." };
    }
    if (error.code === "P0002") {
      return { ok: false, error: "That version is no longer there." };
    }
    // `42883`/`42P01` — the migration has not reached this database yet. Says
    // so plainly rather than "something went wrong", because the fix is a
    // deployment and somebody needs to know that.
    if (error.code === "42883" || error.code === "42P01") {
      return { ok: false, error: "Version history is not available on this database yet." };
    }
    return { ok: false, error: "That version did not go back. Nothing was lost — try again." };
  }

  const [restored] = (data ?? []) as { revision_no: number }[];

  if (parsed.data.projectSlug && parsed.data.sprintNumber) {
    const sprint = `/app/projects/${parsed.data.projectSlug}/sprints/${parsed.data.sprintNumber}`;
    revalidatePath(sprint);
    if (parsed.data.itemKey) revalidatePath(`${sprint}/items/${parsed.data.itemKey}`);
  }
  revalidatePath("/app/my-work");

  return { ok: true, revisionNo: restored?.revision_no };
}

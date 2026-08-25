"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Restoring and purging from the bin.
 *
 * Restoring a story reuses `set_work_item_deleted(id, false)` — the same
 * function `restoreWorkItem` has always called, because there is one way to
 * un-delete a story and the trash screen is a second door to it rather than a
 * second implementation.
 *
 * Purging is the only irreversible operation in this application. It takes one
 * id at a time: there is deliberately no "empty the trash", because a single
 * press that destroys an unbounded amount of work is not a control worth
 * having, and everything in here is already invisible to every other screen.
 */

export interface TrashResult {
  ok: boolean;
  error?: string;
}

const target = z.object({
  kind: z.enum(["work_item", "comment"]),
  entityId: z.string().uuid(),
});

function revalidateEverywhere() {
  revalidatePath("/app/trash");
  revalidatePath("/app/my-work");
}

export async function restoreFromTrash(input: unknown): Promise<TrashResult> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not something we can put back." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();

  if (parsed.data.kind === "work_item") {
    const { error } = await supabase.rpc("set_work_item_deleted", {
      p_item_id: parsed.data.entityId,
      p_deleted: false,
    });
    if (error) {
      return {
        ok: false,
        error:
          error.code === "42501"
            ? "Only an admin or lead can restore a story."
            : "That did not come back. Try again.",
      };
    }
  } else {
    const { error } = await supabase.rpc("restore_comment", {
      p_comment_id: parsed.data.entityId,
    });
    if (error) {
      return {
        ok: false,
        error:
          error.code === "42501"
            ? "Only the author or an admin can put a comment back."
            : "That did not come back. Try again.",
      };
    }
  }

  revalidateEverywhere();
  return { ok: true };
}

export async function purgeFromTrash(input: unknown): Promise<TrashResult> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not something we can remove." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  // Checked here as well as in the function, so the screen can say why rather
  // than turning a `42501` into "something went wrong". The database is still
  // what enforces it.
  if (profile.role !== "admin") {
    return { ok: false, error: "Only an admin can delete something for good." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("purge_deleted", {
    p_kind: parsed.data.kind,
    p_entity_id: parsed.data.entityId,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only an admin can delete something for good."
          : "That did not go. Try again.",
    };
  }

  revalidateEverywhere();
  return { ok: true };
}

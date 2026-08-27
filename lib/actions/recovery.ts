"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { RECOVERY_CHECKS } from "@/lib/recovery";
import { isMissingRelation } from "@/lib/supabase/schema";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Starting a recovery rehearsal.
 *
 * Thin, like `restoreRevision` and for the same reason: **it does not decide
 * who may rehearse.** `rehearse_recovery` is `security definer` and raises
 * `42501` for anybody who is not an admin, so a check here would be a second
 * copy of a rule that already exists — and the second copy is the one that goes
 * stale. The role read below is a hint used to shape the page, not a gate.
 *
 * What this does own is turning the database's error codes into sentences.
 * "permission denied for function rehearse_recovery" is not something to show
 * anybody, and neither is `22023`.
 *
 * ## Why there is no rollback path
 *
 * Invariant 4 asks for a rollback and a visible error on every optimistic
 * update. There is no optimism here: a rehearsal takes as long as it takes,
 * writes one row when it is finished, and the page shows the result of the
 * read that follows. Nothing is displayed before the server has acknowledged
 * it, so there is nothing to take back — which is the right shape for the one
 * control on this screen, because a rehearsal that *appeared* to pass before
 * the server agreed would be the single most misleading thing this application
 * could render.
 */

export interface RehearsalResult {
  ok: boolean;
  error?: string;
  runId?: string;
}

const rehearsalInput = z.object({
  // `.min(1)` is the client-side half of the refusal the function makes anyway.
  // An empty scope would report "passed" about work it never did.
  scope: z.array(z.enum(RECOVERY_CHECKS)).min(1).max(RECOVERY_CHECKS.length),
});

export async function rehearseRecovery(input: unknown): Promise<RehearsalResult> {
  const parsed = rehearsalInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose at least one thing to check." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in any more." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rehearse_recovery", {
    p_scope: parsed.data.scope,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Only an admin can rehearse a recovery." };
    }
    if (isMissingRelation(error.code)) {
      // The migration has not reached this database. Says so, rather than
      // "something went wrong" — this is the one failure a reader can act on.
      return {
        ok: false,
        error: "Recovery rehearsals are not set up on this database yet.",
      };
    }
    return { ok: false, error: "That rehearsal did not finish. Nothing was changed." };
  }

  revalidatePath("/app/settings/recovery");
  return { ok: true, runId: typeof data === "string" ? data : undefined };
}

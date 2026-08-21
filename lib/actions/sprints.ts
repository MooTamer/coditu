"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Every mutation on a sprint.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate. Invariant 1: the project is read back out of the sprint on every
 * call, never taken from the request — the caller names a sprint id and
 * nothing else about where it lives.
 *
 * Invariant 5: `starts_on` and `ends_on` are calendar dates. They travel as
 * `YYYY-MM-DD` strings and are never handed to `new Date()` anywhere in this
 * file.
 */

export interface SprintResult {
  ok: boolean;
  error?: string;
  /** Where the caller should end up, when the write moved it. */
  path?: string;
  number?: number;
}

const uuid = z.string().uuid();

function sprintPath(slug: string, number: number) {
  return `/app/projects/${slug}/sprints/${number}`;
}

/**
 * Resolve a sprint's project and confirm the caller may write to it.
 *
 * Admin and lead only, matching the `leads * sprints` policies. The policy is
 * what actually stops the write; this exists so the user gets a sentence
 * instead of a row count of zero.
 */
async function resolveWritableSprint(sprintId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." } as const;
  if (profile.role === "engineer") {
    return { error: "Only an admin or lead can change a sprint." } as const;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("sprints")
    .select("id, number, name, status, starts_on, ends_on, projects!inner ( id, slug )")
    .eq("id", sprintId)
    .maybeSingle();

  if (!data) return { error: "That sprint no longer exists." } as const;

  return {
    profile,
    supabase,
    sprint: data,
    projectId: data.projects.id,
    slug: data.projects.slug,
  } as const;
}

/* -------------------------------------------------------------------------- */

const notesInput = z.object({
  sprintId: uuid,
  notes: z.string().max(8000, "That is longer than a sprint note should be."),
});

/**
 * Write the sprint notes.
 *
 * The author and the timestamp move with the text. Leaving the author on
 * whoever wrote the first version, while the words are someone else's, is the
 * kind of small lie that makes a team stop trusting the panel.
 */
export async function setSprintNotes(input: unknown): Promise<SprintResult> {
  const parsed = notesInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those notes could not be saved." };
  }

  const scope = await resolveWritableSprint(parsed.data.sprintId);
  if ("error" in scope) return { ok: false, error: scope.error };

  const notes = parsed.data.notes.trim();

  const { error } = await scope.supabase
    .from("sprints")
    .update({
      notes: notes.length ? notes : null,
      notes_author_id: notes.length ? scope.profile.id : null,
      notes_written_at: notes.length ? new Date().toISOString() : null,
    })
    .eq("id", scope.sprint.id);

  if (error) return { ok: false, error: "Those notes did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprint.number));
  return { ok: true };
}

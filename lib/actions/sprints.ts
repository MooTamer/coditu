"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isMissingColumn } from "@/lib/supabase/schema";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { SPRINT_STATUSES } from "@/lib/work-items";

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

  const written = {
    notes: notes.length ? notes : null,
    notes_author_id: notes.length ? scope.profile.id : null,
  };

  // The timestamp is written when the column is there, and skipped when it is
  // not. A database still waiting for the migration keeps the notes — losing
  // somebody's paragraph because a column is missing would be the worse half of
  // the same bug. See `isMissingColumn`: a refused WRITE says PGRST204, not
  // 42703, and checking only for the latter is why this fallback did nothing
  // the first time.
  let { error } = await scope.supabase
    .from("sprints")
    .update({ ...written, notes_written_at: notes.length ? new Date().toISOString() : null })
    .eq("id", scope.sprint.id);

  if (isMissingColumn(error?.code)) {
    ({ error } = await scope.supabase
      .from("sprints")
      .update(written)
      .eq("id", scope.sprint.id));
  }

  if (error) return { ok: false, error: "Those notes did not save. Nothing was lost — try again." };

  revalidatePath(sprintPath(scope.slug, scope.sprint.number));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a calendar date.");

const createInput = z.object({
  projectId: uuid,
  number: z.number().int().positive().max(9999),
  name: z.string().trim().min(1, "A sprint needs a name.").max(120),
  startsOn: calendarDate.nullable().optional(),
  endsOn: calendarDate.nullable().optional(),
});

/**
 * Open a sprint.
 *
 * It arrives `planned`, always. Starting it is a separate, deliberate act,
 * because a project may only have one active sprint at a time and creating one
 * that silently displaced another is exactly the surprise this app exists to
 * avoid.
 */
export async function createSprint(input: unknown): Promise<SprintResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That sprint could not be created." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can create a sprint." };
  }

  const { startsOn, endsOn } = parsed.data;
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: "A sprint cannot end before it starts." };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("id", parsed.data.projectId)
    .maybeSingle();

  if (!project) return { ok: false, error: "That project no longer exists." };

  const { data: created, error } = await supabase
    .from("sprints")
    .insert({
      project_id: project.id,
      number: parsed.data.number,
      name: parsed.data.name,
      starts_on: startsOn ?? null,
      ends_on: endsOn ?? null,
    })
    .select("number")
    .single();

  if (error || !created) {
    // 23505 is the (project_id, number) unique constraint. It is the only
    // failure here a person can actually fix, so it gets its own sentence.
    if (error?.code === "23505") {
      return { ok: false, error: `This project already has a sprint ${parsed.data.number}.` };
    }
    return { ok: false, error: "That sprint did not save. Nothing was lost — try again." };
  }

  revalidatePath(`/app/projects/${project.slug}`);
  revalidatePath("/app/projects");
  return { ok: true, number: created.number, path: sprintPath(project.slug, created.number) };
}

/* -------------------------------------------------------------------------- */

const updateInput = z.object({
  sprintId: uuid,
  name: z.string().trim().min(1, "A sprint needs a name.").max(120).optional(),
  startsOn: calendarDate.nullable().optional(),
  endsOn: calendarDate.nullable().optional(),
});

export async function updateSprint(input: unknown): Promise<SprintResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That change could not be saved." };
  }

  const scope = await resolveWritableSprint(parsed.data.sprintId);
  if ("error" in scope) return { ok: false, error: scope.error };

  // Compare against what is actually stored for whichever end is not being
  // changed, or "ends before it starts" only gets caught when both move.
  const startsOn = parsed.data.startsOn === undefined ? scope.sprint.starts_on : parsed.data.startsOn;
  const endsOn = parsed.data.endsOn === undefined ? scope.sprint.ends_on : parsed.data.endsOn;
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: "A sprint cannot end before it starts." };
  }

  const patch: { name?: string; starts_on?: string | null; ends_on?: string | null } = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.startsOn !== undefined) patch.starts_on = parsed.data.startsOn;
  if (parsed.data.endsOn !== undefined) patch.ends_on = parsed.data.endsOn;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await scope.supabase.from("sprints").update(patch).eq("id", scope.sprint.id);
  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath(`/app/projects/${scope.slug}`);
  revalidatePath(sprintPath(scope.slug, scope.sprint.number));
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const statusInput = z.object({
  sprintId: uuid,
  status: z.enum(SPRINT_STATUSES),
});

/**
 * Start, close, or reopen a sprint.
 *
 * A project may have one active sprint, enforced by a partial unique index —
 * the only place that cannot be raced. Starting a second one is refused here
 * with the name of the one already running, rather than silently closing it:
 * "start Week 18" and "stop Week 17" are two decisions, and quietly doing the
 * second because someone asked for the first is how a week of hours ends up
 * attributed to the wrong sprint.
 */
export async function setSprintStatus(input: unknown): Promise<SprintResult> {
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a sprint state we recognise." };

  const scope = await resolveWritableSprint(parsed.data.sprintId);
  if ("error" in scope) return { ok: false, error: scope.error };
  if (scope.sprint.status === parsed.data.status) return { ok: true };

  if (parsed.data.status === "active") {
    const { data: running } = await scope.supabase
      .from("sprints")
      .select("name")
      .eq("project_id", scope.projectId)
      .eq("status", "active")
      .neq("id", scope.sprint.id)
      .maybeSingle();

    if (running) {
      return {
        ok: false,
        error: `${running.name} is still running. Close it first — a project has one active sprint.`,
      };
    }
  }

  const { error } = await scope.supabase
    .from("sprints")
    .update({ status: parsed.data.status })
    .eq("id", scope.sprint.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Another sprint on this project is already active." };
    }
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  revalidatePath(`/app/projects/${scope.slug}`);
  revalidatePath(sprintPath(scope.slug, scope.sprint.number));
  revalidatePath("/app/projects");
  revalidatePath("/app");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

/**
 * Delete a sprint — only while it is empty.
 *
 * `sprints.id` cascades to `work_items`, which cascades to `time_entries`. A
 * sprint with work in it is a sprint whose deletion silently changes hours that
 * have already been reported to a client. An empty sprint is a typo, and a typo
 * should be removable.
 */
export async function deleteSprint(input: unknown): Promise<SprintResult> {
  const parsed = z.object({ sprintId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a sprint we recognise." };

  const scope = await resolveWritableSprint(parsed.data.sprintId);
  if ("error" in scope) return { ok: false, error: scope.error };

  const { count } = await scope.supabase
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("sprint_id", scope.sprint.id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${scope.sprint.name} still holds ${count} ${count === 1 ? "item" : "items"}. Move or delete them first.`,
    };
  }

  const { error } = await scope.supabase.from("sprints").delete().eq("id", scope.sprint.id);
  if (error) return { ok: false, error: "That sprint could not be deleted. Try again." };

  revalidatePath(`/app/projects/${scope.slug}`);
  revalidatePath("/app/projects");
  return { ok: true, path: `/app/projects/${scope.slug}` };
}

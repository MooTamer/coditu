"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { viewSpecSchema } from "@/lib/saved-views-schema";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Saving, sharing and removing a view.
 *
 * Invariant 3, as everywhere: zod-validate → re-check authorization
 * server-side → write → revalidate. The browser never writes with the anon key.
 *
 * ## Invariant 1, and what these actions refuse to take on trust
 *
 * `saveView` is handed a project slug rather than a project id, and resolves the
 * id itself — the same shape as every other action here. A sprint id, when one
 * is given, is confirmed to belong to that project before it is written; the
 * composite foreign key would refuse the mismatch anyway, but a `23503` surfaced
 * as "that did not save" is a worse answer than a check that can say why.
 *
 * ## Authorization is the policy, not a branch here
 *
 * There is no `if (view.owner_id === me)` below. The update and delete policies
 * on `saved_views` already say "the owner, or an admin", so a write that is not
 * allowed matches **no row** — and the action reports that rather than
 * re-deciding it. Two places deciding the same thing is how they come to
 * disagree.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** The saved view's id, so the caller can show it as current. */
  id?: string;
}

const uuid = z.string().uuid();

const saveInput = z.object({
  projectSlug: z.string().min(1).max(120),
  /** Null keeps the view with the project rather than with one week of it. */
  sprintId: uuid.nullable(),
  name: z.string().trim().min(1, "A view needs a name.").max(60, "That name is too long."),
  spec: viewSpecSchema,
  isShared: z.boolean(),
});

export async function saveView(input: unknown): Promise<ActionResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That view could not be saved." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in again to save a view." };

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", parsed.data.projectSlug)
    .maybeSingle();

  if (!project) return { ok: false, error: "That project no longer exists." };

  // The sprint, if named, has to be this project's. The composite foreign key
  // enforces it too — this is here so the failure has words rather than a
  // constraint name.
  if (parsed.data.sprintId) {
    const { data: sprint } = await supabase
      .from("sprints")
      .select("id")
      .eq("id", parsed.data.sprintId)
      .eq("project_id", project.id)
      .maybeSingle();

    if (!sprint) return { ok: false, error: "That sprint is not part of this project." };
  }

  /**
   * Saving twice under one name is an overwrite, not a duplicate — the unique
   * index says so and this makes it the intended behaviour rather than an
   * error somebody has to read.
   *
   * `onConflict` names `name_key`, the stored generated column holding
   * `lower(btrim(name))`. It cannot name the expression directly: PostgREST
   * takes column names there and answers an expression with
   * `42703 column "lower" does not exist`, which surfaces as "that did not
   * save" and looks like a policy problem.
   */
  const { data, error } = await supabase
    .from("saved_views")
    .upsert(
      {
        project_id: project.id,
        sprint_id: parsed.data.sprintId,
        owner_id: profile.id,
        name: parsed.data.name,
        spec: parsed.data.spec,
        is_shared: parsed.data.isShared,
      },
      { onConflict: "project_id,owner_id,name_key" }
    )
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "That view could not be saved." };

  revalidatePath(`/app/projects/${project.slug}`, "layout");
  return { ok: true, id: data?.id };
}

const shareInput = z.object({ id: uuid, isShared: z.boolean(), projectSlug: z.string().min(1) });

export async function setViewShared(input: unknown): Promise<ActionResult> {
  const parsed = shareInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That view could not be changed." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in again to change a view." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .update({ is_shared: parsed.data.isShared })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "That view could not be changed." };
  // No row came back, so the policy refused it. Said plainly rather than
  // reported as success — a control that appears to work and does not is the
  // failure invariant 4 is about.
  if (!data) return { ok: false, error: "That view is not yours to change." };

  revalidatePath(`/app/projects/${parsed.data.projectSlug}`, "layout");
  return { ok: true, id: data.id };
}

const deleteInput = z.object({ id: uuid, projectSlug: z.string().min(1) });

export async function deleteView(input: unknown): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That view could not be removed." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in again to remove a view." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "That view could not be removed." };
  if (!data) return { ok: false, error: "That view is not yours to remove." };

  revalidatePath(`/app/projects/${parsed.data.projectSlug}`, "layout");
  return { ok: true, id: data.id };
}

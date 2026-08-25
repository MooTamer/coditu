"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Publishing — deciding what leaves the company.
 *
 * The database refuses this to anybody but an admin or a lead, twice: the row
 * policy on `components` / `work_items`, and the column guards
 * (`guard_component_publication`, `guard_work_item_columns`) which name the
 * client-facing columns explicitly. These actions check as well, because a
 * trigger's `42501` reaches the browser as a PostgREST code and a person
 * deserves a sentence.
 */

export interface PublicationResult {
  ok: boolean;
  error?: string;
}

async function requireLead() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." as const };
  if (profile.role === "engineer") {
    return { error: "Only an admin or a lead decides what a client sees." as const };
  }
  const supabase = await createClient();
  return { profile, supabase };
}

const componentInput = z.object({
  componentId: z.string().uuid(),
  projectSlug: z.string().min(1),
  componentSlug: z.string().min(1),
  summary: z.string().trim().max(400),
  published: z.boolean(),
});

/**
 * Publish a component, or take it back.
 *
 * The summary is required to publish and the database says so —
 * `components_published_needs_summary` is a check constraint, not form
 * validation, because a Server Action, a psql session and a future importer all
 * reach that table and only one of them has the form. This returns the sentence
 * a person can act on; the constraint is what makes it true.
 *
 * **Unpublishing does not delete the summary.** Somebody who takes a component
 * back to fix a sentence should find their words still there when they return,
 * and a summary with `published_at is null` is inert — nothing reads it.
 */
export async function setComponentPublication(input: unknown): Promise<PublicationResult> {
  const parsed = componentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireLead();
  if ("error" in scope) return { ok: false, error: scope.error };

  if (parsed.data.published && parsed.data.summary.length === 0) {
    return {
      ok: false,
      error: "Write a sentence for the client first — it is what they will read instead of the internal name.",
    };
  }

  const { error } = await scope.supabase
    .from("components")
    .update({
      client_summary: parsed.data.summary.length > 0 ? parsed.data.summary : null,
      published_at: parsed.data.published ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.componentId);

  if (error) {
    if (error.code === "23514") {
      return { ok: false, error: "A component cannot be published without a summary for the client." };
    }
    if (error.code === "42501") {
      return { ok: false, error: "Only an admin or a lead decides what a client sees." };
    }
    return { ok: false, error: "That did not save. Try again." };
  }

  revalidatePath(`/app/projects/${parsed.data.projectSlug}/components/${parsed.data.componentSlug}`);
  revalidatePath("/client");
  revalidatePath(`/client/projects/${parsed.data.projectSlug}/components/${parsed.data.componentSlug}`);
  return { ok: true };
}

const itemInput = z.object({
  workItemId: z.string().uuid(),
  projectSlug: z.string().min(1),
  componentSlug: z.string().min(1),
  published: z.boolean(),
  clientTitle: z.string().trim().max(200).optional(),
});

/**
 * Include one piece of work in what the client sees, or take it out.
 *
 * `clientTitle` is optional and stays optional. Curated at the component,
 * reused at the item: most titles are fine to show, and requiring a rewrite for
 * each one would be fourteen pieces of writing a sprint and a feature nobody
 * uses by week three. The override is there for the ones that are not fine —
 * "EVIM Collapser (restoring after mistake)" is a real title in this database.
 */
export async function setWorkItemPublication(input: unknown): Promise<PublicationResult> {
  const parsed = itemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const scope = await requireLead();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { error } = await scope.supabase
    .from("work_items")
    .update({
      client_published_at: parsed.data.published ? new Date().toISOString() : null,
      ...(parsed.data.clientTitle !== undefined
        ? { client_title: parsed.data.clientTitle.length > 0 ? parsed.data.clientTitle : null }
        : {}),
    })
    .eq("id", parsed.data.workItemId);

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Only an admin or a lead decides what a client sees." };
    }
    return { ok: false, error: "That did not save. Try again." };
  }

  revalidatePath(`/app/projects/${parsed.data.projectSlug}/components/${parsed.data.componentSlug}`);
  revalidatePath("/client");
  revalidatePath(`/client/projects/${parsed.data.projectSlug}/components/${parsed.data.componentSlug}`);
  return { ok: true };
}

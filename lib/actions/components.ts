"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COMPONENT_KINDS, componentSlug } from "@/lib/components";
import type { ComponentRef } from "@/lib/data/components";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * The component registry's two mutations.
 *
 * Invariant 3, like everything else here: zod-validate → re-check authorization
 * server-side → write → revalidate.
 *
 * The registry is a lead's to shape, the same as the projects and sprints a
 * component sits between. RLS refuses an engineer's insert; these actions say
 * so in a sentence first, so the answer is not a Postgres permission error.
 */

export interface ComponentResult {
  ok: boolean;
  error?: string;
  /** The created or updated row, so a picker can select it without a round trip. */
  component?: ComponentRef;
}

/** Postgres unique violation. The only failure here with a better sentence than "try again". */
const UNIQUE_VIOLATION = "23505";

const name = z
  .string()
  .trim()
  // Collapse runs of whitespace: "EVIM  Newspart" and "EVIM Newspart" are the
  // same component, and only one of them can be found by eye in a list of forty.
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(1, "A component needs a name.").max(80, "That name is too long."));

const createInput = z.object({
  /** The project the component belongs to. Resolved server-side; never trusted as an id. */
  projectSlug: z.string().trim().min(1).max(100),
  name,
  kind: z.enum(COMPONENT_KINDS),
});

export async function createComponent(input: unknown): Promise<ComponentResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That component could not be created." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can add a component." };
  }

  const slug = componentSlug(parsed.data.name);
  // A name of only punctuation, or only characters NFKD cannot fold, leaves
  // nothing to build a URL from. Saying so is better than letting the column's
  // check constraint answer in Postgres.
  if (!slug) {
    return { ok: false, error: "That name needs at least one letter or number." };
  }

  const supabase = await createClient();

  // The project is read back rather than taken as an id — the same shape as
  // `createWorkItem` reading its sprint. RLS applies to this select, so a slug
  // for a project the caller cannot see resolves to nothing.
  const { data: project } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", parsed.data.projectSlug)
    .maybeSingle();

  if (!project) return { ok: false, error: "That project no longer exists." };

  const { data: created, error } = await supabase
    .from("components")
    .insert({
      project_id: project.id,
      name: parsed.data.name,
      slug,
      kind: parsed.data.kind,
      // Left null on purpose. The toolbox icon is a fact about the delivery
      // repository, filled in by `npm run components:sync` when the web part
      // actually exists over there — guessing one here would be a fact we made
      // up, and the kind's own fallback glyph reads honestly until then.
      icon: null,
    })
    .select("id, name, slug, kind, is_archived, icon")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return { ok: false, error: `There is already a component called “${parsed.data.name}”.` };
  }
  if (error || !created) {
    return { ok: false, error: "That component did not save. Nothing was lost — try again." };
  }

  revalidatePath(`/app/projects/${project.slug}/components`);

  return { ok: true, component: toRef(created) };
}

/* -------------------------------------------------------------------------- */

const updateInput = z.object({
  componentId: z.string().uuid(),
  name: name.optional(),
  kind: z.enum(COMPONENT_KINDS).optional(),
  isArchived: z.boolean().optional(),
});

/**
 * Rename a component, correct its kind, or retire it.
 *
 * The slug deliberately does not follow a rename. It is the URL a link in a
 * comment from March points at, and the row's identity is its id — moving the
 * slug would break the link to buy nothing.
 *
 * There is no delete, here or in the schema: a component's whole purpose is to
 * hold the history of what happened to it, and deleting one would blank the
 * column on every item that named it. Retiring takes it out of the pickers and
 * leaves the history intact.
 */
export async function updateComponent(input: unknown): Promise<ComponentResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That change is not one we can store." };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role === "engineer") {
    return { ok: false, error: "Only an admin or lead can change a component." };
  }

  const supabase = await createClient();

  // The project comes from the component's own row, never from the caller —
  // the same rule `resolveScope` follows for a work item.
  const { data: existing } = await supabase
    .from("components")
    .select("id, projects!inner ( slug )")
    .eq("id", parsed.data.componentId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "That component no longer exists." };

  const patch: TablesUpdate<"components"> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.isArchived !== undefined) patch.is_archived = parsed.data.isArchived;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: updated, error } = await supabase
    .from("components")
    .update(patch)
    .eq("id", existing.id)
    .select("id, name, slug, kind, is_archived, icon")
    .single();

  if (error || !updated) {
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  const slug = existing.projects.slug;
  revalidatePath(`/app/projects/${slug}/components`);
  revalidatePath(`/app/projects/${slug}/components/${updated.slug}`);
  return { ok: true, component: toRef(updated) };
}

function toRef(row: {
  id: string;
  name: string;
  slug: string;
  kind: string;
  is_archived: boolean;
  icon: string | null;
}): ComponentRef {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as ComponentRef["kind"],
    isArchived: row.is_archived,
    icon: row.icon,
  };
}

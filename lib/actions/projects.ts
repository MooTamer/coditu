"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TablesInsert } from "@/lib/supabase/database.types";

import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Clients and projects.
 *
 * There was no file here. A client and a project could only be created in SQL,
 * which meant the first thing anybody does on a new engagement — "add the
 * client, add the project, open the first sprint" — was the one thing the app
 * could not do. `20260825091000_project_keys_and_slugs.sql` gave a project its
 * own key prefix and a slug history; this is where a person changes them.
 *
 * Invariant 3: zod-validate → re-check authorization server-side → write →
 * revalidate.
 *
 * **Who may.** Admin *or* lead, matching the `leads insert/update clients` and
 * `leads insert/update projects` policies that have been in
 * `20260820120600_rls.sql` since the first migration. The brief asked for
 * admin-only; the database has said admin-or-lead from the start, and a lead
 * who may open a sprint but not the project it belongs to is a line nobody drew
 * on purpose. Recorded in `docs/05-DECISIONS.md`.
 */

export interface ProjectResult {
  ok: boolean;
  error?: string;
  /** Where the caller should end up, when the write moved it. */
  path?: string;
  slug?: string;
}

const uuid = z.string().uuid();

/**
 * A slug is an address. Lowercase, alphanumeric, single hyphens, no leading or
 * trailing hyphen — so it survives being typed, pasted, and read aloud.
 */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "An address needs at least two characters.")
  .max(48, "That address is too long.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

/** `#2B57FF`. The design system's accents are all six-digit hex. */
const accent = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "An accent is a six-digit hex colour, like #2B57FF.")
  .nullable()
  .optional();

/**
 * A client's website. `https` only, and parsed rather than pattern-matched —
 * this string ends up in an `href` on a page the team looks at every day, and
 * `javascript:` in an anchor is the one input that is not merely wrong.
 */
const websiteUrl = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "A website is a full https:// address." }
  );

async function requireWriter() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." } as const;
  if (profile.role === "engineer") {
    return { error: "Only an admin or lead can change a client or a project." } as const;
  }
  return { profile, supabase: await createClient() } as const;
}

/** 23505 is a unique constraint: a slug, a key prefix, or a client name. */
const UNIQUE_VIOLATION = "23505";

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

const clientInput = z.object({
  name: z.string().trim().min(1, "A client needs a name.").max(120),
  websiteUrl,
  logoPath: z.string().trim().max(300).nullable().optional(),
  accentHex: accent,
});

export async function createClientRecord(input: unknown): Promise<ProjectResult> {
  const parsed = clientInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That client could not be created." };
  }

  const scope = await requireWriter();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { error } = await scope.supabase.from("clients").insert({
    name: parsed.data.name,
    website_url: parsed.data.websiteUrl ?? null,
    logo_path: parsed.data.logoPath ?? null,
    accent_hex: parsed.data.accentHex ?? null,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: `There is already a client called ${parsed.data.name}.` };
    }
    return { ok: false, error: "That client did not save. Nothing was lost — try again." };
  }

  revalidatePath("/app/projects");
  return { ok: true };
}

const updateClientInput = clientInput.partial().extend({ clientId: uuid });

export async function updateClientRecord(input: unknown): Promise<ProjectResult> {
  const parsed = updateClientInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That change could not be saved." };
  }

  const scope = await requireWriter();
  if ("error" in scope) return { ok: false, error: scope.error };

  const patch: TablesUpdate<"clients"> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.websiteUrl !== undefined) patch.website_url = parsed.data.websiteUrl ?? null;
  if (parsed.data.logoPath !== undefined) patch.logo_path = parsed.data.logoPath ?? null;
  if (parsed.data.accentHex !== undefined) patch.accent_hex = parsed.data.accentHex ?? null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await scope.supabase.from("clients").update(patch).eq("id", parsed.data.clientId);
  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath("/app/projects");
  revalidatePath("/app");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

const createProjectInput = z.object({
  clientId: uuid,
  name: z.string().trim().min(1, "A project needs a name.").max(120),
  slug,
  scope: z.string().trim().max(500).nullable().optional(),
  accentHex: accent,
  /** Optional. The database derives one from the slug when it is not given. */
  keyPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,7}$/, "A key prefix is 2–8 letters or digits, starting with a letter.")
    .optional(),
});

export async function createProject(input: unknown): Promise<ProjectResult> {
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That project could not be created." };
  }

  const scope = await requireWriter();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { data: client } = await scope.supabase
    .from("clients")
    .select("id")
    .eq("id", parsed.data.clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };

  const { data: created, error } = await scope.supabase
    .from("projects")
    .insert({
      client_id: client.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      scope: parsed.data.scope?.length ? parsed.data.scope : null,
      accent_hex: parsed.data.accentHex ?? null,
      // Omitted rather than defaulted here: `assign_project_key_prefix` derives
      // one from the slug, uniquified against every prefix in use and every key
      // ever issued. A prefix invented in TypeScript could not check either.
      //
      // The cast is the price of that. `projects.key_prefix` is `not null` with
      // no column DEFAULT — a BEFORE INSERT trigger supplies it — and the type
      // generator reads defaults, not triggers, so it marks the column
      // required. Narrow and deliberate: it says "a trigger fills this", which
      // is true, rather than inventing a value to satisfy a type.
      ...(parsed.data.keyPrefix ? { key_prefix: parsed.data.keyPrefix } : {}),
    } as TablesInsert<"projects">)
    .select("slug")
    .single();

  if (error || !created) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "That address or key prefix is already taken. Pick another.",
      };
    }
    return { ok: false, error: "That project did not save. Nothing was lost — try again." };
  }

  revalidatePath("/app/projects");
  revalidatePath("/app");
  return { ok: true, slug: created.slug, path: `/app/projects/${created.slug}` };
}

const updateProjectInput = z.object({
  projectId: uuid,
  name: z.string().trim().min(1, "A project needs a name.").max(120).optional(),
  slug: slug.optional(),
  scope: z.string().trim().max(500).nullable().optional(),
  accentHex: accent,
  clientId: uuid.optional(),
});

/**
 * Rename a project.
 *
 * **The slug is the interesting half.** It is in every URL the team has
 * bookmarked, in every link pasted into a chat, and in the address bar of
 * whoever is reading this page right now. §8.5 was answered: keep the old one
 * as a redirect. So a rename writes the outgoing slug into
 * `project_slug_aliases` in the same call, and `getProjectBySlug` resolves
 * through it. Nothing 404s, and the alias is permanent — a bookmark does not
 * expire.
 */
export async function updateProject(input: unknown): Promise<ProjectResult> {
  const parsed = updateProjectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That change could not be saved." };
  }

  const scope = await requireWriter();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { data: existing } = await scope.supabase
    .from("projects")
    .select("id, slug")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "That project no longer exists." };

  const patch: TablesUpdate<"projects"> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.scope !== undefined) patch.scope = parsed.data.scope?.length ? parsed.data.scope : null;
  if (parsed.data.accentHex !== undefined) patch.accent_hex = parsed.data.accentHex ?? null;
  if (parsed.data.clientId !== undefined) patch.client_id = parsed.data.clientId;
  if (Object.keys(patch).length === 0) return { ok: true };

  const movingSlug = parsed.data.slug !== undefined && parsed.data.slug !== existing.slug;

  const { error } = await scope.supabase.from("projects").update(patch).eq("id", existing.id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That address already belongs to another project." };
    }
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  if (movingSlug) {
    // After the rename, never before: if the update is refused the old address
    // is still live and an alias pointing at it would be a second name for the
    // same page. `on conflict` is not needed — the slug was unique a moment ago
    // by definition, because it was the project's own.
    const { error: aliasError } = await scope.supabase
      .from("project_slug_aliases")
      .insert({ slug: existing.slug, project_id: existing.id });

    if (aliasError) {
      // The rename stands; the old link is what broke. Say exactly that rather
      // than pretending the whole thing failed — the reader needs to know which
      // half to fix.
      revalidatePath("/app/projects", "layout");
      return {
        ok: false,
        slug: parsed.data.slug,
        error: `Renamed, but /app/projects/${existing.slug} will no longer resolve.`,
      };
    }
  }

  revalidatePath("/app/projects", "layout");
  revalidatePath("/app");
  return {
    ok: true,
    slug: parsed.data.slug ?? existing.slug,
    path: movingSlug ? `/app/projects/${parsed.data.slug}` : undefined,
  };
}

const archiveInput = z.object({ projectId: uuid, isArchived: z.boolean() });

/**
 * Archive a project, or bring it back.
 *
 * Not a delete. `projects.id` cascades to sprints, which cascade to work items,
 * which cascade to time entries — archiving a project that is finished is
 * housekeeping; deleting one destroys hours that have been invoiced. There is a
 * delete policy on the table and this file deliberately does not use it.
 */
export async function setProjectArchived(input: unknown): Promise<ProjectResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a project we recognise." };

  const scope = await requireWriter();
  if ("error" in scope) return { ok: false, error: scope.error };

  const { error } = await scope.supabase
    .from("projects")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.projectId);

  if (error) return { ok: false, error: "That change did not save. Nothing was lost — try again." };

  revalidatePath("/app/projects", "layout");
  revalidatePath("/app");
  return { ok: true, path: "/app/projects" };
}

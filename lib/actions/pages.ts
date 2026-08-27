"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DOC_VERSION, flattenToText, isEmptyDocument, pruneToDepth } from "@/lib/blocks/schema";
import { pageHref } from "@/lib/data/pages";
import { isMissingRelation } from "@/lib/supabase/schema";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Writing a page.
 *
 * ## Invariant 3, and nothing clever on top of it
 *
 * zod-validate → re-check authorization server-side → write → revalidate. The
 * authorization re-check here is deliberately *thin*: the `pages` policies say
 * admin-or-lead for every write, so the check below turns a `42501` into a
 * sentence rather than deciding anything. A second copy of an authorization
 * rule is the copy that goes stale — the same argument `lib/actions/revisions.ts`
 * makes at length.
 *
 * ## Publishing is acknowledgement-based
 *
 * `PLAN.md` §3: *"Longer story or note changes become visible only after
 * Publish/Save succeeds."* Nothing here writes on a keystroke. The editor holds
 * the draft, `publishPage` is the explicit act, and it returns `{ ok: false }`
 * with a sentence when the write did not land — at which point the caller keeps
 * the draft, which is invariant 4 and §3's *"Never clear a draft merely because
 * a request failed."*
 *
 * ## A page cannot move
 *
 * `project_id` and `slug` are frozen by `pages_guard_columns` in the database.
 * Neither is in the update payload here either, which means a bug in this file
 * cannot carry one client's writing into another client's project even before
 * the trigger refuses it. Two locks on the door that matters.
 */

const MAX_BODY = 20000;

const uuid = z.string().uuid();

const doc = z.unknown().refine((value) => value !== undefined, "That page has no content.");

const createInput = z.object({
  /** Null creates a workspace page. */
  projectId: uuid.nullable(),
  title: z.string().trim().min(1, "A page needs a title.").max(120, "That title is too long."),
});

const saveInput = z.object({
  pageId: uuid,
  doc,
  /**
   * Whether this write publishes. A page that has never been published stays
   * private to its author until this is true; after that it is a no-op, because
   * `pages_guard_columns` refuses to un-publish.
   */
  publish: z.boolean().default(true),
});

const renameInput = z.object({
  pageId: uuid,
  title: z.string().trim().min(1, "A page needs a title.").max(120, "That title is too long."),
});

const deleteInput = z.object({ pageId: uuid, deleted: z.boolean() });

export interface PageResult {
  ok: boolean;
  error?: string;
  /** Where the new page lives, so the caller can navigate to it. */
  href?: string;
}

/**
 * A URL segment from a title.
 *
 * Derived once, on create, and then frozen — `project_slug_aliases` exists
 * because renaming a project broke every link somebody had pasted, and a page
 * is not going to repeat that. A title with no ASCII letters at all (an
 * all-Arabic heading, an emoji) yields nothing, so the fallback is a short
 * random segment rather than an error: the title is what a person reads, and
 * the slug only has to be stable and unique.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || `page-${Math.random().toString(36).slice(2, 8)}`;
}

async function requireWriter() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You are not signed in." } as const;
  if (profile.role !== "admin" && profile.role !== "lead") {
    return { error: "Only an admin or lead can write a page." } as const;
  }
  return { profile } as const;
}

/** The two routes a page's existence changes. */
function revalidatePage(projectSlug: string | null, slug: string) {
  revalidatePath(pageHref(projectSlug, slug));
  revalidatePath(projectSlug ? `/app/projects/${projectSlug}/pages` : "/app/pages");
  if (projectSlug) revalidatePath(`/app/projects/${projectSlug}`);
}

export async function createPage(input: unknown): Promise<PageResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That page could not be created." };
  }

  const who = await requireWriter();
  if ("error" in who) return { ok: false, error: who.error };

  const supabase = await createClient();

  // A slug collides when two pages in one scope are given the same title. The
  // second gets a suffix rather than an error — being told "a page called
  // Meeting notes already exists" when you wanted a second one is a refusal
  // nobody can act on. `23505` is the unique index; anything else is real.
  const base = slugify(parsed.data.title);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("pages")
      .insert({
        project_id: parsed.data.projectId,
        title: parsed.data.title,
        slug,
        body: "",
      })
      .select("slug, project:projects ( slug )")
      .single();

    if (!error && data) {
      const projectSlug =
        (data as unknown as { project: { slug: string } | null }).project?.slug ?? null;
      revalidatePage(projectSlug, slug);
      return { ok: true, href: pageHref(projectSlug, slug) };
    }

    if (error?.code === "23505") continue;
    if (error?.code === "42501") {
      return { ok: false, error: "Only an admin or lead can create a page." };
    }
    if (isMissingRelation(error?.code)) {
      return { ok: false, error: "Pages are not available on this database yet." };
    }
    return { ok: false, error: "That page was not created. Nothing was lost — try again." };
  }

  return { ok: false, error: "Too many pages already have that name. Try a different title." };
}

export async function publishPage(input: unknown): Promise<PageResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That page could not be saved." };
  }

  const who = await requireWriter();
  if ("error" in who) return { ok: false, error: who.error };

  // Pruned before it is stored, not after it is read. `lib/blocks/schema.ts`
  // exists because `body_json` is a jsonb column that will happily hold five
  // thousand nested paragraphs, and the depth guard has to run on the way in.
  const document = pruneToDepth(parsed.data.doc);
  const text = flattenToText(document).trim();

  if (text.length > MAX_BODY) {
    return { ok: false, error: "That is longer than a page should be." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .update({
      body_json: isEmptyDocument(document) ? null : (document as Json),
      body: text,
      body_version: DOC_VERSION,
      // Only ever set, never cleared. The trigger refuses to clear it anyway;
      // this keeps the payload honest about what it is asking for.
      ...(parsed.data.publish ? { published_at: new Date().toISOString() } : {}),
    })
    .eq("id", parsed.data.pageId)
    .select("slug, project:projects ( slug )")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Only an admin or lead can change a page." };
    }
    return { ok: false, error: "That change did not save. Nothing was lost — try again." };
  }

  // RLS refuses an update by matching no rows rather than by raising, so a
  // denied write returns `{ data: null, error: null }` and would otherwise be
  // reported as a success. The same trap `restore_comment` records in SQL.
  if (!data) {
    return { ok: false, error: "That page is not there, or it is not yours to change." };
  }

  const projectSlug = (data as unknown as { project: { slug: string } | null }).project?.slug ?? null;
  revalidatePage(projectSlug, data.slug);
  return { ok: true, href: pageHref(projectSlug, data.slug) };
}

export async function renamePage(input: unknown): Promise<PageResult> {
  const parsed = renameInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That page could not be renamed." };
  }

  const who = await requireWriter();
  if ("error" in who) return { ok: false, error: who.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.pageId)
    .select("slug, project:projects ( slug )")
    .maybeSingle();

  if (error) return { ok: false, error: "That title did not save. Nothing was lost — try again." };
  if (!data) return { ok: false, error: "That page is not there, or it is not yours to change." };

  const projectSlug = (data as unknown as { project: { slug: string } | null }).project?.slug ?? null;
  revalidatePage(projectSlug, data.slug);
  return { ok: true, href: pageHref(projectSlug, data.slug) };
}

/**
 * To the bin, and back out of it.
 *
 * `set_page_deleted` rather than an `update`, because `pages` has **no delete
 * policy at all** and its update policy refuses a row that is already deleted —
 * which is what makes the bin the only route out, and the only route back.
 */
export async function setPageDeleted(input: unknown): Promise<PageResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a page we recognise." };

  const who = await requireWriter();
  if ("error" in who) return { ok: false, error: who.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_page_deleted", {
    p_page_id: parsed.data.pageId,
    p_deleted: parsed.data.deleted,
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "Only an admin or lead can delete a page." };
    }
    if (error.code === "P0002") {
      return { ok: false, error: "That page is already in that state." };
    }
    return { ok: false, error: "That did not happen. Nothing was lost — try again." };
  }

  revalidatePath("/app/pages");
  revalidatePath("/app/trash");
  revalidatePath("/app/projects");
  return { ok: true };
}

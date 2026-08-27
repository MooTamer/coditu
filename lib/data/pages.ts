import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingRelation } from "@/lib/supabase/schema";
import type { PersonRef } from "@/lib/data/sprint";

/**
 * Project pages and workspace pages — the sixth writing surface.
 *
 * `PLAN.md` §3 lists six surfaces for the one universal editor and the build
 * had five. §7 asks the project page to carry *"Project notes/pages"*, and the
 * returned prototype draws a **Pages & notes** panel whose rows call
 * `this.toast("Project page — same block editor, project-scoped")` — furniture.
 * This is the read model under the real thing.
 *
 * ## One table, one difference
 *
 * `pages.project_id is null` is a workspace page. Everything else about the two
 * is identical, which is why they share a table, a trigger, a revision surface,
 * a bin entry and this module. See the migration for why that does not weaken
 * invariant 1.
 *
 * ## Drafts are not here
 *
 * A page's unpublished draft lives in the browser, exactly as a sprint note's
 * does. `published_at is null` is the one case the browser cannot hold: a page
 * that was **created and never published at all**, which its author can see and
 * nobody else can. The RLS policy is what enforces that, not this module.
 */

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  /** Null for a workspace page. */
  projectSlug: string | null;
  projectName: string | null;
  /** Null while it has never been published. */
  publishedAt: string | null;
  updatedAt: string;
  author: PersonRef | null;
  /** The route this page lives at, built once here so nothing else guesses. */
  href: string;
}

export interface PageDetail extends PageSummary {
  bodyJson: unknown;
  body: string;
  bodyVersion: number;
  /** Null for a workspace page. Needed to scope the breadcrumb and the panel. */
  projectId: string | null;
}

interface PageRow {
  id: string;
  title: string;
  slug: string;
  body_json: unknown;
  body: string;
  body_version: number;
  published_at: string | null;
  updated_at: string;
  project_id: string | null;
  project: { slug: string; name: string } | null;
  author: { id: string; full_name: string; initials: string; avatar_url: string | null } | null;
}

const PAGE_SELECT =
  "id, title, slug, body_json, body, body_version, published_at, updated_at, project_id, " +
  "project:projects ( slug, name ), " +
  "author:profiles!pages_created_by_fkey ( id, full_name, initials, avatar_url )";

/** Where a page lives. One place, so a link and a revalidation cannot disagree. */
export function pageHref(projectSlug: string | null, slug: string): string {
  return projectSlug ? `/app/projects/${projectSlug}/pages/${slug}` : `/app/pages/${slug}`;
}

function toSummary(row: PageRow): PageDetail {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    projectId: row.project_id,
    projectSlug: row.project?.slug ?? null,
    projectName: row.project?.name ?? null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    bodyJson: row.body_json,
    body: row.body,
    bodyVersion: row.body_version,
    author: row.author
      ? {
          id: row.author.id,
          fullName: row.author.full_name,
          initials: row.author.initials,
          avatarUrl: row.author.avatar_url,
        }
      : null,
    href: pageHref(row.project?.slug ?? null, row.slug),
  };
}

/**
 * Every page in one scope, most recently touched first.
 *
 * `projectId === null` asks for the workspace's own pages, and the `is` filter
 * is the whole difference. Returns `[]` rather than throwing when the table is
 * not there yet — migrations reach production by hand, and a project page that
 * 500s because `pages` has not been applied is a worse failure than a project
 * page with no pages panel. Same argument, and the same check, as the
 * block-document columns.
 */
export const listPages = cache(async (projectId: string | null): Promise<PageDetail[]> => {
  const supabase = await createClient();

  let query = supabase.from("pages").select(PAGE_SELECT).is("deleted_at", null);
  query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);

  if (error) {
    if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
    throw error;
  }

  return ((data ?? []) as unknown as PageRow[]).map(toSummary);
});

/**
 * One page, by the scope and slug in the URL.
 *
 * **The project is re-derived, never trusted.** A project page is found by
 * `(project_id, slug)` and a workspace page by `(project_id is null, slug)`, so
 * `/app/projects/other-client/pages/governance` cannot open a page that belongs
 * to somebody else's project by naming it in a URL — it finds nothing, and the
 * route calls `notFound()`. Invariant 1, re-derived from the row rather than
 * read off the address bar.
 */
export const getPage = cache(
  async (projectId: string | null, slug: string): Promise<PageDetail | null> => {
    const supabase = await createClient();

    let query = supabase.from("pages").select(PAGE_SELECT).eq("slug", slug).is("deleted_at", null);
    query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isMissingRelation(error.code) || isMissingColumn(error.code)) return null;
      throw error;
    }

    return data ? toSummary(data as unknown as PageRow) : null;
  }
);

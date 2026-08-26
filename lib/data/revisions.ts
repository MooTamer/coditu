import "server-only";

import { cache } from "react";

import { OUTSIDE } from "@/lib/history-filters";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/schema";
import type { PersonRef } from "@/lib/data/sprint";

/**
 * A story's history, as the design asks for it: one timeline per story rather
 * than one per column.
 *
 * The prototype's version list reads *"v4 added the code block, v3 rewrote the
 * highlight, v2 added criteria 4 and 5, v1 created from the Notion import"* —
 * so a version is a thing that happened **to the story**, not to
 * `work_items.description`. Somebody looking for "what changed on the 19th"
 * does not know or care which column held it, and asking them to pick a column
 * first is asking them to already know the answer.
 *
 * `document_revisions.work_item_id` exists for exactly this: the capture trigger
 * writes the story a criterion or a comment belongs to, so the whole timeline is
 * one indexed read rather than a five-way union.
 *
 * ## Restoring is per surface, even though reading is per story
 *
 * A merged timeline is the right way to READ history and the wrong way to write
 * it back — "restore the story to the 19th" would have to decide what to do
 * about the four documents that did not change that day, and any answer is
 * surprising. Each entry restores its own document, which is the operation the
 * database offers and the only one with an unambiguous meaning.
 */

export type RevisionSurface =
  | "work_item_description"
  | "work_item_highlight"
  | "sprint_notes"
  | "acceptance_criterion"
  | "comment";

export interface RevisionEntry {
  id: string;
  surface: RevisionSurface;
  entityId: string;
  revisionNo: number;
  actor: PersonRef | null;
  plainText: string | null;
  /** The revision this one was restored from, or null for an ordinary edit. */
  restoredFrom: number | null;
  createdAt: string;
  /** The text of the version before this one, for the diff. */
  previousText: string | null;
  /**
   * Whether `previousText` is actually the previous version.
   *
   * False in two different situations that must not be confused: this is
   * version 1 and there is nothing before it, or the previous version fell
   * outside the fetched window. Diffing against null in the second case would
   * render the whole document as newly added, which is a confident lie.
   */
  previousKnown: boolean;
}

/** What each surface is called on screen. The `case` is exhaustive by type. */
export function surfaceLabel(surface: RevisionSurface): string {
  switch (surface) {
    case "work_item_description":
      return "Description";
    case "work_item_highlight":
      return "Highlight";
    case "sprint_notes":
      return "Sprint notes";
    case "acceptance_criterion":
      return "Acceptance criterion";
    case "comment":
      return "Comment";
  }
}

interface RevisionRow {
  id: string;
  surface: RevisionSurface;
  entity_id: string;
  revision_no: number;
  plain_text: string | null;
  restored_from: number | null;
  created_at: string;
  actor: { id: string; full_name: string; initials: string; avatar_url: string | null } | null;
}

const REVISION_SELECT =
  "id, surface, entity_id, revision_no, plain_text, restored_from, created_at, " +
  "actor:profiles!document_revisions_actor_id_fkey ( id, full_name, initials, avatar_url )";

/**
 * Every version of every document on this story, newest first.
 *
 * `previousText` is stitched here rather than fetched per entry: the rows
 * already arrive ordered, so the version before entry *n* on the same
 * `(surface, entity_id)` is the next one along. One query instead of one per
 * version, which matters on a story with fifty criteria revisions.
 *
 * Returns `[]` rather than throwing when the table is not there yet.
 * Migrations reach production by hand, and a story page that 500s because
 * history has not been applied is a worse failure than a story page with no
 * history panel — the same argument, and the same `isMissingColumn` check, as
 * the block-document columns.
 */
export const getWorkItemRevisions = cache(
  async (workItemId: string, limit = 60): Promise<RevisionEntry[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("document_revisions")
      .select(REVISION_SELECT)
      .eq("work_item_id", workItemId)
      .order("created_at", { ascending: false })
      .order("revision_no", { ascending: false })
      .limit(limit);

    if (error) {
      // `42P01` is "no such table" — the migration has not reached this
      // database. `isMissingColumn` covers the column-shaped version of the
      // same deployment-order problem.
      if (error.code === "42P01" || isMissingColumn(error.code)) return [];
      throw error;
    }

    let rows = (data ?? []) as unknown as RevisionRow[];

    /**
     * A withdrawn comment's words do not come back through history.
     *
     * This was a real leak, introduced the moment history started rendering
     * `plain_text` for the `comment` surface and caught by
     * `e2e/editable.spec.ts` → *"withdrawn, not vanished — and its words never
     * reach the browser"*. Withdrawing a comment hides its words from every
     * reader including its author; a version panel that showed them anyway
     * would have redefined "withdraw" as "moved further down the page", which
     * is the same mistake the trash screen was careful not to make.
     *
     * The whole revision is dropped rather than blanked. A row saying "there
     * was a comment here and you may not see it" tells a reader nothing they
     * can act on, and the fact that the comment exists is already in the thread
     * as a tombstone and in the bin with its location.
     *
     * A second query rather than a join: `document_revisions.entity_id` is a
     * plain uuid with no foreign key — it addresses five different tables — so
     * there is nothing for PostgREST to embed. It is one indexed read on a
     * column the page has already loaded.
     *
     * **Written as an allowlist, deliberately.** The first version asked which
     * comments were withdrawn and dropped those, which is a denylist and missed
     * the case that actually leaked: a comment that no longer EXISTS. Nothing
     * cascades `document_revisions` when a comment is hard-deleted — `entity_id`
     * has no foreign key to cascade along — so a purged comment's words
     * survived in history, permanently, behind a confirmation that had promised
     * to remove them. `purge_deleted` now takes the revisions with it, and this
     * reads forward-only: a comment revision is shown when its comment is
     * present and standing, and in no other case.
     */
    const commentIds = [
      ...new Set(rows.filter((row) => row.surface === "comment").map((row) => row.entity_id)),
    ];
    if (commentIds.length > 0) {
      const { data: standing } = await supabase
        .from("comments")
        .select("id")
        .in("id", commentIds)
        .is("deleted_at", null);

      const visible = new Set((standing ?? []).map((row) => row.id));
      rows = rows.filter((row) => row.surface !== "comment" || visible.has(row.entity_id));
    }

    // The version before each entry, on the same document. One backwards pass:
    // the rows are newest first, so walking from the oldest and remembering the
    // last text seen per document gives every row its predecessor. Searching
    // forward from each row instead would be quadratic for no gain.
    const previousByRow = new Map<string, { text: string | null; known: boolean }>();
    const latestSeen = new Map<string, string | null>();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const document = `${row.surface}:${row.entity_id}`;
      previousByRow.set(row.id, {
        text: latestSeen.get(document) ?? null,
        // Either the predecessor is in this window, or this is version 1 and
        // there is genuinely nothing before it. Otherwise it fell off the end
        // of the page and we must not pretend the document started empty.
        known: latestSeen.has(document) || row.revision_no === 1,
      });
      latestSeen.set(document, row.plain_text);
    }

    return rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      entityId: row.entity_id,
      revisionNo: row.revision_no,
      plainText: row.plain_text,
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      previousText: previousByRow.get(row.id)?.text ?? null,
      previousKnown: previousByRow.get(row.id)?.known ?? false,
      actor: row.actor
        ? {
            id: row.actor.id,
            fullName: row.actor.full_name,
            initials: row.actor.initials,
            avatarUrl: row.actor.avatar_url,
          }
        : null,
    }));
  }
);

/**
 * Where a revision happened, so a workspace-wide list can say so.
 *
 * The story panel never needed this — it already knew which story it was on.
 * `/app/history` reads across everything, and a row that says *"Comment · v2 ·
 * Mohamed"* without saying **on what** is a row nobody can act on.
 */
export interface RevisionTarget {
  /** `COD-241`, or `Week 17` for a sprint note. */
  label: string;
  href: string;
  projectSlug: string;
  sprintNumber: number;
  /** Null for a sprint note, which belongs to a sprint and not to a story. */
  itemKey: string | null;
}

export interface RevisionListEntry extends RevisionEntry {
  target: RevisionTarget | null;
}

interface ListRow extends RevisionRow {
  work_item_id: string | null;
  sprint_id: string | null;
  work_item: {
    key: string;
    sprint: { number: number; project: { slug: string } | null } | null;
  } | null;
  sprint: { number: number; name: string; project: { slug: string } | null } | null;
}

const LIST_SELECT =
  REVISION_SELECT +
  ", work_item_id, sprint_id" +
  ", work_item:work_items ( key, sprint:sprints ( number, project:projects ( slug ) ) )" +
  ", sprint:sprints ( number, name, project:projects ( slug ) )";

/**
 * Every version of every document in the workspace, newest first.
 *
 * The sibling of `getWorkItemRevisions`, and deliberately a separate function
 * rather than a parameter on it. That one is scoped to a story and is read on
 * every story page; this one is scoped to nothing and is read on one screen.
 * Merging them would put `/app/history`'s joins on the critical path of the
 * item dialog.
 *
 * ## The filters run in the database, and the window is applied after them
 *
 * Filtering in memory would fetch the last sixty revisions of anything and then
 * show the four that happened to be comments — a screen that empties out as the
 * workspace gets busier, which is the opposite of what a history is for.
 *
 * ## Actors are matched by initials, in SQL
 *
 * `lib/history-filters.ts` explains why initials rather than ids. The lookup is
 * a separate read of `profiles` rather than a filter on the embedded join,
 * because PostgREST cannot filter a parent row by an embedded column without
 * `!inner`, and `!inner` on `actor` would silently drop every revision written
 * outside the app — which is a category this screen offers as a filter.
 */
export const listRevisions = cache(
  async (
    filters: { surfaces?: RevisionSurface[]; actors?: string[] } = {},
    limit = 80
  ): Promise<RevisionListEntry[]> => {
    const supabase = await createClient();

    let query = supabase.from("document_revisions").select(LIST_SELECT);

    if (filters.surfaces?.length) {
      query = query.in("surface", filters.surfaces);
    }

    if (filters.actors?.length) {
      const initials = filters.actors.filter((value) => value !== OUTSIDE);
      const wantsOutside = filters.actors.includes(OUTSIDE);

      const ids: string[] = [];
      if (initials.length) {
        const { data: people } = await supabase
          .from("profiles")
          .select("id, initials")
          .in("initials", initials);
        ids.push(...(people ?? []).map((row) => row.id));
      }

      if (wantsOutside && ids.length) {
        query = query.or(`actor_id.is.null,actor_id.in.(${ids.join(",")})`);
      } else if (wantsOutside) {
        query = query.is("actor_id", null);
      } else if (ids.length) {
        query = query.in("actor_id", ids);
      } else {
        // Initials nobody has. An empty result is the honest answer — the
        // alternative is dropping the filter, which shows everything under a
        // URL that says otherwise.
        return [];
      }
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("revision_no", { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === "42P01" || isMissingColumn(error.code)) return [];
      throw error;
    }

    let rows = (data ?? []) as unknown as ListRow[];

    // The same forward-only allowlist `getWorkItemRevisions` applies, and for
    // the same reason: a withdrawn comment's words do not come back through
    // history, and a purged one's must not survive it. See the long note there.
    const commentIds = [
      ...new Set(rows.filter((row) => row.surface === "comment").map((row) => row.entity_id)),
    ];
    if (commentIds.length > 0) {
      const { data: standing } = await supabase
        .from("comments")
        .select("id")
        .in("id", commentIds)
        .is("deleted_at", null);

      const visible = new Set((standing ?? []).map((row) => row.id));
      rows = rows.filter((row) => row.surface !== "comment" || visible.has(row.entity_id));
    }

    // `previousText` is stitched per document, exactly as the story panel does
    // — but across a mixed window, so two revisions of the same document may be
    // far apart in the list. Keyed by document, which handles both.
    const previousByRow = new Map<string, { text: string | null; known: boolean }>();
    const latestSeen = new Map<string, string | null>();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const document = `${row.surface}:${row.entity_id}`;
      previousByRow.set(row.id, {
        text: latestSeen.get(document) ?? null,
        known: latestSeen.has(document) || row.revision_no === 1,
      });
      latestSeen.set(document, row.plain_text);
    }

    return rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      entityId: row.entity_id,
      revisionNo: row.revision_no,
      plainText: row.plain_text,
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      previousText: previousByRow.get(row.id)?.text ?? null,
      previousKnown: previousByRow.get(row.id)?.known ?? false,
      actor: row.actor
        ? {
            id: row.actor.id,
            fullName: row.actor.full_name,
            initials: row.actor.initials,
            avatarUrl: row.actor.avatar_url,
          }
        : null,
      target: targetFor(row),
    }));
  }
);

/**
 * A revision's target, from whichever of the two denormalised columns the
 * trigger filled in.
 *
 * Null when neither resolves — a story whose project this reader cannot see,
 * or a scope column an older trigger left empty. The row still renders; it
 * simply says nothing it cannot prove, which is the same choice
 * `previousKnown` makes about the diff.
 */
function targetFor(row: ListRow): RevisionTarget | null {
  const item = row.work_item;
  if (item?.sprint?.project?.slug) {
    const slug = item.sprint.project.slug;
    const number = item.sprint.number;
    return {
      label: item.key,
      href: `/app/projects/${slug}/sprints/${number}/items/${item.key}`,
      projectSlug: slug,
      sprintNumber: number,
      itemKey: item.key,
    };
  }

  const sprint = row.sprint;
  if (sprint?.project?.slug) {
    const slug = sprint.project.slug;
    return {
      label: sprint.name,
      href: `/app/projects/${slug}/sprints/${sprint.number}/notes`,
      projectSlug: slug,
      sprintNumber: sprint.number,
      itemKey: null,
    };
  }

  return null;
}

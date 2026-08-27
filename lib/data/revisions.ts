import "server-only";

import { cache } from "react";

import { OUTSIDE } from "@/lib/history-filters";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingRelation } from "@/lib/supabase/schema";
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
  | "comment"
  | "page";

export interface RevisionEntry {
  id: string;
  surface: RevisionSurface;
  entityId: string;
  revisionNo: number;
  actor: PersonRef | null;
  plainText: string | null;
  /**
   * The block document as it stood after this change.
   *
   * Read only on the server, and only by `lib/block-diff.ts` — it is what makes
   * a formatting-only revision able to say *which* formatting. It is not sent
   * to the browser: the diff is rendered to HTML before it leaves.
   */
  doc: unknown;
  /** The block document of the version before this one, for the same reason. */
  previousDoc: unknown;
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
    case "page":
      return "Page";
  }
}

interface RevisionRow {
  id: string;
  surface: RevisionSurface;
  entity_id: string;
  revision_no: number;
  plain_text: string | null;
  doc: unknown;
  restored_from: number | null;
  created_at: string;
  actor: { id: string; full_name: string; initials: string; avatar_url: string | null } | null;
}

const REVISION_SELECT =
  "id, surface, entity_id, revision_no, plain_text, doc, restored_from, created_at, " +
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
      // The migration has not reached this database — or, just as often,
      // PostgREST has not reloaded its schema cache since it did.
      // `isMissingRelation` covers both, and `isMissingColumn` the
      // column-shaped version of the same deployment-order problem.
      if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
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
    const previousByRow = new Map<string, { text: string | null; doc: unknown; known: boolean }>();
    const latestSeen = new Map<string, { text: string | null; doc: unknown }>();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const document = `${row.surface}:${row.entity_id}`;
      previousByRow.set(row.id, {
        text: latestSeen.get(document)?.text ?? null,
        doc: latestSeen.get(document)?.doc ?? null,
        // Either the predecessor is in this window, or this is version 1 and
        // there is genuinely nothing before it. Otherwise it fell off the end
        // of the page and we must not pretend the document started empty.
        known: latestSeen.has(document) || row.revision_no === 1,
      });
      latestSeen.set(document, { text: row.plain_text, doc: row.doc });
    }

    return rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      entityId: row.entity_id,
      revisionNo: row.revision_no,
      plainText: row.plain_text,
      doc: row.doc,
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      previousText: previousByRow.get(row.id)?.text ?? null,
      previousDoc: previousByRow.get(row.id)?.doc ?? null,
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
 * Every version of one sprint's notes, newest first.
 *
 * Same shape as `getPageRevisions` and for the same reason: one document, so
 * the predecessor is the next row along and no stitching map is needed.
 *
 * Scoped by `sprint_id` **and** surface. `sprint_id` alone would be right today
 * — nothing else is stamped with it — and would silently start returning
 * something else the first time another surface is scoped to a sprint.
 */
export const getSprintRevisions = cache(
  async (sprintId: string, limit = 40): Promise<RevisionEntry[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("document_revisions")
      .select(REVISION_SELECT)
      .eq("sprint_id", sprintId)
      .eq("surface", "sprint_notes")
      .order("revision_no", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
      throw error;
    }

    const rows = (data ?? []) as unknown as RevisionRow[];

    return rows.map((row, index) => {
      const previous = rows[index + 1];
      return {
        id: row.id,
        surface: row.surface,
        entityId: row.entity_id,
        revisionNo: row.revision_no,
        plainText: row.plain_text,
        doc: row.doc,
        restoredFrom: row.restored_from,
        createdAt: row.created_at,
        previousText: previous?.plain_text ?? null,
        previousDoc: previous?.doc ?? null,
        previousKnown: Boolean(previous) || row.revision_no === 1,
        actor: row.actor
          ? {
              id: row.actor.id,
              fullName: row.actor.full_name,
              initials: row.actor.initials,
              avatarUrl: row.actor.avatar_url,
            }
          : null,
      };
    });
  }
);

/**
 * Every version of one page, newest first.
 *
 * The third scope, beside `getWorkItemRevisions` (a story) and `listRevisions`
 * (the workspace). A separate function rather than a parameter, for the reason
 * the other two are separate: this one is read on every page view and must not
 * carry `/app/history`'s joins onto that path.
 *
 * There is no withdrawn-comment allowlist here because a page has no comments —
 * `surface = 'page'` is the only thing `page_id` can be set on.
 */
export const getPageRevisions = cache(
  async (pageId: string, limit = 40): Promise<RevisionEntry[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("document_revisions")
      .select(REVISION_SELECT)
      .eq("page_id", pageId)
      .order("revision_no", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
      throw error;
    }

    const rows = (data ?? []) as unknown as RevisionRow[];

    return rows.map((row, index) => {
      // Ordered by `revision_no desc` on one document, so the predecessor is
      // simply the next row along — no stitching map needed, unlike the two
      // mixed-document readers.
      const previous = rows[index + 1];
      return {
        id: row.id,
        surface: row.surface,
        entityId: row.entity_id,
        revisionNo: row.revision_no,
        plainText: row.plain_text,
        doc: row.doc,
        restoredFrom: row.restored_from,
        createdAt: row.created_at,
        previousText: previous?.plain_text ?? null,
        previousDoc: previous?.doc ?? null,
        previousKnown: Boolean(previous) || row.revision_no === 1,
        actor: row.actor
          ? {
              id: row.actor.id,
              fullName: row.actor.full_name,
              initials: row.actor.initials,
              avatarUrl: row.actor.avatar_url,
            }
          : null,
      };
    });
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

/** What an action is, in the words `/app/history` uses. */
export type RevisionAction = "created" | "edited" | "restored";

/** Everything that can narrow `/app/history`. Every field is optional and additive. */
export interface RevisionQuery {
  surfaces?: RevisionSurface[];
  /** Initials, or the reserved `outside` token. */
  actors?: string[];
  /** Free text, matched against the flattened projection. */
  q?: string;
  projectIds?: string[];
  /** `YYYY-MM-DD`, inclusive, read as a calendar date in Africa/Cairo. */
  from?: string;
  /** `YYYY-MM-DD`, inclusive. */
  to?: string;
  actions?: RevisionAction[];
}

interface ListRow extends RevisionRow {
  work_item_id: string | null;
  sprint_id: string | null;
  page_id: string | null;
  work_item: {
    key: string;
    sprint: { number: number; project: { slug: string } | null } | null;
  } | null;
  sprint: { number: number; name: string; project: { slug: string } | null } | null;
  page: { title: string; slug: string; deleted_at: string | null; project: { slug: string } | null } | null;
}

const LIST_SELECT =
  REVISION_SELECT +
  ", work_item_id, sprint_id, page_id" +
  ", work_item:work_items ( key, sprint:sprints ( number, project:projects ( slug ) ) )" +
  ", sprint:sprints ( number, name, project:projects ( slug ) )" +
  ", page:pages ( title, slug, deleted_at, project:projects ( slug ) )";

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
  async (filters: RevisionQuery = {}, limit = 80): Promise<RevisionListEntry[]> => {
    const supabase = await createClient();

    let query = supabase.from("document_revisions").select(LIST_SELECT);

    if (filters.surfaces?.length) {
      query = query.in("surface", filters.surfaces);
    }

    /**
     * Free text, matched against the flattened projection.
     *
     * `plain_text` and not `doc`: the tree holds the same words plus a shape
     * nobody types into a search box, and `20260827120200`'s trigram index is
     * on the text column. `%` and `_` are escaped — a reader searching for
     * `100%` must not get every revision in the workspace, and a `like`
     * metacharacter reaching the database from a URL is the shape of a much
     * worse bug than that one.
     *
     * **A withdrawn comment can match here and still not be returned**, because
     * the allowlist below drops it after the query. That is the correct order:
     * the words never leave the database, and a searcher learns nothing from
     * the absence.
     */
    if (filters.q) {
      const escaped = filters.q.replace(/[\\%_]/g, (c) => `\\${c}`);
      query = query.ilike("plain_text", `%${escaped}%`);
    }

    if (filters.projectIds?.length) {
      query = query.in("project_id", filters.projectIds);
    }

    // Calendar dates in Africa/Cairo, converted to the instants that bound
    // them. Invariant 5: a `date` has no timezone and `created_at` is a
    // `timestamptz`, so the conversion has to happen somewhere — here, once,
    // rather than in three callers with three answers.
    if (filters.from) query = query.gte("created_at", startOfCairoDay(filters.from));
    if (filters.to) query = query.lt("created_at", startOfCairoDay(nextDay(filters.to)));

    /**
     * The action is derived rather than stored, so it is expressed as the
     * predicate it is:
     *
     * - `created`  — `revision_no = 1`
     * - `restored` — `restored_from is not null`
     * - `edited`   — everything else
     *
     * The three are mutually exclusive (version 1 cannot be a restore, because
     * there is nothing earlier to restore), which is what lets two of them be
     * written as the negation of the third. Selecting all three, or none,
     * narrows nothing — and says so by adding no clause at all rather than by
     * building an `or` of everything.
     */
    const actions = filters.actions ?? [];
    if (actions.length === 1) {
      if (actions[0] === "created") query = query.eq("revision_no", 1);
      if (actions[0] === "restored") query = query.not("restored_from", "is", null);
      if (actions[0] === "edited") query = query.gt("revision_no", 1).is("restored_from", null);
    } else if (actions.length === 2) {
      if (!actions.includes("created")) query = query.gt("revision_no", 1);
      else if (!actions.includes("restored")) query = query.is("restored_from", null);
      else query = query.or("revision_no.eq.1,restored_from.not.is.null");
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
      if (isMissingRelation(error.code) || isMissingColumn(error.code)) return [];
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
    const previousByRow = new Map<string, { text: string | null; doc: unknown; known: boolean }>();
    const latestSeen = new Map<string, { text: string | null; doc: unknown }>();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const document = `${row.surface}:${row.entity_id}`;
      previousByRow.set(row.id, {
        text: latestSeen.get(document)?.text ?? null,
        doc: latestSeen.get(document)?.doc ?? null,
        known: latestSeen.has(document) || row.revision_no === 1,
      });
      latestSeen.set(document, { text: row.plain_text, doc: row.doc });
    }

    return rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      entityId: row.entity_id,
      revisionNo: row.revision_no,
      plainText: row.plain_text,
      doc: row.doc,
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      previousText: previousByRow.get(row.id)?.text ?? null,
      previousDoc: previousByRow.get(row.id)?.doc ?? null,
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

  // A page. Deleted pages resolve to no route rather than to a 404: the row
  // still renders and still says what changed, it simply offers nowhere to go —
  // the same choice `previousKnown` makes about the diff, and the same one the
  // two branches above make when a reader cannot see the project.
  const page = row.page;
  if (page && page.deleted_at === null) {
    return {
      label: page.title,
      href: page.project?.slug
        ? `/app/projects/${page.project.slug}/pages/${page.slug}`
        : `/app/pages/${page.slug}`,
      projectSlug: page.project?.slug ?? "",
      sprintNumber: 0,
      itemKey: null,
    };
  }

  return null;
}

/**
 * Midnight in Africa/Cairo on a calendar date, as an instant.
 *
 * `new Date("2026-08-23")` parses as **UTC** midnight and shows the previous day
 * in half the world — invariant 5's named trap. Egypt observes DST, so the
 * offset is not a constant either: it is asked of `Intl` for that specific date
 * rather than assumed to be +02:00.
 */
function startOfCairoDay(isoDate: string): string {
  // Midday UTC on the date in question is inside the right calendar day in
  // Cairo whatever the offset is, which makes it a safe probe for the offset.
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+02:00";
  const sign = offset.includes("-") ? "-" : "+";
  const [hours = "02", minutes = "00"] = offset.replace(/^GMT[+-]?/, "").split(":");
  return new Date(`${isoDate}T00:00:00${sign}${hours.padStart(2, "0")}:${minutes}`).toISOString();
}

/** The calendar day after this one, as `YYYY-MM-DD`. */
function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

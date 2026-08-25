import "server-only";

import { cache } from "react";

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

    const rows = (data ?? []) as unknown as RevisionRow[];

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

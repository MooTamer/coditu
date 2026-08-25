import "server-only";

import { cache } from "react";

import { pruneToDepth } from "@/lib/blocks/schema";
import { isMissingColumn } from "@/lib/supabase/schema";
import { createClient } from "@/lib/supabase/server";
import {
  COMPONENT_TAGS_SELECT,
  toComponentTags,
  type ComponentRef,
} from "@/lib/data/components";
import type { PersonRef } from "@/lib/data/sprint";
import type { WorkItemStatus, WorkItemType } from "@/lib/work-items";

export interface Criterion {
  id: string;
  /** The flattened text. What the exports read, and the fallback for a
   *  criterion written before they could hold a document. */
  body: string;
  /** The ProseMirror document, or null for the 232 imported ones. */
  bodyJson: unknown | null;
  isDone: boolean;
  orderIndex: number;
}

export interface CommentRecord {
  id: string;
  author: PersonRef;
  bodyJson: unknown;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ActivityRecord {
  id: string;
  actor: PersonRef | null;
  verb: string;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

export interface TimeEntryRecord {
  id: string;
  minutes: number;
  workedOn: string;
  note: string | null;
  person: PersonRef;
}

export interface WorkItemDetail {
  id: string;
  key: string;
  title: string;
  description: string | null;
  highlight: string | null;
  status: WorkItemStatus;
  type: WorkItemType;
  deadline: string | null;
  estimateMinutes: number;
  minutesLogged: number;
  grouping: number | null;
  /** In `primary_component_of()` order. Empty means not attributed yet. */
  components: ComponentRef[];
  /**
   * The body and the note as block documents, or null for a story written
   * before the editor existed — and for one read from a database still waiting
   * for the column. `description` and `highlight` are the flattened projections
   * either way, so the page always has something to render.
   */
  descriptionDoc: unknown;
  highlightDoc: unknown;
  assignee: PersonRef | null;
  reviewer: PersonRef | null;
  criteria: Criterion[];
  comments: CommentRecord[];
  activity: ActivityRecord[];
  entries: TimeEntryRecord[];
  sprint: { id: string; number: number; name: string };
  project: { slug: string; name: string; clientName: string };
}

/**
 * One work item, with everything the detail view renders.
 *
 * Invariant 1: the item is looked up by key AND by project slug AND by sprint
 * number together. A key alone would let `/projects/nile-atelier/sprints/1/items/COD-140`
 * render an EVIM item under Nile Atelier's heading — the URL would lie, and the
 * export that follows would inherit the lie.
 */
export const getWorkItem = cache(
  async (slug: string, sprintNumber: number, key: string): Promise<WorkItemDetail | null> => {
    const supabase = await createClient();

    // Two shapes, differing by exactly the columns a database that has not
    // caught up may not have. Separate literals rather than one built at
    // runtime: supabase-js infers the row type from the LITERAL type of the
    // select string, and a computed one comes back as `GenericStringError` on
    // every field. Same reason `lib/data/sprint.ts` has two.
    const ITEM_TAIL = `status, type, deadline,
         estimate_minutes, minutes_logged, grouping,
         ${COMPONENT_TAGS_SELECT},
         assignee:profiles!work_items_assignee_id_fkey ( id, full_name, initials, avatar_url ),
         reviewer:profiles!work_items_reviewer_id_fkey ( id, full_name, initials, avatar_url ),
         acceptance_criteria ( id, body, body_json, is_done, order_index ),
         comments ( id, body_json, body_text, created_at, edited_at, deleted_at,
                    author:profiles!comments_author_id_fkey ( id, full_name, initials, avatar_url ) ),
         activity ( id, verb, field, from_value, to_value, created_at,
                    actor:profiles!activity_actor_id_fkey ( id, full_name, initials, avatar_url ) ),
         time_entries ( id, minutes, worked_on, note,
                        profiles ( id, full_name, initials, avatar_url ) ),
         sprints!inner ( id, number, name,
                         projects!inner ( slug, name, clients ( name ) ) )` as const;

    const ITEM_RICH =
      `id, key, title, description, description_json, highlight, highlight_json, ${ITEM_TAIL}` as const;
    const ITEM_PLAIN = `id, key, title, description, highlight, ${ITEM_TAIL}` as const;

    const find = <T extends string>(columns: T) =>
      supabase
        .from("work_items")
        .select(columns)
        .eq("key", key)
        .eq("sprints.number", sprintNumber)
        .eq("sprints.projects.slug", slug)
        .maybeSingle();

    const rich = await find(ITEM_RICH);
    if (rich.error && !isMissingColumn(rich.error.code)) throw rich.error;

    let descriptionDoc: unknown = rich.data?.description_json ?? null;
    let highlightDoc: unknown = rich.data?.highlight_json ?? null;
    let data = rich.data as Omit<
      NonNullable<typeof rich.data>,
      "description_json" | "highlight_json"
    > | null;

    if (rich.error) {
      const plain = await find(ITEM_PLAIN);
      if (plain.error) throw plain.error;
      data = plain.data;
      descriptionDoc = null;
      highlightDoc = null;
    }

    if (!data) return null;

    const person = (
      row: { id: string; full_name: string; initials: string; avatar_url: string | null } | null
    ) =>
      row
        ? { id: row.id, fullName: row.full_name, initials: row.initials, avatarUrl: row.avatar_url }
        : null;

    return {
      id: data.id,
      key: data.key,
      title: data.title,
      description: data.description,
      highlight: data.highlight,
      status: data.status as WorkItemStatus,
      type: data.type as WorkItemType,
      deadline: data.deadline,
      estimateMinutes: data.estimate_minutes ?? 0,
      minutesLogged: data.minutes_logged ?? 0,
      grouping: data.grouping,
      components: toComponentTags(data.work_item_components),
      descriptionDoc,
      highlightDoc,
      assignee: person(data.assignee),
      reviewer: person(data.reviewer),
      criteria: (data.acceptance_criteria ?? [])
        .map((c) => ({
          id: c.id,
          body: c.body,
          bodyJson: c.body_json ? pruneToDepth(c.body_json) : null,
          isDone: c.is_done,
          orderIndex: c.order_index,
        }))
        .sort((a, b) => a.orderIndex - b.orderIndex),
      comments: (data.comments ?? [])
        .map((c) => ({
          id: c.id,
          author: person(c.author)!,
          // A withdrawn comment keeps its place, its author and its timestamp,
          // and loses its words HERE — before they leave the server. The schema
          // comment on `comments.deleted_at` is explicit that a comment is
          // struck through rather than removed: an argument that vanishes
          // leaves every reply underneath it making no sense. Nulling the body
          // in the read model rather than in the renderer means the withdrawn
          // text never reaches a browser at all, however it is rendered later.
          bodyJson: c.deleted_at ? null : pruneToDepth(c.body_json),
          bodyText: c.deleted_at ? "" : c.body_text,
          createdAt: c.created_at,
          editedAt: c.edited_at,
          deletedAt: c.deleted_at,
        }))
        // Newest last — a thread reads top to bottom.
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      activity: (data.activity ?? [])
        .map((a) => ({
          id: a.id,
          actor: person(a.actor),
          verb: a.verb,
          field: a.field,
          fromValue: a.from_value,
          toValue: a.to_value,
          createdAt: a.created_at,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      entries: (data.time_entries ?? [])
        .map((e) => ({
          id: e.id,
          minutes: e.minutes,
          workedOn: e.worked_on,
          note: e.note,
          person: person(e.profiles)!,
        }))
        .sort((a, b) => a.workedOn.localeCompare(b.workedOn)),
      sprint: { id: data.sprints.id, number: data.sprints.number, name: data.sprints.name },
      project: {
        slug: data.sprints.projects.slug,
        name: data.sprints.projects.name,
        clientName: data.sprints.projects.clients?.name ?? "—",
      },
    };
  }
);

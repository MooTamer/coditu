import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { ComponentRef } from "@/lib/data/components";
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
  component: ComponentRef | null;
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

    const { data, error } = await supabase
      .from("work_items")
      .select(
        `id, key, title, description, highlight, status, type, deadline,
         estimate_minutes, minutes_logged, grouping,
         components ( id, name, slug, kind, is_archived, icon ),
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
                         projects!inner ( slug, name, clients ( name ) ) )`
      )
      .eq("key", key)
      .eq("sprints.number", sprintNumber)
      .eq("sprints.projects.slug", slug)
      .maybeSingle();

    if (error) throw error;
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
      component: data.components
        ? {
            id: data.components.id,
            name: data.components.name,
            slug: data.components.slug,
            kind: data.components.kind as ComponentRef["kind"],
            isArchived: data.components.is_archived,
            icon: data.components.icon,
          }
        : null,
      assignee: person(data.assignee),
      reviewer: person(data.reviewer),
      criteria: (data.acceptance_criteria ?? [])
        .map((c) => ({
          id: c.id,
          body: c.body,
          bodyJson: c.body_json ?? null,
          isDone: c.is_done,
          orderIndex: c.order_index,
        }))
        .sort((a, b) => a.orderIndex - b.orderIndex),
      comments: (data.comments ?? [])
        // Soft-deleted comments stay in the table but never render.
        .filter((c) => c.deleted_at === null)
        .map((c) => ({
          id: c.id,
          author: person(c.author)!,
          bodyJson: c.body_json,
          bodyText: c.body_text,
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

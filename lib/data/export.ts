import "server-only";

import { cache } from "react";

import { daysRemaining, todayInCairo } from "@/lib/data/sprint";
import { timestamp } from "@/lib/format";
import { statusRank, type WorkItemStatus, type WorkItemType } from "@/lib/work-items";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportItem,
  type ExportOptions,
  type ExportPayload,
} from "@/lib/export/types";

/**
 * Assembles an export payload.
 *
 * THIS is where the scoping guarantee lives. The payload is built from a
 * project slug and a sprint number; the items come from that sprint, and the
 * caller's selection can only ever NARROW that set — `selectedKeys` filters, it
 * never adds. There is no parameter through which another client's work could
 * enter, which is what makes "an export can never contain another project's
 * items" a property of the shape rather than a rule someone has to remember.
 */
export const buildExportPayload = cache(
  async (
    slug: string,
    sprintNumber: number,
    selectedKeys: string[] | null,
    options: ExportOptions = DEFAULT_EXPORT_OPTIONS
  ): Promise<ExportPayload | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("sprints")
      .select(
        `id, number, name, starts_on, ends_on, notes,
         projects!inner ( name, slug, clients ( name, website_url ) ),
         work_items (
           key, title, description, highlight, status, type, grouping, deadline,
           estimate_minutes, minutes_logged, order_index,
           assignee:profiles!work_items_assignee_id_fkey ( full_name, initials ),
           reviewer:profiles!work_items_reviewer_id_fkey ( full_name, initials ),
           acceptance_criteria ( body, is_done, order_index ),
           comments ( body_text, created_at, deleted_at,
                      author:profiles!comments_author_id_fkey ( full_name ) ),
           activity ( verb, field, from_value, to_value, created_at,
                      actor:profiles!activity_actor_id_fkey ( initials ) ),
           time_entries ( minutes, worked_on )
         )`
      )
      .eq("number", sprintNumber)
      .eq("projects.slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const all = (data.work_items ?? []).sort((a, b) => a.order_index - b.order_index);

    // The selection narrows. An unknown key simply matches nothing.
    const selected = selectedKeys === null ? all : all.filter((item) => selectedKeys.includes(item.key));

    const items: ExportItem[] = selected.map((item) => ({
      key: item.key,
      title: item.title,
      description: item.description,
      highlight: item.highlight,
      status: item.status as WorkItemStatus,
      type: item.type as WorkItemType,
      grouping: item.grouping,
      assignee: item.assignee
        ? { fullName: item.assignee.full_name, initials: item.assignee.initials }
        : null,
      reviewer: item.reviewer
        ? { fullName: item.reviewer.full_name, initials: item.reviewer.initials }
        : null,
      deadline: item.deadline,
      estimateMinutes: item.estimate_minutes ?? 0,
      minutesLogged: item.minutes_logged ?? 0,
      criteria: (item.acceptance_criteria ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ body: c.body, isDone: c.is_done })),
      comments: (item.comments ?? [])
        .filter((c) => c.deleted_at === null)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({
          author: c.author?.full_name ?? "someone",
          when: timestamp(c.created_at),
          // The flattened projection, never the ProseMirror document — an
          // export is plain text, and body_text is what it is for.
          text: c.body_text,
        })),
      activity: (item.activity ?? [])
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((a) => {
          const who = a.actor?.initials ?? "system";
          if (a.verb === "created") return `${who} created this item · ${timestamp(a.created_at)}`;
          if (a.field === "status") {
            return `${who} changed status ${a.from_value ?? "—"} → ${a.to_value ?? "—"} · ${timestamp(a.created_at)}`;
          }
          return `${who} set ${a.field ?? a.verb} → ${a.to_value ?? "—"} · ${timestamp(a.created_at)}`;
        }),
      entries: (item.time_entries ?? [])
        .sort((a, b) => a.worked_on.localeCompare(b.worked_on))
        .map((e) => ({ workedOn: e.worked_on, minutes: e.minutes })),
    }));

    return {
      project: {
        name: data.projects.name,
        slug: data.projects.slug,
        clientName: data.projects.clients?.name ?? "—",
        clientUrl: data.projects.clients?.website_url ?? null,
      },
      sprint: {
        id: data.id,
        number: data.number,
        name: data.name,
        startsOn: data.starts_on,
        endsOn: data.ends_on,
        notes: data.notes,
        daysRemaining: daysRemaining(data.ends_on),
      },
      items,
      totalItems: all.length,
      options,
      today: todayInCairo(),
    };
  }
);

/** Items in the fixed display order — how the report groups them. */
export function itemsByStatusOrder(payload: ExportPayload): ExportItem[] {
  return [...payload.items].sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

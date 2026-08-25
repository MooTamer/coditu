import "server-only";

import { cache } from "react";

import { toComponent, type ComponentRef } from "@/lib/components";

// Re-exported so the ten callers that already import these from here keep
// working, and so there is still one obvious place to look for them.
export {
  COMPONENT_TAGS_SELECT,
  COMPONENT_TAG_ORDER,
  componentsFromTags,
  orderComponentTags,
  toComponentTags,
} from "@/lib/components";
export type { ComponentRef, ComponentTag } from "@/lib/components";
import { createClient } from "@/lib/supabase/server";
import { statusRank, type WorkItemStatus, type WorkItemType } from "@/lib/work-items";



/**
 * The registry for one project, name-ordered.
 *
 * Archived components are included, because the pickers need to keep SHOWING
 * the one an item already carries even after it is retired — a cell that blanks
 * itself when a component is archived reads as data loss. Filtering to the
 * offerable ones is `offerable()` below, applied at the point of choice.
 */
export const listComponents = cache(async (projectId: string): Promise<ComponentRef[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("components")
    .select("id, name, slug, kind, is_archived, icon")
    .eq("project_id", projectId)
    .order("name");

  if (error) throw error;

  return (data ?? []).map(toComponent);
});

/**
 * Every project's registry, keyed by project id.
 *
 * The New item dialog lives in the topbar, which is on every screen and can
 * create into any open sprint in any project — so it needs all of them, and one
 * query beats one per project. It is still not "all components": the map is
 * keyed by project and the dialog only ever reads the key belonging to the
 * sprint that was picked.
 */
export const listComponentsByProject = cache(
  async (): Promise<Record<string, ComponentRef[]>> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("components")
      .select("id, project_id, name, slug, kind, is_archived, icon")
      .order("name");

    if (error) throw error;

    const byProject: Record<string, ComponentRef[]> = {};
    for (const row of data ?? []) {
      (byProject[row.project_id] ??= []).push(toComponent(row));
    }
    return byProject;
  }
);

/** What may be CHOSEN, as opposed to what may be displayed. */
export function offerable(components: ComponentRef[], keep: string | null = null): ComponentRef[] {
  return components.filter((component) => !component.isArchived || component.id === keep);
}

/* -------------------------------------------------------------------------- */

export interface ComponentSummary extends ComponentRef {
  itemCount: number;
  openCount: number;
  minutesLogged: number;
  estimateMinutes: number;
  /** Highest sprint number this component has been worked in, or null. */
  lastSprintNumber: number | null;
}

/**
 * The registry with its numbers — what the components page lists.
 *
 * One query, aggregated here rather than in a view: a project has forty
 * components and a few hundred items, the page is not on a hot path, and a
 * fourth database view is a fourth thing to keep in step with RLS.
 */
export const listComponentSummaries = cache(
  async (projectId: string): Promise<ComponentSummary[]> => {
    const supabase = await createClient();

    // Through the join table, not through `work_items.component_id`: an item
    // that names three components has to appear in all three summaries, and the
    // mirror column can only ever put it in one.
    const { data, error } = await supabase
      .from("components")
      .select(
        `id, name, slug, kind, is_archived, icon,
         work_item_components ( work_items!inner ( status, minutes_logged, estimate_minutes, sprints!inner ( number ) ) )`
      )
      .eq("project_id", projectId)
      .order("name");

    if (error) throw error;

    return (data ?? []).map((row) => {
      const items = (row.work_item_components ?? [])
        .map((tag) => tag.work_items)
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        ...toComponent(row),
        itemCount: items.length,
        openCount: items.filter((item) => item.status !== "done").length,
        minutesLogged: items.reduce((total, item) => total + (item.minutes_logged ?? 0), 0),
        estimateMinutes: items.reduce((total, item) => total + (item.estimate_minutes ?? 0), 0),
        lastSprintNumber: items.reduce<number | null>(
          (highest, item) =>
            highest === null || item.sprints.number > highest ? item.sprints.number : highest,
          null
        ),
      };
    });
  }
);

/* -------------------------------------------------------------------------- */

export interface ComponentItem {
  id: string;
  key: string;
  title: string;
  /** The client-safe rewrite, when one was written. Null means the title is fine. */
  clientTitle: string | null;
  /** Whether this item is part of what the client sees. */
  clientPublished: boolean;
  status: WorkItemStatus;
  type: WorkItemType;
  minutesLogged: number;
  estimateMinutes: number;
  closedAt: string | null;
  sprint: { number: number; name: string };
}

export interface ComponentDossier extends ComponentSummary {
  /** Every item that names this component, newest sprint first. */
  items: ComponentItem[];
  /** The sentence written for the client, or "" — never the internal name. */
  clientSummary: string;
  /** Whether this component has been deliberately shown to the client. */
  clientPublished: boolean;
}

/**
 * One component and everything that has ever happened to it, across sprints.
 *
 * This is the whole reason the registry exists. The sprint table answers "what
 * is happening this week"; this answers "what have we done to the Newspart" —
 * a question that used to be a text search over fifteen sprints of hand-typed
 * titles, and that the client asks in almost every call.
 *
 * Looked up by project id AND slug together, never by slug alone, for the same
 * reason `getWorkItem` takes a slug and a sprint number: a lookup by the URL's
 * last segment alone would render one client's component under another's
 * heading.
 */
export const getComponentDossier = cache(
  async (projectId: string, slug: string): Promise<ComponentDossier | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("components")
      .select(
        `id, name, slug, kind, is_archived, icon, client_summary, published_at,
         work_item_components (
           work_items!inner ( id, key, title, status, type, minutes_logged, estimate_minutes, closed_at,
                              client_title, client_published_at,
                              sprints!inner ( number, name ) ) )`
      )
      .eq("project_id", projectId)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const rows = (data.work_item_components ?? [])
      .map((tag) => tag.work_items)
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const items: ComponentItem[] = rows
      .map((item) => ({
        id: item.id,
        key: item.key,
        title: item.title,
        clientTitle: item.client_title,
        clientPublished: item.client_published_at !== null,
        status: item.status as WorkItemStatus,
        type: item.type as WorkItemType,
        minutesLogged: item.minutes_logged ?? 0,
        estimateMinutes: item.estimate_minutes ?? 0,
        closedAt: item.closed_at,
        sprint: { number: item.sprints.number, name: item.sprints.name },
      }))
      // Newest sprint first, and inside a sprint the fixed status display order
      // — the same order the board and every export use, so a component reads
      // the same way everywhere in the app.
      .sort(
        (a, b) =>
          b.sprint.number - a.sprint.number ||
          statusRank(a.status) - statusRank(b.status) ||
          a.key.localeCompare(b.key)
      );

    return {
      ...toComponent(data),
      itemCount: items.length,
      openCount: items.filter((item) => item.status !== "done").length,
      minutesLogged: items.reduce((total, item) => total + item.minutesLogged, 0),
      estimateMinutes: items.reduce((total, item) => total + item.estimateMinutes, 0),
      lastSprintNumber: items[0]?.sprint.number ?? null,
      items,
      clientSummary: data.client_summary ?? "",
      clientPublished: data.published_at !== null,
    };
  }
);

import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * The client portal's read model.
 *
 * ── What this file deliberately does not import ─────────────────────────────
 *
 * `lib/data/export.ts`, `lib/data/work-item.ts` and `lib/data/sprint.ts` are
 * the internal loaders, and every one of them selects things a client must
 * never see — `buildExportPayload` pulls comments, activity, assignees,
 * reviewers and time entries in a single query, and `getWorkItem` does the
 * same. Reusing one of them and filtering afterwards would mean the sensitive
 * rows had already been fetched, already crossed the process boundary, and were
 * one careless prop away from the payload.
 *
 * So nothing here calls them. Every function below is one `rpc()` to one of the
 * `client_*` functions, which name their columns in SQL and check the
 * capability inside their own body. If a field is not on the types in this
 * file, no amount of carelessness at a render edge can leak it — it was never
 * fetched.
 *
 * ── Why these are not `.from(...)` calls ────────────────────────────────────
 *
 * A client session reads zero rows from every base table; that is asserted in
 * `supabase/tests/rls.sql`. `.from("work_items")` here would return an empty
 * array rather than an error, which is the most expensive kind of wrong: it
 * looks like "no data yet" and it is "wrong access model".
 */

export interface ClientProjectView {
  id: string;
  name: string;
  slug: string;
  clientName: string;
  accentHex: string | null;
}

export interface ClientComponentView {
  id: string;
  name: string;
  slug: string;
  /** The summary written for this client. Never the internal description. */
  summary: string;
  /** Published work only — an unpublished item does not move these numbers. */
  itemCount: number;
  doneCount: number;
  /** Null when `view_effort` was not granted. Null, not zero. */
  minutesLogged: number | null;
  lastActivity: string | null;
}

export interface ClientWorkView {
  id: string;
  /** `client_title` if one was written, otherwise the internal title. */
  title: string;
  summary: string | null;
  /** Already humanised in SQL. The enum value never crosses the wire. */
  statusLabel: string;
  isDone: boolean;
  deadline: string | null;
  publishedAt: string;
}

export interface ClientSprintView {
  name: string;
  goal: string | null;
  startsOn: string;
  endsOn: string;
  totalItems: number;
  doneItems: number;
  minutesLogged: number | null;
}

/* -------------------------------------------------------------------------- */

/**
 * The projects this contact may see.
 *
 * `cache`d for the request, like every other loader in `lib/data/**`: the
 * layout, the page and the nav each ask, and one round trip is the right
 * number.
 */
export const listClientProjects = cache(async (): Promise<ClientProjectView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_projects");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.project_id,
    name: row.name,
    slug: row.slug,
    clientName: row.client_name,
    accentHex: row.accent_hex,
  }));
});

/**
 * One project by slug, or null.
 *
 * Resolved from the list rather than by a second query taking a slug, and that
 * is a deliberate narrowing: a function that took a slug straight to the
 * database would be one more place where "which project is this" has to be
 * answered correctly. Here the only projects that exist are the ones already
 * returned, so an ungranted slug cannot resolve — there is nothing to get
 * wrong. The list is one request-cached call, so this costs nothing.
 */
export const getClientProject = cache(
  async (slug: string): Promise<ClientProjectView | null> => {
    const projects = await listClientProjects();
    return projects.find((project) => project.slug === slug) ?? null;
  }
);

export const listClientComponents = cache(
  async (projectId: string): Promise<ClientComponentView[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("client_components", {
      p_project_id: projectId,
    });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.component_id,
      name: row.name,
      slug: row.slug,
      summary: row.summary ?? "",
      itemCount: row.item_count ?? 0,
      doneCount: row.done_count ?? 0,
      // `?? null` and NOT `?? 0`. The RPC returns null to mean "not granted",
      // and coalescing it to zero here would turn "we are not showing you this"
      // into "nobody has worked on it", which is a different and false claim.
      minutesLogged: row.minutes_logged ?? null,
      lastActivity: row.last_activity,
    }));
  }
);

export const getClientComponent = cache(
  async (projectId: string, slug: string): Promise<ClientComponentView | null> => {
    const components = await listClientComponents(projectId);
    return components.find((component) => component.slug === slug) ?? null;
  }
);

export const listClientWork = cache(
  async (projectId: string, componentId: string): Promise<ClientWorkView[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("client_component_work", {
      p_project_id: projectId,
      p_component_id: componentId,
    });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.work_item_id,
      title: row.title,
      summary: row.summary,
      statusLabel: row.status_label ?? "In progress",
      isDone: row.is_done,
      deadline: row.deadline,
      publishedAt: row.published_at,
    }));
  }
);

export const getClientCurrentSprint = cache(
  async (projectId: string): Promise<ClientSprintView | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("client_current_sprint", {
      p_project_id: projectId,
    });

    if (error) throw error;

    const row = (data ?? [])[0];
    if (!row) return null;

    return {
      name: row.name,
      goal: row.goal,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      totalItems: row.total_items ?? 0,
      doneItems: row.done_items ?? 0,
      minutesLogged: row.minutes_logged ?? null,
    };
  }
);

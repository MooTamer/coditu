import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Read models for the app shell.
 *
 * Every function here is wrapped in React's `cache` so a single request that
 * renders the rail, the topbar, and the page body issues one query, not three.
 * They are Server Components — this is request-scoped memoisation, not a cache
 * that outlives the request.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  scope: string | null;
  accentHex: string | null;
  clientName: string;
  clientUrl: string | null;
  clientLogoPath: string | null;
  sprintCount: number;
  minutesLogged: number;
  activeSprint: { number: number; name: string } | null;
  /** Enough for the switcher menu and the New item dialog's target picker. The
   *  full read model is `listSprintsForProject`. */
  sprints: Array<{ id: string; number: number; name: string; status: SprintStatus; itemCount: number }>;
}

type SprintStatus = "planned" | "active" | "closed";

export const listProjects = cache(async (): Promise<ProjectSummary[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, name, slug, scope, accent_hex, is_archived,
       clients ( name, website_url, logo_path ),
       sprints ( id, number, name, status,
                 work_items ( minutes_logged ) )`
    )
    .eq("is_archived", false)
    .order("name");

  if (error) throw error;

  return (data ?? []).map((project) => {
    const sprints = project.sprints ?? [];
    const active = sprints.find((s) => s.status === "active") ?? null;

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      scope: project.scope,
      accentHex: project.accent_hex,
      clientName: project.clients?.name ?? "—",
      clientUrl: project.clients?.website_url ?? null,
      clientLogoPath: project.clients?.logo_path ?? null,
      sprintCount: sprints.length,
      minutesLogged: sprints.reduce(
        (total, sprint) =>
          total + (sprint.work_items ?? []).reduce((n, item) => n + (item.minutes_logged ?? 0), 0),
        0
      ),
      activeSprint: active ? { number: active.number, name: active.name } : null,
      sprints: [...sprints]
        .sort((a, b) => b.number - a.number)
        .map((sprint) => ({
          id: sprint.id,
          number: sprint.number,
          name: sprint.name,
          status: sprint.status,
          itemCount: (sprint.work_items ?? []).length,
        })),
    };
  });
});

export const getProjectBySlug = cache(async (slug: string) => {
  const projects = await listProjects();
  return projects.find((project) => project.slug === slug) ?? null;
});

export interface SprintSummary {
  id: string;
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
  startsOn: string | null;
  endsOn: string | null;
  itemCount: number;
  minutesLogged: number;
  estimateMinutes: number;
  daysRemaining: number | null;
}

/**
 * Invariant 1: sprints are always fetched for one project. There is no
 * "list all sprints" — a sprint list is never global, and the project switcher
 * shows only the sprints belonging to the selected project.
 */
export const listSprintsForProject = cache(async (projectId: string): Promise<SprintSummary[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_sprint_summary")
    .select("sprint_id, number, name, status, starts_on, ends_on, item_count, minutes_logged, estimate_minutes, days_remaining")
    .eq("project_id", projectId)
    .order("number", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.sprint_id!,
    number: row.number!,
    name: row.name!,
    status: row.status!,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    itemCount: Number(row.item_count ?? 0),
    minutesLogged: Number(row.minutes_logged ?? 0),
    estimateMinutes: Number(row.estimate_minutes ?? 0),
    daysRemaining: row.days_remaining === null ? null : Number(row.days_remaining),
  }));
});

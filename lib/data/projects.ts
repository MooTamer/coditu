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
  /**
   * The prefix every story key in this project carries — `COD`.
   *
   * Read for the breadcrumb, where it sits as a chip beside the project's name
   * and connects the project to the keys people actually say out loud. Nullable
   * because the column is: a project created before keys were introduced has
   * none.
   */
  keyPrefix: string | null;
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
      `id, name, slug, scope, accent_hex, is_archived, key_prefix,
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
      keyPrefix: project.key_prefix ?? null,
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

/**
 * Resolve a project by whatever address the reader arrived on.
 *
 * A project's slug can change, and §8.5 was answered "keep the old one as a
 * redirect" — so the second lookup is the alias table, and a bookmark from
 * before a rename still lands. The alias query only runs when the live slug
 * misses, which is every request except the ones that would otherwise 404.
 */
export const getProjectBySlug = cache(async (slug: string) => {
  const projects = await listProjects();
  const live = projects.find((project) => project.slug === slug);
  if (live) return live;

  const supabase = await createClient();
  const { data: alias } = await supabase
    .from("project_slug_aliases")
    .select("project_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!alias) return null;
  return projects.find((project) => project.id === alias.project_id) ?? null;
});

export interface ClientSummary {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoPath: string | null;
  accentHex: string | null;
  projectCount: number;
}

/** Every client, for the pickers that create and move a project. */
export const listClients = cache(async (): Promise<ClientSummary[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, website_url, logo_path, accent_hex, projects ( id )")
    .order("name");

  if (error) throw error;

  return (data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    websiteUrl: client.website_url,
    logoPath: client.logo_path,
    accentHex: client.accent_hex,
    projectCount: (client.projects ?? []).length,
  }));
});

export interface ArchivedProject {
  id: string;
  name: string;
  slug: string;
  clientName: string;
}

/**
 * The archived ones, which `listProjects` deliberately never returns.
 *
 * Only the administration panel asks for these: an archived project is out of
 * everybody's way by design, and the one thing a person still needs to do with
 * it is bring it back.
 */
export const listArchivedProjects = cache(async (): Promise<ArchivedProject[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, slug, clients ( name )")
    .eq("is_archived", true)
    .order("name");

  if (error) throw error;

  return (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    clientName: project.clients?.name ?? "—",
  }));
});

export interface SprintSummary {
  id: string;
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
  startsOn: string | null;
  endsOn: string | null;
  /** The one sentence the sprint is for. Null until somebody writes it. */
  goal: string | null;
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

  // Two reads, joined here. `v_sprint_summary` is a rollup of counts and
  // minutes and stays one — adding a paragraph of prose to it would make every
  // caller pay for text none of them render — so the goal comes from the table
  // and is matched by id.
  const [{ data, error }, { data: goals }] = await Promise.all([
    supabase
      .from("v_sprint_summary")
      .select("sprint_id, number, name, status, starts_on, ends_on, item_count, minutes_logged, estimate_minutes, days_remaining")
      .eq("project_id", projectId)
      .order("number", { ascending: false }),
    supabase.from("sprints").select("id, goal").eq("project_id", projectId),
  ]);

  if (error) throw error;

  const goalById = new Map((goals ?? []).map((row) => [row.id, row.goal ?? null]));

  return (data ?? []).map((row) => ({
    id: row.sprint_id!,
    number: row.number!,
    name: row.name!,
    status: row.status!,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    goal: goalById.get(row.sprint_id!) ?? null,
    itemCount: Number(row.item_count ?? 0),
    minutesLogged: Number(row.minutes_logged ?? 0),
    estimateMinutes: Number(row.estimate_minutes ?? 0),
    daysRemaining: row.days_remaining === null ? null : Number(row.days_remaining),
  }));
});

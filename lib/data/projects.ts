import "server-only";

import { cache } from "react";

import { describeActivity } from "@/lib/activity";
import { listComponentsByProject } from "@/lib/data/components";
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

/* -------------------------------------------------------------------------- */

/**
 * The projects list's own read model: every project, archived ones included,
 * with the three things the list shows that the shell's `listProjects` has no
 * business fetching.
 *
 * ## Why this is separate from `listProjects`
 *
 * `listProjects` runs on **every page in the app** — the sidebar's spaces tree
 * and the topbar both read it. Adding a team roll-up and an activity scan to it
 * would put three more joins on every request in order to serve one screen.
 * This one is called by `/app/projects` and nowhere else.
 *
 * ## `recentActivity` is bounded by TIME, and the column says so
 *
 * The obvious implementation — order every activity row by date and take the
 * newest few hundred — is wrong in a way that is invisible: a quiet project
 * whose last event falls outside the window renders as though nothing has ever
 * happened on it. A window of days cannot do that. It can only ever mean
 * "nothing in the last thirty days", which is exactly what the column is called
 * and exactly what the empty cell says.
 */
export interface ProjectOverview extends ProjectSummary {
  isArchived: boolean;
  componentCount: number;
  /** Everybody holding a seat on an item in this project, by initials. */
  team: Array<{ id: string; fullName: string; initials: string; avatarUrl: string | null }>;
  /** The newest event in the window, already worded. Null if the window is empty. */
  recentActivity: { key: string; sentence: string; at: string } | null;
}

/** What "recent" means, in one place, so the column and the query agree. */
export const RECENT_ACTIVITY_DAYS = 30;

export const listProjectOverviews = cache(async (): Promise<ProjectOverview[]> => {
  const supabase = await createClient();

  const since = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 86_400_000).toISOString();

  const [live, archived, components, seats, events] = await Promise.all([
    listProjects(),
    // Archived projects are a filter on this screen rather than a separate
    // list, so they arrive through the same shape rather than through
    // `listArchivedProjects`, which answers a different question for the
    // admin panel.
    supabase
      .from("projects")
      .select(
        `id, name, slug, scope, accent_hex, key_prefix,
         clients ( name, website_url, logo_path ),
         sprints ( id, number, name, status, work_items ( minutes_logged ) )`
      )
      .eq("is_archived", true)
      .order("name"),
    listComponentsByProject(),
    supabase
      .from("work_items")
      .select(
        `sprints!inner ( project_id ),
         assignee:profiles!work_items_assignee_id_fkey ( id, full_name, initials, avatar_url ),
         reviewer:profiles!work_items_reviewer_id_fkey ( id, full_name, initials, avatar_url )`
      ),
    supabase
      .from("activity")
      .select(
        `verb, field, from_value, to_value, created_at,
         actor:profiles!activity_actor_id_fkey ( initials ),
         work_items!inner ( key, sprints!inner ( project_id ) )`
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  ]);

  if (archived.error) throw archived.error;
  if (seats.error) throw seats.error;
  if (events.error) throw events.error;

  const teams = new Map<string, Map<string, ProjectOverview["team"][number]>>();
  for (const row of seats.data ?? []) {
    const projectId = row.sprints?.project_id;
    if (!projectId) continue;
    const roster = teams.get(projectId) ?? new Map();
    for (const person of [row.assignee, row.reviewer]) {
      if (!person) continue;
      roster.set(person.id, {
        id: person.id,
        fullName: person.full_name,
        initials: person.initials,
        avatarUrl: person.avatar_url,
      });
    }
    teams.set(projectId, roster);
  }

  // Ordered newest first by the query, so the first row seen for a project is
  // its latest — no comparison needed, and no second sort to get wrong.
  const latest = new Map<string, ProjectOverview["recentActivity"]>();
  for (const row of events.data ?? []) {
    const projectId = row.work_items?.sprints?.project_id;
    if (!projectId || latest.has(projectId)) continue;
    latest.set(projectId, {
      key: row.work_items?.key ?? "",
      sentence: describeActivity({
        verb: row.verb,
        field: row.field,
        fromValue: row.from_value,
        toValue: row.to_value,
        actor: row.actor,
      }),
      at: row.created_at,
    });
  }

  const enrich = (project: ProjectSummary, isArchived: boolean): ProjectOverview => ({
    ...project,
    isArchived,
    componentCount: (components[project.id] ?? []).filter((c) => !c.isArchived).length,
    team: [...(teams.get(project.id)?.values() ?? [])].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    ),
    recentActivity: latest.get(project.id) ?? null,
  });

  const retired: ProjectSummary[] = (archived.data ?? []).map((project) => {
    const sprints = project.sprints ?? [];
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      scope: project.scope,
      accentHex: project.accent_hex,
      keyPrefix: project.key_prefix ?? null,
      clientName: project.clients?.name ?? "—",
      clientUrl: project.clients?.website_url ?? null,
      clientLogoPath: project.clients?.logo_path ?? null,
      sprintCount: sprints.length,
      minutesLogged: sprints.reduce(
        (total, sprint) =>
          total + (sprint.work_items ?? []).reduce((n, item) => n + (item.minutes_logged ?? 0), 0),
        0
      ),
      // An archived project has no ACTIVE sprint by definition of what
      // archiving is for — but read it rather than assert it, because the
      // column is what decides and nothing stops a sprint being left open.
      activeSprint: (() => {
        const active = sprints.find((sprint) => sprint.status === "active");
        return active ? { number: active.number, name: active.name } : null;
      })(),
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

  return [
    ...live.map((project) => enrich(project, false)),
    ...retired.map((project) => enrich(project, true)),
  ];
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

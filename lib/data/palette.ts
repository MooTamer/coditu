import "server-only";

import { byProminence, type RankableProject } from "@/lib/projects";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { WorkItemStatus } from "@/lib/work-items";

/**
 * Everything the command palette can jump to.
 *
 * Read on demand — the palette asks for this the first time it opens, not on
 * every navigation. A query per page load to populate a dialog most people
 * never open is a cost with no reader.
 *
 * Scoping is RLS's job, not a `where` clause here. The palette runs as the
 * signed-in profile, so it can only ever list what that person may already
 * see — and invariant 1 holds because every row carries the project and sprint
 * it belongs to, rather than a bare key that a caller could re-point.
 *
 * ## Archived is not a scope, and it is filtered here anyway — PF-3
 *
 * This was the one surface an archived project still reached. Every other
 * reader goes through `listProjects()`, which has filtered `is_archived` since
 * the column existed; the palette builds its own query and did not, so a
 * project deliberately put away still turned up under Cmd-K — with its
 * sprints, and with every story in them. Search is a surface like any other,
 * and a project that is out of the sidebar and out of Home and still first in
 * search has not actually been archived.
 *
 * All three queries carry the filter, and the items one reaches it two joins
 * up (`sprints.projects.is_archived`) rather than filtering in TypeScript
 * afterwards: the rows should never leave the database.
 */

export interface PaletteItem {
  id: string;
  key: string;
  title: string;
  status: WorkItemStatus;
  projectSlug: string;
  clientName: string;
  sprintNumber: number;
  path: string;
}

export interface PaletteSprint {
  id: string;
  name: string;
  number: number;
  status: string;
  projectSlug: string;
  clientName: string;
  path: string;
}

export interface PaletteProject {
  id: string;
  slug: string;
  name: string;
  clientName: string;
  path: string;
}

export interface PalettePerson {
  id: string;
  fullName: string;
  initials: string;
}

export interface PaletteTargets {
  projects: PaletteProject[];
  sprints: PaletteSprint[];
  items: PaletteItem[];
  people: PalettePerson[];
  /** Whether this profile may reassign work — the palette hides what it cannot do. */
  canAssign: boolean;
  /**
   * The reader's role, so the palette can offer the destinations they can
   * actually reach.
   *
   * `navFor()` already filters by role for the sidebar and the phone's overflow
   * sheet; the palette is the third surface that has to agree with them, and a
   * command that 404s reads as a broken app rather than as a screen that is not
   * yours.
   */
  role: string;
}

const EMPTY: PaletteTargets = {
  projects: [],
  sprints: [],
  items: [],
  people: [],
  canAssign: false,
  role: "",
};

export async function getPaletteTargets(): Promise<PaletteTargets> {
  const profile = await getCurrentProfile();
  if (!profile) return EMPTY;

  const supabase = await createClient();

  const [projectRows, itemRows, peopleRows] = await Promise.all([
    supabase
      .from("projects")
      .select("id, slug, name, clients ( name ), sprints ( id, name, number, status )")
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("work_items")
      .select(
        "id, key, title, status, sprints!inner ( number, projects!inner ( slug, is_archived, clients ( name ) ) )"
      )
      .eq("sprints.projects.is_archived", false)
      .order("key"),
    // `initials` is READ, not re-derived. It used to be computed here from the
    // display name, which is a third answer to a question the column already
    // answers — and the three did not agree: this one split on `\s+`, so
    // "Ahmed  Yehia" gave AY where `handle_new_user` gives A. A name corrected
    // in Settings updates the column, and the palette would have gone on
    // showing the old derivation.
    supabase.from("profiles").select("id, full_name, initials").order("full_name"),
  ]);

  const projects: PaletteProject[] = [];
  const sprints: PaletteSprint[] = [];

  for (const row of projectRows.data ?? []) {
    const clientName = (row.clients as { name: string } | null)?.name ?? row.name;
    projects.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      clientName,
      path: `/app/projects/${row.slug}`,
    });

    for (const sprint of (row.sprints ?? []) as Array<{
      id: string;
      name: string;
      number: number;
      status: string;
    }>) {
      sprints.push({
        id: sprint.id,
        name: sprint.name,
        number: sprint.number,
        status: sprint.status,
        projectSlug: row.slug,
        clientName,
        path: `/app/projects/${row.slug}/sprints/${sprint.number}`,
      });
    }
  }

  sprints.sort((a, b) => b.number - a.number);

  /**
   * The same order the sidebar draws, so the first project under Cmd-K is the
   * first project on screen. The palette's rows carry their sprints, so the
   * two inputs the rule needs are already here and no extra query is.
   */
  const sprintsOf = new Map<string, Array<{ number: number; status: string }>>(
    (projectRows.data ?? []).map((row) => [
      row.id,
      (row.sprints ?? []) as Array<{ number: number; status: string }>,
    ])
  );
  const rankable = (project: PaletteProject): RankableProject => {
    const owned = sprintsOf.get(project.id) ?? [];
    return {
      name: project.name,
      sprintCount: owned.length,
      activeSprint: owned.find((sprint) => sprint.status === "active") ?? null,
    };
  };
  projects.sort((a, b) => byProminence(rankable(a), rankable(b)));

  const items: PaletteItem[] = (itemRows.data ?? []).map((row) => {
    const sprint = row.sprints as unknown as {
      number: number;
      projects: { slug: string; is_archived: boolean; clients: { name: string } | null };
    };
    const slug = sprint.projects.slug;
    return {
      id: row.id,
      key: row.key,
      title: row.title,
      status: row.status as WorkItemStatus,
      projectSlug: slug,
      clientName: sprint.projects.clients?.name ?? slug,
      sprintNumber: sprint.number,
      path: `/app/projects/${slug}/sprints/${sprint.number}/items/${row.key}`,
    };
  });

  const people: PalettePerson[] = (peopleRows.data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    initials: row.initials,
  }));

  return {
    projects,
    sprints,
    items,
    people,
    canAssign: profile.role === "admin" || profile.role === "lead",
    role: profile.role,
  };
}

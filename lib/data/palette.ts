import "server-only";

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
}

const EMPTY: PaletteTargets = {
  projects: [],
  sprints: [],
  items: [],
  people: [],
  canAssign: false,
};

export async function getPaletteTargets(): Promise<PaletteTargets> {
  const profile = await getCurrentProfile();
  if (!profile) return EMPTY;

  const supabase = await createClient();

  const [projectRows, itemRows, peopleRows] = await Promise.all([
    supabase
      .from("projects")
      .select("id, slug, name, clients ( name ), sprints ( id, name, number, status )")
      .order("name"),
    supabase
      .from("work_items")
      .select(
        "id, key, title, status, sprints!inner ( number, projects!inner ( slug, clients ( name ) ) )"
      )
      .order("key"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
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

  const items: PaletteItem[] = (itemRows.data ?? []).map((row) => {
    const sprint = row.sprints as unknown as {
      number: number;
      projects: { slug: string; clients: { name: string } | null };
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
    initials: initialsOf(row.full_name),
  }));

  return {
    projects,
    sprints,
    items,
    people,
    canAssign: profile.role === "admin" || profile.role === "lead",
  };
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "··";
}

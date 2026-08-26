/**
 * What narrows the projects list.
 *
 * ## Everything is in the URL, and the filtering happens on the server
 *
 * `?q=evim&state=active,planned&archived=1`. Same rule as the sprint table's
 * filters — shareable, survives a reload, and the back button does what it looks
 * like it does.
 *
 * The difference from `lib/sprint-filters.ts` is where the predicate *runs*.
 * The sprint table filters in the browser because it also sorts, re-tints and
 * re-sums a live board without a round trip. A project list does none of that:
 * it is a page you arrive at, read, and click out of. So the server does the
 * filtering and the client ships the controls and nothing else — which matters
 * here, because §5's total budget has 0.3 KB of headroom.
 *
 * ## Unrecognised values are dropped, never guessed
 *
 * An empty filter means "show everything", so quietly widening a shared link is
 * worse than showing nothing. `?state=paused` — a word the prototype has and
 * this schema does not — filters by nothing at all rather than by something
 * adjacent.
 *
 * ## Archived is a switch, not a state
 *
 * `is_archived` is a real column and the only one `projects` has about status,
 * so it is deliberately *not* one of the state chips. Archiving is what this app
 * does instead of deleting — a project cascades to its sprints, its items and
 * the hours an invoice was built from — so archived projects are hidden by
 * default and shown by asking, which is the same shape the trash uses.
 */

import { isProjectState, projectStateOf, type ProjectState, type StatefulProject } from "@/lib/projects";

/** Every query parameter that can hide a project, in one list. */
export const PROJECT_FILTER_PARAMS = ["q", "state", "archived"] as const;

export interface ProjectFilterSpec {
  /** Already lower-cased and split into terms. Empty means no text filter. */
  terms: string[];
  /** Empty means every state. */
  states: ProjectState[];
  /** Archived projects are hidden unless this is on. */
  archived: boolean;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilterSpec = {
  terms: [],
  states: [],
  archived: false,
};

/** Enough of a project to be filtered. Structural, so the read model fits. */
export interface FilterableProject extends StatefulProject {
  name: string;
  clientName: string;
  slug: string;
  isArchived?: boolean;
}

function readParam(params: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const raw = params[key];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

export function parseProjectFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): ProjectFilterSpec {
  const states = readParam(params, "state")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(isProjectState);

  return {
    terms: parseTerms(readParam(params, "q")),
    // A repeated value narrows nothing and would show a chip twice.
    states: [...new Set(states)],
    archived: readParam(params, "archived") === "1",
  };
}

/**
 * Words, not a phrase.
 *
 * `evim kachel` matches a project whose name and client together contain both,
 * in any order — which is how people actually type a search box. A phrase match
 * would find nothing for the same input and look broken.
 */
export function parseTerms(raw: string): string[] {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * The haystack is the name and the client, and deliberately not the scope.
 *
 * A scope is a paragraph. Searching it means `?q=the` matches everything, and a
 * result set that includes every project is indistinguishable from a filter that
 * did not run.
 */
export function matchesProjectFilters(
  project: FilterableProject,
  spec: ProjectFilterSpec
): boolean {
  if (!spec.archived && project.isArchived) return false;
  if (spec.states.length && !spec.states.includes(projectStateOf(project))) return false;

  if (spec.terms.length) {
    const haystack = `${project.name} ${project.clientName} ${project.slug}`.toLowerCase();
    if (!spec.terms.every((term) => haystack.includes(term))) return false;
  }

  return true;
}

/**
 * How many filters are on, for the "clear" affordance.
 *
 * The text box counts as one however many words are in it — the reader typed
 * one thing — and `archived` counts, because a list that is silently showing
 * archived projects looks like a list with mysterious extra rows.
 */
export function activeProjectFilterCount(spec: ProjectFilterSpec): number {
  return (spec.terms.length ? 1 : 0) + spec.states.length + (spec.archived ? 1 : 0);
}

/** Strip every filter parameter, keeping anything else the URL carries. */
export function clearedProjectFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of PROJECT_FILTER_PARAMS) next.delete(key);
  return next;
}

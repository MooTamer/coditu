/**
 * What narrows `/app/history`.
 *
 * ## Two filters, and they narrow in the database
 *
 * The sprint table's filters run in memory, because the sprint is already
 * loaded whole and a row that the table hides still counts toward the footer's
 * sum. History is the opposite: it is unbounded, it is read one window at a
 * time, and nothing downstream needs the rows that were filtered out. So these
 * two go into the query, and the window is applied after them — otherwise
 * filtering to "comments" would return the last sixty revisions of anything and
 * then show the four that happened to be comments.
 *
 * ## Everything is in the URL, and everything unrecognised is dropped
 *
 * `?surface=comment,sprint_notes&actor=MT,AE`. The same rule the status filter
 * has had since the sprint table was built: a value this app does not recognise
 * is **dropped, never guessed**, because an empty filter means "show
 * everything" and quietly widening somebody's shared link is worse than showing
 * them nothing.
 *
 * ## People are named by their initials here too
 *
 * Matching `lib/sprint-filters.ts`, and for the reason recorded there: an id is
 * unambiguous and unreadable, and a link nobody can read is a link nobody
 * pastes. `profiles.initials` carries no unique constraint, so this filter is
 * honestly *by initials* — `?actor=MT` matches everybody whose initials are
 * `MT`, which is what the URL says and what the screen shows.
 *
 * There is deliberately no `none` token. A revision with no actor is a write
 * that had no session — the seed, the importer, a migration, a fix applied by
 * hand in the SQL console — and "written outside the app" is a category worth
 * filtering to, so it gets a real value rather than a reserved absence.
 */

import type { RevisionSurface } from "@/lib/data/revisions";

/** The reserved token for a revision written with no signed-in session. */
export const OUTSIDE = "outside";

export const SURFACES: readonly RevisionSurface[] = [
  "work_item_description",
  "work_item_highlight",
  "sprint_notes",
  "acceptance_criterion",
  "comment",
];

/** Every query parameter that can hide a row, in one list. */
export const HISTORY_PARAMS = ["surface", "actor"] as const;

export interface HistoryFilterSpec {
  surfaces: RevisionSurface[];
  /** Initials, upper-cased, or `OUTSIDE`. */
  actors: string[];
}

export const EMPTY_HISTORY_FILTERS: HistoryFilterSpec = { surfaces: [], actors: [] };

function split(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseSurfaceFilter(raw: string | null | undefined): RevisionSurface[] {
  const wanted = new Set(split(raw));
  // Filtered from the canonical list rather than mapped from the input, so the
  // result is always in display order and can never contain a duplicate.
  return SURFACES.filter((surface) => wanted.has(surface));
}

export function parseActorFilter(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const value of split(raw)) {
    const token = value.toUpperCase();
    // Initials in this app are one to three letters; anything else is not a
    // value this screen can have produced, so it is dropped rather than sent
    // to the database as a `like` nobody intended.
    if (token === OUTSIDE.toUpperCase() || /^[A-Z]{1,3}$/.test(token)) {
      seen.add(token === OUTSIDE.toUpperCase() ? OUTSIDE : token);
    }
  }
  return [...seen];
}

export function parseHistoryFilters(query: {
  surface?: string | string[];
  actor?: string | string[];
}): HistoryFilterSpec {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return {
    surfaces: parseSurfaceFilter(first(query.surface)),
    actors: parseActorFilter(first(query.actor)),
  };
}

export function activeHistoryFilterCount(spec: HistoryFilterSpec): number {
  return spec.surfaces.length + spec.actors.length;
}

/**
 * The href that toggles one value, keeping everything else in the URL.
 *
 * A link rather than a button, so the whole filter bar works with no JavaScript
 * and every state is somewhere a person can paste. `URLSearchParams` is built
 * from the current query so an unrelated parameter — a future `q`, a `page` —
 * survives being toggled around.
 */
export function toggleHref(
  current: HistoryFilterSpec,
  param: "surface" | "actor",
  value: string
): string {
  const active = param === "surface" ? (current.surfaces as string[]) : current.actors;
  const next = active.includes(value)
    ? active.filter((entry) => entry !== value)
    : [...active, value];

  const params = new URLSearchParams();
  const surfaces = param === "surface" ? next : (current.surfaces as string[]);
  const actors = param === "actor" ? next : current.actors;

  if (surfaces.length) params.set("surface", surfaces.join(","));
  if (actors.length) params.set("actor", actors.join(","));

  const query = params.toString();
  return query ? `/app/history?${query}` : "/app/history";
}

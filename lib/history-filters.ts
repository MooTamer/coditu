/**
 * What narrows `/app/history`.
 *
 * ## Six filters, and they all narrow in the database
 *
 * The sprint table's filters run in memory, because the sprint is already
 * loaded whole and a row that the table hides still counts toward the footer's
 * sum. History is the opposite: it is unbounded, it is read one window at a
 * time, and nothing downstream needs the rows that were filtered out. So these
 * go into the query, and the window is applied after them — otherwise
 * filtering to "comments" would return the last sixty revisions of anything and
 * then show the four that happened to be comments.
 *
 * `PLAN.md` §11 names all six: *"Search and filtering by person, content type,
 * project, date, and action."*
 *
 * ## Everything is in the URL, and everything unrecognised is dropped
 *
 * `?q=governance&surface=comment,sprint_notes&actor=MT,AE&project=evim&from=2026-08-01&to=2026-08-27&action=restored`.
 *
 * The same rule the status filter has had since the sprint table was built: a
 * value this app does not recognise is **dropped, never guessed**, because an
 * empty filter means "show everything" and quietly widening somebody's shared
 * link is worse than showing them nothing.
 *
 * ## People and projects are named by what a person can read
 *
 * Initials for people, slugs for projects — matching `lib/sprint-filters.ts`
 * and for the reason recorded there: an id is unambiguous and unreadable, and a
 * link nobody can read is a link nobody pastes. `profiles.initials` carries no
 * unique constraint, so the actor filter is honestly *by initials*: `?actor=MT`
 * matches everybody whose initials are `MT`, which is what the URL says and
 * what the screen shows. `projects.slug` does have one, so the project filter is
 * exact.
 *
 * There is deliberately no `none` token for the actor. A revision with no actor
 * is a write that had no session — the seed, the importer, a migration, a fix
 * applied by hand in the SQL console — and "written outside the app" is a
 * category worth filtering to, so it gets a real value rather than a reserved
 * absence.
 */

import type { RevisionAction, RevisionSurface } from "@/lib/data/revisions";

/** The reserved token for a revision written with no signed-in session. */
export const OUTSIDE = "outside";

export const SURFACES: readonly RevisionSurface[] = [
  "work_item_description",
  "work_item_highlight",
  "sprint_notes",
  "acceptance_criterion",
  "comment",
  "page",
];

export const ACTIONS: readonly RevisionAction[] = ["created", "edited", "restored"];

/** What each action is called on the chip. */
export const ACTION_LABEL: Record<RevisionAction, string> = {
  created: "Created",
  edited: "Edited",
  restored: "Restored",
};

/**
 * How long a search term may be.
 *
 * Not a guess: `plain_text` is matched with an unanchored `ilike`, so the term
 * becomes part of a pattern, and an unbounded one from a URL is an unbounded
 * pattern. 120 characters is longer than any phrase somebody types into a
 * history search and short enough that the pattern stays a pattern.
 */
export const MAX_QUERY = 120;

/** Every query parameter that can hide a row, in one list. */
export const HISTORY_PARAMS = [
  "q",
  "surface",
  "actor",
  "project",
  "from",
  "to",
  "action",
] as const;

export type HistoryParam = (typeof HISTORY_PARAMS)[number];

export interface HistoryFilterSpec {
  /** Free text, trimmed and bounded. Empty string means no search. */
  q: string;
  surfaces: RevisionSurface[];
  /** Initials, upper-cased, or `OUTSIDE`. */
  actors: string[];
  /** Project slugs. */
  projects: string[];
  /** `YYYY-MM-DD` or empty. Inclusive, read as a calendar date in Africa/Cairo. */
  from: string;
  to: string;
  actions: RevisionAction[];
}

export const EMPTY_HISTORY_FILTERS: HistoryFilterSpec = {
  q: "",
  surfaces: [],
  actors: [],
  projects: [],
  from: "",
  to: "",
  actions: [],
};

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

export function parseActionFilter(raw: string | null | undefined): RevisionAction[] {
  const wanted = new Set(split(raw));
  return ACTIONS.filter((action) => wanted.has(action));
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

/**
 * Project slugs, shaped rather than looked up.
 *
 * Shape only, because this module is imported by a client component and cannot
 * read the database. A slug that no project has resolves to no id in
 * `/app/history` and the filter returns nothing, which is the honest answer for
 * a link that names a project this workspace does not have.
 */
export function parseProjectFilter(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const value of split(raw)) {
    const token = value.toLowerCase();
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(token) && token.length <= 80) seen.add(token);
  }
  return [...seen];
}

/**
 * A calendar date, or the empty string.
 *
 * The shape is checked *and the date is checked to exist*: `2026-02-31` matches
 * the pattern and is not a day. A URL that names one would otherwise reach
 * `startOfCairoDay` and produce `Invalid Date`, which PostgREST answers with a
 * 400 the reader cannot act on.
 */
export function parseDate(raw: string | null | undefined): string {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10) === value ? value : "";
}

export function parseQuery(raw: string | null | undefined): string {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return value.slice(0, MAX_QUERY);
}

export function parseHistoryFilters(query: Record<string, string | string[] | undefined>): HistoryFilterSpec {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const from = parseDate(first(query.from));
  const to = parseDate(first(query.to));

  return {
    q: parseQuery(first(query.q)),
    surfaces: parseSurfaceFilter(first(query.surface)),
    actors: parseActorFilter(first(query.actor)),
    projects: parseProjectFilter(first(query.project)),
    // A range whose end is before its start returns nothing however it is
    // written, so the pair is swapped rather than obeyed. Somebody who typed
    // the two dates the wrong way round meant the range between them.
    from: to && from && to < from ? to : from,
    to: to && from && to < from ? from : to,
    actions: parseActionFilter(first(query.action)),
  };
}

export function activeHistoryFilterCount(spec: HistoryFilterSpec): number {
  return (
    (spec.q ? 1 : 0) +
    spec.surfaces.length +
    spec.actors.length +
    spec.projects.length +
    (spec.from ? 1 : 0) +
    (spec.to ? 1 : 0) +
    spec.actions.length
  );
}

/** Every filter as query parameters, in one place so nothing is forgotten. */
export function toParams(spec: HistoryFilterSpec): URLSearchParams {
  const params = new URLSearchParams();
  if (spec.q) params.set("q", spec.q);
  if (spec.surfaces.length) params.set("surface", spec.surfaces.join(","));
  if (spec.actors.length) params.set("actor", spec.actors.join(","));
  if (spec.projects.length) params.set("project", spec.projects.join(","));
  if (spec.from) params.set("from", spec.from);
  if (spec.to) params.set("to", spec.to);
  if (spec.actions.length) params.set("action", spec.actions.join(","));
  return params;
}

export function historyHref(spec: HistoryFilterSpec): string {
  const query = toParams(spec).toString();
  return query ? `/app/history?${query}` : "/app/history";
}

/**
 * The href that toggles one value, keeping everything else in the URL.
 *
 * A link rather than a button, so the whole filter bar works with no JavaScript
 * and every state is somewhere a person can paste. Built from the parsed spec
 * rather than from the raw query, so a parameter this version does not
 * understand is dropped once, here, instead of being carried around for ever.
 */
export function toggleHref(
  current: HistoryFilterSpec,
  param: "surface" | "actor" | "project" | "action",
  value: string
): string {
  const key = ({ surface: "surfaces", actor: "actors", project: "projects", action: "actions" } as const)[param];
  const active = current[key] as string[];
  const next = active.includes(value)
    ? active.filter((entry) => entry !== value)
    : [...active, value];

  return historyHref({ ...current, [key]: next } as HistoryFilterSpec);
}

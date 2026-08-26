/**
 * What narrows the sprint table, beyond the status chips and the component
 * picker that already existed.
 *
 * ## One predicate, five vocabularies
 *
 * Status and components already had parsers — `parseStatusFilter` and
 * `parseComponentFilter` — and they stay where they are. This adds type,
 * assignee, reviewer, grouping and free text, and then `matchesFilters` is the
 * single place that answers "does this row survive". One predicate, because a
 * row that the table shows and the footer's sum excludes is the bug this whole
 * screen is judged on.
 *
 * ## Everything is in the URL, and everything unrecognised is dropped
 *
 * `?type=bug_fix&assignee=MT,none&grouping=1,none&q=kachel height`. Same rule as
 * the status filter: a value this app does not recognise is **dropped, never
 * guessed**, because an empty filter means "show everything" and quietly
 * widening a shared link is worse than showing nothing.
 *
 * ## People are named by their initials, and that is what the filter filters by
 *
 * `profiles.initials` carries no unique constraint, so `MT` is not a person —
 * it is a pair of letters that may in principle belong to two. The filter is
 * therefore honestly **by initials**: `?assignee=MT` matches everybody whose
 * initials are `MT`, which is exactly what the URL says and what the avatars in
 * the table show. An id would be unambiguous and unreadable, and a link nobody
 * can read is a link nobody pastes.
 *
 * `none` is reserved, and means the row has nobody in that seat. It is the one
 * value that cannot be somebody's initials in practice, and it is the filter
 * people actually want — "what has no reviewer" is a question about a sprint,
 * "who is AE" is not.
 */

import { WORK_ITEM_TYPES, type WorkItemStatus, type WorkItemType } from "@/lib/work-items";

/** The reserved token for "this seat is empty". */
export const NONE = "none";

/**
 * Every query parameter that can hide a row, in one list.
 *
 * `sort` is deliberately not here: it reorders the table, it never empties it,
 * and a "clear the filters" that silently threw away somebody's sort would be
 * doing something it did not say. The panel's own button clears the five it
 * owns; this is the list for "nothing matches — start again".
 */
export const FILTER_PARAMS = [
  "status",
  "component",
  "match",
  "type",
  "assignee",
  "reviewer",
  "grouping",
  "q",
] as const;

export type PersonFilter = string;
export type GroupingFilter = number | typeof NONE;

export interface FilterSpec {
  types: WorkItemType[];
  /** Uppercase initials, or `none`. */
  assignees: PersonFilter[];
  reviewers: PersonFilter[];
  groupings: GroupingFilter[];
  /** Already lower-cased and split into terms. Empty means no text filter. */
  terms: string[];
}

export const EMPTY_FILTERS: FilterSpec = {
  types: [],
  assignees: [],
  reviewers: [],
  groupings: [],
  terms: [],
};

/** Only what the predicate reads. */
export interface FilterableRow {
  status: WorkItemStatus;
  type: WorkItemType;
  grouping: number | null;
  title: string;
  description: string | null;
  assignee: { initials: string } | null;
  reviewer: { initials: string } | null;
}

/**
 * A cap, and it is not paranoia about `LIKE`: the terms are matched in
 * JavaScript against rows already in memory, so the only cost of a very long
 * query is a very long query. Six terms is more than anybody types and it keeps
 * a hand-edited URL from asking for a thousand.
 */
const MAX_TERMS = 6;

function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseTypeFilter(raw: string | null | undefined): WorkItemType[] {
  const known = new Set<string>(WORK_ITEM_TYPES);
  const seen = new Set<WorkItemType>();
  for (const value of splitList(raw)) {
    const type = value.toLowerCase();
    if (known.has(type)) seen.add(type as WorkItemType);
  }
  return [...seen];
}

/**
 * Initials, upper-cased, plus the reserved `none`.
 *
 * Not validated against the team: initials that belong to nobody match nothing,
 * which is an empty table and a visibly wrong filter — the honest outcome. The
 * failure worth preventing is the opposite one, a filter that silently matches
 * more than it says.
 */
export function parsePeopleFilter(raw: string | null | undefined): PersonFilter[] {
  const seen = new Set<PersonFilter>();
  for (const value of splitList(raw)) {
    seen.add(value.toLowerCase() === NONE ? NONE : value.toUpperCase());
  }
  return [...seen];
}

/** Positive integers, plus `none` for a story in no grouping. */
export function parseGroupingFilter(raw: string | null | undefined): GroupingFilter[] {
  const seen = new Set<GroupingFilter>();
  for (const value of splitList(raw)) {
    if (value.toLowerCase() === NONE) {
      seen.add(NONE);
      continue;
    }
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) seen.add(number);
  }
  return [...seen];
}

/**
 * Free text, as terms rather than as a phrase.
 *
 * `kachel height` finds "Tabs with Cards: height logic fix" tagged to the Link
 * Kachel work, which a substring match on the whole phrase does not. Every term
 * has to appear somewhere in the title or the description — AND, not OR,
 * because each word somebody types is meant to narrow the list further.
 */
export function parseQuery(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

export function parseFilters(query: {
  type?: string;
  assignee?: string;
  reviewer?: string;
  grouping?: string;
  q?: string;
}): FilterSpec {
  return {
    types: parseTypeFilter(query.type),
    assignees: parsePeopleFilter(query.assignee),
    reviewers: parsePeopleFilter(query.reviewer),
    groupings: parseGroupingFilter(query.grouping),
    terms: parseQuery(query.q),
  };
}

/** How many dimensions are narrowing the table — the count on the Filter button. */
export function activeFilterCount(spec: FilterSpec): number {
  return (
    (spec.types.length ? 1 : 0) +
    (spec.assignees.length ? 1 : 0) +
    (spec.reviewers.length ? 1 : 0) +
    (spec.groupings.length ? 1 : 0) +
    (spec.terms.length ? 1 : 0)
  );
}

function personMatches(person: { initials: string } | null, wanted: PersonFilter[]): boolean {
  if (wanted.length === 0) return true;
  if (!person) return wanted.includes(NONE);
  return wanted.includes(person.initials.toUpperCase());
}

/**
 * Every dimension is AND; the values inside one dimension are OR.
 *
 * "in progress or in QA, assigned to me or to nobody" is the sentence people
 * actually mean, and it is the same shape the status chips already have.
 */
export function matchesFilters(row: FilterableRow, spec: FilterSpec): boolean {
  if (spec.types.length && !spec.types.includes(row.type)) return false;
  if (!personMatches(row.assignee, spec.assignees)) return false;
  if (!personMatches(row.reviewer, spec.reviewers)) return false;

  if (spec.groupings.length) {
    const value: GroupingFilter = row.grouping === null ? NONE : row.grouping;
    if (!spec.groupings.includes(value)) return false;
  }

  if (spec.terms.length) {
    // The description is the TEXT projection of the block document, which is
    // what the server already stores beside `description_json` — so this does
    // not walk a document tree per row per keystroke.
    const haystack = `${row.title} ${row.description ?? ""}`.toLowerCase();
    if (!spec.terms.every((term) => haystack.includes(term))) return false;
  }

  return true;
}

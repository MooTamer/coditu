/**
 * A saved view is a saved **question**, and the question is a query string.
 *
 * ## Why the spec is the URL and not a shape of its own
 *
 * Every view decision this table has already lives in the URL — `?status=`,
 * `?component=`, `?match=`, `?type=`, `?assignee=`, `?reviewer=`, `?grouping=`,
 * `?q=`, `?sort=`, `?view=`, `?density=`. A saved view could re-express all of
 * that as its own object, and then there would be two vocabularies to keep in
 * step, two parsers, and a migration every time a filter is added.
 *
 * So the spec **is** the query: a flat record of the parameters above and
 * nothing else. Applying a view is `?${searchFromSpec(spec)}`; saving one is
 * `specFromSearch(location.search)`. A filter added later is saved and restored
 * the day it is added, by adding one word to `VIEW_PARAMS`.
 *
 * ## Never a row set, and the allowlist is what guarantees it
 *
 * §5.5 says the spec holds filter/sort/mode and never a row set. That is not a
 * convention here, it is the allowlist: there is no key that could hold a list
 * of work items, so a view cannot be a stale snapshot of twelve stories and
 * cannot leak a row somebody may not read. What a view returns is recomputed by
 * the same filters and the same RLS as the URL somebody typed by hand.
 *
 * ## Validated on read as well as on write
 *
 * A stored spec is not more trustworthy than a URL. Rows outlive the code that
 * wrote them: a value retired by a later rename, a key removed from the
 * allowlist, a spec edited straight into the database. So `parseSpec` runs on
 * the way out too, and drops what it does not recognise — the same rule the
 * status filter has lived by since it was written.
 *
 * ## Why the zod schema is NOT in this file
 *
 * `view-menu.client.tsx` needs `specFromSearch`, `searchFromSpec`, `isSameView`
 * and `describeSpec`, and a client component importing a module that imports
 * zod ships **zod to the browser**. It did: the app shell went from 77.9 KB to
 * **143.1 KB** against a 110 KB budget, in one 75.9 KB chunk, and `npm run
 * budgets` is the only thing that noticed.
 *
 * So this half is pure and has no dependencies at all. The validation lives in
 * `lib/saved-views-schema.ts`, which only the server action and the server read
 * model import — §5.5's "validated on read and write" is unchanged, it just
 * happens where zod already is.
 */

/**
 * Every parameter a view may carry.
 *
 * `page` and anything else the sprint route might grow is deliberately absent:
 * a saved view is a question, and "the second page of it" is not part of the
 * question.
 */
export const VIEW_PARAMS = [
  "status",
  "component",
  "match",
  "type",
  "assignee",
  "reviewer",
  "grouping",
  "q",
  "sort",
  "view",
  "density",
] as const;

export type ViewParam = (typeof VIEW_PARAMS)[number];
export type ViewSpec = Partial<Record<ViewParam, string>>;

/**
 * A cap per value, so a hand-written row cannot make a URL nothing can open.
 * The longest legitimate value is a component list, and 200 characters is more
 * than a project's whole registry.
 */
export const MAX_VALUE = 200;

/** The current view, from the URL, as something worth storing. */
export function specFromSearch(search: string | URLSearchParams): ViewSpec {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const spec: ViewSpec = {};
  for (const key of VIEW_PARAMS) {
    const entry = params.get(key)?.trim();
    if (entry) spec[key] = entry.slice(0, MAX_VALUE);
  }
  return spec;
}

/**
 * The spec as a query string, in `VIEW_PARAMS` order.
 *
 * The order is fixed rather than insertion-dependent so that two views saved
 * from the same screen produce the same string — which is what makes
 * `isSameView` below a comparison anybody can trust.
 */
export function searchFromSpec(spec: ViewSpec): string {
  const params = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
    const entry = spec[key];
    if (entry) params.set(key, entry);
  }
  return params.toString();
}

/** Whether the screen somebody is looking at is already this saved view. */
export function isSameView(spec: ViewSpec, search: string | URLSearchParams): boolean {
  return searchFromSpec(spec) === searchFromSpec(specFromSearch(search));
}

/** Nothing saved is still a view — the whole sprint, in its own order. */
export function isEmptySpec(spec: ViewSpec): boolean {
  return searchFromSpec(spec).length === 0;
}

/**
 * What the menu says under a view's name.
 *
 * Counting the dimensions rather than listing them: "3 filters · sorted" fits
 * in a menu row and "status, component, assignee, sorted by deadline then
 * status" does not.
 */
export function describeSpec(spec: ViewSpec): string {
  const filters = (["status", "component", "type", "assignee", "reviewer", "grouping", "q"] as const)
    .filter((key) => spec[key]).length;

  const parts: string[] = [];
  if (filters) parts.push(`${filters} filter${filters === 1 ? "" : "s"}`);
  if (spec.sort) parts.push("sorted");
  if (spec.view === "board") parts.push("board");
  return parts.length ? parts.join(" · ") : "the whole sprint";
}

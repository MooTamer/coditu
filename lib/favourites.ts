/**
 * Turning a starred row into a sidebar link.
 *
 * ## Why this is pure, like the spaces tree beside it
 *
 * The shell already holds every project — the spaces tree draws itself out of
 * them — so a favourite needs no extra fetch to know where it points. And the
 * one case that is genuinely tricky is exactly the case a unit test can pin: a
 * saved view with no sprint of its own follows *whichever sprint is running*,
 * which means the same starred row resolves to a different address next week.
 *
 * ## A favourite is a pointer, so it can go stale in one direction only
 *
 * The row cannot dangle — the table's foreign keys delete it with its target —
 * but it can still point somewhere unreachable: a view saved against a project
 * whose sprint has since closed, with nothing running to fall back to. That
 * returns `null` here rather than a link to `/app/projects/undefined/…`, and the
 * sidebar leaves it out. A favourite that goes nowhere is worse than one that is
 * quietly not shown, because the click is the only way to find out.
 */

export type FavouriteKind = "saved_view" | "work_item" | "component";

export interface FavouriteRow {
  id: string;
  kind: FavouriteKind;
  /** The view's name, the story's key, or the component's name. */
  name: string;
  projectSlug: string;
  /** The sprint a story lives in, or the one a view is pinned to. */
  sprintNumber: number | null;
  /** A saved view's question, already a query string. Empty for other kinds. */
  search: string;
  componentSlug: string | null;
}

export interface FavouriteLink {
  id: string;
  kind: FavouriteKind;
  /** The mono chip at the left, matching the spaces tree's `s17` / `reg`. */
  glyph: string;
  label: string;
  href: string;
}

/** Enough of a project to resolve "whichever sprint is running". */
export interface FavouriteProject {
  slug: string;
  activeSprint: { number: number } | null;
}

export function favouriteLink(
  row: FavouriteRow,
  projects: FavouriteProject[]
): FavouriteLink | null {
  const project = projects.find((candidate) => candidate.slug === row.projectSlug);
  // A project the reader can no longer see is not an error — RLS returning
  // fewer projects than there are favourites is the system working.
  if (!project) return null;

  const base = `/app/projects/${row.projectSlug}`;

  if (row.kind === "component") {
    if (!row.componentSlug) return null;
    return {
      id: row.id,
      kind: row.kind,
      glyph: "reg",
      label: row.name,
      href: `${base}/components/${row.componentSlug}`,
    };
  }

  if (row.kind === "work_item") {
    if (row.sprintNumber === null) return null;
    return {
      id: row.id,
      kind: row.kind,
      // The key IS the label — it is what anybody calls the story out loud, and
      // the same choice `lib/breadcrumbs.ts` makes for the last crumb.
      glyph: "COD",
      label: row.name,
      href: `${base}/sprints/${row.sprintNumber}/items/${row.name}`,
    };
  }

  // A view pinned to a sprint goes to that sprint; one that is not follows
  // whichever is running. With nothing running there is nowhere to send it.
  const number = row.sprintNumber ?? project.activeSprint?.number ?? null;
  if (number === null) return null;

  return {
    id: row.id,
    kind: row.kind,
    glyph: "view",
    label: row.name,
    href: `${base}/sprints/${number}${row.search ? `?${row.search}` : ""}`,
  };
}

/** Every starred row that still points somewhere, in the order they arrived. */
export function favouriteLinks(
  rows: FavouriteRow[],
  projects: FavouriteProject[]
): FavouriteLink[] {
  return rows
    .map((row) => favouriteLink(row, projects))
    .filter((link): link is FavouriteLink => link !== null);
}

/**
 * What sits under a project in the sidebar.
 *
 * ## Why this is a pure function and not markup
 *
 * The same reasoning as `lib/breadcrumbs.ts`: the shell already holds every
 * project, so the tree is a function of `(project, componentCount)` and nothing
 * else — no fetch, no context, no per-project plumbing. And a navigation tree is
 * the kind of thing that is quietly wrong for one project in five, so the rules
 * are asserted in `tests/project-spaces.test.ts` rather than checked by eye on
 * whichever project happens to be open.
 *
 * ## Closed sprints are not in the tree
 *
 * MEINEvim has **fifteen** sprints and fourteen of them are closed. The design's
 * prototype had three and listed them all; doing that here would put a year of
 * finished weeks in a 268px column, permanently, above the thing you came for.
 *
 * Open sprints are the ones you can still do work in, and there is normally one.
 * Everything else is on the project's own page, which is what the project row
 * itself links to — so nothing is hidden, it is one click away instead of
 * fifteen rows deep.
 *
 * `MAX_SPRINTS` is the pathological case rather than the expected one: nobody
 * runs six sprints at once, but if a project ever does, the tree says so and
 * offers the page that has them all rather than silently dropping the tail.
 */

import { PROJECT_STATE_LABEL, projectStateOf } from "@/lib/projects";

export interface SpaceSprint {
  number: number;
  name: string;
  status: "planned" | "active" | "closed";
}

export interface SpaceProject {
  id: string;
  slug: string;
  name: string;
  /** `COD`. Drawn as the space's glyph when there is one. */
  keyPrefix?: string | null;
  accentHex?: string | null;
  clientLogoPath?: string | null;
  activeSprint: { number: number; name: string } | null;
  sprints: SpaceSprint[];
}

export interface SpaceRow {
  /** Stable across renders; the sprint number or a fixed word. */
  key: string;
  /** The mono chip at the left — `s17`, `reg`, `all`. */
  glyph: string;
  label: string;
  href: string;
  /** The mono note at the right. A status, a count, or nothing. */
  meta: string;
}

const MAX_SPRINTS = 5;

/** `Sprint — Week 17` is the project row's own context, so the row says `Week 17`. */
export function shortSprintName(name: string): string {
  return name.replace(/^Sprint\s+—\s+/, "");
}

/**
 * The rows beneath one project: its open sprints, then its component registry.
 *
 * There is no Notes row, though the design draws one. Sprint notes are a panel
 * *inside* a sprint page and have no address of their own — a row pointing at
 * the sprint and calling itself Notes would be a second name for a link that is
 * already directly above it.
 */
export function spaceRowsFor(project: SpaceProject, componentCount: number): SpaceRow[] {
  const open = project.sprints
    .filter((sprint) => sprint.status !== "closed")
    .sort((a, b) => b.number - a.number);

  const rows: SpaceRow[] = open.slice(0, MAX_SPRINTS).map((sprint) => ({
    key: `sprint-${sprint.number}`,
    glyph: `s${sprint.number}`,
    label: shortSprintName(sprint.name),
    href: `/app/projects/${project.slug}/sprints/${sprint.number}`,
    meta: sprint.status,
  }));

  if (open.length > MAX_SPRINTS) {
    rows.push({
      key: "all-sprints",
      glyph: "all",
      label: "All sprints",
      href: `/app/projects/${project.slug}`,
      meta: String(open.length),
    });
  }

  rows.push({
    key: "components",
    glyph: "reg",
    label: "Components",
    href: `/app/projects/${project.slug}/components`,
    meta: String(componentCount),
  });

  return rows;
}

/**
 * The chip on the project's own row: what state the project's work is in.
 *
 * **A state, not a sprint name**, and both of the alternatives were tried in a
 * browser first. Naming the active sprint reads well for MEINEvim — `Week 17`,
 * seven characters — and then Converso's sprint is called *Converso review*,
 * which is fifteen and crushes the project's own name to `Converso das…`. And
 * naming only the *active* one made the chip say `no sprint` directly above a
 * row listing the sprint Converso does have.
 *
 * A state word is bounded, cannot contradict the tree beneath it — the tree
 * names the sprints, the chip says whether any of them is running — and is what
 * the design draws. It is derived from the sprints this schema already has
 * rather than from the `status` column the prototype implies and `projects`
 * does not have.
 *
 * **The rule itself lives in `lib/projects.ts` since W8a**, because the projects
 * list draws the same chip and filters by it. Two copies would be two chances
 * for this chip to disagree with the one six pixels to its right, on the same
 * screen, about the same project.
 */
export function spaceStateFor(project: SpaceProject): { label: string; active: boolean } {
  const state = projectStateOf(project);
  return { label: PROJECT_STATE_LABEL[state], active: state === "active" };
}

/**
 * Which project the reader is inside, from the URL alone.
 *
 * Only `/app/projects/<slug>/…` says so. Every other route in the app —
 * `/app/my-work`, `/app/trash`, Home — belongs to no project, and guessing one
 * for them would open a space the reader is not in.
 */
export function projectSlugIn(pathname: string): string | null {
  return /^\/app\/projects\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

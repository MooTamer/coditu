/**
 * What state a project's work is in — derived, because the column does not
 * exist and must not be invented.
 *
 * ## The prototype has `active` / `planning` / `paused`; this schema has none
 *
 * `projects` carries `is_archived` and nothing else about status. W6d settled
 * this once for the sidebar's spaces tree: the design's three words are a column
 * the brief never described, and inventing one to match a prototype would be
 * inventing a fact about the work. `paused` in particular is a statement about
 * an engagement — that a client has stopped paying attention — and no query can
 * know it.
 *
 * So the state is a function of the sprints a project has, which is a fact:
 *
 * - **active** — a sprint is running
 * - **planned** — no sprint is running, but one is scheduled
 * - **no sprint** — every sprint is closed, or there are none
 *
 * ## Why it lives here rather than beside either reader
 *
 * The sidebar's tree and the projects list both draw it, and the list also
 * *filters* by it. Two copies of the rule would be two chances for the chip on
 * `/app/projects` to disagree with the chip six pixels to the left of it in the
 * sidebar — on the same screen, about the same project. `nav-items.ts` carries
 * the same argument for the same reason.
 */

export const PROJECT_STATES = ["active", "planned", "none"] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

/**
 * The word each state is drawn with, and it is the projects page's own
 * vocabulary rather than a new one: `no open sprint` was already what that page
 * said before this filter existed.
 */
export const PROJECT_STATE_LABEL: Record<ProjectState, string> = {
  active: "active",
  planned: "planned",
  none: "no sprint",
};

/** Enough of a project to know its state. Structural, so both read models fit. */
export interface StatefulProject {
  activeSprint: { number: number; name: string } | null;
  sprints: Array<{ status: "planned" | "active" | "closed" }>;
}

export function projectStateOf(project: StatefulProject): ProjectState {
  if (project.activeSprint) return "active";
  return project.sprints.some((sprint) => sprint.status !== "closed") ? "planned" : "none";
}

/** A guard, so a URL parameter can be narrowed without a cast. */
export function isProjectState(value: string): value is ProjectState {
  return (PROJECT_STATES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------- *
 * PF-3 — which project comes first.
 * ------------------------------------------------------------------------- */

/** Enough of a project to rank it. Structural, so both read models fit. */
export interface RankableProject {
  name: string;
  activeSprint: { number: number } | null;
  /** How many sprints the project has ever had. */
  sprintCount: number;
}

/**
 * The order every list of projects is drawn in.
 *
 * PF-3 asks for EVIM to be first and easiest to reach. The literal reading —
 * put `meinevim` at the top — is a client's name compiled into the ordering of
 * a product that is meant to run any client's work, and it would be wrong the
 * first week EVIM finishes and something else starts. So the rule is about the
 * work rather than about the client, and today it puts EVIM first because EVIM
 * is where the work is:
 *
 *  1. **A running sprint wins.** The project you are in this week is the one
 *     the sidebar should open with.
 *  2. **Then the one with the most sprints behind it** — the long engagement
 *     over the one-off, which is the difference between MEINEvim's fifteen and
 *     everything else's nought or one.
 *  3. **Then by name**, so the tail is stable and alphabetical rather than
 *     whatever order Postgres returned.
 *
 * Archived projects are not in this comparison at all: they are filtered out by
 * the readers before it runs, which is `is_archived`'s whole job.
 *
 * It lives here beside `projectStateOf` for the same reason that does — the
 * sidebar, Home, `/app/projects` and the command palette all draw the same
 * list, and four copies of an ordering is four chances for the first project in
 * the sidebar to differ from the first one in search.
 */
export function byProminence(a: RankableProject, b: RankableProject): number {
  if (Boolean(a.activeSprint) !== Boolean(b.activeSprint)) return a.activeSprint ? -1 : 1;
  if (a.sprintCount !== b.sprintCount) return b.sprintCount - a.sprintCount;
  return a.name.localeCompare(b.name);
}

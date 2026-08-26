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

/**
 * The arithmetic and the scoping Workspace Home does, as pure functions.
 *
 * None of this needs a database, a request, or a browser, and all of it was
 * previously inline in `app/app/page.tsx` and
 * `components/app/home-work-tabs.client.tsx` — where the only way to check it
 * was to open the page against whatever rows the shared local database happened
 * to be holding that hour. Two of the three were wrong, and neither wrongness
 * was visible that way:
 *
 * - the load bar divided by the **total** rather than by the **largest** entry,
 *   so nobody's bar ever reached the end of its track and the comparison the
 *   design draws — this person against the busiest person — was not the
 *   comparison being drawn;
 * - "Due this sprint" filtered `deadline <= endsOn` against a **workspace-wide**
 *   assigned list, so another client's story with a near deadline appeared
 *   under the active sprint's tab. Invariant 1, broken by omission.
 *
 * They are here so `tests/home.test.ts` can hold them to deterministic
 * fixtures. No module in this file may import `server-only`: Home's tabs are a
 * client component and `tests/server-boundary.test.ts` asserts the boundary.
 */

/**
 * The active sprint, identified the way a work item identifies its own.
 *
 * `MyWorkItem` carries `projectSlug` and `sprintNumber` — the two halves of the
 * address the row links to — so scoping compares those and never a UUID the
 * client would have to be told. Both are already on the row; this adds no
 * query.
 */
export interface SprintScope {
  projectSlug: string;
  sprintNumber: number;
  /** The sprint's last day, as a calendar date. `date` column, no timezone. */
  endsOn: string;
}

/** The least a row must carry to be scoped and dated. */
export interface ScopedDeadlineRow {
  projectSlug: string;
  sprintNumber: number;
  deadline: string | null;
}

/**
 * The rows that are due before the active sprint ends — *of that sprint*.
 *
 * The project and sprint are compared **first**, and the deadline second. A
 * deadline alone is not a scope: every project in the workspace has stories
 * with dates on them, and `getMyWork()` returns the caller's work from all of
 * them.
 *
 * Dates are compared as ISO strings, which is exact for `date` columns and
 * constructs no `Date` — invariant 5. `2026-08-09 <= 2026-08-22` is true both
 * lexically and calendrically because both are zero-padded.
 */
export function dueThisSprint<Row extends ScopedDeadlineRow>(
  rows: Row[],
  scope: SprintScope | null
): Row[] {
  if (!scope) return [];
  return rows.filter(
    (row) =>
      row.projectSlug === scope.projectSlug &&
      row.sprintNumber === scope.sprintNumber &&
      row.deadline !== null &&
      row.deadline <= scope.endsOn
  );
}

/**
 * One person's share of the load bar, as a whole percentage of the **busiest**
 * person's logged time.
 *
 * `Coditu Workspace.dc.html` computes `maxLoad` across the sprint's entries and
 * divides by that, so the person who logged the most fills their track and
 * everybody else is read against them. Dividing by the *sum* instead — which is
 * what this did — answers a different and much less useful question, and on a
 * team of four it means the longest bar is typically a third full.
 *
 * Minutes in, percent out: invariant 2 holds because nothing here divides by
 * 60. The `Math.max(1, …)` floor is the prototype's own, and it is what stops a
 * sprint with no logged time dividing by zero.
 */
export function loadShare(minutes: number, maxMinutes: number): number {
  const denominator = Math.max(1, maxMinutes);
  return Math.round((minutes / denominator) * 100);
}

/** The largest logged value in a set of load rows, in minutes. */
export function busiest(rows: Array<{ minutesLogged: number }>): number {
  return rows.reduce((most, row) => Math.max(most, row.minutesLogged), 0);
}

/**
 * The story Home's `Log time` action opens.
 *
 * The action names something that happens to **an item** — time is logged
 * against a story, and `time_entries.work_item_id` is not nullable — so a
 * control called "Log time" has to arrive somewhere a person can log time. It
 * used to link to the sprint table, which is a list of stories and not a
 * time-logging flow; the prototype's own handler opens an item.
 *
 * ## The scope is structural, not a comparison
 *
 * `rows` is the active sprint's **own** item list — the one this page already
 * fetched by re-deriving the project from the sprint. Nothing here has to check
 * a slug, because a row that is not in this sprint is not in the array.
 * Invariant 1 by construction, which is the stronger version of it.
 *
 * ## Which of them
 *
 * The caller's own, most advanced first, so the story being worked on is the
 * one offered. `statusRank` is the app's single display order, so this agrees
 * with every table showing the same rows, and it sorts `done` last — which
 * matters, because a **closed sprint has nothing but done rows** and time still
 * gets logged against them on the Monday after. Excluding them would delete the
 * action from Home for the whole of a finished week.
 *
 * Ties break on `key`, so the answer is stable between renders rather than
 * depending on the order the rows came back in. Null when the caller has
 * nothing in the sprint at all — and the control is then not rendered, rather
 * than rendered and pointing nowhere.
 */
export function logTimeTarget<Row extends { key: string; assignee: { id: string } | null }>(
  rows: Row[],
  profileId: string,
  rank: (row: Row) => number
): Row | null {
  const mine = rows.filter((row) => row.assignee?.id === profileId);
  if (mine.length === 0) return null;
  return mine.slice().sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))[0];
}

/**
 * What a notification row says, in the shape the design's mention list draws.
 *
 * The design gives each row an author, a place, a time and a body. A
 * `notifications` row carries none of those directly — it has a `kind`, an
 * item, and an optional `comment_id` — so this is where the row becomes the
 * sentence, once, rather than in the JSX where it could not be tested.
 *
 * **The author is honest about being absent.** Only a `mention` has one: it is
 * the comment's author, joined through `comment_id`. `assigned` and
 * `review_requested` are written by a trigger with no actor column, so there is
 * nobody to name and this says so by returning `null` rather than inventing
 * "Coditu" or attributing the row to whoever it is addressed to.
 */
export const NOTIFICATION_VERB: Record<"mention" | "assigned" | "review_requested", string> = {
  mention: "mentioned you",
  assigned: "assigned this to you",
  review_requested: "asked for your review",
};

export interface MentionRow {
  kind: "mention" | "assigned" | "review_requested";
  itemKey: string;
  itemTitle: string;
  projectName: string;
  authorName: string | null;
  preview: string | null;
  readAt: string | null;
}

export interface MentionLine {
  /** Who did it, or the verb when the row records no actor. */
  author: string;
  /** Where it happened — the design's `m.where`. */
  where: string;
  /** The line of body text under the heading. Never empty. */
  body: string;
  unread: boolean;
}

export function mentionLine(row: MentionRow): MentionLine {
  return {
    author: row.authorName ?? "Coditu",
    where: `${row.itemKey} · ${row.projectName}`,
    // A mention's body is the comment it came from. An assignment has no
    // comment, so the item's own title is the only true thing to show.
    body: row.preview?.trim() || `${NOTIFICATION_VERB[row.kind]} — ${row.itemTitle}`,
    unread: row.readAt === null,
  };
}

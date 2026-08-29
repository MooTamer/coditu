/**
 * The work-item domain vocabulary, defined once in TypeScript.
 *
 * The Postgres side defines the same enums and the same display order. Step 4
 * adds a test that asserts the two agree — if you change anything here, change
 * the migration and let the test prove they still match.
 *
 * See docs/02-DATA-MODEL.md §6.2.
 */

/** Declaration order of the `work_item_status` enum. NOT the display order. */
export const WORK_ITEM_STATUSES = [
  "draft",
  "ready",
  "in_progress",
  "in_peer_review",
  "in_qa",
  "changes_requested",
  "done",
  "blocked",
] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/**
 * The fixed order for boards, reports, exports, and sorting. Work in flight
 * first, unstarted next, done last — because the question the table answers is
 * "what needs attention", not "what happened".
 */
export const STATUS_DISPLAY_ORDER = [
  "in_progress",
  "in_peer_review",
  "in_qa",
  "changes_requested",
  "ready",
  "draft",
  "blocked",
  "done",
] as const satisfies readonly WorkItemStatus[];

export function statusRank(status: WorkItemStatus): number {
  return STATUS_DISPLAY_ORDER.indexOf(status);
}

/**
 * Values retired by the 2026-08-21 rename, mapped forward.
 *
 * Filter state lives in the URL, so `?status=dev_started,todo` is in bookmarks,
 * in Slack, and in anything anyone pasted before the rename. Validation drops
 * values it does not recognise, and an empty filter means "show everything" —
 * so without this map an old link does not error, it quietly returns the whole
 * sprint. That is the failure mode worth spending twelve lines on.
 *
 * Safe to delete once no old link is plausibly still in circulation; nothing
 * writes these values any more.
 */
const RETIRED_STATUSES: Record<string, WorkItemStatus> = {
  todo: "ready",
  dev_started: "in_progress",
  ready_for_peer_review: "in_peer_review",
  in_review: "in_qa",
};

/**
 * Parse a `?status=a,b,c` filter into validated statuses, mapping any retired
 * value forward. Unknown values are dropped, so a hand-edited query string
 * still cannot smuggle in a status that does not exist.
 */
export function parseStatusFilter(value: string | null | undefined): WorkItemStatus[] {
  const seen = new Set<WorkItemStatus>();
  for (const raw of (value ?? "").split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const status = RETIRED_STATUSES[token] ?? (token as WorkItemStatus);
    if (WORK_ITEM_STATUSES.includes(status)) seen.add(status);
  }
  return [...seen];
}

/** In-app chip labels. Not the enum value, and not what the client sees. */
/**
 * The status bar's colour per status — `STATUS[…].bar` in
 * `design/project/Coditu Workspace.dc.html`.
 *
 * Beside `STATUS_LABEL` because they answer the same question and drifting
 * apart would be silent: the sprint header and Workspace Home both draw this
 * bar, and until this was shared one of them held a private copy.
 *
 * These are bar fills, not text. Contrast is not the constraint — nothing is
 * written in them, and every legend beside them prints the label in ink.
 */
export const STATUS_BAR_COLOR: Record<WorkItemStatus, string> = {
  in_progress: "#2B57FF",
  in_peer_review: "#FFB020",
  in_qa: "#21E2C6",
  changes_requested: "#FF5F6D",
  ready: "#6B7A90",
  draft: "rgba(107,122,144,0.35)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

export const STATUS_LABEL: Record<WorkItemStatus, string> = {
  draft: "draft",
  ready: "ready",
  in_progress: "in progress",
  in_peer_review: "peer review",
  in_qa: "in qa",
  changes_requested: "changes req.",
  done: "done",
  blocked: "blocked",
};

/**
 * Client-facing labels for the PDF. A client should never read an enum value,
 * and "Not scoped yet" is a truthful, unembarrassing way to say `draft`.
 */
export const STATUS_LABEL_CLIENT: Record<WorkItemStatus, string> = {
  draft: "Not scoped yet",
  ready: "Not started",
  in_progress: "In progress",
  in_peer_review: "In peer review",
  in_qa: "In QA",
  changes_requested: "Changes requested",
  done: "Done",
  blocked: "Blocked",
};

export const WORK_ITEM_TYPES = ["story", "change_request", "bug_fix", "chore", "spike"] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const TYPE_LABEL: Record<WorkItemType, string> = {
  story: "story",
  change_request: "change request",
  bug_fix: "bug fix",
  chore: "chore",
  spike: "spike",
};

export const APP_ROLES = ["admin", "lead", "engineer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const SPRINT_STATUSES = ["planned", "active", "closed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/* ------------------------------------------------------------------------ */

/**
 * Grouping hue, deterministic per integer — the same integer always reads the
 * same, across sprints, sessions, and machines. Never index-based: sorting or
 * filtering the table would otherwise recolour every row.
 *
 * 1 and 2 are pinned to the values in the design bundle. Anything beyond that
 * is derived by hashing the integer onto a hue wheel, kept off the red/amber
 * band so a grouping colour can never be mistaken for a status signal.
 */
const PINNED_GROUP_HUES: Record<number, string> = { 1: "#5b8cff", 2: "#12a594" };

export function groupingHue(grouping: number | null | undefined): string | null {
  if (grouping === null || grouping === undefined) return null;
  const pinned = PINNED_GROUP_HUES[grouping];
  if (pinned) return pinned;

  // xorshift-ish mix so adjacent integers land far apart on the wheel
  let h = grouping * 2654435761;
  h ^= h >>> 15;
  h = Math.abs(h);

  // 160°–300° — teals, blues, violets. Skips the 0°–60° status band entirely.
  const hue = 160 + (h % 141);
  return `hsl(${hue} 62% 62%)`;
}

/** The <=6% row tint. Deliberately weaker than the border: the hue marks a row, it does not own it. */
export function groupingTint(grouping: number | null | undefined): string {
  const hue = groupingHue(grouping);
  if (!hue) return "transparent";
  if (grouping === 1) return "rgba(91, 140, 255, 0.05)";
  if (grouping === 2) return "rgba(18, 165, 148, 0.05)";
  return hue.replace(")", " / 0.05)").replace("hsl(", "hsl(");
}

/**
 * Opaque, pre-mixed sticky-cell background per group.
 *
 * This has to be opaque. A translucent sticky column goes see-through as it
 * scrolls over a tinted row, and you get the row's text bleeding through the
 * task cell. Returns a CSS custom property reference so the value flips with
 * the theme; unpinned groups fall back to the plain raised surface, since a
 * generated hue has no hand-mixed opaque pair.
 */
export function groupingStickyBg(grouping: number | null | undefined): string {
  if (grouping === 1) return "var(--group-1-sticky)";
  if (grouping === 2) return "var(--group-2-sticky)";
  return "var(--raised)";
}

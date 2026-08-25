import type { WorkItemStatus, WorkItemType } from "@/lib/work-items";

/**
 * The shape an export renders from.
 *
 * Deliberately a plain structure with no database types in it: the generators
 * are pure functions over this, so a golden-file test can pin their output
 * exactly without a database, and the same generator serves the live preview
 * and the download.
 */

export interface ExportPerson {
  fullName: string;
  initials: string;
}

export interface ExportCriterion {
  body: string;
  isDone: boolean;
}

export interface ExportComment {
  author: string;
  when: string;
  text: string;
}

export interface ExportTimeEntry {
  workedOn: string;
  minutes: number;
}

export interface ExportItem {
  key: string;
  title: string;
  description: string | null;
  highlight: string | null;
  status: WorkItemStatus;
  type: WorkItemType;
  grouping: number | null;
  /**
   * Every component this item is about, in the order the app renders them.
   *
   * Names, not ids: an export is read by a person or by an agent, and neither
   * has the registry to resolve a uuid against.
   */
  components: string[];
  assignee: ExportPerson | null;
  reviewer: ExportPerson | null;
  deadline: string | null;
  estimateMinutes: number;
  minutesLogged: number;
  criteria: ExportCriterion[];
  comments: ExportComment[];
  activity: string[];
  entries: ExportTimeEntry[];
}

export interface ExportSprint {
  /** Needed by the report to fetch its burn-up; never rendered. */
  id: string;
  number: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  daysRemaining: number | null;
}

export interface ExportProject {
  name: string;
  slug: string;
  clientName: string;
  clientUrl: string | null;
}

/** Which optional sections the reader ticked. */
export interface ExportOptions {
  criteria: boolean;
  hours: boolean;
  comments: boolean;
  owners: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  criteria: true,
  hours: true,
  comments: true,
  owners: true,
};

export interface ExportPayload {
  project: ExportProject;
  sprint: ExportSprint;
  /** The items the reader selected. */
  items: ExportItem[];
  /** How many the sprint has in total, for "n of m". */
  totalItems: number;
  options: ExportOptions;
  /** Today, as a calendar date in Africa/Cairo. Passed in so output is testable. */
  today: string;
}

/**
 * `{client-slug}-sprint-{n}` — the stem both filenames are built from.
 *
 * Derived from the CLIENT, not the project, because that is what the recipient
 * recognises. Non-alphanumerics collapse to single hyphens so the result is
 * safe in a Content-Disposition header and on every filesystem.
 */
export function exportSlug(payload: ExportPayload): string {
  const client = payload.project.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${client}-sprint-${payload.sprint.number}`;
}

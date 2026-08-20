import {
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  type WorkItemStatus,
  type WorkItemType,
} from "@/lib/work-items";

/**
 * The Notion CSV importer.
 *
 * Parsing and mapping are pure functions, deliberately separate from the write.
 * The preview and the commit run the *same* code over the *same* file, so what
 * you approve is exactly what gets written — a preview computed differently
 * from the commit is not a preview, it is a second opinion.
 */

export type MappingState = "mapped" | "unmatched" | "ignored";

export interface ColumnMapping {
  from: string;
  to: string;
  sample: string;
  state: MappingState;
  note?: string;
}

export interface RowIssue {
  /** The Notion column this came from, so the mapping table can be accurate. */
  column: string;
  message: string;
}

export interface ParsedRow {
  /** 1-based, matching what a spreadsheet shows, so a flagged row is findable. */
  line: number;
  title: string;
  status: WorkItemStatus;
  type: WorkItemType;
  assigneeName: string | null;
  reviewerName: string | null;
  deadline: string | null;
  grouping: number | null;
  minutesWorked: number | null;
  /** Everything wrong with this row. A row with issues is skipped, not guessed at. */
  issues: RowIssue[];
}

export interface ImportPreview {
  columns: string[];
  rows: ParsedRow[];
  mappings: ColumnMapping[];
  /** Rows with no issues — the ones a commit would write. */
  committable: number;
  skipped: number;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4180 parsing, done by hand.
 *
 * Splitting on commas is the classic way to corrupt an import: Notion quotes
 * any cell containing a comma, a quote, or a newline, and a title like
 * `Tabs with Cards: height, spacing` would otherwise become two columns and
 * shift every field after it.
 */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM — Excel writes one, and left in place it becomes part of
  // the first column's name, so "Task" never matches.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Treat CRLF as one break.
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/* -------------------------------------------------------------------------- */
/* Value mapping                                                               */
/* -------------------------------------------------------------------------- */

/** Notion's status labels, as the team actually writes them. */
const STATUS_ALIASES: Record<string, WorkItemStatus> = {
  draft: "draft",
  "not started": "todo",
  todo: "todo",
  "to do": "todo",
  "dev started": "dev_started",
  "in progress": "dev_started",
  "peer review": "ready_for_peer_review",
  "ready for peer review": "ready_for_peer_review",
  "in review": "in_review",
  review: "in_review",
  "changes requested": "changes_requested",
  blocked: "blocked",
  done: "done",
  complete: "done",
  completed: "done",
};

const TYPE_ALIASES: Record<string, WorkItemType> = {
  story: "story",
  "cr: change request": "change_request",
  "change request": "change_request",
  cr: "change_request",
  bug: "bug_fix",
  "bug fix": "bug_fix",
  bugfix: "bug_fix",
  chore: "chore",
  spike: "spike",
};

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function mapStatus(value: string): WorkItemStatus | null {
  const key = normalise(value);
  if (!key) return "todo";
  if (STATUS_ALIASES[key]) return STATUS_ALIASES[key];
  const direct = key.replace(/ /g, "_");
  return (WORK_ITEM_STATUSES as readonly string[]).includes(direct) ? (direct as WorkItemStatus) : null;
}

export function mapType(value: string): WorkItemType | null {
  const key = normalise(value);
  if (!key) return "story";
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  const direct = key.replace(/ /g, "_");
  return (WORK_ITEM_TYPES as readonly string[]).includes(direct) ? (direct as WorkItemType) : null;
}

/**
 * Notion writes dates as `DD/MM/YYYY`; the schema wants `YYYY-MM-DD`.
 *
 * Parsed as text, never through `new Date()` — a `date` column is a calendar
 * date, and constructing a Date from one invents a timezone that then shifts it.
 * An ambiguous value like `03/04/2026` is NOT guessed: it is flagged.
 */
export function mapDeadline(value: string): { date: string | null; issue?: string } {
  const raw = value.trim();
  if (!raw) return { date: null };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return { date: raw };

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slashed) {
    const [, first, second, year] = slashed;
    const day = Number(first);
    const month = Number(second);
    if (month > 12) {
      return { date: null, issue: `Deadline "${raw}" is ambiguous — is it D/M or M/D?` };
    }
    if (day > 31 || month < 1 || day < 1) {
      return { date: null, issue: `Deadline "${raw}" is not a real date.` };
    }
    return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
  }

  return { date: null, issue: `Deadline "${raw}" is not a date we recognise.` };
}

/**
 * Grouping is an integer, and only an integer.
 *
 * The team's own export contains `"1a"`. Coercing that to 1 would silently
 * merge two different groups, so it is flagged instead — this specific case is
 * called out in the brief because it is the one that looks harmless.
 */
export function mapGrouping(value: string): { grouping: number | null; issue?: string } {
  const raw = value.trim();
  if (!raw) return { grouping: null };
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n > 0 && n < 1000) return { grouping: n };
    return { grouping: null, issue: `Grouping "${raw}" is out of range.` };
  }
  return { grouping: null, issue: `Grouping "${raw}" is not an integer.` };
}

/**
 * Hours to minutes, at the boundary. Invariant 2: nothing downstream ever sees
 * a float. `7.5` becomes 450 here or the row is flagged.
 */
export function mapHours(value: string): { minutes: number | null; issue?: string } {
  const raw = value.trim();
  if (!raw) return { minutes: null };

  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    return { minutes: null, issue: `Hours Worked "${raw}" is not a number.` };
  }
  if (hours > 24) return { minutes: null, issue: `Hours Worked "${raw}" is more than a day.` };

  const minutes = Math.round(hours * 60);
  if (Math.abs(hours * 60 - minutes) > 0.001) {
    return { minutes, issue: `Hours Worked "${raw}" was rounded to ${minutes} minutes.` };
  }
  return { minutes };
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

const COLUMN_TARGETS: Record<string, string> = {
  task: "title",
  name: "title",
  status: "status",
  "hours worked": "time_entries",
  assignee: "assignee_id",
  reviewer: "reviewer_id",
  deadline: "deadline",
  "story type": "type",
  grouping: "grouping",
};

/**
 * Parses a CSV into a preview.
 *
 * NOTHING is written here. Every problem becomes an `issue` on its row, the
 * count of committable rows is derived from that, and the caller decides.
 */
export function buildPreview(csv: string, knownPeople: string[] = []): ImportPreview {
  const table = parseCsv(csv);
  if (table.length === 0) {
    return { columns: [], rows: [], mappings: [], committable: 0, skipped: 0 };
  }

  const header = table[0].map((cell) => cell.trim());
  const body = table.slice(1);
  const index = (name: string) =>
    header.findIndex((column) => normalise(column) === normalise(name));

  const columnIndex = {
    task: index("Task") >= 0 ? index("Task") : index("Name"),
    status: index("Status"),
    hours: index("Hours Worked"),
    assignee: index("Assignee"),
    reviewer: index("Reviewer"),
    deadline: index("Deadline"),
    type: index("Story Type"),
    grouping: index("Grouping"),
  };

  const peopleIndex = new Map(knownPeople.map((name) => [normalise(name), name]));

  const rows: ParsedRow[] = body.map((cells, i) => {
    const at = (position: number) => (position >= 0 ? (cells[position] ?? "").trim() : "");
    const issues: RowIssue[] = [];
    // Every issue records which column produced it, so the mapping table can
    // report a column as unmatched by fact rather than by matching substrings
    // against its own message.
    const flag = (column: string, message: string) => issues.push({ column, message });

    const title = at(columnIndex.task);
    if (!title) flag("Task", "No task title.");

    const status = mapStatus(at(columnIndex.status));
    if (status === null) flag("Status", `Status "${at(columnIndex.status)}" is not one we recognise.`);

    const type = mapType(at(columnIndex.type));
    if (type === null) flag("Story Type", `Story Type "${at(columnIndex.type)}" is not one we recognise.`);

    const deadline = mapDeadline(at(columnIndex.deadline));
    if (deadline.issue) flag("Deadline", deadline.issue);

    const grouping = mapGrouping(at(columnIndex.grouping));
    if (grouping.issue) flag("Grouping", grouping.issue);

    const hours = mapHours(at(columnIndex.hours));
    if (hours.issue) flag("Hours Worked", hours.issue);

    const assigneeRaw = at(columnIndex.assignee);
    const assigneeName = assigneeRaw ? (peopleIndex.get(normalise(assigneeRaw)) ?? null) : null;
    if (assigneeRaw && !assigneeName) flag("Assignee", `No profile named "${assigneeRaw}".`);

    const reviewerRaw = at(columnIndex.reviewer);
    const reviewerName = reviewerRaw ? (peopleIndex.get(normalise(reviewerRaw)) ?? null) : null;
    if (reviewerRaw && !reviewerName) flag("Reviewer", `No profile named "${reviewerRaw}".`);

    return {
      // +2: one for the header row, one because spreadsheets count from 1.
      line: i + 2,
      title,
      status: status ?? "todo",
      type: type ?? "story",
      assigneeName,
      reviewerName,
      deadline: deadline.date,
      grouping: grouping.grouping,
      minutesWorked: hours.minutes,
      issues,
    };
  });

  const sample = (position: number) =>
    body.map((cells) => (position >= 0 ? (cells[position] ?? "").trim() : "")).find(Boolean) ?? "—";

  const mappings: ColumnMapping[] = header.map((column) => {
    const target = COLUMN_TARGETS[normalise(column)];
    const position = header.indexOf(column);
    const example = sample(position);

    if (!target) {
      return { from: column, to: "—", sample: example, state: "ignored", note: "Not imported." };
    }

    // A column is only "mapped" if every row's value in it actually mapped.
    const columnIssue = rows
      .flatMap((row) => row.issues)
      .find((issue) => issue.column === column);

    return {
      from: column,
      to: target,
      sample: columnIssue ? columnIssue.message : example,
      state: columnIssue ? "unmatched" : "mapped",
    };
  });

  const committable = rows.filter((row) => row.issues.length === 0).length;

  return {
    columns: header,
    rows,
    mappings,
    committable,
    skipped: rows.length - committable,
  };
}

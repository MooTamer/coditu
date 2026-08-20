import { hours } from "@/lib/format";
import type { ExportPayload } from "./types";

/**
 * The CSV export.
 *
 * Contract in docs/04-EXPORT-SPEC.md. This file is the only place that decides
 * what a CSV cell looks like, and `tests/export-csv.test.ts` pins the whole
 * output against a golden file — so a change to quoting or column order fails
 * loudly rather than reaching a client's spreadsheet.
 */

/** Excel needs this to read UTF-8. Without it, "Überschrift" arrives mangled. */
export const UTF8_BOM = "﻿";

/** Multi-value cells join with this, per the contract. */
const JOIN = " | ";

/**
 * RFC 4180 quoting.
 *
 * Wrap a cell containing a quote, a comma, or a newline; double the internal
 * quotes. A cell containing a bare newline breaks every downstream parser that
 * splits on lines, which is most of them.
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvHeader(payload: ExportPayload): string[] {
  const header = [
    "key",
    "title",
    "status",
    "type",
    "grouping",
    "assignee",
    "reviewer",
    "deadline",
    "estimate_hours",
    "hours_logged",
  ];

  if (payload.options.criteria) {
    header.push("acceptance_criteria_done", "acceptance_criteria_total", "acceptance_criteria");
  }
  if (payload.options.comments) header.push("comments", "activity");
  if (payload.options.hours) header.push("time_entries");

  return header;
}

export function generateCsv(payload: ExportPayload): string {
  const { options } = payload;
  const header = csvHeader(payload);

  const rows = payload.items.map((item) => {
    const done = item.criteria.filter((criterion) => criterion.isDone).length;

    const cells: Array<string | number> = [
      item.key,
      item.title,
      item.status,
      item.type,
      item.grouping ?? "",
      // `owners` is honoured by blanking the value rather than dropping the
      // column: a CSV whose columns move depending on a toggle is not a stable
      // import target for whatever reads it next.
      options.owners ? (item.assignee?.fullName ?? "") : "",
      options.owners ? (item.reviewer?.fullName ?? "") : "",
      item.deadline ?? "",
      // Hours as a fixed two decimals — a spreadsheet column of them lines up,
      // and the value is derived from integer minutes at this last step only.
      (item.estimateMinutes / 60).toFixed(2),
      (item.minutesLogged / 60).toFixed(2),
    ];

    if (options.criteria) {
      cells.push(
        String(done),
        String(item.criteria.length),
        item.criteria.map((c) => `${c.isDone ? "[x] " : "[ ] "}${c.body}`).join(JOIN)
      );
    }

    if (options.comments) {
      cells.push(
        item.comments.map((c) => `${c.author} (${c.when}): ${c.text}`).join(JOIN),
        item.activity.join(JOIN)
      );
    }

    if (options.hours) {
      cells.push(item.entries.map((e) => `${e.workedOn} ${hours(e.minutes)} h`).join(JOIN));
    }

    return cells.map(csvCell).join(",");
  });

  // Trailing newline: POSIX text files end with one, and its absence makes
  // `wc -l` and plenty of parsers disagree about the last row.
  return `${UTF8_BOM}${header.join(",")}\n${rows.join("\n")}\n`;
}

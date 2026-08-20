import { describe, expect, it } from "vitest";

import { csvCell, generateCsv, UTF8_BOM } from "@/lib/export/csv";
import { generateMarkdown } from "@/lib/export/markdown";
import { exportSlug, type ExportPayload } from "@/lib/export/types";

import { EXPORT_FIXTURE } from "./export.fixture";

/**
 * Golden-file tests.
 *
 * `toMatchInlineSnapshot` pins the WHOLE output, not a handful of substrings.
 * An export is a contract with something outside this codebase — a spreadsheet,
 * an agent, a client — so a change to quoting or column order should be a
 * decision somebody makes on purpose, visible in a diff, not a side effect.
 */

describe("csvCell — RFC 4180", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Newspart changes")).toBe("Newspart changes");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("Tabs with Cards, height")).toBe('"Tabs with Cards, height"');
  });

  it("quotes and doubles an internal quote", () => {
    expect(csvCell('a "Show Title" toggle')).toBe('"a ""Show Title"" toggle"');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty, not as the words", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("CSV export", () => {
  it("matches the golden file", () => {
    expect(generateCsv(EXPORT_FIXTURE)).toMatchInlineSnapshot(`
      "﻿key,title,status,type,grouping,assignee,reviewer,deadline,estimate_hours,hours_logged,acceptance_criteria_done,acceptance_criteria_total,acceptance_criteria,comments,activity,time_entries
      COD-140,"Add optional titles, and a ""Show Title"" toggle",dev_started,story,,Mohamed Tamer,Abdelrahman Elkhateeb,2026-08-21,8.00,7.50,1,2,"[x] Each webpart has a ""Show Title"" toggle | [ ] Spacing matches Link Kachel | at all breakpoints","Abdelrahman Elkhateeb (2026-08-19 14:02): Inline edit needs the same field ordering as the panel, otherwise editors lose the toggle.",MT changed status todo → dev_started · 2026-08-18 09:12,2026-08-18 3.0 h | 2026-08-19 4.5 h
      COD-144,Newspart changes,todo,change_request,2,,,2026-08-23,3.00,0.00,0,0,,,,
      "
    `);
  });

  it("starts with a UTF-8 BOM so Excel reads it correctly", () => {
    expect(generateCsv(EXPORT_FIXTURE).startsWith(UTF8_BOM)).toBe(true);
  });

  it("keeps the column count stable when Include toggles change", () => {
    // A CSV whose columns move depending on a checkbox is not a stable import
    // target; the owners toggle blanks values instead.
    const withOwners = generateCsv(EXPORT_FIXTURE);
    const withoutOwners = generateCsv({
      ...EXPORT_FIXTURE,
      options: { ...EXPORT_FIXTURE.options, owners: false },
    });

    const columns = (csv: string) => csv.split("\n")[0].split(",").length;
    expect(columns(withoutOwners)).toBe(columns(withOwners));
    expect(withoutOwners).toContain("COD-140");
    expect(withoutOwners).not.toContain("Mohamed Tamer");
  });

  it("drops whole sections when their toggle is off", () => {
    const minimal = generateCsv({
      ...EXPORT_FIXTURE,
      options: { criteria: false, comments: false, hours: false, owners: true },
    });
    const header = minimal.split("\n")[0];
    expect(header).not.toContain("acceptance_criteria");
    expect(header).not.toContain("comments");
    expect(header).not.toContain("time_entries");
    expect(header).toContain("hours_logged");
  });

  it("has one row per item plus the header, and ends with a newline", () => {
    const csv = generateCsv(EXPORT_FIXTURE);
    expect(csv.endsWith("\n")).toBe(true);
    // A quoted newline inside a cell means line count is not row count; the
    // fixture's description has one, so this checks the quoting held.
    expect(csv.trimEnd().split("\n")).toHaveLength(3);
  });
});

describe("Markdown export", () => {
  it("matches the golden file", () => {
    expect(generateMarkdown(EXPORT_FIXTURE)).toMatchInlineSnapshot(`
      "# EVIM — Sprint — Week 17

      - project: MEINEvim components (EVIM, www.evim.de)
      - window: 2026-08-17 → 2026-08-23 (3 days remaining as of 2026-08-20)
      - items in export: 2 of 12
      - hours: 7.5 logged / 11.0 estimated
      - statuses used: draft, todo, dev_started, ready_for_peer_review, in_review, changes_requested, done, blocked
      - convention: items sharing a \`grouping\` integer overlap in logic/UI and are taken by one developer
      - convention: a highlighted block means discuss before implementing

      ## Sprint notes

      > Please work this sprint on the issues in the order they are sorted in.
      >
      > **In the stories, there are highlighted sections, which means you need to discuss something before implementing — please reach out.**

      ## Items

      ### 1. COD-140 — Add optional titles, and a "Show Title" toggle

      | field | value |
      | --- | --- |
      | status | \`dev_started\` |
      | type | \`story\` |
      | grouping | — |
      | assignee | Mohamed Tamer |
      | reviewer | Abdelrahman Elkhateeb |
      | deadline | 2026-08-21 |
      | hours | 7.5 logged / 8.0 estimated |

      A unified optional title field.
      Second line, with a comma.

      > **Discuss before implementing:** Confirm with EVIM whether the toggle default should differ for the Events webpart before implementing.

      **Acceptance criteria**

      - [x] Each webpart has a "Show Title" toggle
      - [ ] Spacing matches Link Kachel | at all breakpoints

      **Discussion**

      - Abdelrahman Elkhateeb (2026-08-19 14:02): Inline edit needs the same field ordering as the panel, otherwise editors lose the toggle.

      **Activity**

      - MT changed status todo → dev_started · 2026-08-18 09:12

      **Time entries**

      - 2026-08-18 — 3.0 h
      - 2026-08-19 — 4.5 h

      ### 2. COD-144 — Newspart changes

      | field | value |
      | --- | --- |
      | status | \`todo\` |
      | type | \`change_request\` |
      | grouping | \`2\` |
      | assignee | unassigned |
      | reviewer | — |
      | deadline | 2026-08-23 |
      | hours | 0.0 logged / 3.0 estimated |

      Layout and metadata changes to the news webpart.
      "
    `);
  });

  it("front-loads the facts an agent needs before any item", () => {
    const md = generateMarkdown(EXPORT_FIXTURE);
    const beforeItems = md.slice(0, md.indexOf("## Items"));

    expect(beforeItems).toContain("- project:");
    expect(beforeItems).toContain("- window:");
    expect(beforeItems).toContain("- items in export: 2 of 12");
    expect(beforeItems).toContain("- hours:");
    expect(beforeItems).toContain("- statuses used:");
    expect(beforeItems).toContain("- convention: a highlighted block means discuss before implementing");
  });

  it("keeps the highlight's emphasis, because the emphasis is the convention", () => {
    const md = generateMarkdown(EXPORT_FIXTURE);
    expect(md).toContain("> **Discuss before implementing:**");
    expect(md).toContain("**In the stories, there are highlighted sections");
  });

  it("respects every Include toggle", () => {
    const minimal = generateMarkdown({
      ...EXPORT_FIXTURE,
      options: { criteria: false, comments: false, hours: false, owners: false },
    });
    expect(minimal).not.toContain("**Acceptance criteria**");
    expect(minimal).not.toContain("**Discussion**");
    expect(minimal).not.toContain("**Activity**");
    expect(minimal).not.toContain("**Time entries**");
    expect(minimal).not.toContain("| assignee |");
    expect(minimal).not.toContain("| hours |");
    // The item itself is still there.
    expect(minimal).toContain("### 1. COD-140");
  });
});

describe("filenames", () => {
  it("is built from the client, which is who the recipient is", () => {
    expect(exportSlug(EXPORT_FIXTURE)).toBe("evim-sprint-17");
  });

  it("collapses punctuation so the name is safe in a header and on disk", () => {
    const payload: ExportPayload = {
      ...EXPORT_FIXTURE,
      project: { ...EXPORT_FIXTURE.project, clientName: "Internal · DevOps / R&D" },
    };
    expect(exportSlug(payload)).toBe("internal-devops-r-d-sprint-17");
  });
});

describe("scoping — one client's work can never appear under another's", () => {
  it("renders only the items it was handed, and names them under that client", () => {
    // The export is {project} → {sprint} → {selected items}. There is no path
    // in either generator that reaches for an item it was not given, so the
    // only way to leak is to hand it the wrong payload — which is what the
    // server-side scoping test in e2e covers.
    const csv = generateCsv(EXPORT_FIXTURE);
    const md = generateMarkdown(EXPORT_FIXTURE);

    for (const output of [csv, md]) {
      expect(output).toContain("COD-140");
      expect(output).toContain("COD-144");
      expect(output).not.toContain("COD-900");
      expect(output).not.toContain("Nile Atelier");
    }

    expect(md.startsWith("# EVIM — ")).toBe(true);
  });

  it("cannot be given items and a mismatched client without saying so", () => {
    // If somebody hands the generator another client's items, the heading is
    // still the payload's client — which is exactly why the payload must be
    // assembled server-side from the sprint, never from a client-supplied list.
    const mismatched: ExportPayload = {
      ...EXPORT_FIXTURE,
      project: { ...EXPORT_FIXTURE.project, clientName: "Nile Atelier" },
    };
    expect(generateMarkdown(mismatched).startsWith("# Nile Atelier — ")).toBe(true);
    expect(exportSlug(mismatched)).toBe("nile-atelier-sprint-17");
  });
});

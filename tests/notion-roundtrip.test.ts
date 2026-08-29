import { describe, expect, it } from "vitest";

/**
 * PF-2 — the round trip, as one fixture that is RED on purpose.
 *
 * `docs/11-NOTION-ROUNDTRIP.md` is the specification. This is its one
 * executable claim: a Notion export, imported, exported and re-imported, comes
 * back the same. It does not, because none of the return direction exists —
 * `scripts/import-notion-export.mjs` goes one way and `lib/export/*` writes for
 * a client, not for Notion.
 *
 * **This test is expected to fail, and `npm run test` is expected to report one
 * failure until PF-2 is built.** That is a deliberate choice over a green suite:
 * the two tools run side by side for a fortnight, and a gap that is only
 * described in prose is a gap somebody discovers in Notion, later, with two
 * weeks of edits in it. The failure message below names every field that
 * drifted, so this is the checklist for building the thing rather than a
 * decoration on top of it.
 *
 * It cannot go green until §5 of that document is answered — Notion's sub-items
 * have no representation in a schema whose first invariant is that a work item
 * is a leaf. That is Mohamed's call and `CLAUDE.md` says to ask before changing
 * the data model.
 */

/** One Notion row, in the shape `import-notion-export.mjs` already reads. */
interface NotionRow {
  pageId: string;
  Name: string;
  Status: string;
  "Story Type": string;
  Grouping: string;
  Assignee: string;
  Reviewer: string;
  Deadline: string;
  "Hours Worked": string;
  /** Notion's sub-item relation: the parent's page id, or "". */
  parentPageId: string;
  /** The page body's checkbox list: `[x]`/`[ ]`, indented four spaces per level. */
  criteria: { depth: number; done: boolean; body: string }[];
}

/**
 * The awkward cases, not the happy path — one per lossy row of the spec's §2.
 */
const NOTION_EXPORT: NotionRow[] = [
  {
    pageId: "notion-0001",
    Name: "Rollover contact cards",
    Status: "In progress",
    "Story Type": "Feature",
    Grouping: "1",
    Assignee: "Ahmed Yehia",
    Reviewer: "Mohamed Tamer",
    Deadline: "2026-08-21",
    // Logged across two days in Coditu; Notion holds only the total.
    "Hours Worked": "3.5",
    parentPageId: "",
    criteria: [
      { depth: 0, done: true, body: "The card flips on hover" },
      // §4: depth is flattened into the body as "— ", and the marker accumulates.
      { depth: 1, done: false, body: "It does not flip on a coarse pointer" },
      // A body that ALREADY starts with the marker: after one round trip this
      // is indistinguishable from the line above it.
      { depth: 0, done: false, body: "— see the ticket" },
    ],
  },
  {
    // §5: a sub-item. Coditu has no item -> item relation at all.
    pageId: "notion-0002",
    Name: "Rollover contact cards — mobile",
    Status: "",
    "Story Type": "Feature",
    Grouping: "1",
    Assignee: "Ahmed Yehia",
    Reviewer: "",
    Deadline: "",
    "Hours Worked": "",
    parentPageId: "notion-0001",
    criteria: [],
  },
];

/**
 * The round trip, as it would have to be called.
 *
 * Neither half exists. `importNotion` is `scripts/import-notion-export.mjs`,
 * which is a script that writes SQL rather than a module that returns rows, and
 * `exportNotion` has never been written at all. Stubbed here as identity-ish so
 * the test fails on a DIFF rather than on a missing import — a red assertion
 * naming the fields is the useful artefact; a module-not-found is not.
 */
function roundTrip(rows: NotionRow[]): NotionRow[] {
  return rows.map((row) => ({
    ...row,
    // What today's importer provably does to a criterion's depth, restated
    // here so the diff shows it: nesting becomes a prefix on the body.
    criteria: row.criteria.map((c) => ({
      depth: 0,
      done: c.done,
      body: c.depth > 0 ? `${"— ".repeat(c.depth)}${c.body}` : c.body,
    })),
    // An empty Status becomes `draft` on the way in and `Draft` on the way out.
    Status: row.Status === "" ? "Draft" : row.Status,
    // There is nowhere to put it, so it does not come back.
    parentPageId: "",
  }));
}

function drift(before: NotionRow[], after: NotionRow[]): string[] {
  const problems: string[] = [];
  for (const [index, was] of before.entries()) {
    const now = after[index];
    if (!now) {
      problems.push(`${was.pageId}: the row did not come back at all`);
      continue;
    }
    if (was.parentPageId !== now.parentPageId) {
      problems.push(
        `${was.pageId}: parent "${was.parentPageId}" came back as "${now.parentPageId}" — §5, sub-items are not representable`
      );
    }
    if (was.Status !== now.Status) {
      problems.push(`${was.pageId}: Status "${was.Status}" came back as "${now.Status}" — §2, blank is not draft`);
    }
    was.criteria.forEach((criterion, at) => {
      const back = now.criteria[at];
      if (!back) {
        problems.push(`${was.pageId}: criterion ${at} vanished`);
        return;
      }
      if (criterion.depth !== back.depth) {
        problems.push(
          `${was.pageId}: criterion ${at} depth ${criterion.depth} came back as ${back.depth} — §4, depth is flattened into the body`
        );
      }
      if (criterion.body !== back.body) {
        problems.push(`${was.pageId}: criterion ${at} body "${criterion.body}" came back as "${back.body}"`);
      }
    });
  }
  return problems;
}

describe("PF-2 — Notion round trip", () => {
  it("returns a Notion export unchanged after import, export and re-import", () => {
    const once = roundTrip(NOTION_EXPORT);
    const twice = roundTrip(once);

    // Two separate claims, and the second is the one that bites: a round trip
    // that is merely lossy can still be lived with, and one that is not
    // IDEMPOTENT corrupts a little more every fortnight it runs.
    expect(
      drift(NOTION_EXPORT, once),
      "the round trip is lossy — docs/11-NOTION-ROUNDTRIP.md says where, and this is the checklist"
    ).toEqual([]);

    expect(
      drift(once, twice),
      "the round trip is not idempotent: running it twice does not equal running it once"
    ).toEqual([]);
  });
});

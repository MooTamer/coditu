import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Money appears on two screens, and nowhere else. This test is the half of that
 * promise a rendered assertion cannot make.
 *
 * The team's requirement, verbatim: *everyone sees everyone's, but not on any
 * screen that gets shared with a client.* That is a hard boundary and it is the
 * most important thing in workstream E — a leak here costs a client
 * relationship, not a bug report.
 *
 * `e2e/earnings.spec.ts` asserts the **rendered output**: load the sprint
 * table, the board, an item, the report route and the PDF route on a sprint
 * that *has* a confirmed payout, and find none of it. That proves today's
 * markup.
 *
 * This proves the next person cannot add it by accident. It is a source-level
 * grep — the pattern `e2e/password.spec.ts` uses to prove nothing in the
 * repository sends mail — and it lives in vitest rather than in Playwright
 * because it needs no browser, no database and no server: it is a fact about
 * the files, and it should fail in one second on a laptop rather than in six
 * minutes in a suite.
 */

const ROOT = join(__dirname, "..");

/** Every screen a client can end up looking at. */
const CLIENT_FACING = [
  "app/app/projects",
  "lib/export",
  "lib/data/export.ts",
  "components/app/sprint-table.client.tsx",
  "components/app/sprint-board.tsx",
  "components/app/sprint-cards.tsx",
  "components/app/sprint-header.tsx",
  "components/app/item-detail.tsx",
  "components/app/command-palette.client.tsx",
  "lib/push",
  "app/app/my-work",
];

/**
 * Importing any of these means the file can reach a figure.
 *
 * Module specifiers rather than words, because words appear in prose: this very
 * file is full of the word "earnings" and a naive text search would flag the
 * comment explaining why the search exists.
 */
const MONEY_MODULES = [
  "@/lib/data/earnings",
  "@/lib/actions/earnings",
  "@/lib/exchange-rate",
  "lib/data/earnings",
  "lib/actions/earnings",
];

/** The formatters that turn cents into something a person reads. */
const MONEY_FORMATTERS = ["usdFromCents", "egpFromPiastres", "piastresFromCents", "rateFromMicros"];

/** The tables. A raw query would bypass the modules above. */
const MONEY_TABLES = ["sprint_payouts", "sprint_payout_shares", "app_settings"];

function sourceFiles(target: string): string[] {
  const full = join(ROOT, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [full];

  const found: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(full, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(relative(ROOT, path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * Strip comments before searching.
 *
 * Without this the test cannot be written about: "money never appears on the
 * sprint table" in a comment on the sprint table would fail the test that says
 * money never appears on the sprint table. Crude on purpose — it only has to be
 * right about this repository's own formatting, and a false negative here is a
 * comment that survives, not a leak that does.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("no client-facing screen can reach a figure", () => {
  const files = CLIENT_FACING.flatMap(sourceFiles);

  it("has something to check — a passing test over zero files proves nothing", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("imports no earnings module", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(file);
      for (const module of MONEY_MODULES) {
        if (body.includes(`"${module}"`) || body.includes(`'${module}'`)) {
          offenders.push(`${relative(ROOT, file)} imports ${module}`);
        }
      }
    }
    expect(offenders, "a shared screen can reach the earnings model").toEqual([]);
  });

  it("calls no money formatter", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(file);
      for (const fn of MONEY_FORMATTERS) {
        if (new RegExp(`\\b${fn}\\s*\\(`).test(body)) {
          offenders.push(`${relative(ROOT, file)} calls ${fn}()`);
        }
      }
    }
    expect(offenders, "a shared screen formats money").toEqual([]);
  });

  it("queries no payout table", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(file);
      for (const table of MONEY_TABLES) {
        if (body.includes(`"${table}"`) || body.includes(`'${table}'`)) {
          offenders.push(`${relative(ROOT, file)} reads ${table}`);
        }
      }
    }
    expect(offenders, "a shared screen queries a money table").toEqual([]);
  });

  it("renders no currency symbol or unit", () => {
    // The rendered half of the same promise, at the source level: a hard-coded
    // "$" or "USD" in a shared component is a figure somebody typed by hand
    // without going near the formatters.
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(file);
      for (const match of body.matchAll(/["'`][^"'`]*(\$\d|USD|EGP)[^"'`]*["'`]/g)) {
        offenders.push(`${relative(ROOT, file)}: ${match[0]}`);
      }
    }
    expect(offenders, "a shared screen has a currency in it").toEqual([]);
  });
});

describe("the export contract is unchanged", () => {
  /**
   * `docs/04-EXPORT-SPEC.md` is a client-facing contract and §9 of the thread
   * brief says it must not change. This asserts the shape of that promise
   * rather than its bytes — the byte-level assertions are
   * `tests/export.test.ts`, which is where the fixture lives.
   */
  it("names no money column anywhere in its spec", () => {
    const spec = readFileSync(join(ROOT, "docs/04-EXPORT-SPEC.md"), "utf8");
    for (const word of ["payout", "earning", "hourly_rate", "share_cents", "pot_cents"]) {
      expect(spec.toLowerCase(), `the export spec mentions ${word}`).not.toContain(word);
    }
  });
});

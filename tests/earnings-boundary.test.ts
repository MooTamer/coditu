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

/**
 * Every screen a client can end up looking at.
 *
 * Two kinds of thing are on this list and they are shared for different
 * reasons. `app/client/**` is the portal — a client is literally signed in to
 * it. Everything else is an internal screen that gets *shown*: projected in a
 * review, screenshotted into a chat, or read over a shoulder. The app shell
 * counts, because the rail, the topbar and the trail are on screen during all
 * of that.
 *
 * It grows with the app. W10 added the second half — the portal itself, which
 * was never listed, and the six workspace surfaces W6 through W9 built after
 * this file was written.
 */
const CLIENT_FACING = [
  // The portal. A client's own session reads these.
  "app/client",
  "components/client",
  "lib/data/client.ts",
  "lib/data/client-threads.ts",
  "lib/client-access.ts",
  "lib/client-threads.ts",

  // What gets exported, printed and mailed.
  "lib/export",
  "lib/data/export.ts",
  "lib/push",

  // The delivery screens.
  "app/app/projects",
  "app/app/my-work",
  "components/app/sprint-table.client.tsx",
  "components/app/sprint-board.tsx",
  "components/app/sprint-cards.tsx",
  "components/app/sprint-header.tsx",
  "components/app/item-detail.tsx",
  "components/app/item-modal.client.tsx",
  "components/app/export-dialog.client.tsx",
  "components/app/client-visibility-panel.client.tsx",

  // The shell, which is on screen during every one of the above.
  "app/app/page.tsx",
  "app/app/layout.tsx",
  "components/app/rail.client.tsx",
  "components/app/topbar.client.tsx",
  "components/app/tab-bar.client.tsx",
  "components/app/breadcrumbs.client.tsx",
  "components/app/command-palette.client.tsx",
  "components/app/project-spaces.client.tsx",
  "components/app/favourites.client.tsx",
  "lib/breadcrumbs.ts",
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

/**
 * The arithmetic itself.
 *
 * `lib/earnings.ts` imports nothing — it is pure functions over integers — so
 * no import test can see it, and a screen that called `potCents()` and printed
 * the number with its own template string would pass every other check in this
 * file. These three names are how a figure comes into existence.
 */
const MONEY_ARITHMETIC = ["potCents", "splitEqually", "meetsThreshold"];

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
      for (const specifier of MONEY_MODULES) {
        if (body.includes(`"${specifier}"`) || body.includes(`'${specifier}'`)) {
          offenders.push(`${relative(ROOT, file)} imports ${specifier}`);
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

  it("computes no pot and no share", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(file);
      for (const fn of MONEY_ARITHMETIC) {
        if (new RegExp(`\\b${fn}\\s*\\(`).test(body)) {
          offenders.push(`${relative(ROOT, file)} calls ${fn}()`);
        }
      }
    }
    expect(offenders, "a shared screen computes money").toEqual([]);
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

/**
 * The same boundary, walked from the other side.
 *
 * The list above is a denylist: it names the screens that must not reach a
 * figure. A denylist only protects what somebody remembered to add to it, and
 * the proof is in this file's own history — `app/client/**`, the portal a
 * client is actually signed in to, was **not on it** from the day the portal
 * was built until W10 put it there. Nothing was leaking; nothing was checking
 * either.
 *
 * So this walks every source file in the application and asserts the set that
 * can reach money is *exactly* the set below. A new screen is covered the
 * moment it exists, without anybody remembering anything: put an earnings
 * import in it and this goes red until the file is named here, which is the
 * point at which somebody has to think about who reads it.
 *
 * The equality is asserted in both directions on purpose. Unexpected entries
 * are the leak. Missing entries are the rot — a list that still names a file
 * which no longer touches money is a list nobody has read in a year, and it
 * makes the next unexpected entry look like it was always there.
 */
const MONEY_TREE = ["app", "components", "lib"];

/**
 * Everything that may reach a figure, and why it is allowed to.
 *
 * Four of these are the model itself and cannot be anything else. The rest are
 * the screens, and there are deliberately few: `/app/earnings` is a person's
 * own money, `/app/settings/payouts` is the admin confirmation, and
 * `/app/settings` carries the rate and the threshold that produce both.
 */
const MONEY_SURFACES = [
  // The model. Pure arithmetic, the reads, the writes, the rate.
  "lib/earnings.ts",
  "lib/data/earnings.ts",
  "lib/actions/earnings.ts",
  "lib/exchange-rate.ts",
  // The tunables row: the rate and the threshold live here beside the image
  // caps, which is why half the app imports this module and none of it gets a
  // figure out.
  "lib/settings.ts",
  // Defines the formatters rather than calling them.
  "lib/format.ts",
  // Generated from the schema, so it names every table including these two.
  "lib/supabase/database.types.ts",
  // The screens.
  "app/app/earnings/page.tsx",
  "app/app/settings/page.tsx",
  "components/app/admin-settings.client.tsx",
  "components/app/earnings-board.client.tsx",
];

describe("the money surfaces are exactly the ones on the list", () => {
  function reachesMoney(path: string): boolean {
    const body = code(path);
    for (const specifier of MONEY_MODULES) {
      if (body.includes(`"${specifier}"`) || body.includes(`'${specifier}'`)) return true;
    }
    // `@/lib/earnings` is the pure arithmetic and is not in `MONEY_MODULES` —
    // the denylist above does not need it, because a screen that imported it
    // would still have to import a read or a formatter to render anything.
    // Walking inward, it counts: it is how a figure gets computed.
    if (/from ["']@?\/?lib\/earnings["']/.test(body)) return true;
    for (const fn of [...MONEY_FORMATTERS, ...MONEY_ARITHMETIC]) {
      if (new RegExp(`\\b${fn}\\s*\\(`).test(body)) return true;
    }
    for (const table of MONEY_TABLES) {
      if (body.includes(`"${table}"`) || body.includes(`'${table}'`)) return true;
    }
    return false;
  }

  const scanned = MONEY_TREE.flatMap(sourceFiles);
  const reaching = scanned
    .filter(reachesMoney)
    .map((file) => relative(ROOT, file))
    .sort();

  it("walks the whole application, not a corner of it", () => {
    expect(scanned.length).toBeGreaterThan(150);
  });

  it("lets nothing else reach a figure", () => {
    const unexpected = reaching.filter((file) => !MONEY_SURFACES.includes(file));
    expect(
      unexpected,
      "a file reaches the earnings model and is not named in MONEY_SURFACES — if that is deliberate, add it there and say who reads the screen"
    ).toEqual([]);
  });

  it("keeps the list honest — every name on it still touches money", () => {
    const stale = MONEY_SURFACES.filter((file) => !reaching.includes(file));
    expect(
      stale,
      "MONEY_SURFACES names a file that no longer reaches a figure; drop it, or the next real entry hides among the dead ones"
    ).toEqual([]);
  });
});

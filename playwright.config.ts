import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Next loads `.env.local` itself; Playwright's config runs in plain Node and
 * does not. Read it here rather than adding a dependency for six lines, and
 * never overwrite a variable the environment already set — CI supplies its own.
 */
function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch {
    // No .env.local: CI, or a checkout that has not been set up yet. The
    // fixtures raise a readable error when the variable is actually needed.
  }
}
loadEnvLocal();

/**
 * What the phones run, and why it is not everything.
 *
 * Most of this suite is about the DATABASE — that RLS refuses a lead's role
 * change, that a reorder is atomic, that the importer flags an ambiguous name,
 * that a temporary password is stored nowhere. None of those answers can depend
 * on the device asking, and running them three times over triples a nine-minute
 * suite to prove the same row three ways.
 *
 * What phones are for is the part a desktop browser cannot answer honestly:
 * layout at 390px, touch targets, sheets, safe areas, and axe on a real mobile
 * engine. Those files are named here. Anything added to them runs everywhere;
 * anything else is chromium-only until somebody decides otherwise, which is a
 * decision worth making on purpose rather than by default.
 *
 * `composer.spec.ts` is the one that had to come back OFF this list. It seeds
 * and clears comments on a single work item, so three projects running it at
 * once is three workers deleting each other's fixture — the same shape as the
 * `claim-%` race `password.spec.ts` documents, and it fails as "the mention was
 * never stored". The phone-relevant half of it, choosing a mention by TAP
 * rather than by Enter, lives in `mobile.spec.ts` on a row of its own.
 */
const ON_A_PHONE = [
  /mobile\.spec\.ts/,
  /a11y\.spec\.ts/,
  /pwa\.spec\.ts/,
  /marketing\.spec\.ts/,
  /navigation\.spec\.ts/,
  /item-detail\.spec\.ts/,
  /motion\.spec\.ts/,
  /**
   * PF-9's other half. The scroll claim was only ever measured with a mouse at
   * 1440x900, and a phone is a different mechanism: the peek is a bottom sheet,
   * the lock is on a document a finger can drag, and the visual viewport is a
   * second thing that can move on its own. It has to run here to answer that.
   */
  /peek-scroll\.spec\.ts/,
];

/**
 * E2E and accessibility suite.
 *
 * Runs against the dev server on the local Supabase stack. Both must be up:
 *   npm run db:start && npm run dev
 *
 * `reuseExistingServer` locally so a run does not fight the server you already
 * have open; CI always starts its own.
 */
/** One answer for both `use.baseURL` and `webServer.url`. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  /**
   * Local-only diagnostics are not part of the routine suite.
   *
   * `.gitignore` keeps `e2e/*.local.spec.ts` out of git — they are one-off
   * sweeps somebody wrote to find something, not guards anybody else has to
   * keep green. Without this they still RAN, because `testDir` is a directory
   * and gitignore is not a test filter: a diagnostic that fails on purpose
   * would fail `npm run e2e` for everybody who never had the file.
   *
   * `testIgnore` applies even to a file named on the command line, so running
   * one deliberately means turning it off for that run:
   *
   *     E2E_LOCAL=1 npx playwright test the-file.local.spec.ts
   */
  testIgnore: process.env.E2E_LOCAL ? [] : "**/*.local.spec.ts",
  /**
   * 10 s for an assertion, not the default 5.
   *
   * A five-run determinism sweep on 2026-08-28 produced 16, 15 and 19 failures
   * from the same tree. Every failure that appeared in only one run was a
   * five-second wait that a busier machine did not fit into — an export preview
   * still saying "building the preview…", a peek whose dialog had not arrived,
   * a breadcrumb whose navigation had not committed. None of them was a claim
   * about latency: the specs that DO make one (`peek-measure`, `editor-measure`)
   * take their own numbers on a production build and assert against a budget.
   *
   * A suite that only passes on an idle machine is not a suite anybody can
   * trust, and doubling this weakens nothing — a wrong answer is still wrong
   * after ten seconds, it just stops depending on what else is running.
   */
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  /**
   * Three devices, and one honest caveat.
   *
   * 162 specs passing said nothing about a phone: there was exactly one project
   * here, `Desktop Chrome`, and the strongest mobile claim in the suite was
   * "no horizontal overflow at thirteen widths" — which a 320px-wide desktop
   * browser can satisfy while being unusable with a thumb.
   *
   * **Playwright's WebKit is not iOS Safari.** It is the same engine built for
   * a different platform: no Apple media stack, a different JIT, no Web Push,
   * and none of the Home-Screen behaviour that decides half of workstream F. It
   * catches layout and touch regressions, which is worth having, and it is not
   * a substitute for looking at a real handset. Workstream F's manual check
   * exists because of this line.
   */
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] }, testMatch: ON_A_PHONE },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, testMatch: ON_A_PHONE },
  ],
  webServer: {
    command: "npm run dev",
    /**
     * The server the tests are actually pointed at, not a fixed 3000.
     *
     * These disagreed: `baseURL` honoured `E2E_BASE_URL` and this did not, so
     * with the tests aimed at another port Playwright probed 3000, found
     * nothing, and started its own `next dev` — which then died on
     * `.next/dev/lock` because the server the tests were using already held it.
     * Two dev servers on one checkout is not a thing that can work.
     */
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

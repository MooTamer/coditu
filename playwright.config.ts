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
 * E2E and accessibility suite.
 *
 * Runs against the dev server on the local Supabase stack. Both must be up:
 *   npm run db:start && npm run dev
 *
 * `reuseExistingServer` locally so a run does not fight the server you already
 * have open; CI always starts its own.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

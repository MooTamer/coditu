import { test as base, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * A signed-in page, and a direct handle on the database.
 *
 * The session is minted against the local auth API and injected as a cookie
 * rather than typed into the form. That keeps these tests about the thing they
 * are testing, and it means an auth-UI change does not break every other spec.
 * `login.spec.ts` covers the form itself.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

export const SEED_ADMIN = { email: "mohamed@coditu.com", password: "coditu" };
export const SEED_ENGINEER = { email: "ahmed@coditu.com", password: "coditu" };

async function anonKey(): Promise<string> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — source .env.local");
  return key;
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  const key = await anonKey();
  const response = await page.request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email: who.email, password: who.password },
  });
  if (!response.ok()) throw new Error(`sign-in failed: ${response.status()} ${await response.text()}`);
  const session = await response.json();

  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  });

  // @supabase/ssr keys the cookie on the first hostname label of the Supabase
  // URL, which is `127` for the local stack.
  await page.context().addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(payload).toString("base64")}`,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/**
 * The suite runs in parallel against ONE seeded database, so a test that logs
 * an hour into the sprint and a test that asserts "16.0 / 46.0" are a race
 * waiting to happen — and it is the second run that finds it, not the first.
 *
 * Postgres already has the right primitive. A test that moves a sprint-wide
 * total declares `sprintTotals: "write"` and takes the advisory lock
 * exclusively; a test that asserts one declares `"read"` and takes it shared,
 * so readers still run together and only a writer stops the world. The lock is
 * session-scoped: ending the connection releases it even when the test throws,
 * which an explicit unlock would not.
 */
const SPRINT_TOTALS_LOCK = 20260817;

export type SprintTotals = "off" | "read" | "write";

export const test = base.extend<{
  sprintTotals: SprintTotals;
  sprintTotalsLock: void;
  adminPage: Page;
}>({
  sprintTotals: ["off", { option: true }],

  sprintTotalsLock: [
    async ({ sprintTotals }, use) => {
      if (sprintTotals === "off") {
        await use();
        return;
      }

      const client = new Client({ connectionString: DB_URL });
      await client.connect();
      try {
        await client.query(
          sprintTotals === "write"
            ? "select pg_advisory_lock($1::bigint)"
            : "select pg_advisory_lock_shared($1::bigint)",
          [SPRINT_TOTALS_LOCK]
        );
        await use();
      } finally {
        await client.end();
      }
    },
    { auto: true },
  ],

  adminPage: async ({ page }, use) => {
    await signIn(page, SEED_ADMIN);
    await use(page);
  },
});

export { expect } from "@playwright/test";

import AxeBuilder from "@axe-core/playwright";
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

/**
 * The seed's item keys, named by the role each one plays in a test.
 *
 * They used to be written out as `COD-140` in twelve different spec files, and
 * re-importing the Notion export moved every one of them — Week 17 now runs
 * COD-229 to COD-242, because the import numbers all fifteen sprints in order
 * and Week 3 comes first. Thirty-nine specs failed for one reason.
 *
 * So the keys live here once. A test asks for the item with the property it
 * needs, and the next import changes this block and nothing else. Anything a
 * test can read from the database at run time it still should — these are only
 * for choosing *which* row to look at.
 */
export const SEED = {
  sprint: "/app/projects/meinevim/sprints/17",

  /** First row of Week 17. Has criteria, logged time, an assignee and a reviewer. */
  item: "COD-229",
  /** Second row, for "navigate to a different item" assertions. */
  otherItem: "COD-230",
  /** Carries grouping 1, so its row is tinted. */
  grouped: "COD-231",
  /** A criterion on `grouped`, verbatim — the tick-and-persist target. */
  groupedCriterion: "There is no min height",
  /** Nothing logged against it yet, so a test may log an hour and take it back. */
  unstarted: "COD-237",
  /**
   * Two quiet items with no thread of their own. The composer and comment-
   * rendering suites each seed and clear comments on one of them, so they have
   * to be different rows or the two suites race.
   */
  thread: "COD-240",
  hostileThread: "COD-241",
  hostileThreadTitle: "Quick Links Plus Open New Tab bug",
  /** A key prefix that matches several Week 17 rows, for palette fuzzy search. */
  keyPrefix: "COD-23",
  /**
   * A word appearing in exactly one item title across the whole project, and a
   * subsequence of that same title. The palette searches every sprint and caps
   * at twelve results, so a term like "banner" now fills the list from fifteen
   * sprints of web parts and says nothing about whether matching works.
   */
  uniqueTerm: "rollover",
  uniqueSubsequence: "rlvrcntct",
  uniqueTitle: "Rollover Contact Cards",
  /** The one Week 17 item carrying a discuss-before-implementing highlight. */
  highlighted: "COD-236",
  highlightText: "please only make changes in this mode",
  /** Last row of the sprint. */
  last: "COD-242",
  /** Highest key in the seed; a newly created item must exceed it. */
  highestKey: 243,

  /** Week 17's footer: hours logged over hours estimated. */
  totals: "17.5 / 0.0",
  /** How many rows Week 17 holds, and how many survive "drop drafts". */
  itemCount: 14,
  nonDraftCount: 12,
  /** A Week 17 row in `draft`, so "drop drafts" removes it from an export. */
  draft: "COD-242",
  /** Week 17's status spread, as the sprint table and the report each phrase it. */
  devStartedCount: 3,
  peerReviewCount: 4,
} as const;

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
 * A throwaway account, for the handful of tests that must not touch the seed.
 *
 * Two things in this app are destructive to a shared session and there is no
 * way to test either of them politely:
 *
 *  - `supabase.auth.signOut()` defaults to `scope: "global"`, so it revokes
 *    every session the account holds — every other parallel worker included.
 *  - Renaming a profile changes a name eleven other specs assert on.
 *
 * So those tests get their own person. Written straight into `auth.users`
 * rather than through the sign-up form because the form is not what is under
 * test — the same approach `password.spec.ts` takes, and the identity row is
 * mandatory there for the same reason: GoTrue refuses to work with a user that
 * has no identity.
 *
 * `handle_new_user` still fires, so the profile and its initials come from the
 * real trigger.
 */
export async function createThrowawayAccount(who: {
  email: string;
  password: string;
  fullName: string;
}): Promise<void> {
  await removeThrowawayAccount(who.email);
  await query(`insert into public.allowed_emails (email, note) values ($1, 'e2e throwaway')`, [
    who.email,
  ]);
  await query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', $1, crypt($2, gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', $3::text),
       '', '', '', '', '', '', '', '')`,
    [who.email, who.password, who.fullName]
  );
  await query(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider,
       last_sign_in_at, created_at, updated_at)
     select u.id, u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true,
                          'phone_verified', false),
       'email', now(), now(), now()
     from auth.users u where u.email = $1`,
    [who.email]
  );
}

export async function removeThrowawayAccount(email: string): Promise<void> {
  await query(`delete from auth.users where email = $1`, [email]);
  await query(`delete from public.allowed_emails where email = $1`, [email]);
}

/**
 * The suite runs in parallel against ONE seeded database, so a test that logs
 * an hour into the sprint and a test that asserts the footer totals are a race
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

/**
 * Every `page.goto` waits for the page to be INTERACTIVE, not merely loaded.
 *
 * ── Why this had to be added ───────────────────────────────────────────────
 * `/app` gained a `loading.tsx` per route segment, which means every screen is
 * now inside a `<Suspense>` and STREAMS. That is the point of it — the shell
 * and a shaped skeleton are flushed while the query runs — but it also changes
 * something the whole suite had quietly relied on: React hydrates a streamed
 * boundary *after* the document has loaded, so `goto` can return with the real
 * markup on screen and no event handlers attached to it yet.
 *
 * The symptom was not a clean failure. Fifteen specs across eight files started
 * failing at a rate of one to four per run, never the same ones twice:
 * `setInputFiles` on a file input that had no `onChange` yet, a click on a
 * filter that did nothing, a `page.evaluate` finding an empty `<tbody>`.
 * Every one of them looked like a bug in the thing it was testing.
 *
 * `__reactFiber$…` is the honest signal. React writes that key onto a DOM node
 * when — and only when — it hydrates it, so asking the page's own `<main>` for
 * one is asking "has React taken ownership of this yet". Waiting for
 * `[data-loading-skeleton]` to be gone first is what stops the question being
 * answered by the fallback's `<main>` instead of the page's.
 *
 * It lives here rather than in fifteen specs because it is one fact about how
 * this app now loads, not fifteen separate waits.
 */
async function waitForInteractive(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      if (document.querySelector("[data-loading-skeleton]")) return false;
      const root = document.querySelector("main") ?? document.body;
      if (!root) return false;
      return Object.keys(root).some((key) => key.startsWith("__reactFiber$"));
    },
    undefined,
    { timeout: 20_000 }
  );
}

/**
 * Wraps `goto` in place, so no spec has to remember to call it.
 *
 * Exported because the `page` fixture is not the only page in this suite: any
 * spec that needs a second identity opens its own `browser.newContext()`, and
 * those pages are NOT wrapped. That gap produced exactly one failure in twelve
 * full runs — a sign-up form filled before it had handlers — which is the worst
 * kind, so a page from a hand-rolled context should be handed to this.
 */
export function instrumentPage(page: Page): void {
  const goto = page.goto.bind(page);
  page.goto = async (url: string, options?: Parameters<Page["goto"]>[1]) => {
    const response = await goto(url, options);
    await waitForInteractive(page);
    return response;
  };
}

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

  page: async ({ page }, use) => {
    instrumentPage(page);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await signIn(page, SEED_ADMIN);
    await use(page);
  },
});

/**
 * Wait for every finite animation that is currently running.
 *
 * A PAUSED animation's `finished` never settles — which is exactly what the
 * reveal tiers are below the fold — so only running ones are awaited, under a
 * cap.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getComputedTiming().iterations !== Infinity
      );
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  });
}

/**
 * Run axe and return each failing node by selector.
 *
 * It settles animations first, and that is the whole reason this lives here
 * rather than in each spec. Every tier fades in from `opacity: 0`, and axe
 * sampling an element mid-fade computes the blended colour and reports a
 * contrast failure that does not exist once it lands. That has now been
 * diagnosed three separate times from three separate copies of this helper.
 *
 * Reporting the selector rather than a count means a regression names the
 * element instead of sending the next person to go and find it.
 */
export async function auditA11y(page: Page, include?: string): Promise<string[]> {
  await settleAnimations(page);

  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (include) builder = builder.include(include);

  const results = await builder.analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} @ ${node.target.join(" ")}`)
  );
}

export { expect } from "@playwright/test";

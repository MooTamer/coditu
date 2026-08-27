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
/**
 * Exported, because a spec that writes its own literal writes it at the wrong
 * stack the moment somebody runs the suite against a second one — and it does
 * not fail. The token validates (every local project shares the default JWT
 * secret), the row simply is not there, PostgREST answers with an empty patch,
 * and the assertion that follows reads the database the test meant all along.
 * A negative test cannot tell that apart from the guard it is checking.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

export const SEED_ADMIN = { email: "mohamed@coditu.com", password: "coditu" };
export const SEED_LEAD = { email: "adam@coditu.com", password: "coditu" };
export const SEED_ENGINEER = { email: "ahmed@coditu.com", password: "coditu" };

/**
 * The seed's item keys, named by the role each one plays in a test.
 *
 * They used to be written out as `COD-140` in twelve different spec files, and
 * re-importing the Notion export moved every one of them. Thirty-nine specs
 * failed for one reason. So the keys live here once: a test asks for the item
 * with the property it needs, and an import changes this block and nothing
 * else. Anything a test can read from the database at run time it still should —
 * these are only for choosing *which* row to look at.
 *
 * ## The 2026-08-27 re-import
 *
 * The keys themselves no longer move. `supabase/notion-keys.json` remembers
 * which Notion page owns which COD- number, so a re-sorted board reorders rows
 * and renumbers nothing. What moved this time is the sprint's SHAPE: Week 17
 * finished. Fifteen rows are `done`, three rows were added, and every row now
 * has logged time.
 *
 * Three fixtures lost their subject to that and had to be re-chosen rather than
 * renamed, and each says so where it stands.
 */
export const SEED = {
  sprint: "/app/projects/meinevim/sprints/17",

  /** First row of Week 17. Has criteria, logged time, an assignee and a reviewer. */
  item: "COD-229",
  /** Second row, for "navigate to a different item" assertions. */
  otherItem: "COD-244",
  /**
   * The component `supabase/seeds/item-components.sql` attributes to `otherItem`.
   *
   * `components.spec.ts` needs a row that already has one, to prove that ticking
   * a second ADDS rather than swaps. It had "EVIM Themen Kachel" written into it
   * twice, which was `otherItem`'s component only for as long as `otherItem` was
   * "Tabs with Cards".
   */
  otherItemComponent: "EVIM Rollover Contact Cards",
  /** Carries grouping 1, so its row is tinted. */
  grouped: "COD-231",
  /** A criterion on `grouped`, verbatim — the tick-and-persist target. */
  groupedCriterion: "There is no min height",
  /**
   * A row whose title a test may rewrite and put back.
   *
   * It used to be the one row with nothing logged against it, and after the
   * sprint closed there is no such row — all seventeen carry time. Nothing
   * actually depended on that; `editable.spec.ts` only edits the title and
   * restores it. Named for what it is used for now.
   */
  unstarted: "COD-237",
  /**
   * Two quiet items with no thread of their own. The composer and comment-
   * rendering suites each seed and clear comments on one of them, so they have
   * to be different rows or the two suites race.
   *
   * "Quiet" now means something stronger than it did: the import writes one
   * comment per item that has pictures on its Notion page, so a row is only
   * empty if its page had none. Week 17 has exactly four such rows and five
   * slots below want one, which is why `mobile-chrome` holds a row that is not
   * quiet — see there.
   *
   * `thread` also has to be the row `uniqueTerm` finds: `palette-realtime.spec.ts`
   * presses Enter on the first result and asserts it lands here.
   */
  thread: "COD-246",
  hostileThread: "COD-241",
  /**
   * One quiet item per Playwright PROJECT, for a spec that runs on more than
   * one device at a time.
   *
   * `composer.spec.ts` seeds and clears comments on `thread`, and the moment a
   * spec like that runs under two projects in parallel the two workers delete
   * each other's fixture mid-assertion. Splitting the row is cheaper than
   * serialising the projects.
   *
   * `mobile-chrome` is the exception: Week 17 ran out of rows with no imported
   * comment. Every spec here deletes the row's comments before seeding its own,
   * so the test is unaffected — but a `mobile-chrome` run does drop COD-238's
   * imported screenshot until the next `db:reset`, and that is the whole cost.
   */
  threadPerProject: {
    chromium: "COD-230",
    "mobile-safari": "COD-231",
    "mobile-chrome": "COD-238",
  } as Record<string, string>,
  hostileThreadTitle: "Quick Links Plus Open New Tab bug",
  /** A key prefix that matches several Week 17 rows, for palette fuzzy search. */
  keyPrefix: "COD-23",
  /**
   * A word appearing in exactly one item title across the whole project, and a
   * subsequence of that same title. The palette searches every sprint and caps
   * at twelve results, so a term like "banner" fills the list from fifteen
   * sprints of web parts and says nothing about whether matching works.
   *
   * It used to be "rollover" on `Rollover Contact Cards`. Week 17 added
   * "New mode: Rollover Contact Cards", so that word now matches two titles and
   * the uniqueness assertion it exists for was quietly meaningless.
   *
   * These three and `thread` move together: the palette test asserts the term
   * yields exactly ONE option, that it reads `uniqueTitle`, and that Enter
   * navigates to `thread`.
   *
   * "Exactly one" is stricter than it looks, because the palette matches a
   * SUBSEQUENCE and not a substring: a short term like "meeting" appears in one
   * title and still matches a second item whose letters happen to fall in that
   * order. Checked against all 107 seeded items with `fuzzyScore` itself —
   * "meeting with" matches one, "meeting" matches two.
   */
  uniqueTerm: "meeting with",
  uniqueSubsequence: "mtngwthvns",
  uniqueTitle: "Meeting with Vanessa",
  /** The one Week 17 item carrying a discuss-before-implementing highlight. */
  highlighted: "COD-236",
  highlightText: "please only make changes in this mode",
  /** Last row of the sprint. */
  last: "COD-246",
  /** Highest key in the seed; a newly created item must exceed it. */
  highestKey: 246,

  /** Week 17's footer: hours logged over hours estimated. */
  totals: "58.0 / 0.0",
  /** How many rows Week 17 holds, and how many survive "drop drafts". */
  itemCount: 17,
  nonDraftCount: 15,
  /** A Week 17 row in `draft`, so "drop drafts" removes it from an export. */
  draft: "COD-245",
  /**
   * Week 17's status spread, as the sprint table and the report each phrase it.
   *
   * `statusDistribution` emits only the statuses a sprint actually holds, so
   * these have to name statuses that are there. The sprint used to be in flight
   * and these read `inProgressCount` and `peerReviewCount`; it has closed, and
   * asserting "in progress 0" would have asserted against a slice the bar does
   * not draw at all.
   */
  doneCount: 15,
  draftCount: 2,
  /**
   * A status to filter the sprint table by: one the sprint holds, and does not
   * hold entirely, or "(filtered)" is a claim about nothing.
   */
  filterableStatus: "done",
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

  /**
   * The second half of the same guard, and it exists because the first one has
   * a cap.
   *
   * `settleAnimations` gives up after 2500ms. Under three Playwright projects
   * on one machine that cap is reachable, and an entrance tier caught mid-fade
   * reports a contrast failure that is not there once it lands — the trap this
   * file already documents as having been diagnosed three separate times.
   * Waiting for the reveals themselves to be opaque is the deterministic
   * version of the same question.
   */
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).every(
          (element) =>
            element.getBoundingClientRect().height === 0 ||
            parseFloat(getComputedStyle(element).opacity) >= 1
        ),
      undefined,
      { timeout: 5_000 }
    )
    // A reveal held at frame zero by an observer that never fired is a real
    // state — `data-reveal-on-view` below the fold — and not a reason to fail
    // an accessibility audit before it has run.
    .catch(() => undefined);

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

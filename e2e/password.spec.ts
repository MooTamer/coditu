import {
  auditA11y,
  createThrowawayAccount,
  expect,
  instrumentPage,
  query,
  removeThrowawayAccount,
  signIn,
  SEED_ENGINEER,
  SUPABASE_URL,
  test,
} from "./fixtures";

/**
 * Getting back in, without any email at all.
 *
 * This file used to drive a magic link and a password-reset link through a real
 * local mail server. Both are gone, and the reason is in `docs/05-DECISIONS.md`:
 * there is no SMTP this team can operate. Vercel's free tier allows two emails
 * an hour and Supabase's shared sender is rate-limited and explicitly not for
 * production, so a recovery path built on mail works four times a day and fails
 * silently the rest of the time — the worst way for an auth path to fail.
 *
 * What replaces it is deliberately unglamorous: an admin generates a temporary
 * password on `/app/people`, reads it out, and `profiles.must_set_password`
 * stops the account being used for anything else until its owner chooses their
 * own. The thing worth testing hard is that last clause, because it is the only
 * thing standing between "an admin can help somebody back in" and "an admin has
 * quietly taken over an account".
 */

/** One address per test — these run in parallel against one database. */
function probe(name: string) {
  return {
    email: `pw-${name}@coditu.test`,
    password: `probe-${name}-2026`,
    // The NAME has to be unique too, not just the address: these run in
    // parallel and every one of them appears on `/app/people` at the same time,
    // so a shared display name makes `filter({ hasText })` match five rows.
    fullName: `Password Probe ${name}`,
  };
}

/** The generated shape: four groups of four, no ambiguous glyphs. */
const TEMPORARY = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){3}$/;

/**
 * A browser that is NOT the admin's.
 *
 * `adminPage` is built on the `page` fixture, so they are the same tab — and
 * the middleware sends a signed-in visitor from `/login` straight to `/app`.
 * Signing the target in on that tab produces a sprint page and a locator that
 * waits thirty seconds for an email field that will never render.
 */
async function asSomebodyElse(
  browser: import("@playwright/test").Browser,
  baseURL: string | undefined,
  run: (page: import("@playwright/test").Page) => Promise<void>
) {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    // Hand-rolled contexts miss the `page` fixture's hydration wait, and every
    // caller here fills a form as soon as it lands. See `instrumentPage`.
    instrumentPage(page);
    await run(page);
  } finally {
    await context.close();
  }
}

/** Sign in on a page that has no session, and land wherever the app sends you. */
async function signInWith(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function issueTemporaryPasswordFor(adminPage: import("@playwright/test").Page, fullName: string) {
  await adminPage.goto("/app/people");
  const row = adminPage.locator("[data-team-member]").filter({ hasText: fullName });
  await row.getByRole("button", { name: `Set a temporary password for ${fullName}` }).click();

  const panel = row.locator("[data-temporary-password]");
  await expect(panel).toBeVisible();
  const shown = (await panel.locator("[data-password-value]").innerText()).trim();
  expect(shown, "the generated password is not the readable shape").toMatch(TEMPORARY);
  return shown;
}

test.describe("one form, and no mail anywhere", () => {
  test("the login page offers exactly one email field and one password field", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('input[type="email"]')).toHaveCount(1);
    await expect(page.locator('input[type="password"]')).toHaveCount(1);

    // The two forms that depended on SMTP are gone, by name.
    await expect(page.getByPlaceholder("Email a sign-in link instead")).toHaveCount(0);
    await expect(page.getByPlaceholder("Set or reset your password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send a sign-in link/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Email a link to set a password/ })).toHaveCount(0);

    // And it says what to do instead, rather than leaving a hole.
    await expect(page.getByText(/Ask an admin for a temporary one/)).toBeVisible();

    // And sign-up is gone with them — PF-10. No tab, no second submit label,
    // no name field, and no control anywhere on the page that reads as one.
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByText(/Create account/i)).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    // One submit, and it says the one thing this screen does.
    const submits = page.locator('button[type="submit"]');
    await expect(submits).toHaveCount(1);
    await expect(submits).toHaveText("Sign in");
  });

  test("no route or link on this screen leads to a registration form", async ({ page }) => {
    await page.goto("/login");

    // Every href the sign-in screen offers. There should be nothing here that
    // goes anywhere near an account-creation surface — and the page is allowed
    // to have no links at all, which is what it has.
    const hrefs = await page.locator("a[href]").evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
    );
    for (const href of hrefs) {
      expect(href, `${href} looks like a registration route`).not.toMatch(
        /sign-?up|register|create-?account|join/i
      );
    }

    // And the routes somebody would guess are not routes. Two shapes are both
    // correct here and the first draft of this test only allowed one: a 404,
    // or the middleware bouncing an unauthenticated visitor to `/login`, which
    // is a 200 at `/login` and not a registration form. `/app/signup` is the
    // second shape, so the assertion is about what is ON the page.
    for (const guess of ["/signup", "/sign-up", "/register", "/join", "/app/signup"]) {
      const response = await page.goto(guess);
      const status = response?.status() ?? 0;
      if (status < 400) {
        expect(new URL(page.url()).pathname, `${guess} rendered a page of its own`).toBe("/login");
      }
      await expect(page.getByText(/Create account/i)).toHaveCount(0);
      await expect(page.getByLabel("Your name")).toHaveCount(0);
    }
  });

  test("nothing in the repository sends mail", async () => {
    // A grep, and it earns its place: the two actions are deleted, but the
    // thing that must stay true is that no NEW caller appears. Every Supabase
    // API below sends an email and there is no transport to send it with.
    const { execSync } = await import("node:child_process");
    // Call sites, not mentions: the trailing `(` is what keeps a comment
    // explaining why the mail is gone from failing the test that proves it.
    const hits = execSync(
      "grep -rnE '(signInWithOtp|resetPasswordForEmail|inviteUserByEmail|generateLink|sendMagicLink|requestPasswordReset)\\(' " +
        "app components lib scripts || true",
      { encoding: "utf8" }
    ).trim();
    expect(hits, "something in the app sends mail").toBe("");
  });
});

test.describe("a temporary password, and the change it forces", () => {
  test("an admin issues one, and it is the readable shape", async ({
    adminPage,
    browser,
    baseURL,
  }) => {
    const me = probe("shape");
    await createThrowawayAccount(me);
    try {
      const shown = await issueTemporaryPasswordFor(adminPage, me.fullName);

      // Shown once, in the row, with the sentence that says it is not stored.
      const row = adminPage.locator("[data-team-member]").filter({ hasText: me.fullName });
      await expect(row.locator("[data-temporary-password]")).toContainText("shown once");
      await expect(row.getByRole("button", { name: "Copy" })).toBeVisible();

      // And it works: this is a password, not a placeholder.
      await asSomebodyElse(browser, baseURL, async (them) => {
        await signInWith(them, me.email, shown);
        await expect(them).toHaveURL(/\/auth\/update-password/, { timeout: 20_000 });
      });
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("the target cannot navigate past the password screen", async ({
    adminPage,
    browser,
    baseURL,
  }) => {
    const me = probe("gate");
    await createThrowawayAccount(me);
    try {
      const shown = await issueTemporaryPasswordFor(adminPage, me.fullName);

      await asSomebodyElse(browser, baseURL, async (them) => {
        await signInWith(them, me.email, shown);
        await expect(them).toHaveURL(/\/auth\/update-password/, { timeout: 20_000 });

        // Typing a URL is the obvious way out, so it is the one worth checking.
        // Every route under /app, not one: the layout is the gate and it wraps
        // all of them.
        // `/app/settings` and `/app/profile` are both here on purpose: settings
        // has a redirect of its own for a non-admin, and this proves the gate
        // in the layout still wins — a layout renders before the page it wraps.
        for (const path of [
          "/app",
          "/app/people",
          "/app/my-work",
          "/app/settings",
          "/app/profile",
        ]) {
          await them.goto(path);
          await expect(them, `${path} let them through`).toHaveURL(/\/auth\/update-password/);
        }
      });
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("setting their own password clears the flag and opens the app", async ({
    adminPage,
    browser,
    baseURL,
  }) => {
    test.slow();
    const me = probe("clears");
    const chosen = "a-password-of-my-own-9";

    await createThrowawayAccount(me);
    try {
      const shown = await issueTemporaryPasswordFor(adminPage, me.fullName);

      const [flagged] = await query<{ must_set_password: boolean }>(
        `select p.must_set_password from public.profiles p
         join auth.users u on u.id = p.id where u.email = $1`,
        [me.email]
      );
      expect(flagged.must_set_password, "the flag was not set").toBe(true);

      await asSomebodyElse(browser, baseURL, async (them) => {
        await signInWith(them, me.email, shown);
        await expect(them).toHaveURL(/\/auth\/update-password/, { timeout: 20_000 });

        await them.locator('input[name="password"]').fill(chosen);
        await them.locator('input[name="confirm"]').fill(chosen);
        await them.getByRole("button", { name: "Set password" }).click();
        await expect(them).toHaveURL(/\/app/, { timeout: 20_000 });
      });

      const [cleared] = await query<{ must_set_password: boolean }>(
        `select p.must_set_password from public.profiles p
         join auth.users u on u.id = p.id where u.email = $1`,
        [me.email]
      );
      expect(cleared.must_set_password, "the flag survived the change").toBe(false);

      // A clean browser: the new password is what gets them in, and it no
      // longer stops at the password screen.
      await asSomebodyElse(browser, baseURL, async (them) => {
        await signInWith(them, me.email, chosen);
        await expect(them).toHaveURL(/\/app/, { timeout: 20_000 });
        await expect(them).not.toHaveURL(/update-password/);
      });

      // And the temporary one is dead.
      await asSomebodyElse(browser, baseURL, async (them) => {
        await signInWith(them, me.email, shown);
        await expect(them.locator("[data-auth-message]")).toContainText(/do not match/i);
      });
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("the plaintext is in no column of any table", async ({ adminPage }) => {
    const me = probe("storage");
    await createThrowawayAccount(me);
    try {
      const shown = await issueTemporaryPasswordFor(adminPage, me.fullName);

      // Every text-ish column of every table in `public` and `auth`, scanned
      // for the literal. Not a spot-check of the columns somebody thought of:
      // the claim is "written to no table, no log, no activity row", and the
      // honest way to test the first of those is to look in all of them.
      const columns = await query<{ table_schema: string; table_name: string; column_name: string }>(
        `select c.table_schema, c.table_name, c.column_name
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema in ('public', 'auth')
           and t.table_type = 'BASE TABLE'
           and c.data_type in ('text', 'character varying', 'json', 'jsonb')`
      );
      expect(columns.length, "no columns were scanned — the query is wrong").toBeGreaterThan(20);

      const probes = columns.map(
        (c) =>
          `select '${c.table_schema}.${c.table_name}.${c.column_name}' as where_it_is
           where exists (select 1 from "${c.table_schema}"."${c.table_name}"
                         where "${c.column_name}"::text like $1)`
      );
      const found = await query<{ where_it_is: string }>(probes.join(" union all "), [`%${shown}%`]);

      expect(found.map((row) => row.where_it_is), "the temporary password was written somewhere").toEqual([]);
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("an admin cannot issue one for themselves, or for somebody deactivated", async ({
    adminPage,
  }) => {
    const me = probe("refuses");
    await createThrowawayAccount(me);
    try {
      await adminPage.goto("/app/people");

      // Their own row does not offer it at all — the same rule that stops an
      // admin changing their own role or deactivating themselves.
      const own = adminPage.locator("[data-team-member][data-self]");
      await expect(own.getByRole("button", { name: /Set a temporary password/ })).toHaveCount(0);

      // A deactivated person has no access at all, so a password would let them
      // in exactly nowhere. The control is present and disabled with a reason,
      // never hidden — the rule this panel already follows everywhere else.
      await query(
        `update public.profiles set is_active = false
         where id = (select id from auth.users where email = $1)`,
        [me.email]
      );
      await adminPage.reload();

      const row = adminPage.locator("[data-team-member]").filter({ hasText: me.fullName });
      const control = row.getByRole("button", {
        name: `Set a temporary password for ${me.fullName}`,
      });
      await expect(control).toBeVisible();
      await expect(control).toBeDisabled();
      await expect(control).toHaveAttribute("title", /no access at all while deactivated/);
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("PostgREST refuses a non-admin's write to the flag", async ({ browser, baseURL }) => {
    // `own profile update` lets a person write their own row — they set their
    // own name and picture through it. `guard_profile_privilege_columns` is
    // what stops that row's `must_set_password` going with them.
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await signIn(page, SEED_ENGINEER);
      await page.goto("/app/my-work");

      const outcome = await page.evaluate(async (supabaseUrl) => {
        const raw = document.cookie
          .split("; ")
          .find((c) => c.startsWith("sb-127-auth-token="))
          ?.split("=")
          .slice(1)
          .join("=");
        const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
        const me = JSON.parse(atob(json.access_token.split(".")[1])).sub;
        const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${me}`, {
          method: "PATCH",
          headers: {
            apikey: json.access_token,
            Authorization: `Bearer ${json.access_token}`,
            "Content-Type": "application/json",
          },
          // TRUE, not false. `is distinct from` is what the trigger tests, so
          // writing the value the row already holds changes nothing, raises
          // nothing, and would have passed this test against no trigger at all.
          body: JSON.stringify({ must_set_password: true }),
        });
        return { status: response.status, body: await response.text() };
      }, SUPABASE_URL);

      // The trigger's own errcode, surfaced by PostgREST as a 403.
      expect(outcome.status).toBe(403);
      expect(outcome.body).toContain("only an admin may require a password change");
    } finally {
      await context.close();
    }
  });

  test("axe finds nothing on the sign-in page or the password screen", async ({
    adminPage,
    browser,
    baseURL,
  }) => {
    // A SEPARATE context for `/login`. The plain `page` fixture is the one
    // `adminPage` signs in, and the middleware sends a signed-in visitor from
    // `/login` straight to `/app` — so the form would never render and this
    // would fail while looking like an accessibility problem.
    const anonymous = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    try {
      const out = await anonymous.newPage();
      instrumentPage(out);
      await out.goto("/login");
      await expect(out.getByRole("heading", { name: "Sign in" })).toBeVisible();
      expect(await auditA11y(out), "the sign-in page").toEqual([]);
    } finally {
      await anonymous.close();
    }

    const me = probe("axe");
    await createThrowawayAccount(me);
    try {
      const shown = await issueTemporaryPasswordFor(adminPage, me.fullName);
      /**
       * The People panel with the password on screen is the other new surface,
       * and the audit is scoped to the row that carries it.
       *
       * Unscoped, this reported `target-size … partially obscured` against a
       * DIFFERENT person's `Temporary password` button — measured: the whole
       * page at `scrollY: 666` reports it, the same page at `scrollY: 0`
       * reports nothing, and `elementFromPoint` at the button's centre returns
       * the topbar. Clicking the throwaway account's button scrolls the page,
       * and a `position: sticky` header genuinely overlaps whatever passes
       * under it — for any control, on any scrolled page in this app.
       *
       * That is a property of the scroll position, not of this surface, so a
       * whole-page audit taken after a click that scrolled is not reproducible.
       * `/app/people` unscrolled is audited by `a11y.spec.ts`; what belongs
       * here is the panel this test is about.
       *
       * NOT the same thing as the criterion editor on a phone, where the
       * browser scrolled a control into view and LEFT it under the bar — that
       * one is a real failure and `scroll-margin-top` fixes it. The difference
       * is whether anybody was sent to the obscured control.
       */
      expect(
        await auditA11y(adminPage, "[data-team-member]:has([data-temporary-password])"),
        "People with a temporary password shown"
      ).toEqual([]);

      const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
      try {
        const forced = await context.newPage();
        instrumentPage(forced);
        await signInWith(forced, me.email, shown);
        await expect(forced).toHaveURL(/\/auth\/update-password/, { timeout: 20_000 });
        // The redirect chain has to have finished before axe reads the DOM, or
        // `page.evaluate` lands mid-navigation and the context is destroyed
        // under it.
        await expect(forced.getByRole("heading", { name: "Set your password" })).toBeVisible();
        expect(await auditA11y(forced), "the forced password screen").toEqual([]);
      } finally {
        await context.close();
      }
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });
});

test.describe("the callback route, which nothing sends links to any more", () => {
  // Kept because it costs nothing, its open-redirect guard is written and
  // tested, and it still serves the forced-change redirect. Deleting a tested
  // guard because the caller went away is how it comes back untested.
  test("a dead code says so instead of showing a blank form", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.locator("[data-auth-message]")).toContainText(/no longer valid/i);
  });

  test("the callback never redirects off this site", async ({ page, baseURL }) => {
    // `next` used to arrive inside an emailed URL. Nothing emails one now, but
    // the parameter is still read, and `//evil.example` is the case people miss:
    // a browser reads it as protocol-relative and leaves the site.
    const ours = new URL(baseURL ?? "http://localhost:3000").host;
    for (const hostile of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      await page.goto(`/auth/callback?next=${encodeURIComponent(hostile)}`);
      expect(new URL(page.url()).host, `escaped with next=${hostile}`).toBe(ours);
    }
  });
});

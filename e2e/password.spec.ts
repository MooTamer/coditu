import { expect, query, test } from "./fixtures";

/**
 * Claiming an account: the email link, the callback, and the password.
 *
 * None of this existed. `sendMagicLink` had always pointed at `/auth/callback`
 * and the login page had always offered to email a sign-in link — but the route
 * was never built, so the mail arrived and the link landed on a 404, and nothing
 * anywhere called `exchangeCodeForSession`. A control that looks finished and is
 * wired to nothing, like the ⌘K badge in §14.
 *
 * It matters now because the four production accounts were created by the seed
 * with one shared password and later repointed to the team's real addresses.
 * Each owner has to choose a password of their own **without** creating a second
 * account — the account they already have is the one holding their work.
 *
 * The whole path is exercised against a real local mail server, because the two
 * ways this breaks are both invisible from the code:
 *
 *  - Supabase IGNORES a `redirectTo` that is not in its allowed redirect list
 *    and silently substitutes the project's Site URL. The mail still arrives and
 *    the link still resolves — it just dumps the person on the site root with a
 *    token nothing will consume. That is why the assertion below reads the URL
 *    out of the actual email rather than trusting what was passed.
 *  - A single-use link is single-use, so a test that reuses one passes once.
 */

/** Mailpit — despite the container being named `supabase_inbucket_*`. */
const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:54424";

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

async function linkSentTo(address: string): Promise<string> {
  const list = (await (await fetch(`${MAIL}/api/v1/messages?limit=50`)).json()) as {
    messages: MailpitMessage[];
  };
  const mine = list.messages.filter((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase())
  );
  expect(mine.length, `no mail was sent to ${address}`).toBeGreaterThan(0);

  const full = (await (await fetch(`${MAIL}/api/v1/message/${mine[0].ID}`)).json()) as {
    HTML?: string;
    Text?: string;
  };
  const body = full.HTML ?? full.Text ?? "";
  const link = (body.match(/https?:\/\/[^"'\s<>]+/g) ?? [])
    .map((url) => url.replace(/&amp;/g, "&"))
    .find((url) => url.includes("/auth/v1/verify"));

  expect(link, "the email contained no verification link").toBeTruthy();
  return link!;
}

/** An account with no known password, exactly like the repointed production ones. */
async function createClaimableAccount(address: string) {
  await query(`delete from auth.users where email = $1`, [address]);
  await query(`delete from allowed_emails where email = $1`, [address]);
  await query(`insert into allowed_emails (email, note) values ($1, 'e2e password spec')`, [address]);
  await query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', $1, crypt($2, gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Claim Probe"}'::jsonb,
       '', '', '', '', '', '', '', '')`,
    [address, "the-old-shared-password"]
  );
  // Without an identity row GoTrue refuses the recovery flow outright.
  await query(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider,
       last_sign_in_at, created_at, updated_at)
     select u.id, u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true,
                          'phone_verified', false),
       'email', now(), now(), now()
     from auth.users u where u.email = $1`,
    [address]
  );
}

async function removeAccount(address: string) {
  await query(`delete from auth.users where email = $1`, [address]);
  await query(`delete from allowed_emails where email = $1`, [address]);
}

test.describe("claiming an account with a password", () => {
  // Serial, because the sweep below is a `like 'claim-%'` and `afterAll` runs
  // once PER WORKER. Split across workers, the worker that finishes the two
  // fast tests deletes the slow test's account while it is still mid-flight —
  // and the symptom is not an error, it is silence: `/recover` on an address
  // with no user returns 200 and sends nothing, precisely so the endpoint
  // cannot be used to find out who works here. The spec then fails at "no mail
  // was sent", pointing at the mail server.
  test.describe.configure({ mode: "serial" });

  // The per-test `finally` is not enough on its own: Playwright aborts a test
  // at its timeout, which can cut the cleanup off part-way and leave the
  // throwaway address on the allowlist. This sweep runs regardless, so a run
  // that times out cannot silently pile rows up for the next one.
  test.afterAll(async () => {
    await query(`delete from auth.users where email like 'claim-%@coditu.test'`);
    await query(`delete from public.allowed_emails where email like 'claim-%@coditu.test'`);
  });

  test("the link sets a session, the password sticks, and the old one stops working", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Mail delivery plus six navigations across three browser contexts. Fast
    // locally; the default 30s is not a meaningful budget for it on CI.
    test.slow();

    const address = `claim-${Date.now()}@coditu.test`;
    const chosen = "a-password-of-my-own-9";

    try {
      await createClaimableAccount(address);

      await page.goto("/login");
      await page.getByPlaceholder("Set or reset your password").fill(address);
      await page.getByRole("button", { name: /Email a link to set a password/ }).click();

      // Same sentence whether or not the address exists — it must not become a
      // way to find out who works here.
      await expect(page.locator("[data-auth-message]")).toContainText(
        /a link to set a password is on its way/i
      );

      const link = await linkSentTo(address);

      // The redirect Supabase actually agreed to. If `/auth/callback` is not in
      // the allowed list this is the Site URL instead, and everything below
      // fails — which is the point.
      expect(decodeURIComponent(link), "Supabase substituted its Site URL for our redirectTo")
        .toContain("/auth/callback");

      await page.goto(link);
      await expect(page).toHaveURL(/\/auth\/update-password/);
      await expect(page.getByRole("heading")).toContainText("Set your password");

      await page.locator('input[name="password"]').fill(chosen);
      await page.locator('input[name="confirm"]').fill(chosen);
      await page.getByRole("button", { name: "Set password" }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });

      // A clean browser: the password is what gets them in, not the session the
      // link happened to leave behind.
      // `browser.newContext()` does NOT inherit `baseURL` from the config's `use`
      // block, so a relative `goto` in here has nothing to resolve against.
      const fresh = await browser.newContext({ baseURL });
      try {
        const signedIn = await fresh.newPage();
        await signedIn.goto("/login");
        await signedIn.locator('input[name="email"]').first().fill(address);
        await signedIn.locator('input[name="password"]').first().fill(chosen);
        await signedIn.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(signedIn).toHaveURL(/\/app/, { timeout: 20_000 });

      } finally {
        await fresh.close();
      }

      // A THIRD context, because the one above is now signed in — and the
      // middleware sends a signed-in visitor from /login straight to /app, so
      // the form would never render and this would hang rather than fail.
      const stale = await browser.newContext({ baseURL });
      try {
        const page3 = await stale.newPage();
        await page3.goto("/login");
        await page3.locator('input[name="email"]').first().fill(address);
        await page3.locator('input[name="password"]').first().fill("the-old-shared-password");
        await page3.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page3.locator("[data-auth-message]")).toContainText(/do not match/i);
      } finally {
        await stale.close();
      }
    } finally {
      await removeAccount(address);
    }
  });

  test("a dead link says so instead of showing a blank form", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.locator("[data-auth-message]")).toContainText(/expired or has already been used/i);
  });

  test("the callback never redirects off this site", async ({ page }) => {
    // `next` arrives inside a URL that gets emailed to somebody, so it is an
    // open redirect waiting to happen. `//evil.example` is the case people miss:
    // a browser reads it as protocol-relative and leaves the site.
    for (const hostile of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      const response = await page.request.get(
        `/auth/callback?code=x&next=${encodeURIComponent(hostile)}`,
        { maxRedirects: 0 }
      );
      const location = response.headers()["location"] ?? "";
      expect(location, `${hostile} escaped the site`).not.toContain("evil.example");
    }
  });
});

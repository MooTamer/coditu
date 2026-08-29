import { SUPABASE_URL, auditA11y, expect, query, shell, test } from "./fixtures";

/**
 * Invite-only, with no sign-up form at all.
 *
 * The form went in PF-10 — `login-form.client.tsx` is one email field and one
 * password field now, and `signUp` is deleted. That removes the *courtesy*
 * (GoTrue turns the trigger's message into a bare `500 Database error saving
 * new user`, and the action used to translate it), and it removes nothing from
 * the gate. `enforce_email_allowlist` is a BEFORE INSERT trigger on
 * `auth.users`: it refuses an uninvited address no matter who is asking, which
 * is what the tests below drive directly now that there is no form to drive.
 */

const PROBE = "allowlist-probe@example.com";

async function cleanUp() {
  await query(`delete from public.profiles where id in (select id from auth.users where email = $1)`, [PROBE]);
  await query(`delete from auth.users where email = $1`, [PROBE]);
  await query(`delete from public.allowed_emails where email = $1`, [PROBE]);
}

/**
 * Create the account the way the application no longer can.
 *
 * A direct `insert into auth.users`, which is both the strongest form of the
 * question — no form, no Server Action, nothing that could be doing the
 * checking on the database's behalf — and, since PF-10, the only way an account
 * comes into existence at all. Returns the trigger's refusal, or null.
 */
async function createAccount(email: string, name = "Allowlist Probe"): Promise<string | null> {
  try {
    await query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data,
                               confirmation_token, recovery_token, email_change,
                               email_change_token_new, email_change_token_current,
                               phone_change, phone_change_token, reauthentication_token)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1, 'x', now(), now(), now(),
               '{"provider":"email","providers":["email"]}'::jsonb,
               jsonb_build_object('full_name', $2::text),
               '', '', '', '', '', '', '', '')`,
      [email, name]
    );
    return null;
  } catch (error) {
    return String(error);
  }
}

test.describe("invite-only sign-up", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(cleanUp);
  test.afterEach(cleanUp);

  test("an uninvited address is refused, and leaves nothing behind", async () => {
    const refusal = await createAccount(PROBE);
    expect(refusal, "an uninvited address was accepted").toMatch(/not on the allowlist/i);

    // Refused means refused: no user, and no orphan profile from the
    // `handle_new_user` trigger that would have run after it.
    const users = await query<{ n: string }>(
      `select count(*)::text as n from auth.users where email = $1`,
      [PROBE]
    );
    expect(users[0].n).toBe("0");
    const profiles = await query<{ n: string }>(
      `select count(*)::text as n from public.profiles p
       join auth.users u on u.id = p.id where u.email = $1`,
      [PROBE]
    );
    expect(profiles[0].n).toBe("0");
  });

  test("the sign-in screen offers no way to create an account", async ({ page }) => {
    // PF-10. Not a security boundary — the trigger above is — but an internal
    // tool that offers to make you an account is describing something it is not.
    await page.goto("/login");

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByText(/Create account/i)).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(1);
    await expect(page.locator('input[type="password"]')).toHaveCount(1);

    // And the action is gone, not merely unrendered: a page with no `signUp`
    // in its Server Action manifest cannot have one called from a console.
    const bodies = await page.evaluate(async () => {
      const srcs = [...document.querySelectorAll("script[src]")].map(
        (s) => (s as HTMLScriptElement).src
      );
      return Promise.all(srcs.map((src) => fetch(src).then((r) => r.text())));
    });
    const joined = bodies.join("\n");
    expect(joined, "a sign-up action is still shipped to /login").not.toMatch(
      /Create account|Your name/
    );
  });

  test("the database refuses even when the app is bypassed entirely", async () => {
    // The message above is a courtesy. THIS is the gate — a direct insert into
    // `auth.users`, no form and no Server Action anywhere near it.
    let refused = false;
    try {
      await query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', $1, 'x', now(), now())`,
        [PROBE]
      );
    } catch (error) {
      refused = /not on the allowlist/i.test(String(error));
    }
    expect(refused, "the allowlist trigger did not refuse a direct insert").toBe(true);
  });

  test("an admin invites, and then the same address can sign up", async ({ adminPage, browser }) => {
    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await adminPage.goto("/app/people");

    // `shell()` — `main[data-page-shell]:visible` — and not the bare page.
    // Re-measured for PF-10 rather than assumed: on `/app/people`,
    // `getByLabel("Email")` reaches max 2 bare and max 1 `:visible` (8 of 225
    // samples over five raw loads), and the second match's parent chain runs
    // through `DIV#S:1`, React's nested streaming placeholder. It was filed as
    // "two real Email fields on /login"; /login measured 1 bare in 0 of 239
    // samples and never had two. Same duplicate as the other six, different
    // selector reaching it — `getByPlaceholder("person@example.com")` was
    // scoped in the harness pass and the label that finds the same input was
    // not.
    await shell(adminPage).getByLabel("Email").fill(PROBE);
    await shell(adminPage).getByLabel("Note (optional)").fill("From the e2e suite");
    await shell(adminPage).getByRole("button", { name: "Invite", exact: true }).click();

    // The allowlist's OWN list. `/app/people` also renders the access history,
    // which quotes the same address back — so a page-level `li` filtered by the
    // email matches three elements as soon as the history is non-empty, and the
    // page-level version of this line passed only on an untouched database.
    const row = shell(adminPage).locator("[data-allowlist] li", { hasText: PROBE });
    await expect(row).toContainText("From the e2e suite");
    await expect(row).toContainText("invited");

    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from public.allowed_emails where email = $1`,
          [PROBE]
        );
        return rows[0].n;
      }, { timeout: 8000 })
      .toBe("1");

    // Now the same insert the trigger refused above is allowed through. The
    // invite is what changed; nothing else did.
    expect(await createAccount(PROBE), "an invited address was still refused").toBeNull();

    // And the profile carries the name, not the email local-part —
    // `handle_new_user` reading `raw_user_meta_data.full_name`.
    const [profile] = await query<{ full_name: string; role: string }>(
      `select p.full_name, p.role::text as role from public.profiles p
       join auth.users u on u.id = p.id where u.email = $1`,
      [PROBE]
    );
    expect(profile.full_name).toBe("Allowlist Probe");
    // New accounts are engineers. Nobody arrives as an admin.
    expect(profile.role).toBe("engineer");

    // The account works: it can sign in on the screen that is left.
    const guest = await browser.newContext();
    const page = await guest.newPage();
    try {
      await query(
        `update auth.users set encrypted_password = crypt($2, gen_salt('bf'))
         where email = $1`,
        [PROBE, "e2e-probe-pw-2026"]
      );
      const { signIn } = await import("./fixtures");
      // `signIn` mints a token and writes the cookie; it does not navigate.
      await signIn(page, { email: PROBE, password: "e2e-probe-pw-2026" });
      await page.goto("/app");
      await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 15_000 });
    } finally {
      await guest.close();
    }
  });

  test("withdrawing an invite shuts the door again", async ({ adminPage }) => {
    await query(`insert into public.allowed_emails (email, note) values ($1, 'e2e')`, [PROBE]);

    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await adminPage.goto("/app/people");
    await shell(adminPage)
      .getByRole("button", { name: `Withdraw the invite for ${PROBE}` })
      .click();

    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from public.allowed_emails where email = $1`,
          [PROBE]
        );
        return rows[0].n;
      }, { timeout: 8000 })
      .toBe("0");
  });

  test("a non-admin sees an explanation, not a broken page", async ({ browser }) => {
    // A control that disappears reads as a bug; one that says why reads as an
    // answer. And RLS is what actually stops them — the page only explains it.
    const context = await browser.newContext();
    const page = await context.newPage();

    const { signIn, SEED_ENGINEER } = await import("./fixtures");
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/people");

    await expect(shell(page).getByText("Only an admin can invite people")).toBeVisible();
    await expect(shell(page).getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
    await context.close();
  });

  test("an engineer cannot write the allowlist even by calling the action", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { signIn, SEED_ENGINEER } = await import("./fixtures");
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/people");

    // Straight at PostgREST with the engineer's own token — the same thing a
    // hand-rolled request would do. RLS is the boundary, not the button.
    const status = await page.evaluate(async ({ email, supabaseUrl }) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch(`${supabaseUrl}/rest/v1/allowed_emails`, {
        method: "POST",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      return response.status;
    }, { email: PROBE, supabaseUrl: SUPABASE_URL });

    expect(status, "an engineer was able to insert into the allowlist").toBeGreaterThanOrEqual(400);

    const rows = await query<{ n: string }>(
      `select count(*)::text as n from public.allowed_emails where email = $1`,
      [PROBE]
    );
    expect(rows[0].n).toBe("0");
    await context.close();
  });

  test("axe finds nothing on People or the sign-in form", async ({ adminPage, browser }) => {
    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await adminPage.goto("/app/people");
    expect(await auditA11y(adminPage)).toEqual([]);

    // A genuinely signed-out context. `adminPage` is built ON `page`, so they
    // share a session — reusing `page` here just redirects to /app.
    const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await guest.newPage();
    await page.goto("/login");
    expect(await auditA11y(page)).toEqual([]);
    await guest.close();
  });
});

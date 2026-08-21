import type { Page } from "@playwright/test";

import { auditA11y, expect, query, test } from "./fixtures";

/**
 * Invite-only sign-up.
 *
 * Two things have to be true at once, and they fail in opposite directions. The
 * database must refuse an uninvited address no matter what any form sends — and
 * the person must be told *why*, because GoTrue turns the trigger's message into
 * a bare `500 Database error saving new user`, which reads as a fault rather
 * than an answer.
 */

const PROBE = "allowlist-probe@example.com";
// Deliberately not any real account's password. A fixture that reuses one puts
// it in git history for the life of the repository.
const PROBE_PASSWORD = "e2e-probe-pw-2026";

async function cleanUp() {
  await query(`delete from public.profiles where id in (select id from auth.users where email = $1)`, [PROBE]);
  await query(`delete from auth.users where email = $1`, [PROBE]);
  await query(`delete from public.allowed_emails where email = $1`, [PROBE]);
}

async function createAccount(page: Page, email: string, name = "Allowlist Probe") {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Password").fill(PROBE_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

test.describe("invite-only sign-up", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(cleanUp);
  test.afterEach(cleanUp);

  test("an uninvited address is refused, and told why", async ({ page }) => {
    await createAccount(page, PROBE);

    const message = page.locator('[data-auth-message="error"]');
    await expect(message).toContainText("not authorized");
    await expect(message).toContainText("invite-only");
    // It is announced assertively, not politely — a refusal a screen reader
    // only hears after the next thing it was already saying is a refusal missed.
    await expect(message).toHaveAttribute("role", "alert");
    await expect(page).toHaveURL(/\/login/);

    // Refused means refused: no user, and no orphan profile.
    const users = await query<{ n: string }>(
      `select count(*)::text as n from auth.users where email = $1`,
      [PROBE]
    );
    expect(users[0].n).toBe("0");
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

    await adminPage.getByLabel("Email").fill(PROBE);
    await adminPage.getByLabel("Note (optional)").fill("From the e2e suite");
    await adminPage.getByRole("button", { name: "Invite", exact: true }).click();

    const row = adminPage.locator("li", { hasText: PROBE });
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

    // Now the same address gets in — no confirmation step, straight into the app.
    const guest = await browser.newContext();
    const page = await guest.newPage();
    await createAccount(page, PROBE);
    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });

    // And the profile carries the name they typed, not the email local-part.
    const [profile] = await query<{ full_name: string; role: string }>(
      `select p.full_name, p.role::text as role from public.profiles p
       join auth.users u on u.id = p.id where u.email = $1`,
      [PROBE]
    );
    expect(profile.full_name).toBe("Allowlist Probe");
    // New accounts are engineers. Nobody signs themselves up as an admin.
    expect(profile.role).toBe("engineer");

    await guest.close();
  });

  test("withdrawing an invite shuts the door again", async ({ adminPage }) => {
    await query(`insert into public.allowed_emails (email, note) values ($1, 'e2e')`, [PROBE]);

    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await adminPage.goto("/app/people");
    await adminPage.getByRole("button", { name: `Withdraw the invite for ${PROBE}` }).click();

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

    await expect(page.getByText("Only an admin can invite people")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
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
    const status = await page.evaluate(async (email) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch("http://127.0.0.1:54421/rest/v1/allowed_emails", {
        method: "POST",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      return response.status;
    }, PROBE);

    expect(status, "an engineer was able to insert into the allowlist").toBeGreaterThanOrEqual(400);

    const rows = await query<{ n: string }>(
      `select count(*)::text as n from public.allowed_emails where email = $1`,
      [PROBE]
    );
    expect(rows[0].n).toBe("0");
    await context.close();
  });

  test("axe finds nothing on People or the sign-up form", async ({ adminPage, browser }) => {
    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await adminPage.goto("/app/people");
    expect(await auditA11y(adminPage)).toEqual([]);

    // A genuinely signed-out context. `adminPage` is built ON `page`, so they
    // share a session — reusing `page` here just redirects to /app.
    const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await guest.newPage();
    await page.goto("/login");
    await page.getByRole("tab", { name: "Create account" }).click();
    expect(await auditA11y(page)).toEqual([]);
    await guest.close();
  });
});

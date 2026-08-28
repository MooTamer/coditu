import { SUPABASE_URL, expect, query, shell, signIn, test } from "./fixtures";

/**
 * From *on the allowlist* to *has an account*, in one path.
 *
 * PF-10 deleted the sign-up form and, with it, the only way an invited address
 * could become an account. PF-14 is the hole that left. This drives the whole
 * replacement — an admin sends a real invitation, the link is exchanged for a
 * session, a password is set, and the account signs in on its own afterwards —
 * and then drives the case that must still fail.
 *
 * ── Why the mail is read rather than mocked ────────────────────────────────
 * `inviteUserByEmail` is the mechanism, so the assertion has to be that mail
 * with a working link actually arrives. The local stack catches it at
 * Mailpit (`54524` on the isolated project), so this reads the message GoTrue
 * really sent and follows the link that is really in it. A mocked sender would
 * assert this suite's own fiction.
 *
 * ── The negative case is at the database, not at the action ────────────────
 * `sendInvitation` refuses an address that is not on `allowed_emails`, and that
 * check is a courtesy. The gate is `enforce_email_allowlist`, a BEFORE INSERT
 * trigger on `auth.users`. So the last test skips the application entirely and
 * asks GoTrue directly, with the service-role key — the strongest form of the
 * question, and the one that still has to come back refused.
 */

const INVITEE = "invite-probe@example.com";
const UNINVITED = "uninvited-probe@example.com";
const NEW_PASSWORD = "a-password-only-they-know";

/** Where the local stack catches outgoing mail. Derived, so the isolated project works. */
/**
 * Mailpit, DERIVED from whichever stack this run is pointed at.
 *
 * This was hard-coded to `:54524` — one particular isolated project's port —
 * so the moment a run used a different one it failed with ECONNREFUSED and
 * looked like GoTrue not sending mail. Supabase's own convention is what makes
 * the derivation safe: the API is `…21` and Mailpit is `…24` in the same block.
 * 54421 → 54424 on the shared stack, 54521 → 54524, 54621 → 54624.
 * `E2E_MAIL_URL` still wins for anything that does not follow it.
 */
const MAIL =
  // `||`, not `??`: `E2E_MAIL_URL=` on a command line sets it to the EMPTY
  // STRING, which `??` accepts and which sends every request to a relative URL.
  // That cost a diagnosis here, and an empty override means "use the default"
  // to everybody who types it.
  process.env.E2E_MAIL_URL ||
  SUPABASE_URL.replace(/:(\d+)$/, (_, port: string) => `:${Number(port) + 3}`);

async function forget(email: string) {
  await query(`delete from public.profiles where id in (select id from auth.users where email = $1)`, [email]);
  await query(`delete from auth.users where email = $1`, [email]);
  await query(`delete from public.allowed_emails where email = $1`, [email]);
}

/** The invitation GoTrue actually sent, and the link inside it. */
async function inviteLink(request: import("@playwright/test").APIRequestContext, to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await request.get(`${MAIL}/api/v1/messages`);
    if (list.ok()) {
      const { messages } = (await list.json()) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      const found = messages.find((m) => m.To?.some((t) => t.Address.toLowerCase() === to));
      if (found) {
        const body = await request.get(`${MAIL}/api/v1/message/${found.ID}`);
        const { Text, HTML } = (await body.json()) as { Text: string; HTML: string };
        // The link is `…/verify?token=…&type=invite&redirect_to=…`. Take it out
        // of the plain-text part first: the HTML one arrives entity-encoded.
        const match = /https?:\/\/[^\s"'<>]+/g.exec(Text) ?? /href="([^"]+)"/.exec(HTML);
        if (match) return (match[1] ?? match[0]).replace(/&amp;/g, "&");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no invitation reached ${to} within 10s`);
}

test.describe("an invited address can become an account", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await forget(INVITEE);
    await forget(UNINVITED);
  });

  test.afterAll(async () => {
    await forget(INVITEE);
    await forget(UNINVITED);
  });

  test("an admin adds the address, sends the invitation, and mail arrives", async ({
    adminPage: page,
  }) => {
    await page.goto("/app/people");

    await shell(page).getByPlaceholder("person@example.com").fill(INVITEE);
    await shell(page).getByRole("button", { name: "Invite", exact: true }).click();

    const row = shell(page).locator("[data-allowlist] li", { hasText: INVITEE });
    await expect(row).toBeVisible();
    // On the list, and not pretending to be more than that: the account does
    // not exist yet and the chip says `invited`, not `signed up`.
    await expect(row).toContainText("invited");

    await row.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${INVITEE}.`)).toBeVisible({ timeout: 10_000 });

    // The link in the mail is GoTrue's own `/auth/v1/verify`, which exchanges
    // the token and THEN redirects to whatever `redirect_to` names. So the
    // assertion is on that parameter: the hop back has to land inside this app,
    // at the callback that already carries the open-redirect guard.
    const link = await inviteLink(page.request, INVITEE);
    expect(link).toContain("type=invite");
    expect(
      decodeURIComponent(new URL(link).searchParams.get("redirect_to") ?? ""),
      "the invitation must come back through our own callback"
    ).toContain("/auth/callback?next=/auth/update-password");

    // `handle_new_user` — unchanged, and the reason no new profile-creation
    // code was written for this path — has already made the profile.
    const [profile] = await query<{ role: string; kind: string; must: boolean }>(
      `select p.role::text as role, p.account_kind::text as kind, p.must_set_password as must
         from public.profiles p
         join auth.users u on u.id = p.id
        where u.email = $1`,
      [INVITEE]
    );
    expect(profile, "the trigger should have created a profile").toBeTruthy();
    expect(profile.role).toBe("engineer");
    expect(profile.kind).toBe("internal");
    // Locked until they choose one: the link grants a session, and a session
    // with no password of its own must not reach the app.
    expect(profile.must).toBe(true);
  });

  test("the link sets a password, and the account then signs in on its own", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const link = await inviteLink(page.request, INVITEE);
    await page.goto(link);

    // Through `/auth/callback`, which exchanges the code for a session and then
    // honours `next` — the redirect guard that was already written and tested.
    await page.waitForURL(/\/auth\/update-password/, { timeout: 20_000 });
    // Not through `shell()`: that scopes to `main[data-page-shell]`, and this
    // page is outside the app shell by design — see the note on its own file
    // about deliberately not living under `/login`.
    await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();

    await page.getByLabel(/^New password$/i).fill(NEW_PASSWORD);
    await page.getByLabel(/^Again$/i).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set password" }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });

    const [after] = await query<{ must: boolean }>(
      `select p.must_set_password as must from public.profiles p
         join auth.users u on u.id = p.id where u.email = $1`,
      [INVITEE]
    );
    expect(after.must, "setting a password must lift the requirement").toBe(false);

    // The real proof that the account is now the person's own: a fresh context,
    // no invite link, just the password they chose.
    const second = await browser.newContext();
    const fresh = await second.newPage();
    await signIn(fresh, { email: INVITEE, password: NEW_PASSWORD });
    await fresh.goto("/app");
    await expect(fresh).toHaveURL(/\/app(\/|$)/);

    await second.close();
    await context.close();
  });

  test("the allowlist row now says the invitation was used", async ({ adminPage: page }) => {
    await page.goto("/app/people");
    const row = shell(page).locator("[data-allowlist] li", { hasText: INVITEE });
    await expect(row).toContainText("signed up");
    // Nothing left to send: the door closes behind them.
    await expect(row.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  });

  test("an uninvited address is still refused, by the database", async ({ adminPage: page }) => {
    // No `allowed_emails` row for this one, and none is created.
    const [{ n }] = await query<{ n: string }>(
      `select count(*)::text as n from public.allowed_emails where email = $1`,
      [UNINVITED]
    );
    expect(n).toBe("0");

    // The application's own refusal.
    await page.goto("/app/people");
    await expect(
      shell(page).locator("[data-allowlist] li", { hasText: UNINVITED })
    ).toHaveCount(0);

    // And the one that matters: GoTrue asked directly, with the service-role
    // key, with no application code in the way at all.
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(service, "SUPABASE_SERVICE_ROLE_KEY must be set for this assertion").toBeTruthy();

    const refused = await page.request.post(`${SUPABASE_URL}/auth/v1/invite`, {
      headers: { apikey: service!, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      data: { email: UNINVITED },
      failOnStatusCode: false,
    });
    expect(refused.ok(), "an uninvited address was invited anyway").toBe(false);

    const [{ n: users }] = await query<{ n: string }>(
      `select count(*)::text as n from auth.users where email = $1`,
      [UNINVITED]
    );
    expect(users, "the refused invitation left an account behind").toBe("0");
  });
});

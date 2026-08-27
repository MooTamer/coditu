/**
 * Inviting somebody, from the admin's side. LOCAL ONLY — see `.gitignore`.
 *
 * The round trip is the point. Every other spec in this suite checks one half
 * of the boundary; this one drives the real form, takes the password it hands
 * back, signs in with it, and asserts the person lands in the portal seeing
 * exactly the project they were granted. If the invitation, the trigger, the
 * grant and the read model disagree anywhere, this is where it shows.
 */
import { expect, test } from "@playwright/test";

import { SEED_ADMIN, SEED_ENGINEER, query, signIn } from "./fixtures";

test.describe.configure({ mode: "serial" });

const CLIENT_NAME = "Access E2E Client";
const PROJECT_NAME = "Access E2E Project";
const PROJECT_SLUG = "access-e2e-project";
const INVITEE = "newcontact@access-e2e.test";
/** What she chooses once the temporary password has done its one job. */
const CHOSEN = "a-real-password-she-chose";

async function cleanup() {
  await query(`delete from public.work_items w using public.sprints s, public.projects p
                where w.sprint_id = s.id and s.project_id = p.id and p.slug = $1`, [PROJECT_SLUG]);
  await query(`delete from public.components c using public.projects p
                where c.project_id = p.id and p.slug = $1`, [PROJECT_SLUG]);
  await query(`delete from public.client_project_grants g using public.projects p
                where g.project_id = p.id and p.slug = $1`, [PROJECT_SLUG]);
  await query(`delete from public.sprints s using public.projects p
                where s.project_id = p.id and p.slug = $1`, [PROJECT_SLUG]);
  await query(`delete from public.client_contacts c using public.clients cl
                where c.client_id = cl.id and cl.name = $1`, [CLIENT_NAME]);
  await query(`delete from public.client_invitation_projects ip using public.client_invitations i
                where ip.invitation_id = i.id and lower(i.email) = $1`, [INVITEE]);
  await query(`delete from public.client_invitations where lower(email) = $1`, [INVITEE]);
  await query(`delete from public.projects where slug = $1`, [PROJECT_SLUG]);
  await query(`delete from public.clients where name = $1`, [CLIENT_NAME]);
  await query(`delete from auth.users where email = $1`, [INVITEE]);
  await query(`delete from public.allowed_emails where email = $1`, [INVITEE]);
}

test.beforeAll(async () => {
  await cleanup();
  await query(`insert into public.clients (name) values ($1)`, [CLIENT_NAME]);
  await query(
    `insert into public.projects (client_id, name, slug)
     values ((select id from public.clients where name = $1), $2, $3)`,
    [CLIENT_NAME, PROJECT_NAME, PROJECT_SLUG]
  );
  // One published component, so the portal has something to show once she is in.
  await query(
    `insert into public.components (project_id, name, slug, kind, client_summary, published_at)
     values ((select id from public.projects where slug = $1), 'Access E2E Part', 'access-e2e-part',
             'react', 'The piece of the build shown to this client.', now())`,
    [PROJECT_SLUG]
  );
});

test.afterAll(cleanup);

test.describe("who may open the Clients screen", () => {
  test("an engineer gets nothing there, and is not offered a link to it", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/clients");

    await expect(page.getByRole("heading", { name: /nothing at this address/i })).toBeVisible();

    // A nav item that 404s reads as a broken app rather than as a screen that
    // is not theirs, so it must not be drawn at all.
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);
  });

  test("an admin sees the section and the invite control", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/clients");

    await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: CLIENT_NAME })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite a contact" }).first()
    ).toBeVisible();
  });
});

test.describe("inviting somebody, end to end", () => {
  test("the effective access is shown before the button, and hours are not in it", async ({
    page,
  }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/clients");

    // `getByRole("region", …)` rather than `locator("section", { hasText })`:
    // the page's outer `<Reveal as="section">` wraps every company, so a text
    // filter matches it as well as the one wanted and Playwright refuses the
    // ambiguity. Each company's section carries `aria-labelledby`, which makes
    // it a named landmark and gives exactly one match.
    const section = page.getByRole("region", { name: CLIENT_NAME });
    await section.getByRole("button", { name: "Invite a contact" }).click();

    // Collaborator is the default, and it must not include hours or files.
    await expect(page.getByText("They will be able to")).toBeVisible();
    await expect(page.getByText("Reply to questions")).toBeVisible();
    await expect(page.getByText("See total hours")).toHaveCount(0);
    await expect(page.getByText("Open shared files")).toHaveCount(0);

    // And it says plainly that nothing is emailed.
    await expect(page.getByText(/No email is sent/)).toBeVisible();
  });

  test("creating the account hands back a password once, and she can use it", async ({
    page,
    browser,
  }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/clients");

    const section = page.getByRole("region", { name: CLIENT_NAME });
    await section.getByRole("button", { name: "Invite a contact" }).click();
    await section.getByPlaceholder("person@client.com").fill(INVITEE);
    await section.getByRole("button", { name: "Create the account" }).click();

    const panel = page.getByRole("status");
    await expect(panel).toContainText(`Read this to ${INVITEE} now`);

    const password = (await panel.locator("span", { hasText: /^[A-Z2-9]{4}-/ }).first().textContent())?.trim();
    expect(password, "a password was shown").toBeTruthy();

    // The whole point: it is not stored anywhere it could be read back.
    const stored = await query<{ n: string }>(
      `select count(*)::text as n from public.client_invitations where capabilities::text like $1`,
      [`%${password}%`]
    );
    expect(stored[0].n).toBe("0");

    // Now be her. A fresh context, a real sign-in with that password.
    const context = await browser.newContext();
    const hers = await context.newPage();
    await signIn(hers, { email: INVITEE, password: password! });

    // She is forced to choose her own password before anything else renders —
    // the same flag `setTemporaryPassword` sets for a teammate.
    await hers.goto("/client");
    await expect(hers).toHaveURL(/\/auth\/update-password/);

    // The same controls `password.spec.ts` drives, by the same names.
    await hers.locator('input[name="password"]').fill(CHOSEN);
    await hers.locator('input[name="confirm"]').fill(CHOSEN);
    await hers.getByRole("button", { name: "Set password" }).click();

    // And lands in the portal, seeing the project she was granted.
    await hers.waitForURL(/\/(app|client)$/);
    await hers.goto("/client");
    await expect(hers.getByRole("heading", { level: 1 })).toContainText("newcontact");
    await expect(hers.getByText(PROJECT_NAME)).toBeVisible();
    await expect(hers.getByRole("heading", { name: "Access E2E Part" })).toBeVisible();

    // Never the internal app.
    await hers.goto("/app");
    await expect(hers).toHaveURL(/\/client$/);

    await context.close();
  });

  test("withdrawing access empties her portal on the next request", async ({ page, browser }) => {
    // She is signed in already, from the previous test's account.
    const context = await browser.newContext();
    const hers = await context.newPage();
    await signIn(hers, { email: INVITEE, password: CHOSEN });
    await hers.goto("/client");
    await expect(hers.getByText(PROJECT_NAME)).toBeVisible();

    await signIn(page, SEED_ADMIN);
    await page.goto("/app/clients");
    page.on("dialog", (dialog) => dialog.accept());
    // Scoped to this company: `.first()` across the page would withdraw
    // somebody else's access, which is a test that breaks the seed.
    const section = page.getByRole("region", { name: CLIENT_NAME });
    await section.getByRole("button", { name: "Withdraw access" }).click();
    await expect(section.getByRole("button", { name: "Restore access" })).toBeVisible();

    await hers.reload();
    await expect(hers.getByText("Your access is still being set up")).toBeVisible();
    expect(await hers.content()).not.toContain(PROJECT_NAME);

    await context.close();
  });
});

import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

/**
 * Role and access, on the People page.
 *
 * Every test here works on a profile it creates itself. Promoting or
 * deactivating one of the seeded people would change the assignee menus, the
 * mention list and `v_person_load` for every spec running beside it — and the
 * failure would land somewhere else entirely.
 */
const SUBJECT = "team-subject@example.com";
const NAME = "Team Subject";

async function createSubject() {
  await removeSubject();
  await query(
    `insert into public.allowed_emails (email, note) values ($1, 'e2e team subject')
     on conflict (email) do nothing`,
    [SUBJECT]
  );
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
    [SUBJECT, NAME]
  );
}

async function removeSubject() {
  await query(`delete from public.profiles where id in (select id from auth.users where email = $1)`, [SUBJECT]);
  await query(`delete from auth.users where email = $1`, [SUBJECT]);
  await query(`delete from public.allowed_emails where email = $1`, [SUBJECT]);
}

async function readSubject() {
  const [row] = await query<{ role: string; active: boolean }>(
    `select p.role::text as role, p.is_active as active
     from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [SUBJECT]
  );
  return row;
}

test.describe("the team", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(createSubject);
  test.afterEach(removeSubject);

  test("an admin changes a role, and the database agrees", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/people");

    expect((await readSubject()).role).toBe("engineer");

    await page.getByLabel(`Role for ${NAME}`).selectOption("lead");
    await expect.poll(async () => (await readSubject()).role, { timeout: 8000 }).toBe("lead");

    await page.getByLabel(`Role for ${NAME}`).selectOption("admin");
    await expect.poll(async () => (await readSubject()).role, { timeout: 8000 }).toBe("admin");
  });

  test("deactivating takes access away and keeps the work", async ({ adminPage: page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/people");

    // Two steps on purpose. Losing access is not a thing to do by misclick.
    const button = page.getByRole("button", { name: `Deactivate ${NAME}` });
    await button.click();
    await expect(button).toContainText("Confirm?");
    expect((await readSubject()).active, "one click must not be enough").toBe(true);

    await button.click();
    await expect.poll(async () => (await readSubject()).active, { timeout: 8000 }).toBe(false);
    await expect(page.getByText("deactivated")).toBeVisible();

    // They are gone from the places that decide who can be given work.
    const [assignable] = await query<{ n: string }>(
      `select count(*)::text as n from public.profiles p
       join auth.users u on u.id = p.id
       where u.email = $1 and p.is_active`,
      [SUBJECT]
    );
    expect(assignable.n).toBe("0");

    // And back again — this is the whole reason it is a deactivation.
    await page.getByRole("button", { name: `Give ${NAME} access again` }).click();
    await expect.poll(async () => (await readSubject()).active, { timeout: 8000 }).toBe(true);

    expect(browser).toBeTruthy();
  });

  test("an admin cannot change their own role or deactivate themselves", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/people");

    // Not a security boundary — an admin demoting themselves escalates nothing.
    // It is the one misclick that locks a person out of the tool they run, and
    // undoing it needs somebody else.
    //
    // Located by row, not by name: the seed has two profiles called "Mohamed
    // Tamer", and the other one is a perfectly ordinary person with perfectly
    // ordinary controls.
    const self = page.locator("[data-team-member][data-self]");
    await expect(self).toHaveCount(1);
    await expect(self).toContainText("· you");
    await expect(self.locator("select")).toHaveCount(0);
    // Named, not counted. This used to assert "no buttons at all", which held
    // only while your own row had no controls of any kind — and then weekly
    // capacity became editable and the row grew a stepper, so a passing test
    // turned red over a control that is deliberately there. Capacity is not a
    // way to lock yourself out of the tool; a role change and a deactivation
    // are, and those are what this test is about.
    await expect(self.getByRole("button", { name: /Deactivate/ })).toHaveCount(0);
    await expect(self.getByRole("button", { name: /access again/ })).toHaveCount(0);
    await expect(self.getByRole("combobox", { name: /Role for/ })).toHaveCount(0);
    // The one control that IS expected, so this test fails if it disappears
    // rather than silently passing on a row that has lost half its features.
    await expect(self.getByRole("status", { name: /weekly capacity/ })).toHaveCount(1);
    await expect(self.getByRole("button", { name: /Half an hour (more|less) for/ })).toHaveCount(2);
  });

  test("an engineer sees roles as text, with no controls", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/people");

    await expect(page.getByText(NAME)).toBeVisible();
    await expect(page.getByLabel(`Role for ${NAME}`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Deactivate ${NAME}` })).toHaveCount(0);
    await expect(page.getByText("roles are set by an admin")).toBeVisible();
  });

  test("the database refuses a lead's role change even when the app is bypassed", async ({
    browser,
  }) => {
    // `guard_profile_privilege_columns` is the real gate: RLS lets a person
    // update their own row, and the trigger is what stops them writing `role`.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/people");

    const [subject] = await query<{ id: string }>(
      `select p.id from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
      [SUBJECT]
    );

    await page.evaluate(async (profileId) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      await fetch(`http://127.0.0.1:54421/rest/v1/profiles?id=eq.${profileId}`, {
        method: "PATCH",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "admin" }),
      });
    }, subject.id);

    expect((await readSubject()).role, "an engineer promoted somebody").toBe("engineer");
    await context.close();
  });

  test("axe finds nothing on People", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/people");
    expect(await auditA11y(page)).toEqual([]);
  });
});

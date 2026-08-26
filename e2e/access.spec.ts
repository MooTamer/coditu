import { SEED_ENGINEER, SEED_LEAD, auditA11y, expect, query, signIn, test } from "./fixtures";

/**
 * People & Access: what each role may do, what nobody may do to themselves, and
 * the record of every change to either.
 *
 * The access history is written by database triggers, so the interesting
 * assertion is not "the panel renders" — it is that a change made through the
 * ORDINARY screen shows up in it, named after the person who made it. That is
 * only observable end to end.
 *
 * Every test that writes an access change clears `access_events` afterwards, in
 * SQL. The seed has none, and a leftover row would put an entry in the history
 * for every spec that runs after this file.
 */

const PEOPLE = "/app/people";

async function clearProbe(email: string) {
  await query(`delete from public.allowed_emails where email = $1`, [email]);
  await query(`delete from public.access_events`);
}

test.describe("roles and what they may do", () => {
  test("the matrix names where each rule is actually enforced", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("Change somebody's role, capacity or access");
    // The last column is the point: it says which of the two to trust when this
    // table and the policies disagree.
    await expect(table).toContainText("guard_profile_privilege_columns");
    await expect(table).toContainText("access_events policies");

    // `yes` and `no` rather than a tick and a blank — colour and shape alone
    // would make the table unreadable to anybody who cannot see the difference.
    const inviteRow = table.getByRole("row", { name: /See who can sign up/ });
    await expect(inviteRow).toContainText("yes");
    await expect(inviteRow).toContainText("no");
  });

  test("the three rules that are not about a role are stated, not left to be discovered", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);

    for (const label of ["Self-protection", "Last admin", "Nothing disappears"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/final active admin cannot be demoted/)).toBeVisible();
  });
});

test.describe("the safety states are visible, not hidden", () => {
  /**
   * The rule this pins: a control that disappears reads as a bug, one that is
   * present and says why reads as an answer. All three used to be absent on
   * your own row, which is the one shape this app has said all along it does
   * not do.
   */
  test("an admin's own row keeps every control, disabled and explained", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);

    const self = page.locator("[data-self]");
    await expect(self).toHaveCount(1);

    const role = self.getByRole("combobox");
    await expect(role).toBeDisabled();
    await expect(role).toHaveAttribute("title", /cannot change your own role/);

    const deactivate = self.getByRole("button", { name: "You cannot deactivate yourself" });
    await expect(deactivate).toBeVisible();
    await expect(deactivate).toBeDisabled();
    await expect(deactivate).toHaveAttribute("title", /locks you out of the tool you administer/);

    const password = self.getByRole("button", {
      name: "You cannot set a temporary password for yourself",
    });
    await expect(password).toBeVisible();
    await expect(password).toBeDisabled();

    // Capacity is not a safety rule — you may change your own.
    await expect(self.getByRole("button", { name: /Half an hour more/ })).toBeEnabled();
  });

  test("somebody else's row keeps all three working", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);

    const other = page.locator("[data-team-member]").filter({ hasText: "Adam Nafie" });
    await expect(other.getByRole("combobox")).toBeEnabled();
    await expect(other.getByRole("button", { name: /^Deactivate / })).toBeEnabled();
    await expect(other.getByRole("button", { name: /^Set a temporary password/ })).toBeEnabled();
  });
});

test.describe("the access history", () => {
  const probe = "access-spec@coditu.test";
  test.afterEach(() => clearProbe(probe));

  /**
   * The assertion that matters. The history is written by a trigger, not by the
   * screen — so this drives the ordinary invite form and checks the row turns
   * up named after the admin who used it. A trigger that failed to see
   * `auth.uid()` would write `system` and still look like it worked.
   */
  test("an ordinary change through the ordinary screen turns up in it, with an author", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);

    // NOT an assertion that the history is empty. A fresh database is not:
    // `db:seed` inserts the four seeded allowlist addresses, the trigger records
    // them, and they show as `system` — which is true, and is the seed being
    // honest about how the workspace came to exist. So this counts the
    // difference the click makes rather than assuming a blank slate.
    const history = page.locator("[data-access-history]");
    const before = await history.locator("li").count();

    await page.getByPlaceholder("person@example.com").fill(probe);
    // `exact`, because every existing row carries a `Withdraw the invite for …`
    // button and the substring match resolves to five elements.
    await page.getByRole("button", { name: "Invite", exact: true }).click();

    await expect(history).toBeVisible();
    await expect(history).toContainText(`Mohamed Tamer invited ${probe} to sign up`);
    await expect(history).toContainText("sign-up");

    // Withdrawing writes a second row rather than removing the first — the
    // whole property that makes an audit trail worth reading.
    await page.getByRole("button", { name: `Withdraw the invite for ${probe}` }).click();
    await expect(history).toContainText(`withdrew the invitation for ${probe}`);
    await expect(history.locator("li")).toHaveCount(before + 2);
  });

  test("a lead reads it and an engineer is told why they cannot", async ({ browser, baseURL }) => {
    await query(`insert into public.allowed_emails (email, note) values ($1, 'access spec')`, [probe]);

    for (const { who, sees } of [
      { who: SEED_LEAD, sees: true },
      { who: SEED_ENGINEER, sees: false },
    ]) {
      const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
      try {
        const page = await context.newPage();
        await signIn(page, who);
        await page.goto(PEOPLE);

        if (sees) {
          await expect(page.locator("[data-access-history]")).toContainText(probe);
        } else {
          // Refused in words, and the team list stays — that is what the
          // workspace is for.
          await expect(page.locator("[data-access-history]")).toHaveCount(0);
          await expect(page.getByText(/names capabilities that are an admin/)).toBeVisible();
          await expect(page.getByText("Adam Nafie").first()).toBeVisible();
        }
      } finally {
        await context.close();
      }
    }
  });

  test("nothing in the application can write, edit or remove a line of it", async () => {
    // The policies are asserted in pgTAP; this is the grant, which is the half
    // that survives somebody adding a permissive policy by mistake.
    const [grants] = await query<{ privileges: string }>(
      `select coalesce(string_agg(privilege_type, ',' order by privilege_type), 'none') as privileges
         from information_schema.role_table_grants
        where table_name = 'access_events' and grantee = 'authenticated'`
    );
    // Not an equality check on the whole set: this project grants `REFERENCES`
    // and `TRIGGER` to `authenticated` on every table by default, and neither
    // writes a row. What must be absent is the four that do — including
    // `TRUNCATE`, which bypasses RLS and which this migration revokes.
    for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      expect(grants.privileges, `${privilege} must not be granted`).not.toContain(privilege);
    }
    expect(grants.privileges).toContain("SELECT");
  });

  test("axe is clean with the history and the matrix on screen", async ({ adminPage: page }) => {
    await query(`insert into public.allowed_emails (email, note) values ($1, 'access spec')`, [probe]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PEOPLE);
    await expect(page.locator("[data-access-history]")).toBeVisible();
    expect(await auditA11y(page), "people, with the matrix and the history").toEqual([]);
  });
});

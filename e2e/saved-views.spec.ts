import { SEED_LEAD, expect, query, signIn, test } from "./fixtures";

/**
 * Saved views — a saved question, and who else can ask it.
 *
 * `tests/saved-views.test.ts` owns the spec vocabulary and `supabase/tests/rls.sql`
 * owns the policy. What only a browser can answer is the round trip: that saving
 * the screen you are looking at produces a view that restores that screen, that
 * it survives a reload because it is a row and not state, and that a shared one
 * reaches somebody else's menu while a private one does not.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const REVIEW = `${SPRINT}?status=in_peer_review&sort=deadline%3Aasc`;

/** Everything these specs create, gone — they run against the seeded database. */
test.afterEach(async () => {
  await query(`delete from public.saved_views where name like 'E2E %'`);
});

async function saveCurrentView(
  page: import("@playwright/test").Page,
  name: string,
  { share = false }: { share?: boolean } = {}
) {
  await page.locator("[data-view-menu]").click();
  await page.locator("[data-save-view]").click();

  await page.getByLabel("Name for this view").fill(name);
  if (share) await page.getByLabel("Share it with the team").check();
  await page.getByRole("button", { name: /^Save view$|^Update /  }).click();

  await expect(page.locator("[data-view-menu]")).toContainText(name);
}

test.describe("saved views", () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("saves the screen you are looking at, and restores it", async ({ adminPage: page }) => {
    /**
     * A filter nothing could plausibly have been saved under, rather than the
     * REVIEW url — "the control says Custom view" is an assertion about the
     * ABSENCE of a matching row, and coupling it to the whole table means
     * anybody's saved view breaks it. This one only breaks if somebody saves a
     * view whose only filter is this exact string.
     */
    await page.goto(`${SPRINT}?q=e2e-unsaved-probe`);
    await expect(page.locator("[data-view-menu]")).toContainText("Custom view");

    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E review queue");

    // It is a row, not state: a fresh load of the bare sprint still knows it.
    await page.goto(SPRINT);
    await expect(page.locator("[data-view-menu]")).toContainText("Default order");

    await page.locator("[data-view-menu]").click();
    await page.getByRole("button", { name: /^Open E2E review queue/ }).click();

    await expect(page).toHaveURL(/status=in_peer_review/);
    await expect(page).toHaveURL(/sort=deadline%3Aasc/);
    await expect(page.locator("[data-view-menu]")).toContainText("E2E review queue");
  });

  /**
   * The spec is filter, sort and mode — never a row set. Asserted against the
   * stored row, because that is the promise §5.5 makes and the only place it
   * could be broken.
   */
  test("stores the question and not the answer", async ({ adminPage: page }) => {
    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E question only");

    const [row] = await query<{ spec: Record<string, unknown> }>(
      `select spec from public.saved_views where name = 'E2E question only'`
    );

    expect(row.spec).toEqual({ status: "in_peer_review", sort: "deadline:asc" });
    // Nothing that could name a story. A view that stored twelve ids would be
    // stale the moment anybody moved one.
    expect(JSON.stringify(row.spec)).not.toMatch(/COD-\d+/);
  });

  test("saving the same name again is an update, and says so first", async ({
    adminPage: page,
  }) => {
    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E once");

    await page.goto(`${SPRINT}?status=done`);
    await page.locator("[data-view-menu]").click();
    await page.locator("[data-save-view]").click();
    await page.getByLabel("Name for this view").fill("E2E once");

    // The button changes before it is pressed — an overwrite is not something
    // to discover afterwards.
    await expect(page.getByRole("button", { name: /Update “E2E once”/ })).toBeVisible();
    await page.getByRole("button", { name: /Update “E2E once”/ }).click();
    await expect(page.locator("[data-view-menu]")).toContainText("E2E once");

    const rows = await query<{ spec: Record<string, unknown> }>(
      `select spec from public.saved_views where name = 'E2E once'`
    );
    expect(rows, "one row, not two").toHaveLength(1);
    expect(rows[0].spec).toEqual({ status: "done" });
  });

  test("removing one takes it out of the menu", async ({ adminPage: page }) => {
    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E temporary");

    await page.locator("[data-view-menu]").click();
    await page.getByRole("button", { name: "Remove E2E temporary" }).click();

    await expect(page.getByRole("button", { name: /^Open E2E temporary/ })).toHaveCount(0);
    expect(
      await query(`select id from public.saved_views where name = 'E2E temporary'`)
    ).toHaveLength(0);
  });

  /**
   * The policy's own test is in `rls.sql`; this is the half of it the reader
   * actually experiences — a shared view in somebody else's menu, and a private
   * one that is not there.
   */
  test("a shared view reaches the team and a private one does not", async ({
    adminPage: page,
    browser,
    baseURL,
  }) => {
    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E shared queue", { share: true });

    await page.goto(`${SPRINT}?status=draft`);
    await saveCurrentView(page, "E2E private note");

    const context = await browser.newContext({ baseURL, viewport: { width: 1400, height: 900 } });
    try {
      const lead = await context.newPage();
      await signIn(lead, SEED_LEAD);
      await lead.goto(SPRINT);
      await lead.locator("[data-view-menu]").click();

      await expect(lead.getByRole("button", { name: /^Open E2E shared queue/ })).toBeVisible();
      await expect(lead.getByRole("button", { name: /E2E private note/ })).toHaveCount(0);

      // And it is somebody else's, so it offers no controls that would fail.
      await expect(lead.getByRole("button", { name: "Remove E2E shared queue" })).toHaveCount(0);

      await lead.getByRole("button", { name: /^Open E2E shared queue/ }).click();
      await expect(lead).toHaveURL(/status=in_peer_review/);
    } finally {
      await context.close();
    }
  });

  test("axe finds nothing with the menu open", async ({ adminPage: page }) => {
    const { auditA11y } = await import("./fixtures");
    await page.goto(REVIEW);
    await saveCurrentView(page, "E2E audited");
    await page.locator("[data-view-menu]").click();
    expect(await auditA11y(page, "main"), "the view menu").toEqual([]);
  });
});

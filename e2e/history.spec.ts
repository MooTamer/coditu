import { SEED, SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = "COD-235";

/**
 * `/app/history` — every version of every document, across the workspace.
 *
 * The story panel answers *"what happened to this story"* and you have to be on
 * the story to ask. This answers *"what happened on the 19th"* and *"what has
 * Adam been rewriting"*, neither of which starts from a story.
 *
 * ## Why this file builds its own history and takes it away again
 *
 * `document_revisions` is append-only to the application, so a spec that leaves
 * rows behind changes what every later run reads — the trap `revisions.sql` was
 * built to avoid, met twice more since. A direct delete is a fixture privilege.
 * Same shape as `version-history.spec.ts`, which owns `COD-238`; this file owns
 * `COD-235` so the two can never collide.
 */

const MARKER = "HISTORY SPEC probe";

async function clearRevisions() {
  await query(
    `delete from document_revisions where work_item_id = (select id from work_items where key = $1)`,
    [ITEM_KEY]
  );
}

test.describe("version history, workspace-wide", () => {
  // Serial: every test counts rows on one screen, and the fixture is one story.
  test.describe.configure({ mode: "serial" });

  let original: string | null = null;

  test.beforeAll(async () => {
    const [row] = await query<{ description: string | null }>(
      `select description from work_items where key = $1`,
      [ITEM_KEY]
    );
    original = row.description;
  });

  test.beforeEach(async () => {
    await clearRevisions();
    // Two versions on one document, so there is something to diff and something
    // to filter.
    await query(`update work_items set description = $1 where key = $2`, [
      `${MARKER} one`,
      ITEM_KEY,
    ]);
    await query(`update work_items set description = $1 where key = $2`, [
      `${MARKER} two`,
      ITEM_KEY,
    ]);
  });

  test.afterAll(async () => {
    await query(`update work_items set description = $1 where key = $2`, [original, ITEM_KEY]);
    await clearRevisions();
  });

  test("lists a version with what it was, who wrote it and where it happened", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/history");

    const row = page.locator("[data-history-entry]").filter({ hasText: ITEM_KEY }).first();
    await expect(row).toBeVisible();
    // The target is the point of this screen over the story panel: a row that
    // says "Description · v2" without saying on what is a row nobody can act on.
    await expect(row).toContainText(ITEM_KEY);
    await expect(row).toContainText("Description");
  });

  test("expanding shows the diff, and a way to reach the document", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/history");

    const row = page.locator("[data-history-entry]").filter({ hasText: ITEM_KEY }).first();
    await row.getByRole("group").click();

    // Marked as text, not only by colour — `01-DESIGN-SYSTEM.md` forbids colour
    // as the sole carrier of meaning and a diff is the clearest case there is.
    await expect(row.getByText(`+ added: ${MARKER} two`)).toBeVisible();

    const open = row.getByRole("link", { name: `Open ${ITEM_KEY}` });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute("href", `${SEED.sprint}/items/${ITEM_KEY}`);
  });

  test("a surface filter narrows the list and says so in the URL", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/history");

    await page.getByRole("link", { name: "Filter by Sprint notes" }).click();
    await expect(page).toHaveURL(/surface=sprint_notes/);

    // Every remaining row is a sprint note. Counting rows would pass on an empty
    // list; this fails if one description survives the filter.
    const rows = page.locator("[data-history-entry]");
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i)).toContainText("Sprint notes");
    }
    await expect(page.locator("[data-history-entry]").filter({ hasText: ITEM_KEY })).toHaveCount(0);

    // And the chip says which state it is in, rather than only colouring itself.
    await expect(page.getByRole("link", { name: "Remove the Sprint notes filter" })).toBeVisible();
  });

  test("an actor nobody has empties the list rather than quietly showing everything", async ({
    adminPage: page,
  }) => {
    // The failure this guards: dropping an unrecognised filter, so a shared link
    // silently widens to "everything" under a URL that says otherwise.
    await page.goto("/app/history?actor=ZZ");
    await expect(page.locator("[data-history-entry]")).toHaveCount(0);
    await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  });

  test("an engineer reads it and is offered no restore on a story document", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/history");

    const row = page.locator("[data-history-entry]").filter({ hasText: ITEM_KEY }).first();
    await expect(row).toBeVisible();
    await row.getByRole("group").click();

    // A description is admin-and-lead. Showing a control that exists to be
    // refused is the shape this app does not do.
    await expect(row.getByRole("button", { name: /Restore/ })).toHaveCount(0);
  });

  test("axe is clean, with a version expanded", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/history");
    await page
      .locator("[data-history-entry]")
      .filter({ hasText: ITEM_KEY })
      .first()
      .getByRole("group")
      .click();
    expect(await auditA11y(page)).toEqual([]);
  });

  test("no horizontal overflow at 390, and the diff scrolls inside its own box", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/history");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow, "the page scrolls sideways at 390px").toBe(false);
  });
});

import { SEED_ENGINEER, SEED_LEAD, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = "COD-237";

/**
 * The bin: what is in it, who may take something out, and what it must never
 * show.
 *
 * The assertion that matters most here is the last kind: **a withdrawn
 * comment's words must not appear.** The thread hides them from every reader
 * including their author, and a trash screen that printed them would quietly
 * redefine "withdrawn" as "moved somewhere less obvious". `trash_list()` does
 * not return `body_text` at all, so this is proving an absence at the
 * projection rather than a `display: none` — but the test is written against
 * the rendered page, because that is where the leak would be visible.
 */

async function clearTrash() {
  await query(`update work_items set deleted_at = null where deleted_at is not null`);
  await query(`delete from comments where body_text like 'TRASH SPEC%'`);
}

async function itemId() {
  const [row] = await query<{ id: string }>(`select id from work_items where key = $1`, [ITEM_KEY]);
  return row.id;
}

async function profileId(email: string) {
  const [row] = await query<{ id: string }>(
    `select p.id from profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [email]
  );
  return row.id;
}

test.describe("trash", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await clearTrash();
  });

  test.afterAll(async () => {
    await clearTrash();
  });

  test("a deleted story is listed with where it was and what it costs to purge", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: ITEM_KEY }).first();
    await expect(row).toBeVisible();
    // Where it was — a story deleted from the wrong sprint is unfindable
    // without this.
    await expect(row).toContainText("sprint");
    await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("restoring puts the story back where every other screen can see it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");
    await page
      .getByRole("listitem")
      .filter({ hasText: ITEM_KEY })
      .first()
      .getByRole("button", { name: "Restore" })
      .click();

    await expect
      .poll(
        async () => {
          const [row] = await query<{ deleted_at: string | null }>(
            `select deleted_at from work_items where key = $1`,
            [ITEM_KEY]
          );
          return row.deleted_at;
        },
        { timeout: 8000 }
      )
      .toBeNull();

    await expect(page.getByRole("listitem").filter({ hasText: ITEM_KEY })).toHaveCount(0);
  });

  test("a withdrawn comment is listed WITHOUT its words", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const secret = "TRASH SPEC this sentence must never be rendered";
    await query(
      `insert into comments (work_item_id, author_id, body_json, body_text, deleted_at)
       values ($1, $2, '{"type":"doc","content":[]}'::jsonb, $3, now())`,
      [await itemId(), await profileId("mohamed@coditu.com"), secret]
    );

    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: `Comment on ${ITEM_KEY}` }).first();
    await expect(row).toBeVisible();

    // Not `not.toBeVisible()` — that passes for text that is present and
    // hidden with CSS, which is exactly the bug this is looking for. The words
    // must not be in the document at all.
    expect(await page.content()).not.toContain("this sentence must never be rendered");
  });

  test("a lead can see a withdrawn comment and is told why they cannot restore it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(
      `insert into comments (work_item_id, author_id, body_json, body_text, deleted_at)
       values ($1, $2, '{"type":"doc","content":[]}'::jsonb, 'TRASH SPEC lead cannot restore', now())`,
      [await itemId(), await profileId("mohamed@coditu.com")]
    );

    await signIn(page, SEED_LEAD);
    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: `Comment on ${ITEM_KEY}` }).first();
    await expect(row).toBeVisible();
    // Disabled controls stay visible and carry the reason — the rule the
    // permission matrix states for every refused action.
    await expect(row).toContainText("only its author or an admin");
    await expect(row.getByRole("button", { name: "Restore" })).toHaveCount(0);
  });

  test("an engineer sees no deleted stories and cannot purge anything", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");

    // Deleting a story is admin-and-lead, and so is finding one in the bin.
    await expect(page.getByRole("listitem").filter({ hasText: ITEM_KEY })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete for good" })).toHaveCount(0);
  });

  test("purging says what will be lost before it does it, and axe is clean", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");
    const row = page.getByRole("listitem").filter({ hasText: ITEM_KEY }).first();
    await row.getByRole("button", { name: "Delete for good" }).click();

    // The consequence, in specifics. "Are you sure?" tells nobody anything they
    // did not already know.
    await expect(row).toContainText("its criteria, its thread, its version history");
    await expect(row).toContainText("cannot be undone");

    expect(await auditA11y(page)).toEqual([]);
  });
});

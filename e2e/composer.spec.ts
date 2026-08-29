import { SEED, expect, query, shell, test } from "./fixtures";

/**
 * `COD-230`, which `SEED.threadPerProject` reserves for chromium — and this file
 * is chromium-only, for the reason `playwright.config.ts` gives.
 *
 * It used to be a literal `COD-240`, which is one of the thirteen Week 17 rows
 * the import gave a comment to. That only worked because `clearComments` was
 * deleting the seeded comment along with its own, so *"the thread says so when
 * it is empty"* was asserting against a thread this file had emptied
 * destructively. With the teardown bounded to the rows it creates, the honest
 * fixture is a row that really is quiet.
 */
const ITEM_KEY = SEED.threadPerProject.chromium;
const ITEM = `${SEED.sprint}/items/${ITEM_KEY}`;
/** Where the composer parks an unsent draft, keyed by the item. */
const DRAFT_KEY = `coditu.draft.${ITEM_KEY}`;

/**
 * The comments this file's row already had when it started.
 *
 * The import writes one comment per item whose Notion page carried pictures,
 * and the row this used to point at was one of them. `clearComments` deleted
 * every comment on the item, so that picture left the database on the first run
 * of this file and did not come back until the next `db:reset` — the same
 * unbounded-teardown shape `inline-edit.spec.ts` and `reliable-writes.spec.ts`
 * were both fixed for. The row is a quiet one now, so this snapshot is normally
 * empty — and it stays, because "normally" is not "always" and the next import
 * decides which rows are quiet.
 *
 * `countComments` is bounded the same way, so "there is one comment" still
 * means *this file wrote one*, which is the claim, rather than being widened to
 * accommodate the seed.
 */
let seeded: string[] = [];

async function snapshotComments() {
  seeded = (
    await query<{ id: string }>(
      `select c.id::text as id from comments c
       join work_items w on w.id = c.work_item_id where w.key = $1`,
      [ITEM_KEY]
    )
  ).map((row) => row.id);
}

async function clearComments() {
  await query(
    `delete from comments
      where work_item_id = (select id from work_items where key = $1)
        and not (id::text = any($2::text[]))`,
    [ITEM_KEY, seeded]
  );
}

async function countComments() {
  const rows = await query<{ n: string }>(
    `select count(*)::text as n from comments c
     join work_items w on w.id = c.work_item_id
     where w.key = $1 and not (c.id::text = any($2::text[]))`,
    [ITEM_KEY, seeded]
  );
  return Number(rows[0].n);
}

test.describe("comment composer", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await snapshotComments();
  });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await clearComments();
    await page.goto(ITEM);
  });

  test.afterEach(async () => {
    await clearComments();
  });

  test("the thread says so when it is empty, and still offers the composer", async ({ adminPage: page }) => {
    await expect(shell(page).getByText("No discussion yet.")).toBeVisible();
    await expect(shell(page).getByText("Write a comment — @ to mention")).toBeVisible();
  });

  test("posts a comment and stores a matching body_text", async ({ adminPage: page }) => {
    await shell(page).getByText("Write a comment — @ to mention").click();

    const editor = page.locator(".coditu-prose");
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("Rollover needs a focus state too, not just hover.");

    await page.getByRole("button", { name: "Comment", exact: true }).click();

    await expect
      .poll(async () => {
        const rows = await query<{ body_text: string }>(
          `select c.body_text from comments c
           join work_items w on w.id = c.work_item_id
           where w.key = $1`,
          [ITEM_KEY]
        );
        return rows[0]?.body_text?.trim() ?? "";
      }, { timeout: 8000 })
      .toBe("Rollover needs a focus state too, not just hover.");

    // And it renders back through the server-side walker.
    await expect(page.getByText("Rollover needs a focus state too, not just hover.")).toBeVisible();
  });

  test("Cmd+Enter submits", async ({ adminPage: page, isMobile }) => {
    // A phone has no Cmd and no Ctrl. Playwright will happily synthesise the
    // modifier and the assertion would pass, which is worse than skipping —
    // it would be a green test for a shortcut nobody on that device can use.
    test.skip(!!isMobile, "there is no Cmd key on a phone");

    await shell(page).getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Sent with the keyboard.");
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect
      .poll(async () => {
        return countComments();
      }, { timeout: 8000 })
      .toBe(1);
  });

  test("a draft survives a reload and is cleared once posted", async ({ adminPage: page }) => {
    await shell(page).getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Half-written thought");
    // Two places say it, and that is the point of the shared vocabulary the
    // 2026-08-27 audit added: the composer's own footer, and the topbar chip
    // that says the same words on every writing surface in the application.
    // `getByText` matched both and Playwright refused the ambiguity — the fix
    // is to assert each of them, not to pick one.
    await expect(page.locator("[data-composer-draft]")).toBeVisible();
    await expect(page.locator("[data-save-chip]")).toHaveAttribute("data-state", "draft");

    await page.reload();

    // The editor reopens with the draft in it — no click needed, because the
    // person was mid-sentence.
    await expect(page.locator(".coditu-prose")).toContainText("Half-written thought");

    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect
      .poll(async () => {
        return countComments();
      }, { timeout: 8000 })
      .toBe(1);

    // The database poll above can win the race against the browser's own state:
    // the row lands before the client's await resolves and clears the draft. So
    // the draft is polled too, rather than read once at the wrong moment.
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY), {
        timeout: 5000,
      })
      .toBeNull();
  });

  test("@ opens the mention list and stores the profile id, not the name", async ({
    adminPage: page,
    isMobile,
  }) => {
    await shell(page).getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("@Adam");

    const list = page.getByRole("listbox", { name: "Mention someone" });
    await expect(list).toBeVisible();
    await expect(list.getByText("Adam Nafie")).toBeVisible();

    // Chosen the way the device chooses. Enter is the keyboard affordance and
    // it is the one worth testing on a desktop; on a phone there is no Enter
    // to press while the suggestion list is open, and the gesture is a tap.
    // Pressing Enter there and asserting success would be a green test for an
    // interaction nobody on that device can perform — and it is not green
    // anyway: WebKit leaves the text as a plain "@Adam".
    if (isMobile) {
      await list.getByText("Adam Nafie").click();
    } else {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type(" which source wins?");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    // The stored node carries the UUID; a rename must not break the mention.
    const [adam] = await query<{ id: string }>(`select id from profiles where full_name = 'Adam Nafie'`);
    await expect
      .poll(async () => {
        const rows = await query<{ doc: string }>(
          `select c.body_json::text as doc from comments c
           join work_items w on w.id = c.work_item_id where w.key = $1`,
          [ITEM_KEY]
        );
        return rows[0]?.doc ?? "";
      }, { timeout: 8000 })
      .toContain(adam.id);

    // And the trigger materialised the mention and its notification.
    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from comment_mentions m
           join comments c on c.id = m.comment_id
           join work_items w on w.id = c.work_item_id
           where w.key = $1 and m.profile_id = $2`,
          [ITEM_KEY, adam.id]
        );
        return Number(rows[0].n);
      }, { timeout: 5000 })
      .toBe(1);

    const notifications = await query<{ n: string }>(
      `select count(*)::text as n from notifications
       where profile_id = $1 and kind = 'mention'`,
      [adam.id]
    );
    expect(Number(notifications[0].n)).toBeGreaterThan(0);

    await query(`delete from notifications where profile_id = $1`, [adam.id]);
  });

  test("Escape steps away without discarding", async ({ adminPage: page }) => {
    await shell(page).getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Still here");
    await page.keyboard.press("Escape");

    // The editor is still mounted and the words are still in it.
    await expect(page.locator(".coditu-prose")).toContainText("Still here");
    const draft = await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY);
    expect(draft).toContain("Still here");

    await page.evaluate((key) => window.localStorage.removeItem(key), DRAFT_KEY);
  });
});

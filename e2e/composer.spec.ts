import { expect, query, test } from "./fixtures";

const ITEM = "/app/projects/meinevim/sprints/17/items/COD-149";

async function clearComments() {
  await query(
    `delete from comments where work_item_id = (select id from work_items where key = 'COD-149')`
  );
}

test.describe("comment composer", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await clearComments();
    await page.goto(ITEM);
  });

  test.afterEach(async () => {
    await clearComments();
  });

  test("the thread says so when it is empty, and still offers the composer", async ({ adminPage: page }) => {
    await expect(page.getByText("No discussion yet.")).toBeVisible();
    await expect(page.getByText("Write a comment — @ to mention")).toBeVisible();
  });

  test("posts a comment and stores a matching body_text", async ({ adminPage: page }) => {
    await page.getByText("Write a comment — @ to mention").click();

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
           where w.key = 'COD-149'`
        );
        return rows[0]?.body_text?.trim() ?? "";
      }, { timeout: 8000 })
      .toBe("Rollover needs a focus state too, not just hover.");

    // And it renders back through the server-side walker.
    await expect(page.getByText("Rollover needs a focus state too, not just hover.")).toBeVisible();
  });

  test("Cmd+Enter submits", async ({ adminPage: page }) => {
    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Sent with the keyboard.");
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from comments c
           join work_items w on w.id = c.work_item_id where w.key = 'COD-149'`
        );
        return Number(rows[0].n);
      }, { timeout: 8000 })
      .toBe(1);
  });

  test("a draft survives a reload and is cleared once posted", async ({ adminPage: page }) => {
    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Half-written thought");
    await expect(page.getByText("draft saved")).toBeVisible();

    await page.reload();

    // The editor reopens with the draft in it — no click needed, because the
    // person was mid-sentence.
    await expect(page.locator(".coditu-prose")).toContainText("Half-written thought");

    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from comments c
           join work_items w on w.id = c.work_item_id where w.key = 'COD-149'`
        );
        return Number(rows[0].n);
      }, { timeout: 8000 })
      .toBe(1);

    const draft = await page.evaluate(() => window.localStorage.getItem("coditu.draft.COD-149"));
    expect(draft, "the draft is cleared once the comment is posted").toBeNull();
  });

  test("@ opens the mention list and stores the profile id, not the name", async ({ adminPage: page }) => {
    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("@Adam");

    const list = page.getByRole("listbox", { name: "Mention someone" });
    await expect(list).toBeVisible();
    await expect(list.getByText("Adam Nafie")).toBeVisible();

    await page.keyboard.press("Enter");
    await page.keyboard.type(" which source wins?");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    // The stored node carries the UUID; a rename must not break the mention.
    const [adam] = await query<{ id: string }>(`select id from profiles where full_name = 'Adam Nafie'`);
    await expect
      .poll(async () => {
        const rows = await query<{ doc: string }>(
          `select c.body_json::text as doc from comments c
           join work_items w on w.id = c.work_item_id where w.key = 'COD-149'`
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
           where w.key = 'COD-149' and m.profile_id = $1`,
          [adam.id]
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
    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await editor.click();
    await page.keyboard.type("Still here");
    await page.keyboard.press("Escape");

    // The editor is still mounted and the words are still in it.
    await expect(page.locator(".coditu-prose")).toContainText("Still here");
    const draft = await page.evaluate(() => window.localStorage.getItem("coditu.draft.COD-149"));
    expect(draft).toContain("Still here");

    await page.evaluate(() => window.localStorage.removeItem("coditu.draft.COD-149"));
  });
});

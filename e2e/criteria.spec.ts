import { SEED, SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = SEED.grouped;
const ITEM = `${SEED.sprint}/items/${ITEM_KEY}`;

/**
 * Acceptance criteria as documents.
 *
 * A criterion holds what a comment holds — paragraphs, code, and pictures
 * pasted straight in — while `body` stays the flattened text the CSV and
 * Markdown exports read. Both halves are asserted here: what the screen shows,
 * and what the column the export contract depends on ends up containing.
 */
async function criteriaOf(key: string) {
  return query<{ body: string; has_json: boolean; is_done: boolean }>(
    `select c.body, (c.body_json is not null) as has_json, c.is_done
     from acceptance_criteria c
     join work_items w on w.id = c.work_item_id
     where w.key = $1
     order by c.order_index`,
    [key]
  );
}

async function removeAdded() {
  await query(`delete from acceptance_criteria where body like 'E2E %'`);
}

/**
 * Paste a real PNG the way a person does — a clipboard event carrying a File.
 *
 * Built in the page rather than uploaded through the file input, because the
 * paste path is the one being tested: `handlePaste` reads
 * `clipboardData.files`, and a file input would go around it.
 */
async function pasteImage(page: import("@playwright/test").Page) {
  await page.locator(".coditu-prose").click();
  await page.evaluate(() => {
    // 1x1 transparent PNG. Small, and a real PNG — the server checks the magic
    // number, so a made-up blob is refused.
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const file = new File([bytes], "pasted.png", { type: "image/png" });
    const data = new DataTransfer();
    data.items.add(file);
    document
      .querySelector(".coditu-prose")!
      .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
}

test.describe("acceptance criteria", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await removeAdded();
    await page.goto(ITEM);
  });

  test.afterEach(async () => {
    await removeAdded();
  });

  test("one is added, and the export column gets the flattened text", async ({
    adminPage: page,
  }) => {
    const before = (await criteriaOf(ITEM_KEY)).length;

    await page.getByRole("button", { name: "Add a criterion" }).click();
    await page.locator(".coditu-prose").click();
    await page.keyboard.type("E2E the pill keeps its arrow at 320px");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("E2E the pill keeps its arrow at 320px")).toBeVisible();

    await expect
      .poll(async () => (await criteriaOf(ITEM_KEY)).length)
      .toBe(before + 1);

    const rows = await criteriaOf(ITEM_KEY);
    const added = rows.find((row) => row.body.startsWith("E2E "))!;
    // The document is stored, and `body` is its one-line reading — which is
    // what `- [ ] …` in the Markdown export is built from.
    expect(added.has_json).toBe(true);
    expect(added.body).toBe("E2E the pill keeps its arrow at 320px");
    expect(added.is_done).toBe(false);
  });

  test("a criterion written before documents existed still edits", async ({ adminPage: page }) => {
    // The 232 imported ones have no body_json at all. Editing must start from
    // the sentence rather than from an empty box.
    const first = (await criteriaOf(ITEM_KEY))[0];

    await page.getByRole("button", { name: `Edit criterion: ${first.body}` }).click();
    const editor = page.locator(".coditu-prose");
    await expect(editor).toContainText(first.body);

    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" — E2E amended");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(async () => (await criteriaOf(ITEM_KEY))[0].body)
      .toBe(`${first.body} — E2E amended`);

    // Put it back, so the next run starts where this one did.
    await query(
      `update acceptance_criteria set body = $2, body_json = null
       where id = (select c.id from acceptance_criteria c join work_items w on w.id = c.work_item_id
                   where w.key = $1 order by c.order_index limit 1)`,
      [ITEM_KEY, first.body]
    );
  });

  test("a screenshot pastes into a criterion and nests under it", async ({ adminPage: page }) => {
    await page.getByRole("button", { name: "Add a criterion" }).click();
    await page.locator(".coditu-prose").click();
    await page.keyboard.type("E2E looks like this");

    await pasteImage(page);

    // The upload is a round trip to storage; the image appears in the editor
    // when it lands.
    await expect(page.locator(".coditu-prose img")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const row = page.getByRole("listitem").filter({ hasText: "E2E looks like this" });
    // Nested UNDER the criterion, not floated somewhere else in the item: the
    // thumbnail is inside the same list row as its text.
    await expect(row.getByRole("button", { name: /^Open image/ })).toBeVisible();

    // And it is a thumbnail here too, not a full-width screenshot.
    const height = (await row.getByRole("button", { name: /^Open image/ }).boundingBox())?.height ?? 0;
    expect(height).toBeLessThanOrEqual(140);

    // The export column reads it as text, with the picture named rather than
    // silently dropped.
    const stored = (await criteriaOf(ITEM_KEY)).find((c) => c.body.startsWith("E2E looks like this"))!;
    expect(stored.body).toContain("[image");
    expect(stored.body).not.toContain("\n");
  });

  test("one can be removed", async ({ adminPage: page }) => {
    await page.getByRole("button", { name: "Add a criterion" }).click();
    await page.locator(".coditu-prose").click();
    await page.keyboard.type("E2E temporary");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("E2E temporary")).toBeVisible();

    await page.getByRole("button", { name: "Remove criterion: E2E temporary" }).click();
    await expect(page.getByText("E2E temporary")).toHaveCount(0);
    await expect.poll(async () => (await criteriaOf(ITEM_KEY)).some((c) => c.body === "E2E temporary")).toBe(false);
  });

  test("an engineer ticks a box and cannot rewrite what it says", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);

    // Ahmed is neither assignee nor reviewer on this one, so he cannot even
    // tick it — but he must still be able to READ it.
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit criterion/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove criterion/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add a criterion" })).toHaveCount(0);
  });

  test("the tick is still a checkbox, and the row is not one big button", async ({
    adminPage: page,
  }) => {
    // The row used to BE the toggle. It cannot be, now that a criterion can
    // contain a link and a picture: clicking the screenshot would tick the box,
    // and a button inside a button is nested-interactive.
    const boxes = page.getByRole("checkbox");
    expect(await boxes.count()).toBeGreaterThan(0);

    const first = boxes.first();
    const before = await first.getAttribute("aria-checked");
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", before ?? "false");
  });

  test("it works on a phone, and axe finds nothing while editing", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ITEM);

    await page.getByRole("button", { name: "Add a criterion" }).click();
    await expect(page.locator(".coditu-prose")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow, "nothing hangs off the side of a 390px screen").toBe(false);

    expect(await auditA11y(page)).toEqual([]);
  });
});

import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";
/** Unassigned, draft, no grouping — the least entangled row in the seed. */
const KEY = "COD-242";

async function readItem() {
  const [row] = await query<{
    status: string;
    type: string;
    deadline: string | null;
    estimate: string;
    grouping: string | null;
    assignee: string | null;
    reviewer: string | null;
    minutes: string;
  }>(
    `select w.status::text, w.type::text, w.deadline::text, w.estimate_minutes::text as estimate,
            w.grouping::text, w.assignee_id::text as assignee, w.reviewer_id::text as reviewer,
            w.minutes_logged::text as minutes
     from work_items w where w.key = $1`,
    [KEY]
  );
  return row;
}

/**
 * Every cell in the row is the control for its own column.
 *
 * The whole describe takes the write lock: these specs move statuses,
 * estimates and hours on a seeded sprint, and every other spec that asserts
 * the sprint totals or "peer review 4" would see them half-applied.
 */
test.describe("editing from the table", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.use({ sprintTotals: "write" });

  let before: Awaited<ReturnType<typeof readItem>>;

  test.beforeAll(async () => {
    before = await readItem();
  });

  test.afterEach(async () => {
    await query(
      `update work_items set status = $2::work_item_status, type = $3::work_item_type,
              deadline = $4::date, estimate_minutes = $5::int, grouping = $6::smallint,
              assignee_id = $7::uuid, reviewer_id = $8::uuid
       where key = $1`,
      [
        KEY,
        before.status,
        before.type,
        before.deadline,
        before.estimate,
        before.grouping,
        before.assignee,
        before.reviewer,
      ]
    );
    await query(
      `delete from time_entries where note = 'e2e inline edit'
         or work_item_id = (select id from work_items where key = $1)`,
      [KEY]
    );
  });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
  });

  function row(page: import("@playwright/test").Page) {
    return page.locator("tbody tr", { hasText: KEY });
  }

  test("status changes from the row and reaches the database", async ({ adminPage: page }) => {
    await row(page).getByRole("button", { name: /^Status/ }).click();
    await page.getByRole("option", { name: /in progress/ }).click();

    await expect(row(page).getByRole("button", { name: /^Status: in progress/ })).toBeVisible();
    await expect.poll(async () => (await readItem()).status, { timeout: 8000 }).toBe("in_progress");
  });

  test("assignee and reviewer change from their own columns", async ({ adminPage: page }) => {
    await row(page).getByRole("button", { name: /^Assignee/ }).click();
    await page.getByRole("option", { name: "Ahmed Yehia" }).click();
    await expect.poll(async () => (await readItem()).assignee, { timeout: 8000 }).not.toBeNull();

    await row(page).getByRole("button", { name: /^Reviewer/ }).click();
    await page.getByRole("option", { name: "Adam Nafie" }).click();
    await expect.poll(async () => (await readItem()).reviewer, { timeout: 8000 }).not.toBeNull();

    const [names] = await query<{ assignee: string; reviewer: string }>(
      `select a.full_name as assignee, r.full_name as reviewer
       from work_items w
       join profiles a on a.id = w.assignee_id
       join profiles r on r.id = w.reviewer_id
       where w.key = $1`,
      [KEY]
    );
    expect(names.assignee).toBe("Ahmed Yehia");
    expect(names.reviewer).toBe("Adam Nafie");
  });

  test("deadline, type and grouping all edit in place", async ({ adminPage: page }) => {
    await row(page).getByRole("button", { name: /^Deadline/ }).click();
    await page.getByLabel("Deadline", { exact: true }).fill("2026-09-01");
    await expect.poll(async () => (await readItem()).deadline, { timeout: 8000 }).toBe("2026-09-01");

    await row(page).getByRole("button", { name: /^Type/ }).click();
    await page.getByRole("option", { name: "spike" }).click();
    await expect.poll(async () => (await readItem()).type, { timeout: 8000 }).toBe("spike");

    await row(page).getByRole("button", { name: /^Grouping/ }).click();
    await page.getByLabel("Grouping", { exact: true }).fill("4");
    await page.getByLabel("Grouping", { exact: true }).press("Enter");
    await expect.poll(async () => (await readItem()).grouping, { timeout: 8000 }).toBe("4");
  });

  test("the hours cell logs time and sets the estimate", async ({ adminPage: page }) => {
    const startMinutes = Number(before.minutes);

    await row(page).getByRole("button", { name: /hours\. Log time/ }).click();
    // Default is 1.5h; one step down logs 1.0h.
    await page.getByRole("button", { name: "Half an hour less" }).click();
    await page.getByRole("button", { name: /^Log 1\.0 h on/ }).click();

    await expect
      .poll(async () => Number((await readItem()).minutes), { timeout: 10_000 })
      .toBe(startMinutes + 60);

    await row(page).getByRole("button", { name: /hours\. Log time/ }).click();
    const estimate = page.getByLabel("Estimate (hours)");
    await estimate.fill("6.5");
    await estimate.press("Enter");
    // 6.5 hours becomes 390 integer minutes at the boundary. Invariant 2.
    await expect.poll(async () => (await readItem()).estimate, { timeout: 8000 }).toBe("390");
  });

  test("the whole cell is the target, and each column means its own thing", async ({
    adminPage: page,
  }) => {
    const assignee = row(page).getByRole("button", { name: /^Assignee/ });
    // The last row of the sprint; `boundingBox` is viewport-relative,
    // so measuring it while it is still below the fold gives coordinates the
    // mouse can never reach.
    await assignee.scrollIntoViewIfNeeded();
    const cell = (await assignee.boundingBox())!;
    const rowBox = (await row(page).boundingBox())!;

    // The trigger fills its cell top to bottom. A 24px control centred in a
    // 52px row leaves most of the column inert while looking like the obvious
    // place to click.
    expect(cell.height).toBeGreaterThan(rowBox.height - 3);

    // Clicking the far right of the assignee cell — well past the name —
    // opens the assignee menu, and does NOT open the item.
    await page.mouse.click(cell.x + cell.width - 8, cell.y + cell.height / 2);
    await expect(page.getByRole("listbox", { name: "Assignee" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${SPRINT}$`));
    await page.keyboard.press("Escape");

    // And the empty right-hand half of the TASK cell opens the item, which is
    // what that column is for.
    const task = (await row(page).locator("td").first().boundingBox())!;
    await page.mouse.click(task.x + task.width - 40, task.y + task.height / 2);
    await expect(page.getByRole("dialog", { name: `Work item ${KEY}` })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a menu on the last row escapes the table's own scroll box", async ({ adminPage: page }) => {
    // The regression this guards: the menu was absolutely positioned inside a
    // `overflow: auto` section, so on the last row its bottom half was simply
    // clipped away.
    const trigger = row(page).getByRole("button", { name: /^Status/ });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const menu = page.getByRole("listbox", { name: "Status" });
    await expect(menu).toBeVisible();

    const box = (await menu.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y, "menu starts on screen").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "menu ends on screen").toBeLessThanOrEqual(viewport.height + 1);

    // Every option is really hittable, not just laid out.
    for (const option of await menu.getByRole("option").all()) {
      await expect(option).toBeInViewport();
    }
  });

  test("axe finds nothing with a cell menu open", async ({ adminPage: page }) => {
    await row(page).getByRole("button", { name: /^Assignee/ }).click();
    await expect(page.getByRole("listbox", { name: "Assignee" })).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });

  test("an engineer sees the values and is told why they are not controls", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const target = page.locator("tbody tr", { hasText: KEY });
    await expect(target.getByRole("button", { name: /^Assignee/ })).toHaveCount(0);
    await expect(
      target.locator('[title="Only an admin or lead can change who owns an item"]').first()
    ).toBeVisible();
  });
});

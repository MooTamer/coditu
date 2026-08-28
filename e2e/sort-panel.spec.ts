import { auditA11y, expect, settleAnimations, shell, test } from "./fixtures";
import { SEED } from "./fixtures";

/**
 * PF-8 — the sort panel, over the stack that was already there.
 *
 * The data layer (`lib/sprint-sort.ts`) has been tested by fixtures since
 * before this panel existed, and `tests/sprint-sort.test.ts` still owns the
 * comparator. What can only be asserted in a browser is the part PF-8 actually
 * asked for: that the toolbar SAYS what the table is sorted by, that a rule can
 * be changed without taking the whole stack apart, and that the words are the
 * column's own rather than a comparator's.
 */
const SPRINT = SEED.sprint;

test.describe("the sort panel", () => {
  test.use({ sprintTotals: "read" });

  test("the toolbar says nothing until there is a sort, and then says what", async ({
    adminPage: page,
  }) => {
    await page.goto(SPRINT);
    const button = shell(page).locator("[data-sort-button]");
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute("data-sort-active", "");
    await expect(shell(page).locator("[data-sort-chip]")).toHaveCount(0);

    await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc`);
    await expect(shell(page).locator("[data-sort-button]")).toHaveAttribute("data-sort-active", "");

    // A chip per rule, in priority order, each naming its column.
    const chips = shell(page).locator("[data-sort-chip]");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText("Deadline");
    await expect(chips.nth(1)).toContainText("Hours");
  });

  test("a chip reopens the panel on its own rule", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc`);
    await shell(page).locator("[data-sort-chip='hours']").click();

    const panel = page.getByRole("dialog", { name: "Sort" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-sort-rule]")).toHaveCount(2);
    // Opened ON that rule: the panel names it back.
    await expect(panel).toContainText("hours");
  });

  test("every direction is worded for its column's type, and never asc or desc", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SPRINT}?sort=hours:desc,deadline:asc,component:asc,status:asc`);
    await shell(page).locator("[data-sort-button]").click();
    const panel = page.getByRole("dialog", { name: "Sort" });
    await expect(panel).toBeVisible();

    await expect(panel.getByLabel("Sort 1: direction")).toHaveValue("desc");
    await expect(panel.getByLabel("Sort 1: direction")).toContainText("Sort high → low");
    await expect(panel.getByLabel("Sort 2: direction")).toContainText("Earliest → latest");
    await expect(panel.getByLabel("Sort 3: direction")).toContainText("A → Z");
    await expect(panel.getByLabel("Sort 4: direction")).toContainText("In display order");

    const words = (await panel.innerText()).toLowerCase();
    expect(words, "the panel used a comparator's vocabulary").not.toMatch(/\basc\b|\bdesc\b/);
  });

  test("changing a rule rewrites the URL contract that already existed", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SPRINT}?sort=hours:asc`);
    await shell(page).locator("[data-sort-button]").click();
    const panel = page.getByRole("dialog", { name: "Sort" });

    await panel.getByLabel("Sort 1: direction").selectOption("desc");
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("hours:desc");

    await panel.getByLabel("Sort 1: column").selectOption("deadline");
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("deadline:desc");

    // `+ Add sort` takes the first column not already spoken for.
    await panel.getByRole("button", { name: "Add sort" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("deadline:desc,key:asc");

    await panel.getByRole("button", { name: "Delete sort", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(null);
  });

  test("one rule can be dropped without taking the stack apart", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc,status:asc`);
    await shell(page).locator("[data-sort-button]").click();
    const panel = page.getByRole("dialog", { name: "Sort" });

    await panel.getByRole("button", { name: "Delete sort by Hours" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(
      "deadline:asc,status:asc"
    );
    await expect(panel.locator("[data-sort-rule]")).toHaveCount(2);
  });

  test("the sort the panel writes is the sort the table is in", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=key:asc`);
    const keys = () =>
      shell(page)
        .locator("[data-row-key]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-row-key") ?? ""));

    const ascending = await keys();
    expect(ascending.length).toBeGreaterThan(2);
    expect([...ascending].sort()).toEqual(ascending);

    await shell(page).locator("[data-sort-button]").click();
    await page.getByRole("dialog", { name: "Sort" }).getByLabel("Sort 1: direction").selectOption("desc");
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("key:desc");

    await expect.poll(async () => (await keys()).join(",")).toBe([...ascending].reverse().join(","));
  });

  test("axe finds nothing with the panel open", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc`);
    await shell(page).locator("[data-sort-button]").click();
    await expect(page.getByRole("dialog", { name: "Sort" })).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });
});

test.describe("the sort panel, reordered without a mouse", () => {
  test.use({ sprintTotals: "read" });

  test("the drag handle moves a rule, and the stack is the priority", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc,status:asc`);
    await shell(page).locator("[data-sort-button]").click();
    const panel = page.getByRole("dialog", { name: "Sort" });
    await expect(panel.locator("[data-sort-rule]")).toHaveCount(3);

    // Driven from the KEYBOARD rather than with a synthetic pointer drag. It is
    // the harder assertion — dnd-kit's keyboard sensor only works if the handle
    // is focusable and labelled — and it is the one that says a person who
    // cannot drag can still set the priority.
    await panel.getByRole("button", { name: /Reorder Hours/ }).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    await page.keyboard.press("Space");

    await expect
      .poll(() => new URL(page.url()).searchParams.get("sort"))
      .toBe("hours:desc,deadline:asc,status:asc");

    // And the toolbar chips follow, in the new priority order.
    await expect(shell(page).locator("[data-sort-chip]").nth(0)).toContainText("Hours");
  });
});

test.describe("the sort panel on a phone", () => {
  // On the CONTEXT, so this holds on chromium too: the 44px floor is in
  // `@media (pointer: coarse)` and a headless desktop context reports
  // `pointer: fine`, which passes the test without applying the rule.
  test.use({ sprintTotals: "read", hasTouch: true, isMobile: true });

  for (const width of [320, 390, 768]) {
    test(`its controls clear 44px and it does not overflow at ${width}px`, async ({
      adminPage: page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${SPRINT}?sort=deadline:asc,hours:desc`);
      await shell(page).locator("[data-sort-button]").tap();

      const panel = page.getByRole("dialog", { name: "Sort" });
      await expect(panel).toBeVisible();
      // The dialog enters on a transform, and a scaled element's bounding rect
      // is smaller than its laid-out size — measuring mid-entrance reports a
      // 44px control as 43-and-change and fails a rule it actually keeps.
      await settleAnimations(page);

      const small = await panel.evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>("button, select")]
          .map((el) => {
            const box = el.getBoundingClientRect();
            if (box.width === 0 && box.height === 0) return null;
            return box.width >= 44 && box.height >= 44
              ? null
              : `${el.tagName}${el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""} ${Math.round(box.width)}x${Math.round(box.height)}`;
          })
          .filter(Boolean)
      );
      expect(small, `controls under 44px at ${width}px`).toEqual([]);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    });
  }
});

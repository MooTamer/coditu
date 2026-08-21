import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

/**
 * Exactly one rail item is the current page.
 *
 * The regression this guards: `startsWith("/app/projects")` matched a sprint
 * URL, so Projects and Sprint both carried `aria-current` and the rail claimed
 * the reader was in two places at once.
 *
 * Read from `title` rather than the text: the label is a `<span>` faded to
 * `opacity: 0` while the rail is collapsed, and My work carries a screen-reader
 * unread count that would make the assertion depend on the seed.
 */
async function currentItems(page: Page): Promise<string[]> {
  return page.locator('aside a[aria-current="page"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("title") ?? "")
  );
}

test.describe("the navigation rail", () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("a sprint page lights Sprint and nothing else", async ({ adminPage: page }) => {
    await page.goto(SPRINT);
    expect(await currentItems(page)).toEqual(["Sprint"]);
  });

  test("an item opened over the sprint keeps Sprint current", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/items/COD-140`);
    expect(await currentItems(page)).toEqual(["Sprint"]);
  });

  test("the project list and a project overview light Projects", async ({ adminPage: page }) => {
    await page.goto("/app/projects");
    expect(await currentItems(page)).toEqual(["Projects"]);

    await page.goto("/app/projects/meinevim");
    expect(await currentItems(page)).toEqual(["Projects"]);
  });

  test("the flat routes light themselves", async ({ adminPage: page }) => {
    for (const [href, label] of [
      ["/app/my-work", "My work"],
      ["/app/people", "People"],
      ["/app/import", "Import"],
    ] as const) {
      await page.goto(href);
      expect(await currentItems(page), href).toEqual([label]);
    }
  });
});

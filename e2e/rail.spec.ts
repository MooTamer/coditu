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

/**
 * The sidebar's three bands, measured.
 *
 * Since W6 the width is CSS and nothing else — no hover, no media-query hook —
 * so these are the only tests that can catch it breaking. They exist because
 * the Tailwind variants that first expressed this compiled to **nothing**: the
 * class names were on the element, every static check passed, and the sidebar
 * simply never changed state. Only measuring in a browser found it.
 */
test.describe("the sidebar's width follows the viewport", () => {
  /**
   * `toHaveCSS` rather than a bare `getComputedStyle` read, and the difference
   * matters: the sidebar animates its width over 220ms, so a synchronous read
   * straight after a resize returns an INTERPOLATED value — 268px on its way
   * down to 64. `toHaveCSS` polls until it settles. The first version of this
   * test read directly and failed on a sidebar that was working correctly.
   */
  const expectRail = (page: Page, width: string, why: string) =>
    expect(page.locator("aside[data-app-chrome]"), why).toHaveCSS("width", width);

  test("labels at 1180 and above, icons below it, and gone below 768", async ({
    adminPage: page,
  }) => {
    await page.goto("/app");

    await page.setViewportSize({ width: 1400, height: 820 });
    await expectRail(page, "268px", "wide: labels fit");
    await expect(page.locator("aside [data-rail-toggle]")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 760 });
    await expectRail(page, "64px", "tablet: icons only");
    // No control below 1180: the sidebar is icons at every setting there, and a
    // button that appears to change that and does not is worse than none.
    await expect(page.locator("aside [data-rail-toggle]")).toBeHidden();

    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.locator("aside[data-app-chrome]")).toBeHidden();
    await expect(page.locator("[data-tab-bar]")).toBeVisible();
  });

  test("collapsing hides the labels without hiding them from a screen reader", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.goto("/app");

    const label = page.locator("aside [data-rail-label]").filter({ hasText: "Sprint" }).first();
    await expect(label).toHaveCSS("opacity", "1");

    await page.locator("aside [data-rail-toggle]").click();

    await expectRail(page, "64px", "collapsed");
    await expect(label).toHaveCSS("opacity", "0");
    // `opacity`, not `display: none`: the name still reaches the accessibility
    // tree, or the sidebar becomes seven unlabelled icons to anybody not
    // looking at it.
    // Scoped to the sidebar: the bottom bar keeps its own "Sprint" link in the
    // DOM at every width, hidden by CSS.
    await expect(
      page.locator("aside[data-app-chrome]").getByRole("link", { name: "Sprint" })
    ).toBeAttached();

    // And the preference survives a reload, which is the only reason it is
    // stored at all.
    await page.reload();
    await expectRail(page, "64px", "the preference survived a reload");
  });
});

test.describe("the navigation rail", () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("a sprint page lights Sprint and nothing else", async ({ adminPage: page }) => {
    await page.goto(SPRINT);
    expect(await currentItems(page)).toEqual(["Sprint"]);
  });

  test("an item opened over the sprint keeps Sprint current", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/items/COD-229`);
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

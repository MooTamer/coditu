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

/**
 * Project spaces — the sidebar's tree, and the thing that let the topbar stop
 * carrying a project switcher.
 *
 * These assert behaviour that only exists in a browser: what is in the
 * accessibility tree at each width, what a stored disclosure does across a
 * reload, and that the tree does not quietly claim to be a second current page.
 */
test.describe("project spaces", () => {
  const spaces = (page: Page) => page.locator("[data-rail-spaces]");

  test("opens the project you are in and leaves the others shut", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const meinevim = spaces(page).getByRole("button", { name: /MEINEvim/ });
    await expect(meinevim).toHaveAttribute("aria-expanded", "true");

    // Every other project is shut, because you are not in it. The default is
    // the URL rather than a preference, so this is true on the first render.
    for (const other of ["Converso", "Nile Atelier", "NVRMiss", "Ops Console"]) {
      await expect(
        spaces(page).getByRole("button", { name: new RegExp(other) }),
        other
      ).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("lists the open sprints and the registry, and not fourteen closed weeks", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const tree = spaces(page);
    await expect(tree.getByRole("link", { name: /Week 17/ })).toBeVisible();
    await expect(tree.getByRole("link", { name: /Components/ })).toBeVisible();

    // The seed carries fifteen sprints for this project and fourteen of them
    // are closed. None of those belongs in a 268px column.
    await expect(tree.getByRole("link", { name: /Week 16/ })).toHaveCount(0);
    await expect(tree.getByRole("link", { name: /Week 3\b/ })).toHaveCount(0);
  });

  /**
   * The rule this pins is "exactly one `aria-current='page'`", which the rail
   * has had since a prefix test lit two items at once. A tree row that IS the
   * open page is genuinely current, so it says so — as `true`, the current item
   * in this SET, rather than as a second page.
   */
  test("marks the open sprint without claiming a second current page", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const current = page.locator('aside [aria-current="true"]');

    expect(await currentItems(page)).toEqual(["Sprint"]);
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Week 17");

    // One row, and it follows the URL rather than the project. The project's
    // own row is tinted everywhere beneath it — that is "you are in here" —
    // but it is current only on the page it actually links to.
    await page.goto("/app/projects/meinevim/components");
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Components");

    await page.goto("/app/projects/meinevim");
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("MEINEvim components");

    // And nothing at all outside the project.
    await page.goto("/app/my-work");
    await expect(current).toHaveCount(0);
  });

  test("remembers a space somebody actually toggled, across a reload", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const meinevim = spaces(page).getByRole("button", { name: /MEINEvim/ });
    await meinevim.click();
    await expect(meinevim).toHaveAttribute("aria-expanded", "false");
    await expect(spaces(page).getByRole("link", { name: /Week 17/ })).toHaveCount(0);

    await page.reload();
    await expect(
      spaces(page).getByRole("button", { name: /MEINEvim/ }),
      "the stored answer wins over the URL's default"
    ).toHaveAttribute("aria-expanded", "false");

    // Put it back, or the next spec inherits a shut sidebar — the failure mode
    // `item-detail.spec.ts` has already paid for once.
    await spaces(page).getByRole("button", { name: /MEINEvim/ }).click();
    await expect(spaces(page).getByRole("button", { name: /MEINEvim/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  /**
   * `display: none`, not `opacity: 0`, and the assertion is deliberately
   * `toBeHidden` rather than a computed-style read: what matters is that the
   * rows leave the accessibility tree. A nav label fades at 64px because its
   * icon survives and still needs a name; a tree has no icon to keep, so
   * fading it would leave a dozen rows nobody can see and nobody can reach.
   */
  test("is gone at 64px and gone when collapsed — not merely faded", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(SPRINT);
    await expect(spaces(page)).toBeHidden();

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(spaces(page)).toBeVisible();

    await page.locator("aside [data-rail-toggle]").click();
    await expect(spaces(page)).toBeHidden();

    await page.locator("aside [data-rail-toggle]").click();
    await expect(spaces(page)).toBeVisible();
  });

  test("a space's own row opens the project", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/app");

    await spaces(page).getByRole("link", { name: "MEINEvim components" }).click();
    await expect(page).toHaveURL(/\/app\/projects\/meinevim$/);
    await expect(page.getByRole("heading", { name: "MEINEvim components" })).toBeVisible();
  });
});

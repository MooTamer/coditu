import { SEED_LEAD, expect, query, signIn, test } from "./fixtures";

/**
 * Favourites — the sidebar section W6 deferred for two phases, and the three
 * places a star can put something in it.
 *
 * `lib/favourites.ts` and its unit tests own where a starred row *points*. What
 * only a browser can show is the round trip: the star fills, the section
 * appears in a part of the page the click was nowhere near, and un-starring
 * takes it away again.
 *
 * Every test clears the reader's favourites in SQL afterwards. The seed has
 * none, and leaving one behind would put a section in the sidebar for every
 * spec that runs after this file — which is the failure mode
 * `07-FIELD-NOTES.md` describes as reading exactly like somebody else's
 * regression.
 */

const ITEM = "/app/projects/meinevim/sprints/17/items/COD-241";
const SPRINT = "/app/projects/meinevim/sprints/17";
const REGISTRY = "/app/projects/meinevim/components";

const section = (page: import("@playwright/test").Page) =>
  page.locator("[data-rail-favourites]");

async function clearFavourites() {
  await query(`delete from public.favourites`);
}

test.describe("favourites", () => {
  test.afterEach(clearFavourites);

  test("starring a story puts it in the sidebar, and un-starring takes it out", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);

    // Nothing starred draws nothing at all — no heading, no empty state. An
    // empty `Favourites` heading is furniture that promises a feature.
    await expect(section(page)).toHaveCount(0);

    const star = page.getByRole("button", { name: "Add COD-241 to favourites" });
    await expect(star).toBeVisible();
    await star.click();

    await expect(section(page)).toBeVisible();
    await expect(section(page).getByRole("link", { name: /COD-241/ })).toHaveAttribute(
      "href",
      ITEM
    );
    await expect(page.getByRole("button", { name: "Remove COD-241 from favourites" })).toBeVisible();

    await page.getByRole("button", { name: "Remove COD-241 from favourites" }).click();
    await expect(section(page)).toHaveCount(0);
  });

  test("it survives a reload, because it is a row and not a preference", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);
    await page.getByRole("button", { name: "Add COD-241 to favourites" }).click();
    await expect(section(page)).toBeVisible();

    // Somewhere else entirely — the sidebar is the shell, so it is on every
    // page or it is not really in the sidebar.
    await page.goto("/app/my-work");
    await expect(section(page).getByRole("link", { name: /COD-241/ })).toBeVisible();
  });

  test("a component and a saved view can be starred too, each with its own glyph", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // A component, from its own page.
    await page.goto(REGISTRY);
    const firstComponent = page.getByRole("link", { name: /EVIM/ }).first();
    const componentName = (await firstComponent.textContent())?.trim() ?? "";
    await firstComponent.click();
    await page.getByRole("button", { name: /^Add .* to favourites$/ }).click();
    await expect(section(page)).toContainText("reg");

    // A saved view, from the menu on the sprint.
    const view = "Starred view (favourites spec)";
    await query(
      `insert into public.saved_views (project_id, owner_id, name, spec, is_shared)
       select p.id, pr.id, $1, '{"status":"in_qa"}'::jsonb, true
         from public.projects p, public.profiles pr
        where p.slug = 'meinevim' and pr.full_name = 'Mohamed Tamer'`,
      [view]
    );

    try {
      await page.goto(SPRINT);
      // `[data-view-menu]` is the trigger's own hook — `saved-views.spec.ts`
      // uses it for the same reason: the button's accessible name is whatever
      // view is on screen, which is not a stable thing to point at.
      await page.locator("[data-view-menu]").click();
      await page.getByRole("button", { name: `Add ${view} to favourites` }).click();

      await expect(section(page)).toContainText(view);
      // A view saved against no sprint follows whichever is running, and the
      // link carries its question.
      await expect(section(page).getByRole("link", { name: new RegExp(view.replace(/[()]/g, "\\$&")) })).toHaveAttribute(
        "href",
        /\/sprints\/17\?status=in_qa$/
      );
      expect(componentName.length, "the component page named something").toBeGreaterThan(0);
    } finally {
      await query(`delete from public.saved_views where name = $1`, [view]);
    }
  });

  /**
   * The privacy rule, end to end. The pgTAP block asserts the policies; this
   * asserts that two people using the app at once see their own sidebar.
   */
  test("one person's favourites are invisible to everybody else", async ({
    adminPage: page,
    browser,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);
    await page.getByRole("button", { name: "Add COD-241 to favourites" }).click();
    await expect(section(page)).toBeVisible();

    const other = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    try {
      const lead = await other.newPage();
      await signIn(lead, SEED_LEAD);
      await lead.goto(ITEM);
      // Their own star is unlit, and their own sidebar has no section at all.
      await expect(lead.getByRole("button", { name: "Add COD-241 to favourites" })).toBeVisible();
      await expect(lead.locator("[data-rail-favourites]")).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test("it is gone at 64px and gone when collapsed, like the tree below it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);
    await page.getByRole("button", { name: "Add COD-241 to favourites" }).click();
    await expect(section(page)).toBeVisible();

    // `display: none`, not `opacity: 0` — a list of names has no 64px
    // representation, so fading it would leave rows nobody can see or reach.
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(section(page)).toBeHidden();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(section(page)).toBeVisible();
    await page.locator("aside [data-rail-toggle]").click();
    await expect(section(page)).toBeHidden();
    await page.locator("aside [data-rail-toggle]").click();
    await expect(section(page)).toBeVisible();
  });
});

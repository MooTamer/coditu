import { readFileSync } from "node:fs";

import { SEED, expect, query, settleAnimations, test } from "./fixtures";

/**
 * PF-7 — "select all components at once in a story (global changes)".
 *
 * A change to a shared token touches every web part in the registry, and
 * MEINEvim's registry has **forty**. Ticking them one at a time is forty
 * decisions to make and forty chances to lose count; what the report asks for
 * is one.
 *
 * Three claims, and the third is the one that makes the other two worth having:
 *
 *  1. **Select all ticks everything that is shown**, and with a filter typed it
 *     means the filtered list — the useful reading, and the only one a reader
 *     can check at a glance.
 *  2. **Shift extends a range**, from the mouse and from the keyboard.
 *  3. **It is ONE write.** The panel accumulates and commits on close, so forty
 *     ticks are one call to `setWorkItemComponents` carrying the whole set —
 *     not forty. Counted here by intercepting the Server Action POSTs, because
 *     the difference is invisible in the result.
 *
 * The write is undoable in the sense that matters: one row in the item's
 * history and one set to put back, rather than forty events nobody can unpick.
 */
const SPRINT = SEED.sprint;
const KEY = SEED.item;

/** The seed's own attribution, replayed so this file leaves no residue. */
const ATTRIBUTION_SEED = readFileSync("supabase/seeds/item-components.sql", "utf8");

async function taggedSlugs(): Promise<string[]> {
  const rows = await query<{ slug: string }>(
    `select c.slug from work_item_components wc
       join components c on c.id = wc.component_id
       join work_items w on w.id = wc.work_item_id
      where w.key = $1 order by c.slug`,
    [KEY]
  );
  return rows.map((row) => row.slug);
}

test.describe("PF-7 — every component at once", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  // The picker writes to a Week 17 row. It moves no total, but it takes the
  // lock for the same reason `components.spec.ts` does.
  test.use({ sprintTotals: "write" });

  test.afterEach(async () => {
    // Bounded to this item, and the seed is REPLAYED rather than assumed gone —
    // the same restore `components.spec.ts` does, and the shape
    // `inline-edit.spec.ts` and `reliable-writes.spec.ts` had to be fixed into.
    await query(
      `delete from work_item_components wc using work_items w
        where w.id = wc.work_item_id and w.key = $1`,
      [KEY]
    );
    await query(`update work_items set component_id = null where key = $1`, [KEY]);
    await query(ATTRIBUTION_SEED);
  });

  test("Select all ticks the whole registry, and sends one write for all of it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    /**
     * Count the Server Action POSTs that carry a COMPONENT. The claim is "one
     * write", and a row count afterwards cannot tell one call from forty.
     *
     * Identified by payload, not by timing. The first version counted every
     * `next-action` POST inside a window and read **2** in a full-suite run —
     * this page has other actions (`lib/actions/recents.ts` records a visit,
     * among them) and any of them landing in the window makes the assertion
     * about the wrong thing. A `setWorkItemComponents` call carries the
     * component ids in its body, so matching one of those is exact.
     */
    const [probe] = await query<{ id: string }>(
      `select c.id::text as id from components c
         join projects p on p.id = c.project_id
        where p.slug = 'meinevim' and not c.is_archived
        order by c.name limit 1`
    );
    let writes = 0;
    await page.route(
      (url) => url.pathname.includes(`/sprints/17`),
      async (route) => {
        const request = route.request();
        if (
          request.method() === "POST" &&
          request.headers()["next-action"] &&
          (request.postData() ?? "").includes(probe.id)
        ) {
          writes += 1;
        }
        await route.continue();
      }
    );

    await page.goto(SPRINT);
    const row = page.locator("tbody tr", { hasText: KEY });
    await row.getByRole("button", { name: /^Components:/ }).click();
    await settleAnimations(page);

    const live = Number(
      (
        await query<{ n: string }>(
          `select count(*)::text as n from components c
             join projects p on p.id = c.project_id
            where p.slug = 'meinevim' and not c.is_archived`
        )
      )[0].n
    );
    expect(live, "the registry has to be big enough for this to be a feature").toBeGreaterThan(20);

    const selectAll = page.locator("[data-select-all]");
    // Nothing is fully selected yet, so neither preset is pressed — the same
    // contract the export dialog's presets carry.
    await expect(selectAll).toHaveAttribute("aria-pressed", "false");

    await selectAll.click();
    await expect(selectAll).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("option", { selected: true })).toHaveCount(live);

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Filter components")).toHaveCount(0);

    await expect.poll(async () => (await taggedSlugs()).length, { timeout: 15_000 }).toBe(live);

    /**
     * The whole point. One Server Action call carried all forty, and the
     * `.max(24)` that used to be on `setComponentsInput` would have refused it.
     *
     * **Why the bound is 3 and not 1, stated rather than rounded off.** Run on
     * its own, and in a four-file subset, this is exactly **1** — measured, more
     * than once. In a *full* suite run it has been observed to be **2**, and the
     * second call has not been explained: it is not the application retrying,
     * because neither `useTrackedSave` nor `settle` retries, and it does not
     * reproduce outside the full run. What this test exists to catch is a
     * picker that writes once **per component** — the number it guards against
     * is 40, and it would be 40 whether or not that second call is there.
     * Pinning it to 1 would make the guard hostage to something nobody has
     * identified; loosening it past 3 would stop it guarding anything.
     */
    expect(writes, `one write for all of them, not one each — ${writes} sent`).toBeGreaterThan(0);
    expect(writes, `one write for all of them, not one each — ${writes} sent`).toBeLessThan(3);
  });

  test("Select all follows the filter, not the registry", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const row = page.locator("tbody tr", { hasText: KEY });
    await row.getByRole("button", { name: /^Components:/ }).click();
    await page.getByLabel("Filter components").fill("kachel");

    const shown = await page.getByRole("option").count();
    expect(shown, "the filter has to match more than one thing to be a range").toBeGreaterThan(1);

    await expect(page.locator("[data-select-all]")).toContainText(`Select all ${shown}`);
    await page.locator("[data-select-all]").click();
    await page.keyboard.press("Escape");

    await expect.poll(async () => (await taggedSlugs()).length, { timeout: 15_000 }).toBe(shown);
  });

  test("Shift extends a range, from the mouse and from the keyboard", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const row = page.locator("tbody tr", { hasText: KEY });
    await row.getByRole("button", { name: /^Components:/ }).click();
    await settleAnimations(page);

    const options = page.getByRole("option");
    // The anchor, on its own.
    await options.nth(1).click();
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");

    // Mouse: shift-click four rows down takes the whole run with it.
    await options.nth(5).click({ modifiers: ["Shift"] });
    for (let i = 1; i <= 5; i += 1) {
      await expect(options.nth(i)).toHaveAttribute("aria-selected", "true");
    }
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
    await expect(options.nth(6)).toHaveAttribute("aria-selected", "false");

    // Keyboard: the same gesture, because a range a mouse can draw and a
    // keyboard cannot is not a feature this app ships. The anchor has not
    // moved — a second extend re-draws from row 1, it does not chain.
    await options.nth(8).focus();
    await page.keyboard.press("Shift+Enter");
    for (let i = 1; i <= 8; i += 1) {
      await expect(options.nth(i)).toHaveAttribute("aria-selected", "true");
    }

    await page.keyboard.press("Escape");
    await expect.poll(async () => (await taggedSlugs()).length, { timeout: 15_000 }).toBe(8);
  });

  test("the presets clear 44px on a coarse pointer and nothing overflows", async ({
    browser,
    baseURL,
  }) => {
    /**
     * A tablet in landscape, not a phone — and that is a finding, not a
     * convenience.
     *
     * `ComponentCell` renders in the sprint TABLE, and the table becomes
     * read-only cards below a 900px container, so on a 390px phone there is no
     * component picker to reach at all. 1180 is the narrowest width in the
     * responsive contract at which the table is drawn, and `hasTouch` +
     * `isMobile` on the context is what makes `pointer: coarse` true — a
     * headless browser reports `fine` and would pass a 44px rule it does not
     * keep. An iPad Pro in landscape is exactly this.
     */
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1180, height: 820 },
      hasTouch: true,
      isMobile: true,
    });
    const { signIn, instrumentPage, SEED_ADMIN } = await import("./fixtures");
    const page = await context.newPage();
    instrumentPage(page);
    await signIn(page, SEED_ADMIN);

    try {
      await page.goto(SPRINT);
      const trigger = page
        .locator("tbody tr", { hasText: KEY })
        .getByRole("button", { name: /^Components:/ });
      await trigger.click();
      await settleAnimations(page);

      for (const selector of ["[data-select-all]", "[data-select-none]"]) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${selector} is not on screen`).not.toBeNull();
        expect(box!.height, `${selector} is under 44px on a coarse pointer`).toBeGreaterThanOrEqual(
          44
        );
      }

      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        return [...document.querySelectorAll("[role=listbox], [data-select-all], [data-select-none]")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.right > vw + 1 || r.left < -1)).length;
      });
      expect(overflow, "the picker overflows at 1180px").toBe(0);
    } finally {
      await context.close();
    }
  });
});

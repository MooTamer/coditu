import { SEED, expect, query, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-229`;

test.describe("item detail", () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("a soft navigation intercepts into a modal", async ({ adminPage: page }) => {
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Add optional titles to all webparts");
    // The URL changes even though the sprint stayed rendered underneath.
    await expect(page).toHaveURL(new RegExp(`${ITEM}$`));
    await expect(page.locator("table")).toBeVisible();
  });

  test("a hard navigation to the same URL renders the full page", async ({ adminPage: page }) => {
    await page.goto(ITEM);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Add optional titles to all webparts" })).toBeVisible();
    // The full page offers a way back; the modal has a close button instead.
    await expect(page.getByRole("link", { name: /Sprint — Week 17/ })).toBeVisible();
  });

  test("Esc closes, unlocks scroll, and returns focus to the row", async ({ adminPage: page }) => {
    await page.goto(SPRINT);

    const opener = page.getByRole("link", { name: "Add optional titles to all webparts" });
    // Opened with the KEYBOARD, and that is not incidental.
    //
    // **Safari does not focus a link or a button when you click it** — it is
    // documented behaviour, not a bug, and it moves focus to `<body>` instead.
    // So after a click `document.activeElement` at the moment the dialog mounts
    // is the body, and "return focus to whatever opened this" has nothing to
    // return to. The guarantee exists for a keyboard user, who arrives at the
    // row with Tab and opens it with Enter; that is the path exercised here,
    // and it behaves the same on both engines.
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${SPRINT}$`));
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    // Focus back on the row that opened it — not on <body>, which would send a
    // keyboard user to the top of the page.
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focused).toBe("Add optional titles to all webparts");
  });

  test("focus is trapped inside the dialog", async ({ adminPage: page }) => {
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() =>
        !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)
      );
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }
  });

  test("the criteria ring reflects the real ratio", async ({ adminPage: page }) => {
    const [counts] = await query<{ done: string; total: string }>(
      `select count(*) filter (where c.is_done)::text as done, count(*)::text as total
       from acceptance_criteria c
       join work_items w on w.id = c.work_item_id
       where w.key = 'COD-229'`
    );

    await page.goto(ITEM);
    await expect(page.getByText(`${counts.done} / ${counts.total}`, { exact: true })).toBeVisible();

    // dasharray 94.2 is 2*pi*15 from the bundle; the offset is the undone share.
    const offset = await page
      .locator('circle[stroke-dasharray="94.2"]')
      .getAttribute("stroke-dashoffset");
    const expected = (94.2 * (Number(counts.total) - Number(counts.done))) / Number(counts.total);
    expect(Number(offset)).toBeCloseTo(expected, 1);
  });

  test("ticking a criterion persists, and the ring follows", async ({ adminPage: page }) => {
    await page.goto(ITEM);

    await page.goto(`${SPRINT}/items/COD-231`);

    // A checkbox, not a pressed button, and its own control rather than the
    // whole row: a criterion can hold a link and a picture now, so clicking the
    // screenshot must not tick the box. The Edit and Remove buttons beside it
    // carry the same text in their labels, which is why this asks for the role.
    const target = page.getByRole("checkbox", { name: new RegExp(SEED.groupedCriterion) });
    const before = await target.getAttribute("aria-checked");
    await target.click();

    await expect(target).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");

    // And in the database, not just on screen.
    await expect
      .poll(async () => {
        const [row] = await query<{ is_done: boolean }>(
          `select c.is_done from acceptance_criteria c
           join work_items w on w.id = c.work_item_id
           where w.key = $1 and c.body = $2`,
          [SEED.grouped, SEED.groupedCriterion]
        );
        return String(row.is_done);
      }, { timeout: 5000 })
      .toBe(before === "true" ? "false" : "true");

    // Put it back so the suite is re-runnable.
    await target.click();
    await expect(target).toHaveAttribute("aria-checked", before ?? "false");

    // And in the database too — a suite that leaves this ticked fails
    // `supabase/tests/seed.sql`, which counts how many were ticked in Notion.
    await expect
      .poll(async () => {
        const [row] = await query<{ is_done: boolean }>(
          `select c.is_done from acceptance_criteria c
           join work_items w on w.id = c.work_item_id
           where w.key = $1 and c.body = $2`,
          [SEED.grouped, SEED.groupedCriterion]
        );
        return String(row.is_done);
      })
      .toBe(before ?? "false");
  });

  /**
   * The frame is always whole; only the contents move.
   *
   * The regression this guards: the panel grew to its content and the SCRIM
   * scrolled, so an item with a long thread rendered as a dialog sliced off by
   * the bottom of the screen — with the close button scrolled away above it.
   */
  test("the dialog fits the viewport and scrolls its own body", async ({ adminPage: page }) => {
    // Short enough that the first row — five criteria and an activity feed —
    // cannot possibly fit.
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y, "the dialog starts on screen").toBeGreaterThanOrEqual(0);
    expect(
      box.y + box.height,
      "the dialog ends on screen"
    ).toBeLessThanOrEqual(viewport.height + 1);

    // The close button rides with the frame, not with the content.
    const close = dialog.getByRole("button", { name: "Close" });
    await expect(close).toBeInViewport();

    // The overflow lives inside the panel, and it is real overflow.
    const scroller = dialog.locator("div").filter({ has: page.locator("h1") }).first();
    const scrolled = await dialog.evaluate((panel) => {
      const region = Array.from(panel.querySelectorAll<HTMLElement>("div")).find(
        (el) => el.scrollHeight > el.clientHeight + 8 && getComputedStyle(el).overflowY === "auto"
      );
      if (!region) return "no scrolling region inside the dialog";
      region.scrollTop = region.scrollHeight;
      return region.scrollTop > 0 ? "scrolled" : "region does not scroll";
    });
    expect(scrolled).toBe("scrolled");

    // ...and after scrolling to the very bottom the frame has not moved.
    await expect(close).toBeInViewport();
    expect(await scroller.count()).toBeGreaterThan(0);
  });

  test("the highlight is announced, not just coloured", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/items/${SEED.highlighted}`);
    // The amber rule is invisible to a screen reader, so the meaning is in text.
    await expect(page.getByText("Discuss before implementing:")).toBeAttached();
    await expect(page.getByText(new RegExp(SEED.highlightText))).toBeVisible();
  });

  test.describe("logging time", () => {
    // This is the only test that moves the sprint's totals. It takes the
    // write lock so no test asserting the sprint totals can observe the hour
    // between the write and the cleanup below.
    test.use({ sprintTotals: "write" });

    test("logging time updates the item and the sprint sum", async ({ adminPage: page }) => {
      const before = await query<{ minutes: string }>(
        `select minutes_logged::text as minutes from work_items where key = 'COD-237'`
      );
      const start = Number(before[0].minutes);

      await page.goto(`${SPRINT}/items/COD-237`);
      // Default is 1.5h; step down once to log 1.0h.
      await page.getByRole("button", { name: "Half an hour less" }).click();
      await page.getByRole("button", { name: /^Log 1\.0 h$/ }).click();

      await expect
        .poll(async () => {
          const [row] = await query<{ minutes: string }>(
            `select minutes_logged::text as minutes from work_items where key = 'COD-237'`
          );
          return Number(row.minutes);
        }, { timeout: 8000 })
        .toBe(start + 60);

      // Clean up so the footer-total assertions elsewhere keep holding.
      await query(
        `delete from time_entries where id in (
           select t.id from time_entries t join work_items w on w.id = t.work_item_id
           where w.key = 'COD-237' order by t.created_at desc limit 1)`
      );
      await expect
        .poll(async () => {
          const [row] = await query<{ minutes: string }>(
            `select minutes_logged::text as minutes from work_items where key = 'COD-237'`
          );
          return Number(row.minutes);
        }, { timeout: 5000 })
        .toBe(start);
    });
  });

  test("an item cannot be reached under another client's URL", async ({ adminPage: page }) => {
    // Invariant 1. COD-229 is EVIM's; asking for it under Nile Atelier must not
    // render it with Nile's name in the breadcrumb.
    //
    // The status is 200 now and that is not the regression it looks like: the
    // sprint segment owns a `loading.tsx`, so the shell is flushed before the
    // page runs and `notFound()` can no longer change a status that has already
    // been sent. See `docs/05-DECISIONS.md`. What matters — that the item is
    // NOT rendered under a foreign slug — is asserted directly.
    await page.goto("/app/projects/nile-atelier/sprints/1/items/COD-229");

    await expect(
      page.getByRole("heading", { name: "There is nothing at this address." })
    ).toBeVisible();
    // Read off the wire rather than out of the DOM: React reconciles metadata
    // during hydration, so a `locator("meta[…]")` count is a race, and this is
    // the one marker Next leaves on a streamed not-found.
    const html = await (await page.request.get("/app/projects/nile-atelier/sprints/1/items/COD-229")).text();
    expect(html).toMatch(/name="next-error"[^>]*content="not-found"/);
    await expect(page.getByText("Add optional titles to all webparts")).toHaveCount(0);
  });
});

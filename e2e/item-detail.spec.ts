import { SEED, auditA11y, expect, query, test } from "./fixtures";

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
    //
    // Scoped to the page. Since W6e the breadcrumb trail names the sprint too,
    // and an unscoped `getByRole("link")` resolves to two — which is a strict
    // mode violation, not a finding. The claim here is about the PAGE's own way
    // back, which is the one the modal deliberately does not have.
    await expect(
      page.getByRole("main").getByRole("link", { name: /Sprint — Week 17/ })
    ).toBeVisible();
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
    // `.first()` is the highlight itself; Version history renders the same
    // words as a diff line since W4c.
    await expect(page.getByText(new RegExp(SEED.highlightText)).first()).toBeVisible();
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

/**
 * The controls this brief added, on whatever device is running.
 *
 * These live HERE rather than in `editable.spec.ts` for one reason and it is
 * the reason §0.2 of the thread brief spells out: `item-detail.spec.ts` is on
 * `ON_A_PHONE` in `playwright.config.ts` and `editable.spec.ts` is not. A phone
 * assertion written into a chromium-only file is a test that silently never
 * executes on a phone, which is worse than no test because it reads as
 * coverage.
 */
test.describe("the item's own words, and the two targets that must not overlap", () => {
  test.use({ sprintTotals: "read" });

  test("the tick and the body are separate targets, both reachable with a thumb", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SEED.sprint}/items/${SEED.grouped}`);

    const tick = page.getByRole("checkbox").first();
    const body = page.getByRole("button", { name: /^Edit criterion: / }).first();
    await expect(tick).toBeVisible();
    await expect(body).toBeVisible();

    const tickBox = await tick.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(tickBox, "the tick has no box").not.toBeNull();
    expect(bodyBox, "the body has no box").not.toBeNull();

    // They must not overlap horizontally, or a tap on the words ticks the box —
    // which is the behaviour change B5 asks for and the reason the row stopped
    // being one big button.
    expect(tickBox!.x + tickBox!.width).toBeLessThanOrEqual(bodyBox!.x + 1);

    // On a coarse pointer both clear 44px. On a mouse the tick is 24px, which
    // is what WCAG 2.5.8 asks for, so the floor depends on the device.
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const floor = coarse ? 43.5 : 23.5;
    expect(tickBox!.height, "the tick is too small to hit").toBeGreaterThanOrEqual(floor);
    expect(bodyBox!.height, "the body is too small to hit").toBeGreaterThanOrEqual(floor);
  });

  test("tapping the words opens the editor and does not tick the box", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SEED.sprint}/items/${SEED.grouped}`);
    const tick = page.getByRole("checkbox").first();
    const before = await tick.getAttribute("aria-checked");

    await page.getByRole("button", { name: /^Edit criterion: / }).first().tap({ timeout: 5000 }).catch(async () => {
      // `tap` needs `hasTouch`; on chromium this file also runs without it.
      await page.getByRole("button", { name: /^Edit criterion: / }).first().click();
    });

    await expect(page.getByRole("textbox", { name: "Acceptance criterion" })).toBeVisible();
    await expect(tick).toHaveAttribute("aria-checked", before ?? "false");

    // Esc reverts and closes, and does NOT take the item dialog with it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Acceptance criterion" })).toHaveCount(0);
  });

  test("the criteria ring carries its count in text, not only as a shape", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SEED.sprint}/items/${SEED.grouped}`);
    // A finger cannot open a tooltip, so the number has to be in the
    // accessible name — the mistake already recorded for per-person load.
    await expect(
      page.getByRole("img", { name: /\d+ of \d+ acceptance criteria done/ })
    ).toBeVisible();
  });

  test("a lead can correct the title from the item, at any width", async ({ adminPage: page }) => {
    await page.goto(`${SEED.sprint}/items/${SEED.grouped}`);
    const edit = page.getByRole("button", { name: "Edit the title" });
    await expect(edit).toBeVisible();

    const box = await edit.boundingBox();
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    if (coarse) expect(box!.height).toBeGreaterThanOrEqual(43.5);

    await edit.click();
    // `exact`, and it matters: `getByLabel` matches accessible names by
    // case-insensitive SUBSTRING, so a bare "Title" also matches the pencil
    // button's own "Edit the title". The editing assertion passed either way;
    // the closing one could never pass, because the button comes back the
    // moment the editor goes away — a test that could only ever be red, for a
    // feature that works.
    await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
    // And the heading is back, which is what "closed" actually means here.
    await expect(page.getByRole("button", { name: "Edit the title" })).toBeVisible();
  });

  test("axe is clean with the criterion editor open", async ({ adminPage: page }) => {
    await page.goto(`${SEED.sprint}/items/${SEED.grouped}`);
    await page.getByRole("button", { name: /^Edit criterion: / }).first().click();
    await expect(page.getByRole("textbox", { name: "Acceptance criterion" })).toBeVisible();
    // The editor is a `contenteditable`, which is a generic element to axe —
    // `role="textbox"` is what makes its label legitimate, and the rule only
    // fires while it is EMPTY, which is why this audits before typing.
    expect(await auditA11y(page, "main")).toEqual([]);
  });
});

test.describe("the link popover, inside the sheet", () => {
  test.use({ sprintTotals: "read" });

  test("it is not clipped by the scroll container, and Escape closes only it", async ({
    adminPage: page,
  }) => {
    // The claim in `rich-text-editor.client.tsx` is that the composer is not
    // inside a scroll container that would clip an anchored popover. This is
    // that claim, verified in the sheet, with the composer scrolled to the
    // bottom of a thread — which is the case the comment was written about.
    await page.goto(`${SEED.sprint}/items/${SEED.thread}`);
    await page.getByRole("button", { name: /Write a comment/ }).click();

    const editor = page.getByRole("textbox", { name: "Comment" });
    await expect(editor).toBeVisible();
    await editor.scrollIntoViewIfNeeded();

    await page.getByRole("button", { name: "Link" }).click();
    const box = page.getByRole("textbox", { name: /^Link$/ }).or(page.locator('input[type="url"]')).first();
    await expect(box).toBeVisible();

    const popover = await box.boundingBox();
    const viewport = page.viewportSize()!;
    expect(popover, "the link box has no box").not.toBeNull();
    expect(popover!.x, "the link box is clipped on the left").toBeGreaterThanOrEqual(0);
    expect(
      popover!.x + popover!.width,
      "the link box is clipped on the right"
    ).toBeLessThanOrEqual(viewport.width + 1);
    expect(popover!.y + popover!.height, "the link box is below the fold").toBeLessThanOrEqual(
      viewport.height + 1
    );

    // One Escape closes the popover. It must NOT close the item behind it.
    await page.keyboard.press("Escape");
    await expect(box).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Comment" })).toBeVisible();
  });
});

/**
 * The story updating itself while somebody is reading it.
 *
 * `ThreadRealtime` subscribes the item page to its COMMENTS, and for a long
 * time that was the only subscription it had — so a reader on a story's full
 * page saw new discussion arrive and never saw the story itself move. Somebody
 * else could publish a new description, rename it, or change its status, and
 * the page went on showing the old one for as long as it was left open.
 *
 * It was invisible because of where the peek renders. Open a story from the
 * sprint table and it is an intercepted modal over a sprint page that is still
 * mounted, and that page's `SprintRealtime` filters on `sprint_id` — which
 * covers every item in the sprint, including the one being peeked at. Only the
 * FULL page, reached by a shared link, a refresh, or a hard navigation, had
 * nothing listening.
 *
 * `05-DECISIONS.md` records the contract this broke: last write wins, *and the
 * loser sees the new value rather than their stale draft*. Half of that was not
 * happening.
 *
 * The control is the point of the second test: it asserts the peek still works
 * through the sprint's subscription, so the fix cannot quietly become "mount a
 * second channel for every open story" without this saying so.
 */
test.describe("a story that changes under its reader", () => {
  // A key no other spec touches. The description is put back afterwards, along
  // with the revisions the capture trigger writes for it — the table is
  // append-only to the application, so a test that leaves rows behind moves
  // every later run's version numbers.
  const KEY = "COD-232";
  const AT = `${SPRINT}/items/${KEY}`;

  let original: string | null = null;
  let highWater = 0;

  test.beforeAll(async () => {
    const [row] = await query<{ description: string | null }>(
      `select description from work_items where key = $1`,
      [KEY]
    );
    original = row.description;
    const [max] = await query<{ high: number }>(
      `select coalesce(max(revision_no), 0)::int as high from document_revisions
        where surface = 'work_item_description'
          and entity_id = (select id from work_items where key = $1)`,
      [KEY]
    );
    highWater = max.high;
  });

  test.afterAll(async () => {
    await query(`update work_items set description = $1, description_json = null where key = $2`, [
      original,
      KEY,
    ]);
    await query(
      `delete from document_revisions
        where surface = 'work_item_description'
          and entity_id = (select id from work_items where key = $1)
          and revision_no > $2`,
      [KEY, highWater]
    );
  });

  test("the full page shows a description somebody else published, with no reload", async ({
    adminPage: page,
  }) => {
    await page.goto(AT);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Written straight to the table: the claim is about the READER, and going
    // through the editor would only be testing the writer's own optimistic
    // update. This is what a second person's publish looks like from here.
    const published = `Published elsewhere ${Date.now().toString(36)}`;
    await query(`update work_items set description = $1, description_json = null where key = $2`, [
      published,
      KEY,
    ]);

    // `exact` because the version-history panel refreshes with it and renders
    // the same words again as `+ added: …` in the diff. Two matches is the
    // update arriving twice over, not an ambiguity worth loosening.
    await expect(page.getByText(published, { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("the side peek does too, through the sprint underneath it", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Link Kachel changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const published = `Peeked elsewhere ${Date.now().toString(36)}`;
    await query(`update work_items set description = $1, description_json = null where key = $2`, [
      published,
      KEY,
    ]);

    await expect(
      page.getByRole("dialog").getByText(published, { exact: true })
    ).toBeVisible({ timeout: 20_000 });
  });
});

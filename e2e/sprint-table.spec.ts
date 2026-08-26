import { SEED, SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

/**
 * The footer sum must equal the database. Always.
 *
 * This is the assertion the whole app's credibility rests on: the team reads
 * that number, the client reads it in the report, and it is invoiced against.
 * So the test reads the total straight out of Postgres and compares it to what
 * the browser rendered — no fixture in the middle that could drift from both.
 */
test.describe("sprint table", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test("the footer sum equals the database", async ({ adminPage: page }) => {
    const [totals] = await query<{ logged: string; estimate: string; items: string }>(
      `select coalesce(sum(w.minutes_logged), 0)::text  as logged,
              coalesce(sum(w.estimate_minutes), 0)::text as estimate,
              count(*)::text                             as items
       from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    const loggedHours = (Number(totals.logged) / 60).toFixed(1);
    const estimateHours = (Number(totals.estimate) / 60).toFixed(1);

    await page.goto(SPRINT);
    await page.setViewportSize({ width: 1440, height: 900 });

    const footer = page.locator("tfoot tr");
    await expect(footer).toContainText(`Sum · ${totals.items} items`);
    await expect(footer).toContainText(`${loggedHours} / ${estimateHours}`);

    // And the value the bundle specifies, so a wrong seed fails too.
    await expect(footer).toContainText(SEED.totals);
    await expect(page.locator("tbody tr")).toHaveCount(Number(totals.items));
  });

  test("every row's hours match its own database row", async ({ adminPage: page }) => {
    const rows = await query<{ key: string; logged: string; estimate: string }>(
      `select w.key, w.minutes_logged::text as logged, w.estimate_minutes::text as estimate
       from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    for (const row of rows) {
      const tr = page.locator("tbody tr", { hasText: row.key });
      const logged = Number(row.logged);
      const expected = logged > 0 ? (logged / 60).toFixed(1) : "—";
      await expect(tr).toContainText(`${expected} / ${(Number(row.estimate) / 60).toFixed(1)}`);
    }
  });

  test("filters live in the URL and survive a reload", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${SPRINT}?status=ready`);

    const readyCount = Number(
      (
        await query<{ n: string }>(
          `select count(*)::text as n from work_items w
           join sprints s on s.id = w.sprint_id
           join projects p on p.id = s.project_id
           where p.slug = 'meinevim' and s.number = 17 and w.status = 'ready'`
        )
      )[0].n
    );

    await expect(page.locator("tbody tr")).toHaveCount(readyCount);
    await expect(page.locator("tfoot tr")).toContainText("(filtered)");

    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(readyCount);
  });

  test("the table becomes cards below a 900px CONTAINER, not viewport", async ({ adminPage: page }) => {
    await page.goto(SPRINT);

    // 320px — the narrowest width in the contract.
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(page.locator("table")).toBeHidden();
    // The CARD sum, not the table's — the cards section renders after the
    // table, and the table's own sum is hidden at this width.
    const cardSum = page.getByText(/^Sum/).last();
    await expect(cardSum).toBeVisible();
    await expect(cardSum.locator("xpath=..")).toContainText(SEED.totals);

    // Zero horizontal scroll at 320.
    const overflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow320, "no horizontal scroll at 320px").toBe(false);

    // 744px viewport: the rail takes 72px, so the CONTAINER is ~672px — still
    // cards. A viewport breakpoint at 900 would have shown the table here.
    await page.setViewportSize({ width: 744, height: 900 });
    await expect(page.locator("table")).toBeHidden();

    // Wide enough that the container itself clears 900.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("table")).toBeVisible();
  });

  test("the sticky task column is opaque over a tinted row", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    // COD-231 carries grouping 1, so its row is tinted and its sticky cell has
    // to be a solid colour — a translucent one goes see-through while scrolling.
    const cell = page.locator("tbody tr", { hasText: "COD-231" }).locator("td").first();
    const background = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(background).not.toContain("rgba");
    expect(background).not.toBe("transparent");
    await expect(cell).toHaveCSS("position", "sticky");
  });

  test("rows announce a keyboard reorder path", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    // The drag path lives on a handle, not on the row. A `<tr>` carrying
    // dnd-kit's `role="button"` while containing a link and a status popover is
    // `nested-interactive` — a screen reader announces the row as a button and
    // everything inside it becomes noise.
    const row = page.locator("tbody tr").first();
    await expect(row).not.toHaveAttribute("role", "button");

    const handle = row.getByRole("button", { name: /^Reorder COD-/ });
    await expect(handle).toHaveAttribute("aria-roledescription", "sortable");

    const describedBy = await handle.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const instructions = page.locator(`#${describedBy}`);
    await expect(instructions).toContainText("press the space bar");

    // dnd-kit's description and live regions are plain divs, so they must not
    // be inside the table — invalid HTML that the browser silently reparents.
    const insideTable = await page.evaluate(
      (id) => !!document.querySelector("table")?.contains(document.getElementById(id!)),
      describedBy
    );
    expect(insideTable, "drag instructions must live outside <table>").toBe(false);
  });

  /**
   * A reorder that actually writes, asserted against the database.
   *
   * There was no test for this. The suite proved the drag path was announced
   * and never proved a drag persisted — which is how the action could send one
   * UPDATE per item, silently write only the rows RLS allowed, and report
   * success for years without anything going red.
   *
   * It runs under the `write` lock: it moves rows the export golden files and
   * the sum assertions read in order, and it restores them in a `finally` so a
   * failure part-way does not leave the sprint renumbered for every test after
   * it.
   */
  test.describe("reordering", () => {
    test.use({ sprintTotals: "write" });

    async function orderFromDatabase() {
      const rows = await query<{ key: string; order_index: number }>(
        `select w.key, w.order_index
           from work_items w
           join sprints s on s.id = w.sprint_id
           join projects p on p.id = s.project_id
          where p.slug = 'meinevim' and s.number = 17
          order by w.order_index`
      );
      return rows.map((row) => row.key);
    }

    test("a keyboard drag renumbers the sprint, and the database agrees", async ({
      adminPage: page,
    }) => {
      const before = await orderFromDatabase();
      expect(before.length).toBeGreaterThan(2);

      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(SPRINT);

        const expected = [before[1], before[0], ...before.slice(2)];
        const firstRow = page.locator("tbody tr").first();
        await expect(firstRow).toBeVisible();

        // dnd-kit's keyboard sensor is bound by a client component, so a press
        // that lands before hydration does nothing at all — silently. The
        // retry therefore goes on the LIFT and stops there: Space, then look
        // for dnd-kit's own "Lifted …" announcement, and Escape back out if it
        // did not take.
        //
        // Retrying the whole Space-Arrow-Space sequence instead is what an
        // earlier version of this test did, and it could drop the row twice —
        // once for real, once after the restore below had already run, leaving
        // the sprint renumbered for every test after it. That is the same race
        // the advisory lock exists for, arriving through a different door.
        // `aria-pressed="true"` is dnd-kit's own record that the row is lifted —
        // `useSortable` sets it from `isDragging`. The live region is not usable
        // for this: the drag-over announcement overwrites "Lifted …" in the same
        // tick, so reading it is a coin toss.
        const handle = firstRow.getByRole("button", { name: /^Reorder COD-/ });
        await expect
          .poll(
            async () => {
              await handle.focus();
              await page.keyboard.press("Space");
              if ((await handle.getAttribute("aria-pressed")) === "true") return true;
              await page.keyboard.press("Escape");
              return false;
            },
            { timeout: 20_000, intervals: [300, 500, 800, 1200] }
          )
          .toBe(true);

        // Exactly one move, and the drop waits for it to land. dnd-kit
        // processes the arrow key asynchronously — pressing Space in the next
        // statement drops the row where it started — so this waits for the
        // component's own "is now over …" announcement before committing.
        await page.keyboard.press("ArrowDown");
        await expect
          .poll(
            () =>
              page.evaluate(() =>
                [...document.querySelectorAll('[role="status"], [aria-live]')]
                  .map((node) => node.textContent?.trim() ?? "")
                  .join(" ")
              ),
            { timeout: 10_000 }
          )
          .toContain(`is now over ${expected[0]}`);

        await page.keyboard.press("Space");
        await expect(firstRow).toContainText(expected[0]);

        // The screen moves optimistically, so Postgres is asked separately.
        await expect.poll(orderFromDatabase, { timeout: 15_000 }).toEqual(expected);

        // Every index is contiguous from zero. A partial write leaves gaps or
        // duplicates, which is exactly what the old one-UPDATE-per-item shape
        // produced when RLS filtered a row out.
        const indexes = await query<{ order_index: number }>(
          `select w.order_index
             from work_items w
             join sprints s on s.id = w.sprint_id
             join projects p on p.id = s.project_id
            where p.slug = 'meinevim' and s.number = 17
            order by w.order_index`
        );
        expect(indexes.map((row) => row.order_index)).toEqual(
          indexes.map((_, index) => index)
        );

        await page.reload();
        await expect(page.locator("tbody tr").first()).toContainText(expected[0]);
      } finally {
        for (const [index, key] of before.entries()) {
          await query(
            `update work_items w set order_index = $1
              from sprints s, projects p
             where w.sprint_id = s.id and s.project_id = p.id
               and p.slug = 'meinevim' and s.number = 17 and w.key = $2`,
            [index, key]
          );
        }
      }
      expect(await orderFromDatabase()).toEqual(before);
    });

    test("an engineer is not offered the handle at all", async ({ page }) => {
      await signIn(page, SEED_ENGINEER);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(SPRINT);

      await expect(page.locator("tbody tr").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Reorder COD-/ })).toHaveCount(0);
    });
  });

  test("the status distribution and burn-up carry real values", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const bar = page.getByRole("img", { name: /Status distribution/ });
    await expect(bar).toHaveAttribute("aria-label", new RegExp(`in progress ${SEED.inProgressCount}`));
    await expect(bar).toHaveAttribute("aria-label", new RegExp(`peer review ${SEED.peerReviewCount}`));

    const burn = page.getByRole("img", { name: /Cumulative hours logged/ });
    // Nothing in the Notion export is estimated, so the burn-up line sits at 0.
    const estimated = SEED.totals.split(" / ")[1];
    await expect(burn).toHaveAttribute("aria-label", new RegExp(`against ${estimated} estimated`));

    // ...and the estimate label is fully inside the viewBox. It sits above the
    // dashed line, and at 8px type a baseline four units below the line puts
    // its ascenders outside the box — which renders as a label sliced in half,
    // with nothing in the DOM to say so.
    const inside = await burn.evaluate((svg) => {
      const label = Array.from(svg.querySelectorAll("text")).find((t) =>
        /est$/.test(t.textContent ?? "")
      );
      if (!label) return "no estimate label";
      const box = (label as SVGTextElement).getBBox();
      const view = (svg as SVGSVGElement).viewBox.baseVal;
      return box.y >= view.y && box.y + box.height <= view.y + view.height
        ? "inside"
        : `clipped: y=${box.y.toFixed(1)} h=${box.height.toFixed(1)} viewBox=${view.y}..${view.y + view.height}`;
    });
    expect(inside).toBe("inside");
  });
});

/**
 * The sort stack, in a browser.
 *
 * `tests/sprint-sort.test.ts` owns the comparator and asserts every rule it
 * has. What only a browser can answer is the other half: that the URL is what
 * carries the sort, that a header says what it is doing to a screen reader, and
 * that a sort and a manual drag order are never both on offer at once.
 */
test.describe("sorting the sprint table", () => {
  const header = (page: import("@playwright/test").Page, name: string) =>
    page.locator("thead th").filter({ hasText: new RegExp(`^${name}`, "i") });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("a header click writes the sort into the URL and back out again", async ({
    adminPage: page,
  }) => {
    await page.goto(SPRINT);

    await header(page, "Deadline").getByRole("button").click();
    await expect(page).toHaveURL(/[?&]sort=deadline%3Aasc/);
    await expect(header(page, "Deadline")).toHaveAttribute("aria-sort", "ascending");

    await header(page, "Deadline").getByRole("button").click();
    await expect(page).toHaveURL(/[?&]sort=deadline%3Adesc/);
    await expect(header(page, "Deadline")).toHaveAttribute("aria-sort", "descending");

    // Third click clears it, and the parameter leaves the URL rather than
    // sitting there as `sort=`.
    await header(page, "Deadline").getByRole("button").click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(header(page, "Deadline")).toHaveAttribute("aria-sort", "none");
  });

  /**
   * Shift-click is why the headers are `<button>`s and not links: **shift-click
   * on an anchor opens a new window**, which is the browser's own binding and
   * cannot be prevented.
   */
  test("shift-click stacks, and the stack is numbered", async ({ adminPage: page }) => {
    await page.goto(SPRINT);

    // Deliberately without waiting in between. `router.replace` on a dynamic
    // route is a server round trip, and the second click used to compute its
    // toggle from the stack the FIRST click had not yet delivered — so the
    // deadline key was silently dropped. The faster somebody builds a sort, the
    // more of it they lost.
    await header(page, "Deadline").getByRole("button").click();
    await header(page, "Status").getByRole("button").click({ modifiers: ["Shift"] });

    await expect(page).toHaveURL(/sort=deadline%3Aasc%2Cstatus%3Aasc/);

    // `aria-sort` belongs to the PRIMARY column only — the attribute takes one
    // value and a table has one sort direction as far as the accessibility tree
    // is concerned. The second key says its position in its own name.
    await expect(header(page, "Deadline")).toHaveAttribute("aria-sort", "ascending");
    await expect(header(page, "Status")).toHaveAttribute("aria-sort", "none");
    await expect(
      header(page, "Status").getByRole("button", { name: /sorted ascending — 2 of 2/ })
    ).toBeVisible();
  });

  /**
   * The rule that keeps the table honest: what a sort shows does not come from
   * `order_index`, so a drag would write a position nothing on screen reflects.
   */
  test("a sort pauses the manual order, and says so", async ({ adminPage: page }) => {
    await page.goto(SPRINT);

    const grips = page.locator("tbody [data-drag-handle]");
    const before = await grips.count();
    expect(before, "the seeded admin can drag before any sort").toBeGreaterThan(0);
    await expect(page.locator("[data-drag-paused]")).toHaveCount(0);

    await header(page, "Grouping").getByRole("button").click();

    await expect(page.locator("[data-drag-paused]")).toBeVisible();
    await expect(page.locator("[data-drag-paused]")).toContainText("paused while a sort is active");
    await expect(grips).toHaveCount(0);

    // And the way back is offered where the drag used to be, not in a tooltip
    // on a handle that is no longer there.
    await page.locator("[data-drag-paused]").getByRole("button", { name: "back to manual order" }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(page.locator("[data-drag-paused]")).toHaveCount(0);
    await expect(grips).toHaveCount(before);
  });

  test("the order in the URL is the order on the page, on arrival", async ({
    adminPage: page,
  }) => {
    await page.goto(`${SPRINT}?sort=hours%3Adesc`);

    const logged = await page
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => {
          const cell = row.querySelectorAll("td")[3];
          return Number((cell?.textContent ?? "").split("/")[0].trim()) || 0;
        })
      );

    expect(logged.length).toBeGreaterThan(1);
    expect(logged, "hours descending").toEqual([...logged].sort((a, b) => b - a));
  });

  /**
   * A stale or hand-edited link must not quietly reorder the sprint — the same
   * rule the status filter lives by, asserted here because a dropped key is
   * invisible on screen.
   */
  test("an unrecognised column is dropped rather than guessed", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=whatever%3Aasc`);

    await expect(page.locator("[data-drag-paused]")).toHaveCount(0);
    const sorted = page.locator('thead th:not([aria-sort="none"])');
    await expect(sorted).toHaveCount(0);
  });

  test("axe is clean with a two-key sort applied", async ({ adminPage: page }) => {
    // Sorted, the header stops being text and becomes a control: nine buttons
    // inside `<th>`s, one of them carrying `aria-sort`. That is a different
    // table to audit than the one `a11y.spec.ts` sees.
    await page.goto(`${SPRINT}?sort=deadline%3Aasc%2Cstatus%3Adesc`);
    await expect(page.locator("[data-drag-paused]")).toBeVisible();
    expect(await auditA11y(page, "main"), "the sorted sprint table").toEqual([]);
  });

  test("the stacked cards follow the same order as the table", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}?sort=hours%3Adesc`);

    // Read the table's order at a width where the table is what renders…
    const fromTable = await page
      .locator("tbody tr td:first-child")
      .evaluateAll((cells) => cells.map((cell) => (cell.textContent ?? "").slice(0, 7)));

    // …then the cards' order at a width where they are. Sorting happens on the
    // server precisely so these cannot disagree at the same URL.
    await page.setViewportSize({ width: 700, height: 900 });
    const fromCards = await page
      .locator("[data-sprint-card]")
      .evaluateAll((cards) => cards.map((card) => (card.textContent ?? "").slice(0, 7)));

    expect(fromCards.length).toBeGreaterThan(1);
    expect(fromCards).toEqual(fromTable);
  });
});

/**
 * The filters that do not fit in the bar.
 *
 * `tests/sprint-filters.test.ts` owns the predicate. What a browser has to
 * answer is that the panel is a dialog on a desktop and a sheet on a phone,
 * that the footer's sum narrows with the table it sums, and that a filter which
 * matches nothing says so instead of leaving an empty screen.
 */
test.describe("filtering the sprint table", () => {
  const openPanel = async (page: import("@playwright/test").Page) => {
    await page.locator("[data-filter-button]").click();
    await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  };

  test("the panel offers every dimension the bar does not", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);
    await openPanel(page);

    const panel = page.getByRole("dialog", { name: "Filter" });
    for (const group of ["Type", "Assignee", "Reviewer", "Grouping"]) {
      await expect(panel.getByRole("group", { name: group }), group).toBeVisible();
    }
    await expect(panel.getByLabel("Filter by words in the title or description")).toBeVisible();
  });

  test("a type narrows the table and the sum with it", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const before = await page.locator("tbody tr").count();
    await openPanel(page);
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: "bug fix", exact: true }).click();

    await expect(page).toHaveURL(/[?&]type=bug_fix/);
    const after = page.locator("tbody tr");
    await expect(after).not.toHaveCount(before);
    const rows = await after.count();

    // The footer sums what is on screen and says it is filtered. A table and a
    // sum that disagree is the one bug this screen cannot have.
    await expect(page.locator("tfoot")).toContainText(`${rows} item`);
    await expect(page.locator("tfoot")).toContainText("(filtered)");
    await expect(page.locator("[data-filter-button]")).toContainText("1 active");
  });

  /**
   * Asserted against the database rather than against the cell's text, for the
   * same reason the footer's sum is: what the filter claims has to be what the
   * table actually holds, and a cell's placeholder is a rendering decision that
   * can change without the filter being wrong.
   */
  test("none finds exactly the rows with nobody in that seat", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${SPRINT}?reviewer=none`);

    const shown = await page
      .locator("tbody tr td:first-child")
      .evaluateAll((cells) =>
        cells.map((cell) => (cell.textContent ?? "").trim().match(/^[A-Z]+-\d+/)?.[0] ?? "")
      );

    const unreviewed = await query<{ key: string }>(
      `select w.key from public.work_items w
         join public.sprints s on s.id = w.sprint_id
        where s.number = 17 and w.reviewer_id is null`
    );

    expect(unreviewed.length, "the seed has rows with no reviewer").toBeGreaterThan(0);
    expect(new Set(shown.filter(Boolean))).toEqual(new Set(unreviewed.map((row) => row.key)));
  });

  test("free text needs every word, and says so when nothing has them all", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });

    // One term the seed does have.
    await page.goto(`${SPRINT}?q=kachel`);
    const some = await page.locator("tbody tr").count();
    expect(some).toBeGreaterThan(0);

    // Two terms no single story has. An empty table has to explain itself —
    // otherwise it reads as a broken page rather than as an answer.
    await page.goto(`${SPRINT}?q=kachel+height`);
    await expect(page.locator("tbody")).toContainText("No story here matches these filters");
    await expect(page.locator("tbody")).toContainText("14 in the sprint");

    await page.locator("tbody").getByRole("button", { name: "clear the filters" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  /**
   * `sort` is not a filter: it reorders, it never hides. Clearing the filters
   * from an empty table must not quietly throw away somebody's sort as well.
   */
  test("clearing the filters keeps the sort", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${SPRINT}?q=kachel+height&sort=deadline%3Adesc`);

    await page.locator("tbody").getByRole("button", { name: "clear the filters" }).click();
    await expect(page).toHaveURL(/sort=deadline%3Adesc/);
    await expect(page).not.toHaveURL(/[?&]q=/);
  });

  test("an unrecognised value is dropped rather than widening the view", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${SPRINT}?type=epic&grouping=0`);

    // Nothing was applied, so the table is whole and the button says nothing.
    await expect(page.locator("[data-filter-button]")).not.toContainText("active");
    await expect(page.locator("tfoot")).not.toContainText("(filtered)");
  });

  test("axe finds nothing with the panel open", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);
    await openPanel(page);
    expect(await auditA11y(page), "the filter panel").toEqual([]);
  });

  /**
   * The phone half of the W7 verification. `DialogShell` is a centred dialog
   * above `md` and a bottom sheet below it, so the panel is against the bottom
   * edge and full width — which is also why it is not a popover.
   */
  test("it is a sheet on a phone, against the bottom edge", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(SPRINT);
    await openPanel(page);

    const panel = page.getByRole("dialog", { name: "Filter" });
    const box = (await panel.boundingBox())!;
    expect(box.width, "full width on a phone").toBeGreaterThan(370);
    expect(box.y + box.height, "against the bottom edge").toBeGreaterThan(780);

    // And it filters from there, which is the point of the sheet.
    await panel.getByRole("button", { name: "bug fix", exact: true }).click();
    await expect(page).toHaveURL(/[?&]type=bug_fix/);
  });
});

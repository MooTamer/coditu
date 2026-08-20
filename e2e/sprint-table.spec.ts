import { expect, query, test } from "./fixtures";

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
    await expect(footer).toContainText("16.0 / 46.0");
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
    await page.goto(`${SPRINT}?status=todo`);

    const todoCount = Number(
      (
        await query<{ n: string }>(
          `select count(*)::text as n from work_items w
           join sprints s on s.id = w.sprint_id
           join projects p on p.id = s.project_id
           where p.slug = 'meinevim' and s.number = 17 and w.status = 'todo'`
        )
      )[0].n
    );

    await expect(page.locator("tbody tr")).toHaveCount(todoCount);
    await expect(page.locator("tfoot tr")).toContainText("(filtered)");

    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(todoCount);
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
    await expect(cardSum.locator("xpath=..")).toContainText("16.0 / 46.0");

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

    // COD-142 carries grouping 1, so its row is tinted and its sticky cell has
    // to be a solid colour — a translucent one goes see-through while scrolling.
    const cell = page.locator("tbody tr", { hasText: "COD-142" }).locator("td").first();
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

  test("the status distribution and burn-up carry real values", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const bar = page.getByRole("img", { name: /Status distribution/ });
    await expect(bar).toHaveAttribute("aria-label", /dev started 1/);
    await expect(bar).toHaveAttribute("aria-label", /peer review 4/);

    const burn = page.getByRole("img", { name: /Cumulative hours logged/ });
    await expect(burn).toHaveAttribute("aria-label", /against 46\.0 estimated/);

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

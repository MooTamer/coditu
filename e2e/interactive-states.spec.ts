import { SEED, expect, shell, test } from "./fixtures";

/**
 * PF-4, measured rather than described.
 *
 * The report was "sorting does nothing for ~2s then sorts". The cause is not
 * the sort: it is that sort, filter, grouping and view are URL state — which is
 * the right design, because every one of them is then a link somebody can paste
 * — and a `router.replace` on a dynamic route is a server round trip that React
 * gives no sign of unless you put it in a transition.
 *
 * So the acceptance is a stopwatch: **every control that triggers work reports
 * it within 100 ms**. Not "eventually", and not "there is a spinner somewhere".
 *
 * The instrument is a MutationObserver on `data-state`, started before the
 * click, resolving on the first mutation to `"pending"`. That measures what the
 * reader sees — an attribute the stylesheet is already reacting to — rather
 * than what React scheduled. Polling would measure the poll interval.
 */
const SPRINT = SEED.sprint;
const BUDGET_MS = 100;

/** Click, and time the control's own `data-state` reaching `pending`. */
async function timeToPending(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator
): Promise<number> {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error("no such control");

  const armed = handle.evaluate(
    (node) =>
      new Promise<number>((resolve, reject) => {
        // From the browser's own `pointerdown`, NOT from when this observer was
        // attached. The first version of this started the clock before
        // `locator.click()` and so timed Playwright's actionability checks,
        // scroll-into-view and mouse move as well — it read 307ms for a control
        // that was already inside the budget, and the number was about the test
        // harness rather than about the app.
        let pressed = 0;
        node.addEventListener("pointerdown", () => {
          pressed = performance.now();
        });
        const observer = new MutationObserver(() => {
          if (node.getAttribute("data-state") !== "pending") return;
          observer.disconnect();
          if (!pressed) return reject(new Error("pending arrived without a press"));
          resolve(performance.now() - pressed);
        });
        observer.observe(node, { attributes: true, attributeFilter: ["data-state"] });
        setTimeout(() => {
          observer.disconnect();
          reject(new Error("data-state never reached pending"));
        }, 4000);
      })
  );

  // After the observer is attached, or a fast transition beats it and the test
  // reports a control that worked as one that never fired.
  await locator.click();
  return armed;
}

test.describe("the interactive-state contract", () => {
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(SPRINT);
  });

  test("a sort header reports pending inside the budget", async ({ adminPage: page }) => {
    // Through the column header, not the page: `Status` is also the name of a
    // cell editor in every row.
    const header = shell(page)
      .getByRole("columnheader", { name: /Status/ })
      .getByRole("button");
    const ms = await timeToPending(page, header);
    console.log(JSON.stringify({ control: "sort:status", ms: Math.round(ms) }));
    expect(ms, `the sort header took ${Math.round(ms)}ms to say anything`).toBeLessThan(BUDGET_MS);
  });

  test("a status filter chip reports pending inside the budget", async ({ adminPage: page }) => {
    // `done`, not `in progress`: the bar only offers the statuses this sprint
    // actually uses, and a chip for a status nothing is in would be a filter
    // that empties the table.
    const chip = shell(page).getByRole("button", { name: "done", exact: true });
    const ms = await timeToPending(page, chip);
    console.log(JSON.stringify({ control: "status:done", ms: Math.round(ms) }));
    expect(ms, `the status chip took ${Math.round(ms)}ms to say anything`).toBeLessThan(BUDGET_MS);
  });

  test("the view toggle reports pending inside the budget", async ({ adminPage: page }) => {
    const board = shell(page).getByRole("button", { name: "board", exact: true });
    const ms = await timeToPending(page, board);
    console.log(JSON.stringify({ control: "view:board", ms: Math.round(ms) }));
    expect(ms, `the view toggle took ${Math.round(ms)}ms to say anything`).toBeLessThan(BUDGET_MS);
  });

  /**
   * The bug the first draft of `useUrlWrite` had, kept as a test.
   *
   * `useTransition` returns ONE boolean for the hook, and the filter bar has
   * fourteen controls sharing it — so a click on "In progress" lit the pending
   * line under every status chip, which says "the whole bar is thinking" and
   * loses the only fact the reader wanted.
   */
  test("only the control that was pressed reports pending", async ({ adminPage: page }) => {
    const chip = shell(page).getByRole("button", { name: "done", exact: true });
    await timeToPending(page, chip);

    const pending = await shell(page)
      .locator('[data-control][data-state="pending"]')
      .evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? "").trim()));

    expect(pending.length, `${pending.length} controls reported one click`).toBeLessThanOrEqual(1);
  });

  /**
   * The contract is six states and four of them are native. This asserts the
   * two that are not have a visible answer, because a `data-state` nothing
   * draws is a contract in name only.
   */
  test("pending and error are drawn, not merely attributed", async ({ adminPage: page }) => {
    const drawn = await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.setAttribute("data-control", "");
      document.body.append(probe);
      const read = (state: string) => {
        probe.setAttribute("data-state", state);
        const after = getComputedStyle(probe, "::after");
        return { content: after.content, background: after.backgroundColor, height: after.height };
      };
      const out = { pending: read("pending"), error: read("error"), idle: read("idle") };
      probe.remove();
      return out;
    });

    // `idle` draws nothing at all — the default has to stay free.
    expect(drawn.idle.content, "an idle control paints something").toBe("none");
    for (const state of ["pending", "error"] as const) {
      expect(drawn[state].content, `${state} paints nothing`).not.toBe("none");
      expect(
        parseFloat(drawn[state].height),
        `${state} paints a zero-height line`
      ).toBeGreaterThan(0);
    }
    // And they are told apart by colour, not only by presence.
    expect(drawn.pending.background).not.toBe(drawn.error.background);
  });
});

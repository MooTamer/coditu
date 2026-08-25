import { expect, query, test } from "./fixtures";

const ITEM = "/app/projects/meinevim/sprints/17/items/COD-239";

/**
 * A submission that arrives twice must happen once.
 *
 * ## Why this is not tested by clicking twice
 *
 * The composer disables its own button while a send is in flight, and the time
 * form does the same, so a double CLICK has never been the failure. The failure
 * is one layer down: the request that reached the database and whose response
 * was lost, the Server Action that rejects because the network went away
 * mid-flight — which skips the client's rollback entirely, see
 * `07-FIELD-NOTES.md` — the second tab, and the reader who presses Send again
 * because the first attempt looked like it did nothing.
 *
 * So these tests do not click twice. They intercept the real Server Action
 * request and **send it to the server a second time**, byte for byte, which is
 * exactly what a lost response and a retry produce. Nothing is faked: both
 * requests are dispatched, both are handled, and the assertion is on the rows
 * that exist afterwards.
 *
 * ## The third test is the one that keeps the other two honest
 *
 * Two distinct submissions must still write two rows. Without it, a bug that
 * collapsed every comment on an item into one would pass the first two tests
 * perfectly.
 */

/**
 * Sends every Server Action POST on this page twice; returns how many it doubled.
 *
 * `replayed` is incremented only once BOTH requests have come back, and every
 * test polls it before asserting on rows. That ordering is the test: assert the
 * row count too early and a passing "there is one comment" means only that the
 * first request landed, which proves nothing at all. The first draft did exactly
 * that and reported a green count with `replayed` still at zero.
 */
async function replayEveryAction(page: import("@playwright/test").Page) {
  const state = { replayed: 0 };

  await page.route(
    (url) => url.pathname.includes("/items/COD-239"),
    async (route) => {
      const request = route.request();
      // Server Actions are a POST to the page's own URL carrying `next-action`.
      // Everything else — the navigation, RSC payloads, prefetches — goes
      // straight through, or the page never loads.
      if (request.method() !== "POST" || !request.headers()["next-action"]) {
        return route.continue();
      }

      await route.fetch();
      const second = await route.fetch();
      state.replayed += 1; // both are done — only now is a row count meaningful
      // The browser is handed the SECOND response — the retry's — because that
      // is the one a reader would actually be looking at.
      await route.fulfill({ response: second });
    }
  );

  return state;
}

async function clearItem() {
  await query(
    `delete from comments where work_item_id = (select id from work_items where key = 'COD-239')`
  );
  await query(
    `delete from time_entries where work_item_id = (select id from work_items where key = 'COD-239')`
  );
}

async function countComments() {
  const rows = await query<{ n: string }>(
    `select count(*)::text as n from comments c
     join work_items w on w.id = c.work_item_id where w.key = 'COD-239'`
  );
  return Number(rows[0].n);
}

test.describe("a submission that arrives twice happens once", () => {
  // Serial: all three write to the same item, so parallel workers would count
  // each other's rows.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await clearItem();
  });

  test.afterEach(async ({ adminPage: page }) => {
    // Route callbacks still in flight when a test ends raise "Test ended" and
    // fail an otherwise passing run.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await clearItem();
  });

  test("a comment whose response was lost is not posted a second time", async ({
    adminPage: page,
  }) => {
    const replay = await replayEveryAction(page);
    await page.goto(ITEM);

    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("The retry must not say this twice.");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    // Both requests have been answered. Until this is true, a row count says
    // only that the first one landed.
    await expect.poll(() => replay.replayed, { timeout: 15000 }).toBeGreaterThan(0);

    await expect.poll(countComments, { timeout: 8000 }).toBe(1);

    // And it is on screen once, not merely in the table once.
    await expect(page.getByText("The retry must not say this twice.")).toHaveCount(1);
  });

  test("time logged twice over is logged once, and the rollup agrees", async ({ adminPage: page }) => {
    const replay = await replayEveryAction(page);
    await page.goto(ITEM);

    // The amount comes from the button rather than from a constant here. The
    // default step is a product decision that has moved before, and a test that
    // hardcodes 60 fails for a reason that has nothing to do with what it is
    // checking — as this one did, on an item whose default is 1.5 h.
    const log = page.getByRole("button", { name: /^Log \d/ });
    const label = (await log.getAttribute("aria-label")) ?? (await log.innerText());
    const expectedMinutes = Math.round(Number(label.match(/([\d.]+)\s*h/)?.[1]) * 60);
    expect(expectedMinutes).toBeGreaterThan(0);

    await log.click();

    await expect.poll(() => replay.replayed, { timeout: 15000 }).toBeGreaterThan(0);

    await expect
      .poll(
        async () => {
          const rows = await query<{ n: string; total: string }>(
            `select count(*)::text as n, coalesce(sum(minutes), 0)::text as total
               from time_entries t
               join work_items w on w.id = t.work_item_id where w.key = 'COD-239'`
          );
          return `${rows[0].n}/${rows[0].total}`;
        },
        { timeout: 8000 }
      )
      // Invariant 2 is the reason this one matters more than the comment. Two
      // identical entries are indistinguishable from somebody genuinely logging
      // the same half hour twice, so nothing downstream could ever undo it —
      // and `minutes_logged` is a rollup a client can see.
      .toBe(`1/${expectedMinutes}`);
  });

  test("two different comments are still two comments", async ({ adminPage: page }) => {
    const replay = await replayEveryAction(page);
    await page.goto(ITEM);

    for (const words of ["The first thing.", "A separate second thing."]) {
      await page.getByText("Write a comment — @ to mention").click();
      const editor = page.locator(".coditu-prose");
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.type(words);
      await page.getByRole("button", { name: "Comment", exact: true }).click();
      await expect(page.getByText(words)).toBeVisible();
    }

    // Each submission mints its own token, so idempotency must not collapse
    // them. This is the assertion that stops the other two passing for the
    // wrong reason.
    await expect.poll(() => replay.replayed, { timeout: 15000 }).toBeGreaterThan(1);
    await expect.poll(countComments, { timeout: 8000 }).toBe(2);
  });
});

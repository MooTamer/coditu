import AxeBuilder from "@axe-core/playwright";

import { expect, query, test } from "./fixtures";

/**
 * The command palette and realtime — §8 and §5.
 *
 * Both are features whose absence is invisible: a palette that never opens
 * looks like a decorative badge, and a missing subscription looks like a page
 * that simply has not changed yet. Neither shows up in a build, a type check,
 * or a screenshot.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-140`;

/**
 * Watch the realtime socket.
 *
 * Knowing when a subscription is actually LIVE takes some care, and getting it
 * wrong makes this test flaky rather than false. The frame order on the wire is:
 *
 *   1. `phx_join`                             — we ask to join the topic
 *   2. `phx_reply {status: ok}`               — the topic exists. NOT ready.
 *   3. `system {"Unable to subscribe …"}`     — the first attempt at the
 *                                               Postgres binding often fails
 *   4. `system {"Subscribed to PostgreSQL"}`  — ready. This is the signal.
 *
 * A write between 2 and 4 is simply never delivered, which is indistinguishable
 * from realtime being broken. So the test waits for 4, and for nothing else —
 * no sleeps, no guesses.
 */
function watchRealtime(page: import("@playwright/test").Page) {
  const sent: Array<{ topic: string; event: string }> = [];
  /** Topics whose Postgres binding the server has confirmed. */
  const live = new Set<string>();

  const parse = (payload: unknown) => {
    try {
      // realtime-js frames are ARRAYS: [ref, joinRef, topic, event, payload].
      const frame = JSON.parse(String(payload)) as unknown[];
      return Array.isArray(frame) && frame.length >= 4 ? frame : null;
    } catch {
      return null; // heartbeats and non-JSON frames
    }
  };

  page.on("websocket", (socket) => {
    if (!socket.url().includes("/realtime/")) return;

    socket.on("framesent", (frame) => {
      const parsed = parse(frame.payload);
      if (parsed) sent.push({ topic: String(parsed[2]), event: String(parsed[3]) });
    });

    socket.on("framereceived", (frame) => {
      const parsed = parse(frame.payload);
      if (!parsed) return;
      // The server's confirmation that the POSTGRES BINDING is live — not the
      // `phx_reply` that merely acknowledges the topic.
      const payload = parsed[4] as { status?: string; message?: string } | undefined;
      if (
        String(parsed[3]) === "system" &&
        payload?.status === "ok" &&
        payload.message === "Subscribed to PostgreSQL"
      ) {
        live.add(String(parsed[2]));
      }
    });
  });

  return { sent, live };
}

/**
 * Open the palette and wait until it can actually take input.
 *
 * Pressing ⌘K and typing immediately sends the first keystrokes to the
 * document — the dialog is not mounted yet — and the palette fetches its
 * targets on first open, so an empty list is a normal intermediate state rather
 * than a failure. Both are races the tests kept losing.
 */
async function openPalette(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "Command palette" });

  // ⌘K is bound by a client component, so a press that lands before hydration
  // does nothing at all. Pressing until it takes is what a person does anyway,
  // and it is honest about the shortcut being an enhancement rather than
  // something the server can answer.
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible()) return true;
        await page.keyboard.press("Meta+k");
        return dialog.isVisible();
      },
      { timeout: 15_000, intervals: [200, 300, 500, 800] }
    )
    .toBe(true);

  await expect(dialog.locator("input")).toBeFocused();
  await expect(dialog.getByRole("option").first()).toBeVisible();
  return dialog;
}

test.describe("command palette", () => {
  // These read item state — and the palette deliberately omits an item's
  // CURRENT status from its options, so a concurrent write flips the row this
  // expects out of existence.
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
  });

  test("⌘K opens it, Esc closes it, and the topbar button does the same", async ({
    adminPage: page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Command palette" });

    await page.keyboard.press("Meta+k");
    await expect(dialog).toBeVisible();
    // The page behind must not scroll while it is open.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    // Ctrl+K too, for anyone not on a Mac.
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Search items, sprints, people/ }).click();
    await expect(dialog).toBeVisible();
  });

  test("fuzzy matching finds items by key and by title", async ({ adminPage: page }) => {
    const dialog = await openPalette(page);

    // By title.
    await page.keyboard.type("banner");
    await expect(dialog.getByRole("option")).toHaveCount(2);
    await expect(dialog.getByRole("option").first()).toContainText("Banner News Mode");

    // By key.
    await page.locator('[role="dialog"] input').fill("COD-142");
    await expect(dialog.getByRole("option").first()).toContainText("Tabs with Cards: height logic fix");

    // A subsequence, not a substring — this is what makes it fuzzy.
    await page.locator('[role="dialog"] input').fill("tbwc");
    await expect(dialog.getByRole("option").first()).toContainText("Tabs with Cards");
  });

  test("Enter on the highlighted row navigates", async ({ adminPage: page }) => {
    await openPalette(page);
    await page.keyboard.type("newspart");
    await expect(page.getByRole("option").first()).toContainText("Newspart changes");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/items\/COD-144$/);
  });

  test("the arrows move the highlight, and it stays a single selection", async ({
    adminPage: page,
  }) => {
    await openPalette(page);
    await page.keyboard.type("cod-14");

    const options = page.getByRole("option");
    // The list is still settling while the query is typed. Pressing ArrowDown
    // against a one-row list clamps at index 0 and the assertion below fails
    // for a reason that has nothing to do with the arrows.
    await expect.poll(() => options.count(), { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "false");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowUp");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    // Exactly one row is ever selected.
    expect(await page.locator('[role="option"][aria-selected="true"]').count()).toBe(1);
  });

  test("item-scoped commands only exist when there is an item in scope", async ({
    adminPage: page,
  }) => {
    // On the sprint, no item is focused, so "set status" would have nothing to
    // act on — a dead row teaches people the palette is unreliable.
    await openPalette(page);
    await page.keyboard.type("set cod-140");
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto(ITEM);
    await openPalette(page);
    await page.keyboard.type("set COD-140 to blocked");
    await expect(page.getByRole("option").first()).toContainText("Set COD-140 to blocked");
  });

  test("axe finds nothing in the palette", async ({ adminPage: page }) => {
    await openPalette(page);
    // The panel enters on the `surface` tier. axe sampling a row mid-fade
    // reports a contrast failure that does not exist once it lands.
    await page.evaluate(async () => {
      await Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined))
        ),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} @ ${n.target.join(" ")}`))
    ).toEqual([]);
  });
});

test.describe("command palette — it actually writes", () => {
  // Changing a status moves the sprint's distribution, so this cannot overlap a
  // test asserting it.
  test.use({ sprintTotals: "write" });

  test("changing a status from the palette goes through the Server Action", async ({
    adminPage: page,
  }) => {
    const [before] = await query<{ status: string }>(
      `select status::text from work_items where key = 'COD-140'`
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);
    await openPalette(page);
    await page.keyboard.type("Set COD-140 to blocked");
    await page.getByRole("option").first().click();

    await expect
      .poll(
        async () => {
          const [row] = await query<{ status: string }>(
            `select status::text from work_items where key = 'COD-140'`
          );
          return row.status;
        },
        { timeout: 8000 }
      )
      .toBe("blocked");

    // Put it back, so the suite is re-runnable.
    await query(`update work_items set status = $1::work_item_status where key = 'COD-140'`, [
      before.status,
    ]);
  });
});

test.describe("realtime", () => {
  // The probe inserts a row into the sprint, which moves its totals.
  test.use({ sprintTotals: "write" });

  test("a write made outside the browser reaches the sprint table", async ({ adminPage: page }) => {
    const realtime = watchRealtime(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    // Wait for the binding to be live. See `watchRealtime` for why the join
    // reply is not enough.
    await expect
      .poll(() => [...realtime.live].some((topic) => topic.startsWith("realtime:sprint:")), {
        timeout: 20_000,
      })
      .toBe(true);

    const before = await page.locator("tbody tr").count();

    // Straight into Postgres — no Server Action, no navigation, no refresh.
    // If the row appears, realtime delivered it.
    const [inserted] = await query<{ id: string }>(
      `insert into work_items (sprint_id, key, title, status, type, estimate_minutes, order_index)
       select s.id, 'COD-901', 'Realtime probe', 'todo', 'story', 60, 999
       from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17
       returning id`
    );

    try {
      await expect(page.locator("tbody tr")).toHaveCount(before + 1, { timeout: 12_000 });
      await expect(page.locator("tbody").getByText("Realtime probe")).toBeVisible();
      // The footer is recomputed by the server, not patched on the client —
      // which is the point of refreshing rather than merging the payload.
      await expect(page.locator("tfoot tr")).toContainText(`${before + 1} items`);
    } finally {
      await query(`delete from work_items where id = $1`, [inserted.id]);
    }

    await expect(page.locator("tbody tr")).toHaveCount(before, { timeout: 12_000 });
  });

  test("the subscription is torn down when the route changes", async ({ adminPage: page }) => {
    // A channel that outlives its route is a leak that stays invisible until
    // the socket limit is hit. Supabase multiplexes every channel over ONE
    // WebSocket, so counting sockets proves nothing — the observable fact is
    // the Phoenix frame: joining a topic sends `phx_join`, and unsubscribing
    // sends `phx_leave` for that same topic.
    //
    // Watched through Playwright rather than by patching `WebSocket.prototype`
    // in the page: the listener survives navigation, and realtime-js sends
    // frames as ARRAYS — `[ref, joinRef, topic, event, payload]` — which an
    // in-page hook reading `.topic` silently misses.
    const { sent } = watchRealtime(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await expect
      .poll(() => sent.filter((f) => f.event === "phx_join").length, { timeout: 12_000 })
      .toBeGreaterThan(0);

    const joined = sent.find((frame) => frame.event === "phx_join")!.topic;
    expect(joined, "the channel is scoped to one sprint").toMatch(/^realtime:sprint:[0-9a-f-]+$/);

    // A client-side transition, not `page.goto`: a hard navigation tears the
    // document down wholesale, and the leak this guards against is the SPA one.
    await page.getByRole("link", { name: "People" }).click();
    await expect(page).toHaveURL(/\/app\/people$/);

    await expect
      .poll(
        () => sent.some((frame) => frame.event === "phx_leave" && frame.topic === joined),
        { timeout: 12_000 }
      )
      .toBe(true);
  });
});

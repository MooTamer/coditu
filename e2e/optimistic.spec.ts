import { expect, query, shell, test } from "./fixtures";

/**
 * The two things people do all day: log time, and post a comment.
 *
 * Both used to wait for the write and then `router.refresh()` before anything
 * on screen moved. Locally that is a couple of hundred milliseconds; against a
 * hosted database it is most of a second of a screen that looks like it ignored
 * the click, which is exactly when somebody clicks again.
 *
 * Invariant 4 is the reason the failure cases here are longer than the happy
 * ones: *"a failed write that silently reverts is worse than no optimism"*. The
 * write is failed on purpose — the Server Action's own POST is aborted at the
 * network — because a rollback nobody has ever seen run is a rollback nobody
 * knows is broken. It is aborted rather than made to return an error on
 * purpose too: an aborted call REJECTS, and a rejected Server Action skips
 * every `if (!result.ok)` branch in the app. That is the failure `settle()`
 * exists for, and it is the one that actually happens.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-229`;

/** The panel's own running total, as rendered. */
async function loggedTotal(page: import("@playwright/test").Page): Promise<string> {
  // Through `shell()`: unscoped, `.last()` picks whichever copy of the
  // total is last in the document, and between the streaming wrapper and the
  // live tree that is not the same element twice running — which is how this
  // read "total9.0 h" once and "total 9.0 h" the next time for one number.
  const panel = shell(page).locator("div", { hasText: /^total/ }).last();
  return (await panel.innerText()).replace(/\s+/g, " ").trim();
}

/** Fail the next Server Action POST to this route, at the network. */
async function breakTheNextWrite(page: import("@playwright/test").Page, path: string) {
  await page.route(`**${path}*`, (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue()
  );
}

test.describe("logging time is optimistic", () => {
  // It moves the sprint total, so it must not run beside a test asserting one.
  test.use({ sprintTotals: "write" });

  test("the total moves before the server has answered, and the write lands", async ({
    adminPage: page,
  }) => {
    const [before] = await query<{ minutes: string }>(
      `select coalesce(sum(minutes), 0)::text as minutes
         from time_entries t
         join work_items w on w.id = t.work_item_id
        where w.key = 'COD-229'`
    );

    let entryId: string | null = null;
    try {
      await page.goto(ITEM);
      const start = await loggedTotal(page);

      // Hold the write open, so anything that moves on screen can only be
      // optimistic. Without this the server can beat the assertion and the test
      // passes whether the optimism is there or not.
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(`**${ITEM}*`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await held;
        return route.continue();
      });

      await page.getByRole("button", { name: /^Log 1\.5 h$/ }).click();

      // 1.5h on top of whatever was there, with the server still thinking.
      await expect
        .poll(() => loggedTotal(page), { timeout: 3_000 })
        .not.toBe(start);
      const optimistic = await loggedTotal(page);

      release();

      // And the real write agrees with what was shown.
      await expect
        .poll(
          async () => {
            const [now] = await query<{ minutes: string }>(
              `select coalesce(sum(minutes), 0)::text as minutes
                 from time_entries t
                 join work_items w on w.id = t.work_item_id
                where w.key = 'COD-229'`
            );
            return Number(now.minutes);
          },
          { timeout: 15_000 }
        )
        .toBe(Number(before.minutes) + 90);

      await expect.poll(() => loggedTotal(page), { timeout: 10_000 }).toBe(optimistic);

      const [written] = await query<{ id: string }>(
        `select t.id from time_entries t
           join work_items w on w.id = t.work_item_id
          where w.key = 'COD-229' order by t.created_at desc limit 1`
      );
      entryId = written.id;
    } finally {
      if (entryId) await query(`delete from time_entries where id = $1`, [entryId]);
    }

    const [after] = await query<{ minutes: string }>(
      `select coalesce(sum(minutes), 0)::text as minutes
         from time_entries t
         join work_items w on w.id = t.work_item_id
        where w.key = 'COD-229'`
    );
    expect(after.minutes).toBe(before.minutes);
  });

  test("a failed write puts the total back and says so", async ({ adminPage: page }) => {
    const [before] = await query<{ minutes: string }>(
      `select coalesce(sum(minutes), 0)::text as minutes
         from time_entries t
         join work_items w on w.id = t.work_item_id
        where w.key = 'COD-229'`
    );

    await page.goto(ITEM);
    const start = await loggedTotal(page);

    await breakTheNextWrite(page, ITEM);
    await page.getByRole("button", { name: /^Log 1\.5 h$/ }).click();

    /**
     * The sentence is the part that used to be missing: an aborted Server
     * Action rejects, so the `if (!result.ok)` branch never ran and the reader
     * watched the number go up and then quietly come back down.
     *
     * **The sentence changed on 2026-08-30 and the change is the point.** This
     * used to assert `/did not save/`, which was true when nothing retried. Now
     * an aborted write goes on the pending queue, so telling somebody it did not
     * save would contradict the chip beside it saying it will be sent. What must
     * not change is that *something is said* — the assertion is still that the
     * reader is told, and `e2e/pending-queue.spec.ts` holds what happens next.
     */
    await expect(page.getByText(/will be sent when you are back online/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(() => loggedTotal(page), { timeout: 10_000 }).toBe(start);

    const [after] = await query<{ minutes: string }>(
      `select coalesce(sum(minutes), 0)::text as minutes
         from time_entries t
         join work_items w on w.id = t.work_item_id
        where w.key = 'COD-229'`
    );
    expect(after.minutes, "a failed write must not have written").toBe(before.minutes);

    /**
     * Empty the queue before leaving.
     *
     * This test deliberately strands a real time entry in IndexedDB. Left there,
     * a later navigation in a reused context would drain it and insert 90
     * minutes against COD-229 — which would surface as another spec's sprint
     * total being wrong, a long way from here. Cleaning up after a deliberate
     * failure is part of the test.
     */
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open("coditu", 1);
          open.onerror = () => resolve();
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("pending")) return resolve();
            const clear = db.transaction("pending", "readwrite").objectStore("pending").clear();
            clear.onsuccess = () => resolve();
            clear.onerror = () => resolve();
          };
        })
    );
    await page.evaluate(() => window.localStorage.removeItem("coditu.pending.n"));
  });
});

test.describe("posting a comment is optimistic", () => {
  test.use({ sprintTotals: "read" });

  test("the comment appears while the server is still thinking", async ({ adminPage: page }) => {
    const body = `optimistic comment ${Date.now()}`;
    let commentId: string | null = null;

    try {
      await page.goto(ITEM);

      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(`**${ITEM}*`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await held;
        return route.continue();
      });

      await page.getByRole("button", { name: /Write a comment/ }).click();
      const editor = page.locator("[contenteditable='true']");
      await editor.waitFor({ state: "visible", timeout: 20_000 });
      await editor.click();
      await editor.fill(body);

      await page.getByRole("button", { name: "Comment", exact: true }).click();

      // On screen, in the thread, with the server still holding the write.
      // Scoped to the pending article: an unscoped text match also finds the
      // copy still sitting in the editor, which is a different claim entirely.
      const sending = page.locator("article").filter({ hasText: "sending…" });
      await expect(sending).toContainText(body, { timeout: 5_000 });
      // And the box is already empty, as if it had sent.
      await expect(page.getByRole("button", { name: /Write a comment/ })).toBeVisible();

      release();

      // Then the real one replaces it — same text, no longer "sending".
      //
      // `[data-pending-comment]` rather than a text match. Since the topbar
      // gained the shared save-confidence chip, two elements say "sending" —
      // the thread's own pending caption and the chip — which is the point of
      // a shared vocabulary and a strict-mode violation for an unscoped
      // `getByText`. This assertion is about the OPTIMISTIC comment, so it
      // names it.
      await expect(page.locator("[data-pending-comment]")).toBeHidden({ timeout: 15_000 });
      // `.first()` is the comment in the thread; version history renders the
      // same words as a diff line since W4c.
      await expect(page.getByText(body, { exact: false }).first()).toBeVisible();

      const [row] = await query<{ id: string }>(
        `select c.id from comments c
           join work_items w on w.id = c.work_item_id
          where w.key = 'COD-229' and c.body_text like $1`,
        [`%${body}%`]
      );
      expect(row, "the comment reached the database").toBeTruthy();
      commentId = row.id;
    } finally {
      if (commentId) await query(`delete from comments where id = $1`, [commentId]);
    }
  });

  test("a failed post gives the draft back rather than losing it", async ({ adminPage: page }) => {
    const body = `doomed comment ${Date.now()}`;

    await page.goto(ITEM);
    await page.getByRole("button", { name: /Write a comment/ }).click();
    const editor = page.locator("[contenteditable='true']");
    await editor.waitFor({ state: "visible", timeout: 20_000 });
    await editor.click();
    await editor.fill(body);

    await breakTheNextWrite(page, ITEM);
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    await expect(page.getByText(/did not save/i)).toBeVisible({ timeout: 10_000 });
    // The optimistic entry is gone…
    await expect(page.locator("[data-pending-comment]")).toBeHidden({ timeout: 10_000 });
    // …and the words are back in the box, not lost. This is the whole reason
    // the composer clears optimistically rather than destructively.
    await expect(page.locator("[contenteditable='true']")).toContainText(body, { timeout: 10_000 });

    const rows = await query(
      `select 1 from comments c join work_items w on w.id = c.work_item_id
        where w.key = 'COD-229' and c.body_text like $1`,
      [`%${body}%`]
    );
    expect(rows.length, "a failed post must not have written").toBe(0);
  });
});

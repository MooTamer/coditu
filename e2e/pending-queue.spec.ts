import { expect, query, test } from "./fixtures";

/**
 * "Offline — will retry" has to actually retry.
 *
 * The save chip has carried that sentence since the vocabulary was written, and
 * for most of that time nothing retried — somebody who read it had every reason
 * to close the tab believing their change was safe. `lib/pending-queue.ts` makes
 * it true, and this is the spec that stops it quietly becoming untrue again.
 *
 * The write is failed **at the network**, with `route.abort("failed")`, rather
 * than by making the action return an error. That distinction is the subject: an
 * aborted Server Action call *rejects*, which skips every `if (!result.ok)`
 * branch in the application, and it is the only failure the queue is allowed to
 * act on. A `{ ok: false }` from a server that read the write and declined it
 * must never be queued — replaying it gets the same refusal forever and leaves a
 * badge that never clears. That half is held by `tests/action-result.test.ts`,
 * which can test the discriminator directly and without a browser.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const KEY = "COD-229";

/** What the queue is holding, read out of IndexedDB itself rather than the UI. */
async function queued(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      new Promise<{ label: string; kind: string }[]>((resolve, reject) => {
        const open = indexedDB.open("coditu", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("pending")) return resolve([]);
          const all = db.transaction("pending", "readonly").objectStore("pending").getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as { label: string; mutation: { kind: string } }[]).map((entry) => ({
                label: entry.label,
                kind: entry.mutation.kind,
              }))
            );
          all.onerror = () => reject(all.error);
        };
      })
  );
}

async function statusOf(key: string): Promise<string> {
  const [row] = await query<{ status: string }>(
    "select status::text as status from work_items where key = $1",
    [key]
  );
  return row.status;
}

test.describe("a write the network refused is kept, and sent again", () => {
  // It writes a work item's status, so it must not run beside a test reading one.
  test.use({ sprintTotals: "write" });

  test("a status change survives the connection dropping, and lands on reconnect", async ({
    adminPage: page,
  }) => {
    const before = await statusOf(KEY);
    // Never the value it already holds — a no-op write would prove nothing, and
    // the control returns early on it.
    const target = before === "in_qa" ? "in progress" : "in qa";
    const targetEnum = target === "in qa" ? "in_qa" : "in_progress";

    try {
      // The status control is a sprint-table cell, and the table needs the
      // width to render its columns — the same setup `inline-edit.spec.ts` uses.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(SPRINT);

      const row = page.locator("tbody tr", { hasText: KEY });
      const cell = row.getByRole("button", { name: /^Status/ });
      await expect(cell).toBeVisible();

      // Cut the network for writes only. Reads keep working, which is what a
      // train tunnel actually looks like from inside the page.
      await page.route(`**${SPRINT}*`, (route) =>
        route.request().method() === "POST" ? route.abort("failed") : route.continue()
      );

      await cell.click();
      await page.getByRole("option", { name: target, exact: true }).click();

      // The chip is the contract: it says how many writes are unsent, and it
      // says so whether or not anything is currently in flight.
      // NOT through `shell()` — the chip lives in the topbar, outside `main`.
      // `:visible` because a streaming page briefly holds a detached copy of the
      // tree, and the detached one matches every locator that is not filtered
      // by visibility (`07-FIELD-NOTES.md`).
      const chip = page.locator("[data-save-chip]:visible").first();
      await expect(chip).toHaveAttribute("data-pending", "1");
      await expect(chip).toContainText("unsent");

      expect(await queued(page)).toMatchObject([{ kind: "status" }]);

      // Nothing reached the database. This is the half that makes the queue
      // meaningful rather than decorative.
      expect(await statusOf(KEY)).toBe(before);

      // The connection comes back.
      await page.unroute(`**${SPRINT}*`);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));

      await expect
        .poll(() => statusOf(KEY), { message: "the queued status never reached the database" })
        .toBe(targetEnum);
      await expect(chip).not.toHaveAttribute("data-pending", "1");
      expect(await queued(page)).toEqual([]);
    } finally {
      await query("update work_items set status = $1::work_item_status where key = $2", [
        before,
        KEY,
      ]);
    }
  });
});

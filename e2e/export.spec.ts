import { SEED, expect, query, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

test.describe("export dialog", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(SPRINT);
    // Start from a clean selection so the persistence test is about
    // persistence, not about whatever a previous run left behind.
    await page.evaluate(() => window.localStorage.removeItem("coditu.export.v1"));
  });

  async function openDialog(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Export" }).click();
    const dialog = page.getByRole("dialog", { name: /^Export EVIM/ });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("previews Markdown with the facts front-loaded", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);

    const preview = dialog.locator("pre");
    await expect(preview).toContainText("# EVIM — Sprint — Week 17");
    await expect(preview).toContainText("- project: MEINEvim components (EVIM, www.evim.de)");
    await expect(preview).toContainText(`- items in export: ${SEED.itemCount} of ${SEED.itemCount}`);
    await expect(preview).toContainText(`- hours: ${SEED.totals.replace(" / ", " logged / ")} estimated`);
    await expect(preview).toContainText("convention: a highlighted block means discuss before implementing");
    await expect(preview).toContainText("> **Discuss before implementing:**");
  });

  test("switches to CSV with a quoted header and real rows", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: /CSV — detailed/ }).click();

    const preview = dialog.locator("pre");
    await expect(preview).toContainText(
      "key,title,status,type,grouping,assignee,reviewer,deadline,estimate_hours,hours_logged"
    );
    await expect(preview).toContainText("COD-229");
    await expect(preview).toContainText("8.00");
  });

  test("Include toggles change the output", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);
    const preview = dialog.locator("pre");

    await expect(preview).toContainText("**Acceptance criteria**");
    await dialog.getByRole("checkbox", { name: "Acceptance criteria" }).click();
    await expect(preview).not.toContainText("**Acceptance criteria**");
  });

  test("the item selector narrows the export, and the count follows", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);
    await expect(dialog.getByText(`${SEED.itemCount} of ${SEED.itemCount} items`)).toBeVisible();

    // Drop the two drafts.
    await dialog.getByRole("button", { name: "drop drafts" }).click();
    const kept = `${SEED.nonDraftCount} of ${SEED.itemCount}`;
    await expect(dialog.getByText(`${kept} items`)).toBeVisible();
    await expect(dialog.locator("pre")).toContainText(`- items in export: ${kept}`);
    await expect(dialog.locator("pre")).not.toContainText(SEED.draft);
  });

  test("the selection persists across a reload", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);
    await dialog.getByRole("button", { name: "drop drafts" }).click();
    const kept = `${SEED.nonDraftCount} of ${SEED.itemCount} items`;
    await expect(dialog.getByText(kept)).toBeVisible();

    await page.reload();
    const reopened = await openDialog(page);
    // The team exports the same subset repeatedly; re-ticking every time is the
    // friction that stops people producing the report at all.
    await expect(reopened.getByText(kept)).toBeVisible();
  });

  test("PDF offers the report route rather than a text preview", async ({ adminPage: page }) => {
    const dialog = await openDialog(page);
    await dialog.getByRole("radio", { name: /PDF — for the client/ }).click();

    await expect(dialog.locator("pre")).toHaveCount(0);
    const open = dialog.getByRole("link", { name: /Open report to print/ });
    await expect(open).toHaveAttribute("href", `${SPRINT}/report`);
  });
});

test.describe("the client report", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1200, height: 1000 });
  });

  test("shows humanised statuses and no internal vocabulary", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/report`);

    const body = page.locator(".report-body");
    await expect(body).toContainText("Sprint report");
    await expect(body).toContainText("Prepared for EVIM");
    // The statuses this sprint holds, in the words a client reads. It named
    // "In progress" and "In peer review" while Week 17 was in flight; the
    // report draws a heading per status PRESENT, so after the sprint closed
    // those two were assertions about headings that are not there.
    await expect(body).toContainText("Done");
    await expect(body).toContainText("Not scoped yet");

    // Client-facing means client-facing. The enum spellings are refused whether
    // or not the sprint currently holds them — that is the point of the list.
    const text = await body.innerText();
    expect(text).not.toContain("COD-");
    expect(text).not.toContain("in_progress");
    expect(text).not.toContain("in_peer_review");
    expect(text).not.toContain("draft");
    // No reviewer names, and no per-person hours.
    expect(text).not.toContain("Abdelrahman Elkhateeb");
    // No internal comments.
    expect(text).not.toContain("Inline edit needs");
  });

  test("its numbers match the database", async ({ adminPage: page }) => {
    const [totals] = await query<{ logged: string; estimate: string; items: string }>(
      `select coalesce(sum(w.minutes_logged),0)::text as logged,
              coalesce(sum(w.estimate_minutes),0)::text as estimate,
              count(*)::text as items
       from work_items w join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    await page.goto(`${SPRINT}/report`);
    const stats = page.locator(".report-stats");
    await expect(stats).toContainText(totals.items);
    await expect(stats).toContainText((Number(totals.logged) / 60).toFixed(1));
  });

  test("a selection in the URL narrows the report", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/report?items=COD-229,COD-231`);
    const body = page.locator(".report-body");
    await expect(body).toContainText("Add optional titles to all webparts");
    await expect(body).toContainText("Tabs with Cards: height logic fix");
    await expect(body).not.toContainText("Banner News Mode");
    await expect(page.locator(".report-stats")).toContainText("2");
  });

  test("charts carry aria-labels naming the real values", async ({ adminPage: page }) => {
    await page.goto(`${SPRINT}/report`);
    await expect(page.getByRole("img", { name: new RegExp(`Status distribution: .*Done ${SEED.doneCount}`) })).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Cumulative hours logged across the sprint/ })
    ).toBeVisible();
  });
});

test.describe("export scoping — one client's work can never appear under another's", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test("a sprint number from another project does not resolve", async ({ adminPage: page }) => {
    // EVIM has sprint 17; Nile Atelier does not. Asking for it under Nile must
    // not quietly render EVIM's sprint with Nile's name on it.
    //
    // This asserted `status() === 404` until `/app` gained its loading states.
    // A `loading.tsx` anywhere above a route makes it STREAM: the shell and the
    // fallback are flushed — with a 200 — before the page body runs and calls
    // `notFound()`, and a status already on the wire cannot be taken back. Next
    // marks the response instead, with `<meta name="next-error">`, which is the
    // signal that survives streaming. Recorded in `docs/05-DECISIONS.md`.
    //
    // The security property is unchanged and is what is actually checked here:
    // no EVIM row appears under a Nile URL.
    await page.goto("/app/projects/nile-atelier/sprints/17/report");

    await expect(
      page.getByRole("heading", { name: "There is nothing at this address." })
    ).toBeVisible();
    // Read off the wire rather than out of the DOM: React reconciles metadata
    // during hydration, so a `locator("meta[…]")` count is a race, and this is
    // the one marker Next leaves on a streamed not-found.
    const html = await (await page.request.get("/app/projects/nile-atelier/sprints/17/report")).text();
    expect(html).toMatch(/name="next-error"[^>]*content="not-found"/);
    // Scoped to the page's own content. The sidebar lists every project this
    // admin can see, including `MEINEvim components` — which `getByText` matches
    // case-insensitively on the substring — and a navigation tree naming a
    // project is chrome, not one client's work appearing under another's. The
    // scope claim is about what the PAGE renders.
    const body = page.getByRole("main");
    await expect(body.getByText("EVIM")).toHaveCount(0);
    await expect(body.getByText("Add optional titles to all webparts")).toHaveCount(0);
  });

  test("selected keys from another project are ignored, not imported", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1200, height: 1000 });

    // COD-900 does not exist in EVIM's sprint 17. `selectedKeys` NARROWS the
    // sprint's own items — it can never add one — so asking for it yields an
    // empty report, not another client's item.
    await page.goto(`${SPRINT}/report?items=COD-900`);
    const body = page.locator(".report-body");
    await expect(body).toContainText("Prepared for EVIM");
    await expect(body).not.toContainText("Nile");
    await expect(page.locator(".report-item")).toHaveCount(0);
  });

  test("the rendered export never contains an item outside its sprint", async ({ adminPage: page }) => {
    const outside = await query<{ key: string }>(
      `select w.key from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       where not (p.slug = 'meinevim' and s.number = 17)`
    );

    await page.goto(SPRINT);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.localStorage.removeItem("coditu.export.v1"));
    await page.getByRole("button", { name: "Export" }).click();

    const preview = page.getByRole("dialog", { name: /^Export EVIM/ }).locator("pre");
    await expect(preview).toContainText("COD-229");
    const text = await preview.innerText();

    for (const row of outside) {
      expect(text, `${row.key} belongs to another sprint and must not be in this export`).not.toContain(
        row.key
      );
    }
  });
});

import { SEED, SEED_ENGINEER, SUPABASE_URL, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

test.describe("new item", () => {
  // Serial, and with headroom: these are the first specs to exercise the New
  // item dialog and the intercepted item route in a given dev session, so the
  // first of them pays for compiling both. The assertions themselves are fast.
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  // Creating an item moves the sprint's estimate, so nothing may read
  // the footer totals while one is in flight.
  test.use({ sprintTotals: "write" });

  test.afterEach(async () => {
    await query(`delete from work_items where title like 'E2E new item%'`);
  });

  test("creates the item in the named sprint, with everything it was given", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await page.getByRole("button", { name: "New item" }).click();
    const dialog = page.getByRole("dialog", { name: "New work item" });
    await expect(dialog).toBeVisible();

    // It says where the item is going before anything is typed.
    await expect(dialog).toContainText("into EVIM · Sprint — Week 17");

    await dialog.getByLabel("Title").fill("E2E new item — from the dialog");
    await dialog.getByLabel("Description").fill("Created by the suite.");
    await dialog.getByLabel("Discuss before implementing").fill("Check this first.");
    await dialog.getByLabel("Acceptance criteria — one per line").fill("First one\n- Second one\n\n");
    await dialog.getByLabel("Type").selectOption("bug_fix");
    await dialog.getByLabel("Status").selectOption("in_progress");
    await dialog.getByLabel("Assignee").selectOption({ label: "Ahmed Yehia" });
    await dialog.getByLabel("Deadline").fill("2026-08-23");
    await dialog.getByLabel("Estimate (hours)").fill("2.5");
    await dialog.getByLabel("Grouping").fill("3");

    await page.getByRole("button", { name: "Create item" }).click();

    // It lands on the item it just made. The generous timeout is the dev
    // server compiling the intercepted route for the first time, not the
    // action — the toast fires immediately either way.
    await expect(page).toHaveURL(/\/items\/COD-\d+$/, { timeout: 20_000 });
    await expect(page.getByRole("dialog", { name: /^Work item COD-/ })).toContainText(
      "E2E new item — from the dialog"
    );

    const [row] = await query<{
      key: string;
      status: string;
      type: string;
      deadline: string;
      estimate: string;
      grouping: string;
      highlight: string;
      assignee: string;
      sprint: string;
      slug: string;
      criteria: string;
    }>(
      `select w.key, w.status::text, w.type::text, w.deadline::text,
              w.estimate_minutes::text as estimate, w.grouping::text, w.highlight,
              p.full_name as assignee, s.number::text as sprint, pr.slug,
              (select count(*)::text from acceptance_criteria c where c.work_item_id = w.id) as criteria
       from work_items w
       join sprints s on s.id = w.sprint_id
       join projects pr on pr.id = s.project_id
       left join profiles p on p.id = w.assignee_id
       where w.title = 'E2E new item — from the dialog'`
    );

    expect(row.slug, "invariant 1: it landed under the project that owns the sprint").toBe("meinevim");
    expect(row.sprint).toBe("17");
    expect(row.status).toBe("in_progress");
    expect(row.type).toBe("bug_fix");
    expect(row.deadline).toBe("2026-08-23");
    // 2.5 hours became 150 integer minutes at the boundary. Invariant 2.
    expect(row.estimate).toBe("150");
    expect(row.grouping).toBe("3");
    expect(row.highlight).toBe("Check this first.");
    expect(row.assignee).toBe("Ahmed Yehia");
    // Blank lines dropped, the "- " bullet stripped.
    expect(row.criteria).toBe("2");
    // The key came from the sequence, above everything already seeded.
    expect(Number(row.key.replace("COD-", ""))).toBeGreaterThan(SEED.highestKey);
  });

  test("a new item joins the end of the order, never the top", async ({ adminPage: page }) => {
    const before = await query<{ n: string }>(
      `select max(w.order_index)::text as n from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByRole("button", { name: "New item" }).click();
    // Scoped to the dialog: the table behind it has a "Reorder COD-229 — Add
    // optional titles…" handle whose label also contains the word Title.
    await page
      .getByRole("dialog", { name: "New work item" })
      .getByLabel("Title")
      .fill("E2E new item — ordering");
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page).toHaveURL(/\/items\/COD-\d+$/, { timeout: 20_000 });

    const [row] = await query<{ n: string }>(
      `select order_index::text as n from work_items where title = 'E2E new item — ordering'`
    );
    expect(Number(row.n)).toBe(Number(before[0].n) + 1);
  });

  test("axe finds nothing in the dialog, and it fits a short screen", async ({ adminPage: page }) => {
    // 620px tall: the form is comfortably longer than that, so this also proves
    // the shared shell caps the panel rather than letting it run off-screen.
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto(SPRINT);
    await page.getByRole("button", { name: "New item" }).click();

    const dialog = page.getByRole("dialog", { name: "New work item" });
    await expect(dialog).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);

    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    // Create rides in the pinned footer, so it is reachable without scrolling.
    await expect(page.getByRole("button", { name: "Create item" })).toBeInViewport();
  });

  test("an engineer is told why, rather than shown a form that cannot submit", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const button = page.getByRole("button", { name: "New item" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", "Only an admin or lead can create an item");
  });

  test("the database refuses an engineer's insert even when the app is bypassed", async ({
    browser,
  }) => {
    // The disabled button is a courtesy. THIS is the gate: straight at
    // PostgREST with the engineer's own token, the same thing a hand-rolled
    // request would do.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, SEED_ENGINEER);
    await page.goto(SPRINT);

    const [sprint] = await query<{ id: string }>(
      `select s.id from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    const status = await page.evaluate(async ({ sprintId, supabaseUrl }) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch(`${supabaseUrl}/rest/v1/work_items`, {
        method: "POST",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sprint_id: sprintId, title: "E2E new item — smuggled" }),
      });
      return response.status;
    }, { sprintId: sprint.id, supabaseUrl: SUPABASE_URL });

    expect(status, "an engineer was able to insert a work item").toBeGreaterThanOrEqual(400);

    const rows = await query<{ n: string }>(
      `select count(*)::text as n from work_items where title = 'E2E new item — smuggled'`
    );
    expect(rows[0].n).toBe("0");
    await context.close();
  });
});

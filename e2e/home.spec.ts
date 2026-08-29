import { auditA11y, expect, query, SEED_ENGINEER, shell, signIn, test } from "./fixtures";

/**
 * `/app` is the workspace home, not a redirect.
 *
 * Every number on it comes from the same readers the screens it links to use,
 * so the tests here check that the page AGREES with the database rather than
 * that it renders something. A Home whose sprint card says 14 stories while the
 * sprint says 12 is worse than no Home at all — it is the one screen people
 * glance at without clicking through.
 */

test.describe("workspace home", () => {
  test("it greets you and dates itself in Cairo", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    // Not a redirect any more.
    await expect(page).toHaveURL(/\/app$/);

    const [row] = await query<{ today: string; weekday: string; hour: string }>(
      `select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD') as today,
              trim(to_char((now() at time zone 'Africa/Cairo')::date, 'Day')) as weekday,
              to_char(now() at time zone 'Africa/Cairo', 'HH24') as hour`
    );

    // The database's idea of "today in Cairo" and the page's must be the same
    // one. This is invariant 5 with two independent implementations agreeing.
    await expect(shell(page).getByText(`${row.weekday} · ${row.today}`)).toBeVisible();

    const hour = Number(row.hour);
    const expected =
      hour < 5 ? "Still up," : hour < 12 ? "Good morning," : hour < 18 ? "Good afternoon," : "Good evening,";
    await expect(page.getByRole("heading", { level: 1 })).toContainText(expected);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mohamed");
  });

  test("the sprint card matches what the sprint page would say", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    const [sprint] = await query<{ name: string; items: string; logged: string }>(
      `select s.name,
              count(w.id)::text as items,
              coalesce(sum(w.minutes_logged), 0)::text as logged
         from sprints s
         left join work_items w on w.sprint_id = s.id and w.deleted_at is null
        where s.status = 'active'
        group by s.id, s.name
        order by s.number desc
        limit 1`
    );

    // `shell()` on both, and it is the ONLY thing that changed in these three
    // tests. What they ask for is unaltered: a level-2 heading naming the
    // sprint, the story count, the hours. Unscoped they matched the streaming
    // tree's copy as well as the real one and raised a strict-mode violation —
    // the fault `shell()` was written for and already applied to fourteen
    // assertions in eleven files. The page is what was fixed here.
    await expect(shell(page).getByRole("heading", { level: 2, name: sprint.name })).toBeVisible();
    await expect(shell(page).getByText(`${sprint.items} stories`)).toBeVisible();

    // Invariant 2: minutes in the database, hours only at the render edge.
    const hours = (Number(sprint.logged) / 60).toFixed(1);
    await expect(page.getByText(hours, { exact: false }).first()).toBeVisible();
  });

  test("an ended sprint says ended rather than 0 days left", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    const [sprint] = await query<{ past: boolean }>(
      `select (ends_on < (now() at time zone 'Africa/Cairo')::date) as past
         from sprints where status = 'active' order by number desc limit 1`
    );

    if (sprint.past) {
      // `daysRemaining` clamps at zero, so the obvious rendering says
      // "0 days left" for a sprint that finished last week. It said exactly
      // that until the page was opened in a browser.
      await expect(shell(page).getByText("· ended")).toBeVisible();
      await expect(shell(page).getByText(/0 days left/)).toHaveCount(0);
    } else {
      await expect(shell(page).getByText(/days left/)).toBeVisible();
    }
  });

  test("my work lists what is mine, and links to the story", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    const [mine] = await query<{ n: string }>(
      `select count(*)::text as n
         from work_items w
         join profiles p on p.id = w.assignee_id
         join auth.users u on u.id = p.id
        where u.email = 'mohamed@coditu.com'
          and w.deleted_at is null
          and w.status <> 'done'`
    );

    await expect(shell(page).getByText(`Assigned to me · ${mine.n}`)).toBeVisible();

    // The link has to reach the real, project-scoped URL — invariant 1 lives in
    // it, and a Home that linked to a bare key would be a dead end.
    const first = page.getByRole("link", { name: /^COD-/ }).first();
    await expect(first).toHaveAttribute(
      "href",
      /^\/app\/projects\/[^/]+\/sprints\/\d+\/items\/COD-\d+$/
    );
  });

  test("Home is current in the rail, and Sprint is not", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    // The rail only. The bottom bar marks its own current item, which is
    // correct and is why `rail.spec.ts` scopes the same way.
    const current = await page
      .locator('aside a[aria-current="page"]')
      .evaluateAll((links) => links.map((l) => l.getAttribute("title") ?? ""));
    expect(current).toEqual(["Home"]);
  });

  test("/app/sprint is an entrance, and lands on the real scoped URL", async ({
    adminPage: page,
  }) => {
    await page.goto("/app/sprint");
    // It resolves and redirects: what ends up in the address bar is the URL you
    // can share, which names its project.
    await expect(page).toHaveURL(/\/app\/projects\/[^/]+\/sprints\/\d+$/);
  });

  test("an engineer gets their own home, not an empty one", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ahmed");
    // Home is not an admin screen; the sprint card is the team's sprint.
    await expect(shell(page).getByText("active sprint", { exact: false })).toBeVisible();
  });

  test("nothing overflows at 320px and axe is clean", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/app");

    // Element geometry, not `scrollWidth`: `html` carries `overflow-x-clip`, so
    // scrollWidth reports the clipped width and a real overflow hides in it.
    // `07-FIELD-NOTES.md` records this costing a day twice.
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll("main *")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.right > vw + 1 || r.left < -1)).length;
    });
    expect(overflow).toBe(0);

    expect(await auditA11y(page)).toEqual([]);
  });
});

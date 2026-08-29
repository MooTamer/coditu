import { expect, query, shell, test } from "./fixtures";

/**
 * PF-3 — "EVIM is the main work: most prominent, easiest to reach. Other
 * projects are archived."
 *
 * Two claims, and they are separate.
 *
 * **Prominence.** Every list of projects in the application comes out of
 * `listProjects()`, which sorts by `byProminence` — a running sprint first,
 * then the longest engagement, then the alphabet. `tests/project-prominence.test.ts`
 * holds the RULE against fixtures; this holds that the screens actually use it,
 * which a unit test cannot say.
 *
 * **Archived.** The column has always been filtered by `listProjects()`. The
 * command palette built its own query and did not, so a project deliberately
 * put away was still first-class in search — with its sprints and with every
 * story in them. That is the regression this file exists to keep closed, and it
 * is asserted by archiving a project and looking, rather than by reading the
 * query.
 */
const ARCHIVE_ME = "converso";

test.describe("PF-3 — the project you are working in comes first", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ sprintTotals: "read" });

  test.afterAll(async () => {
    await query(`update projects set is_archived = false where slug = $1`, [ARCHIVE_ME]);
  });

  test("the sidebar opens with the project that has the running sprint", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    const [expected] = await query<{ name: string }>(
      `select p.name from projects p
         join sprints s on s.project_id = p.id and s.status = 'active'
        where not p.is_archived
        order by p.name limit 1`
    );

    // The rail's own list, in render order. `data-rail-spaces` is the section;
    // the first link inside it is the first project.
    const first = page.locator("[data-rail-spaces]:visible nav a").first();
    await expect(first).toContainText(expected.name);
  });

  test("an archived project leaves the sidebar, Home and the command palette", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const [project] = await query<{ name: string; slug: string }>(
      `select name, slug from projects where slug = $1`,
      [ARCHIVE_ME]
    );

    await page.goto("/app");
    await expect(page.locator("[data-rail-spaces]:visible nav")).toContainText(project.name);

    await query(`update projects set is_archived = true where slug = $1`, [ARCHIVE_ME]);
    await page.goto("/app");
    await expect(page.locator("[data-rail-spaces]:visible nav")).not.toContainText(project.name);

    // Search is a surface like any other. This is the one that leaked.
    const dialog = page.getByRole("dialog", { name: "Command palette" });
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

    await dialog.locator("input").fill(project.name.slice(0, 8));
    await expect(dialog.getByRole("option", { name: new RegExp(project.name) })).toHaveCount(0);

    // And its stories go with it — an archived project whose work is still
    // searchable has not been archived.
    const [item] = await query<{ title: string }>(
      `select w.title from work_items w
         join sprints s on s.id = w.sprint_id
         join projects p on p.id = s.project_id
        where p.slug = $1 and w.deleted_at is null limit 1`,
      [ARCHIVE_ME]
    );
    if (item) {
      await dialog.locator("input").fill(item.title.slice(0, 12));
      await expect(dialog.getByRole("option", { name: new RegExp(item.title.slice(0, 12)) })).toHaveCount(0);
    }

    await page.keyboard.press("Escape");
    await query(`update projects set is_archived = false where slug = $1`, [ARCHIVE_ME]);
    await page.goto("/app");
    await expect(page.locator("[data-rail-spaces]:visible nav")).toContainText(project.name);
  });
});

/**
 * PF-5 — average and cumulative load per person, beside the sprint bar.
 *
 * `tests/home.test.ts` holds the arithmetic against fixtures. This holds that
 * the page renders the arithmetic it computed and that the cumulative figure
 * agrees with the database — the same bar every other number on Home is held
 * to, because a Home whose sums disagree with the sprint is worse than no Home.
 */
test.describe("PF-5 — load over time on Home", () => {
  test.use({ sprintTotals: "read" });

  test("every person's cumulative hours match the database, and the average is legible", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");

    // `shell()`, or the streaming tree's copy doubles every row — 8 where the
    // team is 4, and every per-person assertion still passes because the copy
    // carries the same attributes. It is the count that catches it.
    const rows = shell(page).locator("[data-load-history]");
    const count = await rows.count();
    expect(count, "nobody has any load on Home").toBeGreaterThan(0);

    const totals = await query<{ id: string; minutes: string }>(
      `select t.profile_id::text as id, sum(t.minutes)::text as minutes
         from time_entries t
         join work_items w on w.id = t.work_item_id
         join sprints s on s.id = w.sprint_id
         join projects p on p.id = s.project_id
        where p.slug = 'meinevim'
        group by t.profile_id`
    );
    const byPerson = Object.fromEntries(totals.map((row) => [row.id, Number(row.minutes)]));

    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const id = (await row.getAttribute("data-load-history"))!;
      const cumulative = Number(await row.getAttribute("data-load-cumulative"));
      expect(cumulative, `cumulative for ${id}`).toBe(byPerson[id] ?? 0);

      // Rendered, not just attributed: hours are a presentation concern and
      // this is the render edge — invariant 2's only division by 60.
      await expect(row).toContainText(`${(cumulative / 60).toFixed(1)} h total`);

      const weeks = Number(await row.getAttribute("data-load-weeks"));
      const average = await row.getAttribute("data-load-average");
      if (average === "") {
        expect(weeks, "no average, so there must be no complete week").toBe(0);
        await expect(row).toContainText("no full week yet");
      } else {
        expect(weeks).toBeGreaterThan(0);
        await expect(row).toContainText(`${(Number(average) / 60).toFixed(1)} h/wk · ${weeks} wks`);
        // The count has to be there beside the number, or nobody can check it.
        expect(Number(average) * weeks).toBeLessThanOrEqual(cumulative + weeks);
      }
    }

    // The bar and the history are two different questions about one person, and
    // the point of PF-5 is that both are on screen.
    expect(await shell(page).locator("[data-load-bar]").count()).toBe(count);
  });
});

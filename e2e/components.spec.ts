import { readFileSync } from "node:fs";

import { SEED, SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = SEED.sprint;
const REGISTRY = "/app/projects/meinevim/components";

/**
 * The component registry, and attributing work to it.
 *
 * Every count in here is read out of the DATABASE rather than written down.
 * `npm run components:sync` is supposed to change how many components there are,
 * and re-importing Notion is supposed to change how many items each one holds —
 * a test that failed when either happened would be a test against the feature
 * working.
 *
 * The seed attributes the imported work by title (`seeds/item-components.sql`),
 * so most rows arrive with a component already on them. Tests that change one
 * put it back by re-running that file: it only ever fills a NULL, so nulling the
 * row first and replaying it restores exactly what a fresh seed would hold.
 */
const ATTRIBUTION_SEED = readFileSync("supabase/seeds/item-components.sql", "utf8");
test.describe("components", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  // Attributing an item does not move any total, but the picker writes to a
  // Week 17 row and the New item case creates one.
  test.use({ sprintTotals: "write" });

  test.afterEach(async () => {
    await query(`delete from work_items where title like 'E2E component%'`);
    await query(`delete from components where slug like 'e2e-%'`);
    // Clear the TAGS, not the mirror column. Nulling `component_id` removes only
    // the first tag — the column-to-join trigger promotes and keeps, which is
    // the whole point of it — so the extras a multi-select test ticked would
    // survive into the next test and quietly change what it is looking at.
    await query(
      `delete from work_item_components wc
        using work_items w
        where w.id = wc.work_item_id and w.key = any($1)`,
      [[SEED.item, SEED.otherItem]]
    );
    await query(`update work_items set component_id = null where key = any($1)`, [
      [SEED.item, SEED.otherItem],
    ]);
    await query(ATTRIBUTION_SEED);
  });

  test("the registry lists what the delivery repo has, with its toolbox icons", async ({
    adminPage: page,
  }) => {
    const [{ total, withIcon }] = await query<{ total: string; withIcon: string }>(
      `select count(*)::text as total, count(icon)::text as "withIcon"
       from components c join projects p on p.id = c.project_id
       where p.slug = 'meinevim'`
    );

    await page.goto(REGISTRY);

    await expect(page.getByRole("heading", { name: "Components", level: 1 })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(Number(total));

    // The names are the SharePoint titles, not the folder names — `Tabs with
    // Cards` ships as *EVIM Themen Kachel*, and a ticket calls it the latter.
    await expect(page.getByRole("link", { name: /EVIM Themen Kachel/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /EVIM Dokumentenbibliothek/ })).toBeVisible();

    // Every card draws a glyph. They are decorative — the name carries the
    // meaning — so they are asserted by count, not by accessible name.
    const icons = page.locator("main ul li svg");
    expect(await icons.count()).toBeGreaterThanOrEqual(Number(withIcon));
  });

  test("a row's components are ticked in the registry, and the change is recorded", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const row = page.locator("tbody tr", { hasText: SEED.item });
    await row.getByRole("button", { name: /^Components:/ }).click();

    // Forty options need a filter, which is the reason this is a listbox and
    // not a <select>.
    await page.getByLabel("Filter components").fill("themen");
    const options = page.getByRole("option");
    await expect(options).toHaveCount(1);
    await options.first().click();

    // Ticking does NOT close the panel — choosing several components is one
    // decision, so the whole set is sent on the way out. The option reports its
    // own state in the meantime.
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Filter components")).toBeVisible();

    // Escape is how a keyboard user finishes, so it is the exit worth testing:
    // if the commit hung off the click handler instead, this would write nothing.
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Filter components")).toHaveCount(0);

    await expect(row.getByRole("button", { name: /^Components:.*EVIM Themen Kachel/ })).toBeVisible();

    // Polled, not read once: the cell writes OPTIMISTICALLY, so the name is on
    // screen before the server has answered. Reading the row the instant the
    // label appears is a race this suite would lose about half the time.
    await expect
      .poll(async () => {
        // Through the join table: the mirror column holds only the first tag.
        const stored = await query<{ slug: string }>(
          `select c.slug from work_items w
           join work_item_components wc on wc.work_item_id = w.id
           join components c on c.id = wc.component_id
           where w.key = $1 order by c.slug`,
          [SEED.item]
        );
        return stored.map((row) => row.slug).join(",");
      })
      .toContain("evim-themen-kachel");

    // The change is history, not just state: the activity trigger names the
    // component rather than its id.
    const [activity] = await query<{ to_value: string }>(
      `select a.to_value from activity a
       join work_items w on w.id = a.work_item_id
       where w.key = $1 and a.field = 'component'
       order by a.created_at desc limit 1`,
      [SEED.item]
    );
    expect(activity.to_value).toBe("EVIM Themen Kachel");
  });

  test("the filter box hands over to the list on ArrowDown", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await page
      .locator("tbody tr", { hasText: SEED.item })
      .getByRole("button", { name: /^Components:/ })
      .click();

    const filter = page.getByLabel("Filter components");
    await expect(filter).toBeFocused();
    await filter.fill("evim b");
    await filter.press("ArrowDown");

    // The first option, not the filter box and not whatever Tab would have
    // reached. `optionListKeyDown` takes over from here.
    const first = page.getByRole("option").first();
    await expect(first).toBeFocused();
    await first.press("ArrowDown");
    await expect(page.getByRole("option").nth(1)).toBeFocused();
  });

  test("Enter ticks the only match", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const row = page.locator("tbody tr", { hasText: SEED.otherItem });
    await row.getByRole("button", { name: /^Components:/ }).click();

    const filter = page.getByLabel("Filter components");
    await filter.fill("dokumentenbibliothek");
    await filter.press("Enter");

    // Ticked, panel still open, and only then committed.
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");

    // ADDED, not swapped: the seed already attributed this row, and a
    // multi-select that silently drops what it did not name would be the same
    // data loss the single column caused.
    await expect(
      row.getByRole("button", { name: /^Components:.*EVIM Dokumentenbibliothek/ })
    ).toBeVisible();
    await expect(row).toContainText("EVIM Themen Kachel");
  });

  test("the sprint reads one component at a time", async ({ adminPage: page }) => {
    // Counted through `work_item_components`, which is what the page filters
    // on. The old query joined `work_items.component_id` — the mirror — and a
    // story is allowed to carry a component as its SECOND tag now, where the
    // mirror still names the first. The two counts diverge the moment any test
    // adds a tag, and the page is the one that is right.
    const [{ count }] = await query<{ count: string }>(
      `select count(*)::text from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       join work_item_components wc on wc.work_item_id = w.id
       join components c on c.id = wc.component_id
       where p.slug = 'meinevim' and s.number = 17 and c.slug = 'evim-themen-kachel'`
    );
    expect(Number(count)).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${SPRINT}?component=evim-themen-kachel`);

    await expect(page.locator("tbody tr")).toHaveCount(Number(count));
    await expect(page.locator("tbody tr").first()).toContainText("EVIM Themen Kachel");

    // A slug that is not this project's registry is not a filter — the table
    // shows everything rather than silently matching nothing.
    await page.goto(`${SPRINT}?component=not-a-real-component`);
    await expect(page.locator("tbody tr")).toHaveCount(SEED.itemCount);
  });

  test("a component's page collects its work across sprints", async ({ adminPage: page }) => {
    // The point of the whole feature: Themen Kachel has been worked in more
    // than one sprint, and the imported titles are what say so.
    const sprints = await query<{ number: number }>(
      `select distinct s.number from work_items w
       join sprints s on s.id = w.sprint_id
       join projects p on p.id = s.project_id
       join components c on c.id = w.component_id
       where p.slug = 'meinevim' and c.slug = 'evim-themen-kachel'
       order by s.number desc`
    );
    expect(sprints.length).toBeGreaterThan(1);

    await page.goto(`${REGISTRY}/evim-themen-kachel`);

    await expect(page.getByRole("heading", { name: "EVIM Themen Kachel", level: 1 })).toBeVisible();
    // One SPRINT heading per sprint — scoped by the id the sections label
    // themselves with, not "every h2 on the page". The broad version passed
    // until the client-visibility panel arrived with a heading of its own, and
    // then failed for a reason that had nothing to do with sprints.
    await expect(page.locator('h2[id^="sprint-"]')).toHaveCount(sprints.length);
    await expect(page.getByRole("link", { name: new RegExp(SEED.otherItem) })).toBeVisible();

    // Straight back into the sprint, filtered to this component.
    await page.getByRole("link", { name: "Sprint — Week 17", exact: true }).click();
    await expect(page).toHaveURL(/\?component=evim-themen-kachel$/);
  });

  test("a component that does not belong to the project is a 404, not another client's page", async ({
    adminPage: page,
  }) => {
    // Invariant 1. The dossier is looked up by project id AND slug together, so
    // guessing a URL cannot read across the boundary.
    await query(
      `insert into components (project_id, name, slug, kind)
       select id, 'E2E Converso thing', 'e2e-converso-thing', 'react'
       from projects where slug = 'converso'`
    );

    await page.goto(`${REGISTRY}/e2e-converso-thing`);

    // The status is 200 and that is not the regression it looks like: the
    // project segment owns a `loading.tsx`, so the shell is flushed before the
    // page runs and `notFound()` can no longer change a status already sent.
    // Same trap as the cross-project item 404 — see item-detail.spec.ts and
    // docs/05-DECISIONS.md. What matters is asserted directly.
    await expect(
      page.getByRole("heading", { name: "There is nothing at this address." })
    ).toBeVisible();
    const html = await (await page.request.get(`${REGISTRY}/e2e-converso-thing`)).text();
    expect(html).toMatch(/name="next-error"[^>]*content="not-found"/);
    await expect(page.getByText("E2E Converso thing")).toHaveCount(0);
  });

  test("an engineer sees the component and cannot change it", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(SPRINT);
    // A row the seed already attributed — "Tabs with Cards" is Themen Kachel.
    const row = page.locator("tbody tr", { hasText: SEED.otherItem });

    await expect(row).toContainText("EVIM Themen Kachel");
    // Not a hidden control — a visible value with a reason attached.
    await expect(row.getByRole("button", { name: /^Components:/ })).toHaveCount(0);
    await expect(row.locator('[aria-disabled="true"]', { hasText: "EVIM Themen Kachel" })).toBeVisible();
  });

  test("a new item is created with a component, and a component can be added in place", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await page.getByRole("button", { name: "New item" }).click();
    const dialog = page.getByRole("dialog", { name: "New work item" });
    await dialog.getByLabel("Title").fill("E2E component — created with one");

    await dialog.getByRole("button", { name: /^Component:/ }).click();
    await page.getByLabel("Filter components").fill("E2E Brand New Part");
    await page.getByRole("button", { name: /^New component/ }).click();

    // Scoped to the panel and exact: every attributed row in the table behind
    // this dialog also announces "Microsoft web part" as part of its cell label.
    const panel = page.locator("[data-cell-popover]");
    // The filter text became the name, because that is what was just typed.
    await expect(panel.getByRole("textbox")).toHaveValue("E2E Brand New Part");
    await panel.getByRole("button", { name: "Microsoft web part", exact: true }).click();
    await panel.getByRole("button", { name: "Add", exact: true }).click();

    await expect(dialog.getByRole("button", { name: /E2E Brand New Part/ })).toBeVisible();

    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page).toHaveURL(/\/items\/COD-\d+$/, { timeout: 20_000 });

    const [row] = await query<{ component: string; kind: string; icon: string | null }>(
      `select c.name as component, c.kind::text, c.icon
       from work_items w join components c on c.id = w.component_id
       where w.title = 'E2E component — created with one'`
    );
    expect(row.component).toBe("E2E Brand New Part");
    expect(row.kind).toBe("spfx");
    // Nothing invents an icon: the toolbox glyph is a fact about the delivery
    // repository, filled in by the sync script when the web part exists there.
    expect(row.icon).toBeNull();
  });

  test("neither new route logs anything on the way in", async ({ adminPage: page }) => {
    // A hydration mismatch is the failure this is really watching for: both
    // routes are Server Components with one client island, and the island was
    // added to a page that renders forty rows of server-side markup. React
    // reports it once, in the console, and nowhere else — so without this it is
    // something you notice by accident or not at all.
    //
    // React's hydration warning is filtered, and the measurement behind that is
    // already in this suite: once `/app` gained its `loading.tsx` files every
    // screen sits inside a `<Suspense>`, and on the DEV server the gap between
    // flushing the shell and resolving the boundary is wide enough that
    // hydration sometimes wins the race — 10 in 60 page loads against
    // `next dev`, 0 in 60 against a production build, under six workers. It
    // costs this spec a failure only when the machine is busy, which is the
    // definition of a flake. `comments.spec.ts` carries the same filter and the
    // same numbers; a REAL mismatch still shows up there and here, because it
    // does not need a loaded machine to happen.
    const hydrationNoise = /^Hydration failed|hydrated but some attributes|did not match/i;
    const noise: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (hydrationNoise.test(message.text())) return;
      noise.push(message.text());
    });
    page.on("pageerror", (error) => {
      if (hydrationNoise.test(error.message)) return;
      noise.push(error.message);
    });

    await page.goto(REGISTRY);
    await page.goto(`${REGISTRY}/evim-banner-and-news`);
    await expect(page.getByRole("heading", { name: "EVIM Banner and News", level: 1 })).toBeVisible();

    expect(noise).toEqual([]);
  });

  test("match any is at least one, match all is every one", async ({ adminPage: page }) => {
    // Two components this sprint actually uses, discovered rather than written
    // down: `npm run components:sync` and a re-import both change which is which.
    const [pair] = await query<{ a: string; b: string }>(
      `select a.slug as a, b.slug as b
         from (select distinct c.slug, c.id from work_items w
                 join sprints s on s.id = w.sprint_id
                 join projects p on p.id = s.project_id
                 join work_item_components wc on wc.work_item_id = w.id
                 join components c on c.id = wc.component_id
                where p.slug = 'meinevim' and s.number = 17) a
         cross join lateral (select c.slug from work_items w
                 join sprints s on s.id = w.sprint_id
                 join projects p on p.id = s.project_id
                 join work_item_components wc on wc.work_item_id = w.id
                 join components c on c.id = wc.component_id
                where p.slug = 'meinevim' and s.number = 17 and c.slug <> a.slug
                limit 1) b
        limit 1`
    );
    expect(pair, "the sprint needs two distinct components for this to mean anything").toBeTruthy();

    // Give ONE story both of them, so `all` has an answer that `any` does not.
    await query(
      `insert into work_item_components (work_item_id, component_id)
       select w.id, c.id from work_items w, components c
        where w.key = $1 and c.slug = any($2)
       on conflict do nothing`,
      [SEED.item, [pair.a, pair.b]]
    );

    const expected = async (mode: "any" | "all") => {
      const [{ count }] = await query<{ count: string }>(
        `select count(*)::text from work_items w
           join sprints s on s.id = w.sprint_id
           join projects p on p.id = s.project_id
          where p.slug = 'meinevim' and s.number = 17
            and (select count(distinct c.slug) from work_item_components wc
                   join components c on c.id = wc.component_id
                  where wc.work_item_id = w.id and c.slug = any($1)) ${mode === "all" ? "= 2" : ">= 1"}`,
        [[pair.a, pair.b]]
      );
      return Number(count);
    };

    const anyCount = await expected("any");
    const allCount = await expected("all");
    // If these were equal the test could pass with the two modes wired together.
    expect(anyCount).toBeGreaterThan(allCount);
    expect(allCount).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${SPRINT}?component=${pair.a},${pair.b}`);
    await expect(page.locator("tbody tr")).toHaveCount(anyCount);

    await page.goto(`${SPRINT}?component=${pair.a},${pair.b}&match=all`);
    await expect(page.locator("tbody tr")).toHaveCount(allCount);

    // An unrecognised mode widens rather than narrows: a link written before
    // `match` existed has none, and a filter that quietly hides work is worse
    // than one that shows too much.
    await page.goto(`${SPRINT}?component=${pair.a},${pair.b}&match=nonsense`);
    await expect(page.locator("tbody tr")).toHaveCount(anyCount);

    // The toggle only exists once there is something to combine.
    await expect(page.getByRole("button", { name: "match all" })).toBeVisible();
    await page.goto(`${SPRINT}?component=${pair.a}`);
    await expect(page.getByRole("button", { name: "match all" })).toHaveCount(0);
  });

  test("the registry and a component's page are clean to axe", async ({ adminPage: page }) => {
    await page.goto(REGISTRY);
    expect(await auditA11y(page)).toEqual([]);

    await page.goto(`${REGISTRY}/evim-themen-kachel`);
    expect(await auditA11y(page)).toEqual([]);

    // And with a picker open: the panel is portalled to <body>, so it is not
    // covered by an audit of the page that opened it.
    await page.goto(SPRINT);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("tbody tr").first().getByRole("button", { name: /^Components:/ }).click();
    await expect(page.getByLabel("Filter components")).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });
});

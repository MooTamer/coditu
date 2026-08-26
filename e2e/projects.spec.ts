import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

/**
 * The projects list: what it shows, and the three ways to narrow it.
 *
 * The filtering itself is asserted in `tests/project-filters.test.ts`, which is
 * where the predicate lives. What can only be checked here is that the URL and
 * the page agree — that a filter typed into the box is a filter in the address
 * bar, survives a reload, and comes back the same when the link is pasted.
 *
 * ## This file archives a real project, and puts it back
 *
 * The seed has no archived project, so there is nothing to test the toggle
 * against without making one. `ops-console` is the one used: no sprints, no
 * items, and no other spec mentions it. The `finally` sets the column back in
 * SQL rather than through the UI, so a failure halfway cannot leave the seed
 * changed — which `07-FIELD-NOTES.md` records as the failure mode that reads
 * exactly like a regression in somebody else's work.
 *
 * It runs in the chromium project only, like every spec outside `ON_A_PHONE`,
 * so nothing races it for that row.
 */

const LIST = "/app/projects";
const SLUGS = ["converso", "meinevim", "nile-atelier", "nvrmiss", "ops-console"];

const rows = (page: import("@playwright/test").Page) => page.locator("[data-project-row]");
const slugs = (page: import("@playwright/test").Page) =>
  rows(page).evaluateAll((list) =>
    list.map((row) => (row as HTMLElement).dataset.projectSlug ?? "")
  );

test.describe("the projects list", () => {
  test("shows every live project, with what it has and what happened last", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);

    expect(await slugs(page)).toEqual(SLUGS);

    const evim = rows(page).filter({ hasText: "MEINEvim components" });
    await expect(evim).toContainText("41 components");
    await expect(evim).toContainText("15 sprints");
    // Read from the database rather than hard-coded: the seed's hours move
    // whenever anything logs time, and a spec that pins them fails for the
    // wrong reason.
    const [{ minutes }] = await query<{ minutes: string }>(
      `select coalesce(sum(w.minutes_logged), 0)::text as minutes
         from public.work_items w
         join public.sprints s on s.id = w.sprint_id
         join public.projects p on p.id = s.project_id
        where p.slug = 'meinevim'`
    );
    await expect(evim).toContainText(`${(Number(minutes) / 60).toFixed(1)} h`);

    // A project nothing has happened on says so, and says it about a WINDOW —
    // `listProjectOverviews` bounds the scan by days, so "no activity" would be
    // a claim it cannot make.
    await expect(rows(page).filter({ hasText: "Nile Atelier" })).toContainText("nothing recent");
  });

  test("a count of nothing is a sentence, not a dash with a plural after it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);

    const quiet = rows(page).filter({ hasText: "Ops Console" });
    await expect(quiet).toContainText("no components");
    await expect(quiet).toContainText("no sprints");
    await expect(quiet).toContainText("no hours");
    await expect(quiet).not.toContainText("— components");
    // Converso has exactly one, which is the case an `s` gets wrong.
    await expect(rows(page).filter({ hasText: "Converso dashboard" })).toContainText("1 sprint");
  });

  test("searching narrows the list and the URL, and the link is shareable", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);

    await page.getByRole("searchbox", { name: /Search projects/ }).fill("evim");

    await expect(page).toHaveURL(/\?q=evim$/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("MEINEvim components");
    // The count says what is hidden. A filtered list that looks like the whole
    // list is how somebody concludes a project has disappeared.
    //
    // `[data-project-count]` rather than `[aria-live="polite"]`: the toast
    // container carries that attribute too, so the role selector resolves to
    // two elements the moment anything shows a toast.
    await expect(page.locator("[data-project-count]")).toHaveText("1 of 5");

    // Pasted, not typed — the filter is in the URL or it is not shareable.
    await page.goto(`${LIST}?q=evim`);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("searchbox", { name: /Search projects/ })).toHaveValue("evim");
  });

  test("a state chip narrows, two chips widen, and an unknown state is ignored", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${LIST}?state=active`);
    expect(await slugs(page)).toEqual(["meinevim"]);

    await page.goto(`${LIST}?state=active,planned`);
    expect(await slugs(page)).toEqual(["converso", "meinevim"]);

    // `paused` is the prototype's word and this schema has no column that could
    // answer it. It narrows by the state that IS named rather than guessing.
    await page.goto(`${LIST}?state=active,paused`);
    expect(await slugs(page)).toEqual(["meinevim"]);

    // And nothing matching says so, rather than quietly showing everything.
    await page.goto(`${LIST}?q=nothing+here`);
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("No project matches those filters.")).toBeVisible();
  });

  test("archiving takes a project out of the list, and the toggle brings it back", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await page.goto(LIST);
      await expect(rows(page).filter({ hasText: "Ops Console" })).toBeVisible();

      await page.getByRole("button", { name: "Archive Ops Console" }).click();
      await expect(rows(page).filter({ hasText: "Ops Console" })).toHaveCount(0);
      // It is hidden, not gone, and the count is what says so.
      await expect(page.locator("[data-project-count]")).toHaveText("4 of 5");

      await page.getByRole("button", { name: "Show archived" }).click();
      await expect(page).toHaveURL(/archived=1/);

      const archivedRow = rows(page).filter({ hasText: "Ops Console" });
      await expect(archivedRow).toBeVisible();
      await expect(archivedRow).toContainText("archived");
      // The way back is on the row itself. It used to be a separate list under
      // the admin panel, which the search and the state chips could not see.
      await expect(page.getByRole("button", { name: "Restore Ops Console" })).toBeVisible();

      await page.getByRole("button", { name: "Restore Ops Console" }).click();
      await expect(rows(page).filter({ hasText: "Ops Console" })).toContainText("no open sprint");
      await expect(page.getByRole("button", { name: "Archive Ops Console" })).toBeVisible();
    } finally {
      // In SQL, not through the UI: a failure above must not leave the seed
      // changed for whatever runs next.
      await query(`update public.projects set is_archived = false where slug = 'ops-console'`);
    }
  });

  test("an engineer sees the list and none of the controls", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);

    await expect(rows(page)).toHaveCount(SLUGS.length);
    // RLS refuses their write anyway; a button that always fails is worse than
    // no button.
    await expect(page.getByRole("button", { name: /^Archive / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);
    // The filters are everybody's, though.
    await expect(page.getByRole("searchbox", { name: /Search projects/ })).toBeVisible();
  });

  test("axe is clean, and nothing overflows at 320", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${LIST}?q=evim&state=active`);
    expect(await auditA11y(page), "the projects list, filtered").toEqual([]);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(LIST);
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1);
        })
        .map((element) => element.tagName + "." + element.className.toString().slice(0, 40))
    );
    expect(overflowing, "nothing overflows at 320px").toEqual([]);
  });
});

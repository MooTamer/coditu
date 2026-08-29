import {
  auditA11y,
  createThrowawayAccount,
  expect,
  query,
  removeThrowawayAccount,
  test,
} from "./fixtures";

/**
 * A project's own page: what it is, what is in it, and who can see it.
 *
 * The four panels down the right are the reason this file exists. Three of them
 * have an empty state that the seed happens to be in — no saved views, no client
 * contacts — so the interesting half is only reachable by putting a row in and
 * taking it out again. Every one of those does its cleanup in SQL, in a
 * `finally`, for the reason `07-FIELD-NOTES.md` gives: a spec that leaves the
 * seed changed fails somebody else's test in a way that reads exactly like a
 * regression in their code.
 */

const EVIM = "/app/projects/meinevim";
const QUIET = "/app/projects/ops-console";

const panel = (page: import("@playwright/test").Page, name: string) =>
  page.locator(`[data-project-panel="panel-${name}"]`);

test.describe("a project's own page", () => {
  test("names the client, the prefix people say out loud, and the sprint to open", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EVIM);

    await expect(page.getByRole("heading", { level: 1, name: "MEINEvim components" })).toBeVisible();
    await expect(page.getByText("EVIM", { exact: true }).first()).toBeVisible();
    // The key prefix is the one fact about a project that gets said out loud and
    // cannot be looked up anywhere else.
    await expect(page.getByText("COD-", { exact: true })).toBeVisible();

    const open = page.getByRole("link", { name: /^Open Week 17$/ });
    await expect(open).toBeVisible();
    await open.click();
    await expect(page).toHaveURL(/\/app\/projects\/meinevim\/sprints\/17$/);
  });

  test("a project with nothing running says so rather than hiding the control", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(QUIET);

    // Present and explaining itself, never hidden — the rule Export and New
    // item follow in the topbar.
    const stated = page.getByText("No sprint running");
    await expect(stated).toBeVisible();
    await expect(stated).toHaveAttribute("title", /Sprints belong to a project/);
    await expect(page.getByRole("link", { name: /^Open / })).toHaveCount(0);
  });

  test("the team is read from the seats on the work, not from a list nobody maintains", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EVIM);

    const [{ names }] = await query<{ names: string[] }>(
      `select coalesce(array_agg(distinct p.full_name order by p.full_name), '{}') as names
         from public.work_items w
         join public.sprints s on s.id = w.sprint_id
         join public.projects pr on pr.id = s.project_id
         join public.profiles p
           on p.id = w.assignee_id or p.id = w.reviewer_id
        where pr.slug = 'meinevim'`
    );

    const team = panel(page, "team");
    for (const name of names) await expect(team).toContainText(name);
    await expect(team.locator("li")).toHaveCount(names.length);

    // A project nobody has been given work on says why it is empty.
    await page.goto(QUIET);
    await expect(panel(page, "team")).toContainText("Nobody holds a seat on an item here yet");
  });

  test("the activity panel links to the story it is about", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EVIM);

    const latest = panel(page, "latest-activity");
    const first = latest.getByRole("link").first();
    const key = (await first.textContent())?.trim() ?? "";
    expect(key, "the row names a story").toMatch(/^COD-\d+$/);

    await first.click();
    await expect(page).toHaveURL(new RegExp(`/sprints/\\d+/items/${key}$`));
  });

  test("a saved view is offered here, and carries its question into the sprint", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const name = "Peer review queue (project-home spec)";
    try {
      await query(
        `insert into public.saved_views (project_id, owner_id, name, spec, is_shared)
         select p.id, pr.id, $1, $2::jsonb, true
           from public.projects p, public.profiles pr
          where p.slug = 'meinevim' and pr.full_name = 'Mohamed Tamer'`,
        [name, JSON.stringify({ status: "in_peer_review", sort: "deadline:asc" })]
      );

      await page.goto(EVIM);
      const views = panel(page, "saved-views");
      await expect(views).toContainText(name);
      // The spec is summarised, not listed — "1 filter · sorted" fits a 320px
      // column and the full sentence does not.
      await expect(views).toContainText("1 filter · sorted");
      await expect(views).toContainText("shared");

      await views.getByRole("link", { name: new RegExp(name.replace(/[()]/g, "\\$&")) }).click();
      // A view saved against no sprint follows whichever one is running.
      await expect(page).toHaveURL(/\/sprints\/17\?.*status=in_peer_review/);
      await expect(page).toHaveURL(/sort=deadline%3Aasc|sort=deadline:asc/);
    } finally {
      await query(`delete from public.saved_views where name = $1`, [name]);
    }
  });

  test("client access is a count and what it allows, never an address", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(EVIM);
    await expect(panel(page, "client-access")).toContainText(
      "Nothing here is visible outside the company"
    );

    /**
     * A contact and a live grant, built for this test: the seed has neither, so
     * the panel's other half is unreachable without one.
     *
     * The profile comes from `createThrowawayAccount` rather than a raw insert,
     * because `profiles.id` references `auth.users` — a profile without an auth
     * user is refused, which is the schema saying that a person in this app is
     * an account first.
     */
    const contact = {
      email: "project-home-spec@coditu.test",
      password: "project-home-spec-2026",
      fullName: "Project Home Spec Contact",
    };
    try {
      await createThrowawayAccount(contact);
      await query(
        `insert into public.client_contacts (profile_id, client_id, status)
         select p.id, c.id, 'active'
           from public.profiles p, public.clients c
          where p.full_name = $1 and c.name = 'EVIM'`,
        [contact.fullName]
      );
      await query(
        `insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
         select p.id, pr.id, array['view_project', 'view_components']::client_capability[]
           from public.profiles p, public.projects pr
          where p.full_name = $1 and pr.slug = 'meinevim'`,
        [contact.fullName]
      );

      await page.goto(EVIM);
      const access = panel(page, "client-access");
      await expect(access).toContainText("One client contact can see this project.");
      await expect(access).toContainText("See the project");
      await expect(access).toContainText("See published components");
      // The contact itself is deliberately absent — an outside person's name
      // and address do not belong on a screen shown in a stand-up.
      await expect(access).not.toContainText(contact.fullName);
      await expect(access.getByRole("link", { name: /Manage access/ })).toBeVisible();
    } finally {
      await query(
        `delete from public.client_project_grants
           where contact_profile_id in (select id from public.profiles where full_name = $1)`,
        [contact.fullName]
      );
      await query(
        `delete from public.client_contacts
           where profile_id in (select id from public.profiles where full_name = $1)`,
        [contact.fullName]
      );
      await removeThrowawayAccount(contact.email);
    }
  });

  /**
   * A pure-CSS layout rule, which `07-FIELD-NOTES.md` records as the kind only
   * a browser can catch — a Tailwind variant that compiles to nothing leaves
   * the class on the element and every static check green.
   *
   * The number is measured: at 1360 the main column is 683px and seven things
   * in the sprint manager clip, `Sprint — Week 16` down to 37px of the 119 it
   * needs. At 1400 it is 721 and nothing clips.
   */
  test("the aside sits beside the work only where the work still fits", async ({
    adminPage: page,
  }) => {
    await page.goto(EVIM);

    await page.setViewportSize({ width: 1440, height: 900 });
    // Descendant, not direct child. `PageShell` puts a max-width wrapper
    // between `<main>` and the page's own content, so `main > div.grid` matched
    // nothing and this failed on a layout that is correct. A depth-coupled
    // selector breaks every time the shell gains a wrapper; this one does not.
    // The page has exactly one `.grid`, and it is the outermost element under
    // the header.
    const grid = page.locator("main div.grid").first();
    await expect(grid).toHaveCSS("grid-template-columns", /^\d+(\.\d+)?px 320px$/);
    const clippedWide = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-labelledby="sprints"] *')].filter(
        (element) => element.scrollWidth > element.clientWidth + 1
      ).length
    );
    expect(clippedWide, "nothing in the sprint manager clips at 1440").toBe(0);

    // Below it, one column — the aside is under the work, not squeezing it.
    await page.setViewportSize({ width: 1360, height: 900 });
    await expect(grid).not.toHaveCSS("grid-template-columns", /320px$/);
  });

  test("axe is clean, and nothing overflows at 320", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(EVIM);
    expect(await auditA11y(page), "the project page").toEqual([]);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(EVIM);
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

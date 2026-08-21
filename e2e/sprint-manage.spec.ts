import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

/**
 * Managing sprints, on the project that owns them.
 *
 * Every sprint these tests touch is one they create. Starting or closing a
 * seeded sprint would move "sprint 17 · active" out from under every spec that
 * reads it, and the failure would land somewhere else entirely.
 */
const PROJECT = "/app/projects/meinevim";
const NAME = "E2E managed sprint";
const NUMBER = 901;

async function removeManaged() {
  await query(`delete from public.sprints where name like 'E2E managed%' or number >= 900`);
}

async function readManaged() {
  const [row] = await query<{ status: string; name: string; starts: string | null; ends: string | null }>(
    `select status::text, name, starts_on::text as starts, ends_on::text as ends
     from public.sprints where number = $1`,
    [NUMBER]
  );
  return row;
}

test.describe("managing sprints", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(removeManaged);
  test.afterEach(removeManaged);

  test("opens a sprint, planned, without disturbing the one that is running", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    await page.getByRole("button", { name: "New sprint" }).click();
    await page.getByLabel("Number").fill(String(NUMBER));
    await page.getByLabel("Name").fill(NAME);
    await page.getByLabel("Starts").fill("2026-09-07");
    await page.getByLabel("Ends").fill("2026-09-13");
    await page.getByRole("button", { name: "Open sprint" }).click();

    await expect.poll(async () => (await readManaged())?.status, { timeout: 8000 }).toBe("planned");

    // Week 17 is still the one running. A new sprint that quietly displaced it
    // would move a week of hours onto the wrong sprint.
    const [running] = await query<{ number: string }>(
      `select s.number::text from public.sprints s
       join public.projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.status = 'active'`
    );
    expect(running.number).toBe("17");
  });

  test("a second sprint cannot be started while one is running, and says which", async ({
    adminPage: page,
  }) => {
    await query(
      `insert into public.sprints (project_id, number, name, status)
       select p.id, $1, $2, 'planned' from public.projects p where p.slug = 'meinevim'`,
      [NUMBER, NAME]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    const row = page.locator("[data-sprint-row]", { hasText: NAME });
    const start = row.getByRole("button", { name: "Start" });
    await expect(start).toBeDisabled();
    // The tooltip names the sprint in the way, rather than leaving the reader
    // to guess why a button is dead.
    await expect(start).toHaveAttribute("title", /Sprint — Week 17 is still running/);
  });

  test("close, start, reopen — the three moves, in the database", async ({ adminPage: page }) => {
    // Its own project, so closing the active sprint here cannot disturb EVIM.
    await query(
      `insert into public.sprints (project_id, number, name, status)
       select p.id, $1, $2, 'planned' from public.projects p where p.slug = 'nile-atelier'`,
      [NUMBER, NAME]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/projects/nile-atelier");

    const row = page.locator("[data-sprint-row]", { hasText: NAME });

    await row.getByRole("button", { name: "Start" }).click();
    await expect.poll(async () => (await readManaged()).status, { timeout: 8000 }).toBe("active");

    await row.getByRole("button", { name: "Close" }).click();
    await expect.poll(async () => (await readManaged()).status, { timeout: 8000 }).toBe("closed");

    await row.getByRole("button", { name: "Reopen" }).click();
    await expect.poll(async () => (await readManaged()).status, { timeout: 8000 }).toBe("planned");
  });

  test("name and dates edit in place", async ({ adminPage: page }) => {
    await query(
      `insert into public.sprints (project_id, number, name, status, starts_on, ends_on)
       select p.id, $1, $2, 'planned', '2026-09-07', '2026-09-13'
       from public.projects p where p.slug = 'meinevim'`,
      [NUMBER, NAME]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    await page.getByRole("button", { name: `Edit sprint ${NUMBER}` }).click();
    await page.getByLabel(`Name of sprint ${NUMBER}`).fill("E2E managed sprint, renamed");
    await page.getByLabel(`End of sprint ${NUMBER}`).fill("2026-09-20");
    await page.getByRole("button", { name: `Save sprint ${NUMBER}` }).click();

    await expect
      .poll(async () => (await readManaged()).name, { timeout: 8000 })
      .toBe("E2E managed sprint, renamed");
    expect((await readManaged()).ends).toBe("2026-09-20");
  });

  test("a sprint holding work cannot be deleted, and says how much", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    // Week 17 holds twelve items. Deleting it would cascade to their time
    // entries — hours a client has already been shown.
    const row = page.locator("[data-sprint-row]", { hasText: "Sprint — Week 17" });
    const remove = row.getByRole("button", { name: /^Delete sprint/ });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAttribute("title", /holds 12 items/);
  });

  test("an empty sprint can be deleted, in two clicks", async ({ adminPage: page }) => {
    await query(
      `insert into public.sprints (project_id, number, name, status)
       select p.id, $1, $2, 'planned' from public.projects p where p.slug = 'meinevim'`,
      [NUMBER, NAME]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    const remove = page.getByRole("button", { name: `Delete sprint ${NUMBER}` });
    await remove.click();
    await expect(remove).toContainText("Confirm?");
    expect(await readManaged(), "one click must not be enough").toBeTruthy();

    await remove.click();
    await expect.poll(async () => (await readManaged()) ?? null, { timeout: 8000 }).toBeNull();
  });

  test("an engineer reads the sprints and gets no controls", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);

    // Scoped to the list: the topbar's project switcher names the sprint too.
    await expect(page.locator("[data-sprint-row]", { hasText: "Sprint — Week 17" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New sprint" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close" })).toHaveCount(0);
    await expect(page.getByText("managed by an admin or lead")).toBeVisible();
  });

  test("the database refuses an engineer's sprint insert", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, SEED_ENGINEER);
    await page.goto(PROJECT);

    const [project] = await query<{ id: string }>(
      `select id from public.projects where slug = 'meinevim'`
    );

    const status = await page.evaluate(async (projectId) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch("http://127.0.0.1:54421/rest/v1/sprints", {
        method: "POST",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_id: projectId, number: 902, name: "E2E managed smuggled" }),
      });
      return response.status;
    }, project.id);

    expect(status, "an engineer created a sprint").toBeGreaterThanOrEqual(400);
    const rows = await query<{ n: string }>(
      `select count(*)::text as n from public.sprints where number = 902`
    );
    expect(rows[0].n).toBe("0");
    await context.close();
  });

  test("axe finds nothing on the project screen, list and create form", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECT);
    expect(await auditA11y(page)).toEqual([]);

    await page.getByRole("button", { name: "New sprint" }).click();
    await expect(page.getByLabel("Number")).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });
});

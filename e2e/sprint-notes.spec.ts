import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

/** The seeded note, restored after every test so the suite is re-runnable. */
let original: { notes: string | null; author: string | null; writtenAt: string | null };

test.describe("sprint notes", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const [row] = await query<{ notes: string | null; author: string | null; written: string | null }>(
      `select s.notes, s.notes_author_id::text as author, s.notes_written_at::text as written
       from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );
    original = { notes: row.notes, author: row.author, writtenAt: row.written };
  });

  test.afterEach(async () => {
    await query(
      `update sprints set notes = $1, notes_author_id = $2::uuid, notes_written_at = $3::timestamptz
       where id = (select s.id from sprints s join projects p on p.id = s.project_id
                   where p.slug = 'meinevim' and s.number = 17)`,
      [original.notes, original.author, original.writtenAt]
    );
  });

  test("clicking the notes edits them in place, and the write is real", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    // The prose itself is the affordance — not a separate edit screen.
    await page.getByTitle("Click to edit the sprint notes").click();

    const editor = page.getByRole("textbox", { name: "Sprint notes" });
    await expect(editor).toBeVisible();
    // It opens holding exactly what was on screen a moment ago.
    await expect(editor).toHaveValue(/please work this sprint on the issues/);

    await editor.fill("Rewritten by the suite.\n\n**Ask before touching the importer.**");
    await page.getByRole("button", { name: "Save notes" }).click();

    await expect(page.getByRole("textbox", { name: "Sprint notes" })).toHaveCount(0);
    await expect(page.getByText("Rewritten by the suite.")).toBeVisible();
    // A **wrapped** paragraph renders as the amber rule, not as literal stars.
    await expect(page.getByText("Ask before touching the importer.")).toBeVisible();
    await expect(page.getByText("**Ask before")).toHaveCount(0);

    const [row] = await query<{ notes: string; author: string; written: string | null }>(
      `select s.notes, p.full_name as author, s.notes_written_at::text as written
       from sprints s
       join projects pr on pr.id = s.project_id
       join profiles p on p.id = s.notes_author_id
       where pr.slug = 'meinevim' and s.number = 17`
    );
    expect(row.notes).toContain("Rewritten by the suite.");
    // The author and the timestamp move with the text. Leaving the author on
    // whoever wrote the first version, while the words are someone else's, is
    // the small lie this column exists to avoid.
    expect(row.author).toBe("Mohamed Tamer");
    expect(row.written).not.toBeNull();
  });

  test("escape abandons the edit and keeps what was there", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await page.getByTitle("Click to edit the sprint notes").click();
    const editor = page.getByRole("textbox", { name: "Sprint notes" });
    await editor.fill("This must never reach the database.");
    await editor.press("Escape");

    await expect(page.getByRole("textbox", { name: "Sprint notes" })).toHaveCount(0);
    await expect(page.getByText(/please work this sprint on the issues/)).toBeVisible();

    const [row] = await query<{ notes: string }>(
      `select s.notes from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );
    expect(row.notes).not.toContain("This must never reach the database.");
  });

  test("an engineer reads the notes and cannot edit them", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await expect(page.getByText(/please work this sprint on the issues/)).toBeVisible();
    // No dead control to tab through, and no button that would fail.
    await expect(page.getByTitle("Click to edit the sprint notes")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit the sprint notes" })).toHaveCount(0);
  });

  test("the database refuses an engineer's update even when the app is bypassed", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, SEED_ENGINEER);
    await page.goto(SPRINT);

    const [sprint] = await query<{ id: string }>(
      `select s.id from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );

    const status = await page.evaluate(async (sprintId) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch(
        `http://127.0.0.1:54421/rest/v1/sprints?id=eq.${sprintId}`,
        {
          method: "PATCH",
          headers: {
            apikey: json.access_token,
            Authorization: `Bearer ${json.access_token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ notes: "smuggled" }),
        }
      );
      return { status: response.status, body: await response.text() };
    }, sprint.id);

    // RLS answers a forbidden UPDATE by matching no rows, so a 200 with an
    // empty body is a refusal — the assertion that matters is the one below.
    expect(status.body).not.toContain("smuggled");

    const [row] = await query<{ notes: string }>(`select notes from sprints where id = $1`, [
      sprint.id,
    ]);
    expect(row.notes).not.toContain("smuggled");
    await context.close();
  });

  test("axe finds nothing while the notes are being edited", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByTitle("Click to edit the sprint notes").click();
    await expect(page.getByRole("textbox", { name: "Sprint notes" })).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });
});

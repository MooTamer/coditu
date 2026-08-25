import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

/** The seeded note, restored after every test so the suite is re-runnable. */
let original: {
  notes: string | null;
  doc: string | null;
  author: string | null;
  writtenAt: string | null;
};

test.describe("sprint notes", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const [row] = await query<{
      notes: string | null;
      doc: string | null;
      author: string | null;
      written: string | null;
    }>(
      `select s.notes, s.notes_json::text as doc, s.notes_author_id::text as author,
              s.notes_written_at::text as written
       from sprints s join projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );
    original = { notes: row.notes, doc: row.doc, author: row.author, writtenAt: row.written };
  });

  test.afterEach(async () => {
    // `notes_json` is restored too, and it has to be: this teardown was written
    // when notes were one text column, and a stale document left behind
    // OVERRIDES the text it just put back — the panel reads the document first.
    // It under-restored rather than failing, which is the quiet kind of wrong.
    await query(
      `update sprints
          set notes = $1, notes_json = $2::jsonb,
              notes_author_id = $3::uuid, notes_written_at = $4::timestamptz
       where id = (select s.id from sprints s join projects p on p.id = s.project_id
                   where p.slug = 'meinevim' and s.number = 17)`,
      [original.notes, original.doc, original.author, original.writtenAt]
    );
  });

  test("clicking the notes edits them in place, and the write is real", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    // The seeded notes are the real Notion import — plain text, no document —
    // and they still read. Converted on the way out rather than by rewriting
    // fifteen sprints of history.
    await expect(page.getByText(/please work this sprint on the issues/i)).toBeVisible();

    // The prose itself is the affordance — not a separate edit screen.
    await page.getByTitle("Click to edit the sprint notes").click();

    const editor = page.getByRole("textbox", { name: "Sprint notes" });
    await expect(editor).toBeVisible();
    // It opens holding exactly what was on screen a moment ago.
    await expect(editor).toContainText(/please work this sprint on the issues/i);

    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Rewritten by the suite.");

    await page.getByRole("button", { name: "Publish to the team" }).click();

    await expect(page.getByRole("textbox", { name: "Sprint notes" })).toHaveCount(0);
    await expect(page.getByText("Rewritten by the suite.")).toBeVisible();

    const [row] = await query<{
      notes: string;
      doc: string | null;
      author: string;
      written: string | null;
    }>(
      `select s.notes, s.notes_json::text as doc, p.full_name as author,
              s.notes_written_at::text as written
       from sprints s
       join projects pr on pr.id = s.project_id
       join profiles p on p.id = s.notes_author_id
       where pr.slug = 'meinevim' and s.number = 17`
    );

    // Both halves, written in the same statement. `notes` is what the sprint
    // report and the Markdown export read, and a projection that lagged the
    // document would be a report saying something the panel does not.
    expect(row.notes).toContain("Rewritten by the suite.");
    // PARSED, not substring-matched: `jsonb` renders with a space after every
    // colon, so `"type":"doc"` never appears in it and a substring assertion
    // fails for a reason that has nothing to do with what was stored.
    expect(row.doc).not.toBeNull();
    expect(JSON.parse(row.doc!)).toMatchObject({ type: "doc" });
    expect(row.doc).toContain("Rewritten by the suite.");

    // The author and the timestamp move with the text. Leaving the author on
    // whoever wrote the first version, while the words are someone else's, is
    // the small lie this column exists to avoid.
    expect(row.author).toBe("Mohamed Tamer");
    expect(row.written).not.toBeNull();
  });

  test("a legacy **wrapped** paragraph reads as the callout it always meant", async ({
    adminPage: page,
  }) => {
    // Written straight into the column, in the shape the textarea era produced:
    // no document, one paragraph wrapped in stars meaning "discuss this first".
    // The seed's own notes do not use it — they are the real Notion import, with
    // bullet lines — so the case is set up rather than assumed.
    await query(
      `update sprints set notes = $1, notes_json = null
        where number = 17
          and project_id = (select id from projects where slug = 'meinevim')`,
      ["Ordinary paragraph.\n\n**Ask before touching the importer.**"]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const callout = page.locator("[data-callout]");
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("Ask before touching the importer.");
    // The stars were the markup, not the words.
    await expect(page.getByText("**Ask before")).toHaveCount(0);
  });

  test("the notes take a block the textarea could never hold", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByTitle("Click to edit the sprint notes").click();

    const editor = page.getByRole("textbox", { name: "Sprint notes" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Order of play");
    await page.keyboard.press("Enter");
    await page.keyboard.type("[ ] COD-140 first");

    await expect(editor.locator("input[type=checkbox]")).toHaveCount(1);
    await page.getByRole("button", { name: "Publish to the team" }).click();

    // Stored as a checklist and rendered back as one by the SERVER walker —
    // which is the same renderer the thread uses, so a callout written in a
    // comment and one written here are the same thing on screen.
    await expect
      .poll(async () => {
        const [row] = await query<{ doc: string | null }>(
          `select s.notes_json::text as doc from sprints s
             join projects p on p.id = s.project_id
            where p.slug = 'meinevim' and s.number = 17`
        );
        // Same reason as above — parsed rather than matched as a string.
        return JSON.stringify(JSON.parse(row?.doc ?? "null"));
      })
      .toContain('"type":"taskItem"');

    await expect(page.locator("input[type=checkbox]").first()).toBeDisabled();
  });

  test("escape abandons the edit and keeps what was there", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    await page.getByTitle("Click to edit the sprint notes").click();
    const editor = page.getByRole("textbox", { name: "Sprint notes" });
    // A contenteditable, not an input — `fill` cannot set it.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("This must never reach the database.");
    await page.keyboard.press("Escape");

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

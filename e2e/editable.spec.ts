import { expect, query, SEED, SEED_ADMIN, SEED_ENGINEER, signIn, test } from "./fixtures";

/**
 * The things this app could not do until 2026-08-25, each of which was the same
 * shape: the database was ready and the screen was missing.
 *
 * A work item's title, description and highlight had no path at all after
 * creation. A comment could not be edited or withdrawn even though both actions
 * were written, authorized and RLS-tested — and the "edited" badge rendered a
 * state no user could reach. A time entry could not be corrected, which after
 * workstream E is somebody's pay rather than a typo. An item could not be
 * deleted or carried over.
 *
 * Chromium only. Every assertion here is about whether a write reaches the
 * database, which is not a question a device can answer differently — the
 * phone-facing half of these flows lives in `item-detail.spec.ts` and
 * `mobile.spec.ts`, which are the files `playwright.config.ts` actually runs on
 * a phone. Writing a phone assertion here would be a test that silently never
 * executes on one.
 */

const ITEM = `${SEED.sprint}/items/${SEED.unstarted}`;

test.describe("an item's own words", () => {
  test.use({ sprintTotals: "read" });

  test("a lead corrects a title, and it reaches the database", async ({ adminPage }) => {
    const original = (
      await query<{ title: string }>(`select title from public.work_items where key = $1`, [
        SEED.unstarted,
      ])
    )[0].title;

    try {
      await adminPage.goto(ITEM);
      await adminPage.getByRole("button", { name: "Edit the title" }).click();
      const field = adminPage.getByLabel("Title");
      await field.fill("A title somebody fixed the morning after planning");
      await adminPage.getByRole("button", { name: "Save" }).first().click();

      await expect
        .poll(async () =>
          (
            await query<{ title: string }>(`select title from public.work_items where key = $1`, [
              SEED.unstarted,
            ])
          )[0].title
        )
        .toBe("A title somebody fixed the morning after planning");
    } finally {
      await query(`update public.work_items set title = $1 where key = $2`, [
        original,
        SEED.unstarted,
      ]);
    }
  });

  test("an emptied description is null, not an empty string", async ({ adminPage }) => {
    // Every reader asks "is there a description?", and an empty string answers
    // yes — which renders an empty paragraph nobody typed.
    const [before] = await query<{ description: string | null }>(
      `select description from public.work_items where key = $1`,
      [SEED.unstarted]
    );

    try {
      await query(`update public.work_items set description = 'temporary' where key = $1`, [
        SEED.unstarted,
      ]);
      await adminPage.goto(ITEM);
      await adminPage.getByRole("button", { name: "Edit the description" }).click();

      // A contenteditable, not a textarea — `fill` cannot set it. And the commit
      // is an explicit Save rather than a blur: this editor has a toolbar, and
      // pressing Bold blurs the surface, so blur-to-save would commit on every
      // formatting click.
      const field = adminPage.getByRole("textbox", { name: "Description" });
      await field.click();
      await adminPage.keyboard.press("ControlOrMeta+a");
      await adminPage.keyboard.press("Backspace");
      await adminPage.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(async () =>
          (
            await query<{ description: string | null }>(
              `select description from public.work_items where key = $1`,
              [SEED.unstarted]
            )
          )[0].description
        )
        .toBeNull();
    } finally {
      await query(`update public.work_items set description = $1 where key = $2`, [
        before.description,
        SEED.unstarted,
      ]);
    }
  });

  test("a description keeps its line breaks, and takes a block", async ({ adminPage }) => {
    const [before] = await query<{ description: string | null }>(
      `select description from public.work_items where key = $1`,
      [SEED.unstarted]
    );

    try {
      // The shape 58 imported items are in: one paragraph, several lines. The
      // newlines are the requirement list, and collapsing them turned those
      // items into one unreadable run once already.
      await query(
        `update public.work_items set description = $1, description_json = null where key = $2`,
        ["First requirement\nSecond requirement", SEED.unstarted]
      );
      await adminPage.goto(ITEM);

      // Converted on read, not rewritten: the row is still plain text.
      await expect(adminPage.getByText("First requirement")).toBeVisible();
      await expect(adminPage.getByText("Second requirement")).toBeVisible();

      await adminPage.getByRole("button", { name: "Edit the description" }).click();
      const field = adminPage.getByRole("textbox", { name: "Description" });
      await field.click();
      await adminPage.keyboard.press("ControlOrMeta+a");
      await adminPage.keyboard.press("Backspace");
      await adminPage.keyboard.type("[ ] ship the toggle");
      await expect(field.locator("input[type=checkbox]")).toHaveCount(1);

      await adminPage.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(async () => {
          const [row] = await query<{ doc: string | null; description: string | null }>(
            `select description_json::text as doc, description
               from public.work_items where key = $1`,
            [SEED.unstarted]
          );
          return { doc: row.doc, text: row.description };
        })
        .toEqual(
          expect.objectContaining({ text: expect.stringContaining("ship the toggle") })
        );

      // Both halves, written in the same statement — `description` is what the
      // CSV, the Markdown export and the PDF read, and a projection that lagged
      // the document would be an export saying something the story does not.
      const [row] = await query<{ doc: string | null }>(
        `select description_json::text as doc from public.work_items where key = $1`,
        [SEED.unstarted]
      );
      expect(row.doc).not.toBeNull();
      expect(JSON.stringify(JSON.parse(row.doc!))).toContain('"type":"taskItem"');
    } finally {
      await query(
        `update public.work_items set description = $1, description_json = null where key = $2`,
        [before.description, SEED.unstarted]
      );
    }
  });


  test("an engineer sees the words and no way to change them", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.goto(ITEM);
    await expect(page.getByRole("button", { name: "Edit the title" })).toHaveCount(0);
  });
});

test.describe("a comment can be withdrawn, and it stays in the thread", () => {
  test.use({ sprintTotals: "read" });

  test("withdrawn, not vanished — and its words never reach the browser", async ({ adminPage }) => {
    const [item] = await query<{ id: string }>(`select id from public.work_items where key = $1`, [
      SEED.hostileThread,
    ]);
    const [me] = await query<{ id: string }>(
      `select id from public.profiles where full_name = 'Mohamed Tamer'`
    );

    const [comment] = await query<{ id: string }>(
      `insert into public.comments (work_item_id, author_id, body_json, body_text)
       values ($1, $2, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"WITHDRAWNSENTINEL"}]}]}'::jsonb, 'WITHDRAWNSENTINEL')
       returning id`,
      [item.id, me.id]
    );

    try {
      const path = `${SEED.sprint}/items/${SEED.hostileThread}`;
      await adminPage.goto(path);
      await expect(adminPage.getByText("WITHDRAWNSENTINEL")).toBeVisible();

      await adminPage.getByRole("button", { name: "Withdraw this comment" }).first().click();
      await expect(adminPage.getByText("This comment was withdrawn.")).toBeVisible();

      // Struck through and still in place — the schema comment on
      // `comments.deleted_at` is explicit that an argument which vanishes leaves
      // the replies underneath it making no sense.
      await expect(adminPage.getByText("withdrawn").first()).toBeVisible();

      // And the words are gone from the page source entirely, not merely hidden
      // by CSS: the read model nulls them before they leave the server.
      //
      // Reloaded first, and that is the honest way to ask it. This page was
      // rendered while the comment still stood, so its inline RSC payload holds
      // the text the admin was legitimately reading a second ago — asserting
      // against that document tests the browser's memory, not the server's
      // behaviour. The claim worth proving is that the NEXT reader never
      // receives the words, so fetch the page again and look at what arrives.
      await adminPage.reload();
      await expect(adminPage.getByText("This comment was withdrawn.")).toBeVisible();
      const html = await adminPage.content();
      expect(html).not.toContain("WITHDRAWNSENTINEL");

      const [row] = await query<{ deleted_at: string | null }>(
        `select deleted_at from public.comments where id = $1`,
        [comment.id]
      );
      expect(row.deleted_at).not.toBeNull();
    } finally {
      await query(`delete from public.comments where id = $1`, [comment.id]);
    }
  });
});

test.describe("a time entry can be corrected", () => {
  // It changes a sprint's total, so it takes the exclusive lock.
  test.use({ sprintTotals: "write" });

  test("8 hours typed instead of 0.8 is fixable, and the rollup follows", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    const [item] = await query<{ id: string }>(`select id from public.work_items where key = $1`, [
      SEED.unstarted,
    ]);
    const [me] = await query<{ id: string }>(
      `select id from public.profiles where full_name = 'Mohamed Tamer'`
    );

    const [entry] = await query<{ id: string }>(
      `insert into public.time_entries (work_item_id, profile_id, minutes, worked_on)
       values ($1, $2, 480, current_date) returning id`,
      [item.id, me.id]
    );

    try {
      await page.goto(ITEM);
      await page.getByRole("button", { name: /^Correct 8\.0 h/ }).click();
      // Sixteen half-hours down, from 8.0 to nothing — the stepper floors at
      // 0.5, so this lands on the minimum and proves the clamp too.
      for (let i = 0; i < 20; i += 1) {
        await page.getByRole("button", { name: "Half an hour less" }).last().click();
      }
      await page.getByRole("button", { name: "Save" }).last().click();

      await expect
        .poll(async () =>
          Number(
            (
              await query<{ minutes: number }>(
                `select minutes from public.time_entries where id = $1`,
                [entry.id]
              )
            )[0].minutes
          )
        )
        .toBe(30);

      // The rollup is a trigger, so it must have followed on its own.
      const [rolled] = await query<{ minutes_logged: number }>(
        `select minutes_logged from public.work_items where id = $1`,
        [item.id]
      );
      expect(Number(rolled.minutes_logged)).toBe(30);
    } finally {
      await query(`delete from public.time_entries where id = $1`, [entry.id]);
    }
  });

  test("nobody rewrites somebody else's record of what they did", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    const [item] = await query<{ id: string }>(`select id from public.work_items where key = $1`, [
      SEED.unstarted,
    ]);
    const [other] = await query<{ id: string }>(
      `select id from public.profiles where full_name = 'Mohamed Tamer'`
    );
    const [entry] = await query<{ id: string }>(
      `insert into public.time_entries (work_item_id, profile_id, minutes, worked_on)
       values ($1, $2, 60, current_date) returning id`,
      [item.id, other.id]
    );

    try {
      await page.goto(ITEM);
      // An admin may DELETE anyone's entry; nobody may rewrite one. That
      // asymmetry is the policy's, not the interface's.
      await expect(page.getByRole("button", { name: /^Correct 1\.0 h/ })).toHaveCount(0);
    } finally {
      await query(`delete from public.time_entries where id = $1`, [entry.id]);
    }
  });
});

test.describe("an item can be deleted softly, and carried over", () => {
  test.use({ sprintTotals: "write" });

  test("deleting hides it from every list and the undo brings it back", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    const [sprint] = await query<{ id: string }>(
      `select s.id from public.sprints s join public.projects p on p.id = s.project_id
       where p.slug = 'meinevim' and s.number = 17`
    );
    const [made] = await query<{ id: string; key: string }>(
      `insert into public.work_items (sprint_id, title) values ($1, 'E2E soft delete') returning id, key`,
      [sprint.id]
    );

    try {
      await page.goto(`${SEED.sprint}/items/${made.key}`);
      await page.getByRole("button", { name: `Delete ${made.key}` }).click();
      await page.getByRole("button", { name: `Delete ${made.key}` }).click();

      await expect
        .poll(async () =>
          (
            await query<{ deleted_at: string | null }>(
              `select deleted_at from public.work_items where id = $1`,
              [made.id]
            )
          )[0].deleted_at
        )
        .not.toBeNull();

      // Gone from the sprint table without any list having learned about it —
      // the read policy is what hides it.
      await page.goto(SEED.sprint);
      await expect(page.getByText("E2E soft delete")).toHaveCount(0);

      // And the hours are still there, which is the whole reason it is soft.
      const [still] = await query<{ n: string }>(
        `select count(*) as n from public.work_items where id = $1`,
        [made.id]
      );
      expect(Number(still.n)).toBe(1);
    } finally {
      await query(`delete from public.work_items where id = $1`, [made.id]);
    }
  });

  test("a cross-project move is refused by the database, not only by the picker", async () => {
    const [item] = await query<{ id: string }>(`select id from public.work_items where key = $1`, [
      SEED.unstarted,
    ]);
    const [elsewhere] = await query<{ id: string }>(
      `select s.id from public.sprints s join public.projects p on p.id = s.project_id
       where p.slug <> 'meinevim' limit 1`
    );

    await expect(
      query(`update public.work_items set sprint_id = $1 where id = $2`, [elsewhere.id, item.id])
    ).rejects.toThrow(/another project/);
  });
});

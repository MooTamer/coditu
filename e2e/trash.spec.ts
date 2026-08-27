import { SEED, SEED_ENGINEER, SEED_LEAD, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = "COD-237";

/**
 * The bin: what is in it, who may take something out, and what it must never
 * show.
 *
 * The assertion that matters most here is the last kind: **a withdrawn
 * comment's words must not appear.** The thread hides them from every reader
 * including their author, and a trash screen that printed them would quietly
 * redefine "withdrawn" as "moved somewhere less obvious". `trash_list()` does
 * not return `body_text` at all, so this is proving an absence at the
 * projection rather than a `display: none` — but the test is written against
 * the rendered page, because that is where the leak would be visible.
 */

async function clearTrash() {
  await query(`update work_items set deleted_at = null where deleted_at is not null`);
  await query(`delete from comments where body_text like 'TRASH SPEC%'`);
}

/**
 * Put `COD-237` back exactly as the seed left it.
 *
 * The restore test edits its description to have a version worth losing, and
 * every edit and every comment writes a `document_revisions` row. The table is
 * append-only **to the application** — a direct delete is a fixture privilege,
 * and it is the only way this file can stop changing what the next run of
 * anything else reads. `version-history.spec.ts` does the same for `COD-238`
 * and says why; leaving rows behind is the trap `revisions.sql` was built to
 * avoid and this session met twice more.
 */
async function clearRevisions() {
  await query(
    `delete from document_revisions where work_item_id = (select id from work_items where key = $1)`,
    [ITEM_KEY]
  );
}

async function itemId() {
  const [row] = await query<{ id: string }>(`select id from work_items where key = $1`, [ITEM_KEY]);
  return row.id;
}

async function profileId(email: string) {
  const [row] = await query<{ id: string }>(
    `select p.id from profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [email]
  );
  return row.id;
}

test.describe("trash", () => {
  test.describe.configure({ mode: "serial" });

  let originalDescription: string | null = null;

  test.beforeAll(async () => {
    const [row] = await query<{ description: string | null }>(
      `select description from work_items where key = $1`,
      [ITEM_KEY]
    );
    originalDescription = row.description;
  });

  test.beforeEach(async () => {
    await clearTrash();
  });

  test.afterAll(async () => {
    await clearTrash();
    await query(`update work_items set description = $1 where key = $2`, [
      originalDescription,
      ITEM_KEY,
    ]);
    await clearRevisions();
  });

  test("a deleted story is listed with where it was and what it costs to purge", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: ITEM_KEY }).first();
    await expect(row).toBeVisible();
    // Where it was — a story deleted from the wrong sprint is unfindable
    // without this.
    await expect(row).toContainText("sprint");
    await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("restoring puts the story back where every other screen can see it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");
    await page
      .getByRole("listitem")
      .filter({ hasText: ITEM_KEY })
      .first()
      .getByRole("button", { name: "Restore" })
      .click();

    await expect
      .poll(
        async () => {
          const [row] = await query<{ deleted_at: string | null }>(
            `select deleted_at from work_items where key = $1`,
            [ITEM_KEY]
          );
          return row.deleted_at;
        },
        { timeout: 8000 }
      )
      .toBeNull();

    await expect(page.getByRole("listitem").filter({ hasText: ITEM_KEY })).toHaveCount(0);
  });

  /**
   * The promise the bin makes, checked against the screens that would show it
   * broken.
   *
   * `docs/06-PROGRESS.md` names this as W11's verification, and it was the one
   * thing the restore path had nobody asserting: the previous test proves the
   * story comes back and leaves the bin, which is true of a row whose thread
   * and history were thrown away on the way in.
   *
   * Delete is soft precisely so that does not happen — `lib/actions/work-items.ts`
   * says *"the row keeps its criteria, its thread and its hours"* — so this
   * passes today. It is written for the day somebody makes deletion cascade,
   * which is the obvious tidy-up and would be silent: every screen would keep
   * working, and only a story that had already been round the bin would come
   * back hollow.
   *
   * Rendered rather than counted in SQL. `select count(*) from comments` would
   * pass while the thread refused to show them, and it is the thread that
   * somebody opens.
   */
  test("a restored story comes back with its comments and its versions", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const id = await itemId();
    const marker = `TRASH SPEC restored thread ${Date.now()}`;

    await query(
      `insert into comments (work_item_id, author_id, body_text, body_json)
       values ($1, $2, $3, $4)`,
      [
        id,
        await profileId("mohamed@coditu.com"),
        marker,
        JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: marker }] }],
        }),
      ]
    );

    // An edit, so there is a version to lose as well as a comment.
    await query(
      `update work_items set description = 'W11 restore probe' where id = $1`,
      [id]
    );

    const before = await query<{ n: string }>(
      `select count(*) as n from document_revisions where work_item_id = $1`,
      [id]
    );
    expect(Number(before[0].n), "nothing to prove without a version").toBeGreaterThan(0);

    await query(`update work_items set deleted_at = now() where id = $1`, [id]);

    await page.goto("/app/trash");
    await page
      .getByRole("listitem")
      .filter({ hasText: ITEM_KEY })
      .first()
      .getByRole("button", { name: "Restore" })
      .click();

    await expect
      .poll(
        async () => {
          const [row] = await query<{ deleted_at: string | null }>(
            `select deleted_at from work_items where id = $1`,
            [id]
          );
          return row.deleted_at;
        },
        { timeout: 8000 }
      )
      .toBeNull();

    // The thread and the history, on the story's own page. `exact`, because the
    // history panel's diff quotes the comment it captured — two matches, and
    // the second one is half of what this test is here to prove, so it is
    // asserted rather than escaped from.
    await page.goto(`${SEED.sprint}/items/${ITEM_KEY}`);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    // `toBeAttached`, not `toBeVisible`: the diff lives inside a collapsed
    // `<details>` — W4c's decision, so the panel ships a diff viewer and no
    // JavaScript. Whether a reader can expand it is `version-history.spec.ts`'s
    // question; this one only asks whether the version is still there.
    await expect(page.getByText(`+ added: ${marker}`)).toBeAttached();

    // And the count, because the panel shows a window and the table is what
    // survives.
    const after = await query<{ n: string }>(
      `select count(*) as n from document_revisions where work_item_id = $1`,
      [id]
    );
    expect(Number(after[0].n), "history did not survive the round trip").toBe(
      Number(before[0].n)
    );
  });

  test("a withdrawn comment is listed WITHOUT its words", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const secret = "TRASH SPEC this sentence must never be rendered";
    await query(
      `insert into comments (work_item_id, author_id, body_json, body_text, deleted_at)
       values ($1, $2, '{"type":"doc","content":[]}'::jsonb, $3, now())`,
      [await itemId(), await profileId("mohamed@coditu.com"), secret]
    );

    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: `Comment on ${ITEM_KEY}` }).first();
    await expect(row).toBeVisible();

    // Not `not.toBeVisible()` — that passes for text that is present and
    // hidden with CSS, which is exactly the bug this is looking for. The words
    // must not be in the document at all.
    expect(await page.content()).not.toContain("this sentence must never be rendered");
  });

  test("searching narrows the bin, and cannot be made to print a withdrawn comment", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const secret = "TRASH SPEC searchable secret sentence";
    const id = await itemId();
    await query(
      `insert into comments (work_item_id, author_id, body_text, body_json, deleted_at)
       values ($1, $2, $3, $4, now())`,
      [
        id,
        await profileId("mohamed@coditu.com"),
        secret,
        JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: secret }] }],
        }),
      ]
    );
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");
    await expect(page.getByRole("listitem")).not.toHaveCount(0);

    // A story key narrows to that story. Scoped to the `search` landmark, not
    // to the page: the topbar's palette trigger is also called "Search items,
    // sprints, people", and a bare `name: "Search"` matches both — Playwright's
    // accessible-name match is a substring. Fourth time in this repository.
    const search = page.getByRole("search");
    await search.getByRole("searchbox", { name: "Search the bin" }).fill(ITEM_KEY);
    await search.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${ITEM_KEY}`));
    await expect(page.getByRole("listitem").filter({ hasText: ITEM_KEY })).not.toHaveCount(0);

    // **The assertion that matters.** A search box over a list is the obvious
    // way for a withdrawn comment's words to start being printed — type them,
    // and if the projection carried `body_text` the row would match and the
    // box would echo them back. `trash_list()` does not return them at all,
    // so this finds nothing, and `page.content()` proves the words are not in
    // the markup rather than merely hidden by CSS.
    await page.goto(`/app/trash?q=${encodeURIComponent("searchable secret sentence")}`);
    await expect(page.getByText("Nothing in the bin matches that.")).toBeVisible();
    expect(await page.content()).not.toContain(secret);
  });

  test("a lead can see a withdrawn comment and is told why they cannot restore it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(
      `insert into comments (work_item_id, author_id, body_json, body_text, deleted_at)
       values ($1, $2, '{"type":"doc","content":[]}'::jsonb, 'TRASH SPEC lead cannot restore', now())`,
      [await itemId(), await profileId("mohamed@coditu.com")]
    );

    await signIn(page, SEED_LEAD);
    await page.goto("/app/trash");

    const row = page.getByRole("listitem").filter({ hasText: `Comment on ${ITEM_KEY}` }).first();
    await expect(row).toBeVisible();
    // Disabled controls stay visible and carry the reason — the rule the
    // permission matrix states for every refused action.
    await expect(row).toContainText("only its author or an admin");
    await expect(row.getByRole("button", { name: "Restore" })).toHaveCount(0);
  });

  test("an engineer sees no deleted stories and cannot purge anything", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");

    // Deleting a story is admin-and-lead, and so is finding one in the bin.
    await expect(page.getByRole("listitem").filter({ hasText: ITEM_KEY })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete for good" })).toHaveCount(0);
  });

  test("purging says what will be lost before it does it, and axe is clean", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await query(`update work_items set deleted_at = now() where key = $1`, [ITEM_KEY]);

    await page.goto("/app/trash");
    const row = page.getByRole("listitem").filter({ hasText: ITEM_KEY }).first();
    await row.getByRole("button", { name: "Delete for good" }).click();

    // The consequence, in specifics. "Are you sure?" tells nobody anything they
    // did not already know.
    await expect(row).toContainText("its criteria, its thread, its version history");
    await expect(row).toContainText("cannot be undone");

    expect(await auditA11y(page)).toEqual([]);
  });

  test("a page goes to the bin, is listed without a sprint, and comes back", async ({
    adminPage: page,
  }) => {
    // The third kind. `trash_list()` returns a null `sprint_number` for it —
    // a page has never belonged to a sprint — and the row must not print
    // "sprint null", which is the small lie a recovery screen cannot afford.
    const title = `A page for the bin ${Date.now()}`;
    const slug = `a-page-for-the-bin-${Date.now()}`;
    await query(
      `insert into pages (project_id, title, slug, body, published_at, created_by)
       values ((select id from projects where slug = 'meinevim'), $1, $2, 'words', now(),
               (select id from profiles where role = 'admin' limit 1))`,
      [title, slug]
    );

    await page.goto(`/app/projects/meinevim/pages/${slug}`);
    await page.getByRole("button", { name: `Move ${title} to the bin` }).click();
    await page.waitForURL("**/app/projects/meinevim/pages");

    await page.goto("/app/trash");
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("sprint null");
    await expect(row).toContainText("MEINEvim");

    await row.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);

    // And it is readable again where it lives.
    await page.goto(`/app/projects/meinevim/pages/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    await query(`delete from pages where slug = $1`, [slug]);
  });
});

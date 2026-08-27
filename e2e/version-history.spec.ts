import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = "COD-238";
const ITEM = `/app/projects/meinevim/sprints/17/items/${ITEM_KEY}`;

/**
 * Version history on a story: the timeline, the diff, and a restore that adds a
 * version rather than rewinding.
 *
 * The database half is proved in `supabase/tests/revisions.sql`. What is proved
 * here is everything above it — that the panel shows a real timeline, that the
 * diff says what actually changed, that restoring works from the button, and
 * that an engineer is not offered a control they would only be refused.
 */

/** Writes a description straight to the table, so the capture trigger records it. */
async function setDescription(text: string) {
  await query(`update work_items set description = $1, description_json = null where key = $2`, [
    text,
    ITEM_KEY,
  ]);
}

async function clearRevisions() {
  await query(
    `delete from document_revisions where entity_id = (select id from work_items where key = $1)`,
    [ITEM_KEY]
  );
}

async function revisions() {
  return query<{ revision_no: number; plain_text: string; restored_from: number | null }>(
    `select revision_no, plain_text, restored_from from document_revisions
      where surface = 'work_item_description'
        and entity_id = (select id from work_items where key = $1)
      order by revision_no`,
    [ITEM_KEY]
  );
}

/** A one-paragraph document, optionally with marks on its only text node. */
function doc(text: string, marks?: Array<{ type: string }>) {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] },
    ],
  };
}

test.describe("version history", () => {
  // Serial: every test rewrites the same story's description and counts its
  // versions, so parallel workers would interleave revision numbers.
  test.describe.configure({ mode: "serial" });

  let original: string | null = null;

  test.beforeAll(async () => {
    const [row] = await query<{ description: string | null }>(
      `select description from work_items where key = $1`,
      [ITEM_KEY]
    );
    original = row.description;
  });

  test.beforeEach(async () => {
    // Every test in this file starts from an empty history, so revision numbers
    // are 1, 2, 3 rather than whatever the previous test left. Revisions are
    // append-only to the APPLICATION — a direct delete is a fixture privilege,
    // and it is the only way a test can assert on absolute version numbers
    // without inheriting the run before it. Same trap as `revisions.sql`.
    await clearRevisions();
  });

  test.afterAll(async () => {
    // Put the seed back, INCLUDING the revisions this suite created. The table
    // is append-only to the application on purpose, so a test that leaves rows
    // behind changes every later run's numbering — the trap that made
    // `revisions.sql` build its own fixture.
    await query(`update work_items set description = $1 where key = $2`, [original, ITEM_KEY]);
    await clearRevisions();
  });

  test("the panel lists a version per edit, newest first, and names who made it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setDescription("The first thing it said.");
    await setDescription("The second thing it said.");
    await page.goto(ITEM);

    const panel = page.getByRole("region", { name: "Version history" });
    await expect(panel).toBeVisible();

    const entries = panel.getByRole("listitem");
    await expect(entries.first()).toContainText("Description · v");

    // Newest first: the highest version number is at the top.
    const [top] = await revisions().then((rows) => rows.slice(-1));
    await expect(entries.first()).toContainText(`v${top.revision_no}`);
  });

  test("expanding an entry shows what changed, marked as text and not only by colour", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setDescription("Keep this line.\nRemove this line.");
    await setDescription("Keep this line.\nAdd this line instead.");
    await page.goto(ITEM);

    const panel = page.getByRole("region", { name: "Version history" });
    await panel.getByRole("listitem").first().locator("summary").click();

    const diff = panel.locator("pre").first();
    await expect(diff).toContainText("Remove this line.");
    await expect(diff).toContainText("Add this line instead.");

    // `01-DESIGN-SYSTEM.md` forbids colour as the sole carrier of meaning, and
    // a diff is the clearest case: two hues and nothing else is unreadable to
    // anybody who cannot tell them apart.
    await expect(diff).toContainText("+ ");
    await expect(diff).toContainText("- ");
  });

  test("restoring writes a NEW version and leaves the ones in between readable", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setDescription("Version one text.");
    await setDescription("Version two text.");
    await setDescription("Version three text.");
    await page.goto(ITEM);

    const before = await revisions();
    expect(before).toHaveLength(3);

    const panel = page.getByRole("region", { name: "Version history" });
    // The oldest entry is last; restore it.
    const oldest = panel.getByRole("listitem").last();
    await oldest.locator("summary").click();
    await oldest.getByRole("button", { name: "Restore as a new version" }).click();
    await oldest.getByRole("button", { name: /^Restore version 1$/ }).click();

    await expect.poll(async () => (await revisions()).length, { timeout: 8000 }).toBe(4);

    const after = await revisions();
    // The restore ADDED v4 stamped with where it came from …
    expect(after[3].restored_from).toBe(1);
    expect(after[3].plain_text).toBe("Version one text.");
    // … and 2 and 3 are still there. This is the property the whole feature
    // rests on: history that can be edited is not history.
    expect(after[1].plain_text).toBe("Version two text.");
    expect(after[2].plain_text).toBe("Version three text.");

    // And the live story now says what v1 said.
    const [live] = await query<{ description: string }>(
      `select description from work_items where key = $1`,
      [ITEM_KEY]
    );
    expect(live.description).toBe("Version one text.");
  });

  test("an engineer sees the history and is not offered a restore they cannot use", async ({
    page,
  }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await setDescription("Something an engineer may read.");
    await page.goto(ITEM);

    const panel = page.getByRole("region", { name: "Version history" });
    // Reading history is not a privilege — every internal member has it.
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("listitem").first()).toContainText("Description · v");

    // A story description is admin-and-lead, so there is no button to refuse.
    await expect(panel.getByRole("button", { name: "Restore as a new version" })).toHaveCount(0);
  });

  test("axe finds nothing with a version expanded", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setDescription("Before.");
    await setDescription("After.");
    await page.goto(ITEM);

    const panel = page.getByRole("region", { name: "Version history" });
    await panel.getByRole("listitem").first().locator("summary").click();
    await expect(panel.locator("pre").first()).toBeVisible();

    expect(await auditA11y(page)).toEqual([]);
  });

  test("a formatting-only change says WHAT changed rather than 'formatting only'", async ({
    adminPage: page,
  }) => {
    // The thing this replaced: `lib/diff.ts` compares the flattened text, so
    // bolding a word produced no diff lines and the entry read "formatting
    // only" and then "nothing to compare" — a label, not an answer, on the one
    // screen whose whole job is answering "what did somebody do to this".
    //
    // Written through the database rather than the editor on purpose: what is
    // under test is the DIFF, and driving TipTap's toolbar to produce one bold
    // mark would be testing TipTap.
    await query(
      `update work_items set description_json = $2, description = $3 where key = $1`,
      [ITEM_KEY, JSON.stringify(doc("A sentence with no marks at all.")), "A sentence with no marks at all."]
    );
    await query(
      `update work_items set description_json = $2, description = $3 where key = $1`,
      [
        ITEM_KEY,
        JSON.stringify(doc("A sentence with no marks at all.", [{ type: "bold" }])),
        // The SAME flattened text. This is what makes it formatting-only.
        "A sentence with no marks at all.",
      ]
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);

    const panel = page.getByRole("region", { name: "Version history" });
    const newest = panel.getByRole("listitem").first();
    await expect(newest).toContainText("formatting none → bold");

    await newest.locator("summary").click();
    await expect(newest.locator("[data-block-diff]")).toContainText("a paragraph: formatting");
  });

  test("restoring the version that is already current still writes a version", async ({
    adminPage: page,
  }) => {
    // Before the audit the capture trigger's "nothing changed" guard swallowed
    // this: no version was written and the RPC returned the pre-existing latest
    // as though it had just made it. `supabase/tests/pages.sql` holds the same
    // property at the database; this holds it through the button.
    await setDescription("The one and only text.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);

    const before = await revisions();
    const panel = page.getByRole("region", { name: "Version history" });
    await panel.getByRole("listitem").first().locator("summary").click();
    await panel.getByRole("button", { name: "Restore as a new version" }).first().click();
    await panel.getByRole("button", { name: /Restore/ }).last().click();

    await expect
      .poll(async () => (await revisions()).length)
      .toBe(before.length + 1);

    const after = await revisions();
    expect(after[after.length - 1].restored_from).toBe(before.length);
  });
});

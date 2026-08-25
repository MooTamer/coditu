import { SEED, auditA11y, expect, query, test } from "./fixtures";

const ITEM_KEY = SEED.thread;
const ITEM = `${SEED.sprint}/items/${ITEM_KEY}`;

/**
 * The composer's own behaviour: the toolbar, the link editor, and what a
 * pasted picture looks like once it is in the thread.
 *
 * Each of these is a bug that was reported by somebody using it rather than by
 * a test — the toolbar looked dead on an empty line, the link button opened an
 * OS prompt, and one screenshot pushed the conversation a full screen down.
 */
async function clearThread() {
  await query(
    `delete from comments where work_item_id = (select id from work_items where key = $1)`,
    [ITEM_KEY]
  );
}

/** A comment carrying two images and a link, without going through an upload. */
async function seedPictureComment() {
  await query(
    `insert into comments (work_item_id, author_id, body_json, body_text)
     select w.id,
            (select id from profiles where initials = 'MT'),
            $2::jsonb,
            'Two screenshots'
     from work_items w where w.key = $1`,
    [
      ITEM_KEY,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Two screenshots" }] },
          { type: "image", attrs: { src: "/clients/evim.svg", alt: "the wide one" } },
          { type: "image", attrs: { src: "/brand/icon.svg", alt: "the small one" } },
        ],
      }),
    ]
  );
}

/**
 * ONE serial describe for the whole file, not two.
 *
 * Playwright parallelises at the file level but a `serial` group is a unit, so
 * two of them in one file can land in two workers at once — and both of these
 * seed and clear comments on the same work item, which means each one deleting
 * the other's fixture mid-assertion. It failed as "the thumbnails are not
 * there". Same shape as the `threadPerProject` split in fixtures.ts.
 */
test.describe("the comment editor", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await clearThread();
    await page.goto(ITEM);
  });

  test.afterEach(async () => {
    await clearThread();
  });

  async function openComposer(page: import("@playwright/test").Page) {
    await page.getByText("Write a comment — @ to mention").click();
    const editor = page.locator(".coditu-prose");
    await expect(editor).toBeVisible();
    await editor.click();
    return editor;
  }

  test("bold works before there is anything to select", async ({ adminPage: page }) => {
    const editor = await openComposer(page);

    // The bug: pressing a toolbar button moved focus out of the editor, which
    // drops ProseMirror's stored marks — the "what I type next is bold" state
    // an empty line has instead of a range. The button looked dead until there
    // were words to select.
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await page.keyboard.type("bold from an empty line");

    await expect(editor.locator("strong")).toHaveText("bold from an empty line");

    // And the button reports the state it is in, for anyone not looking at the
    // letters.
    await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("italic and inline code do the same", async ({ adminPage: page }) => {
    const editor = await openComposer(page);

    await page.getByRole("button", { name: "Italic", exact: true }).click();
    await page.keyboard.type("emphasis");
    await expect(editor.locator("em")).toHaveText("emphasis");

    await page.getByRole("button", { name: "Italic", exact: true }).click();
    await page.getByRole("button", { name: "Inline code", exact: true }).click();
    await page.keyboard.type("npm run dev");
    await expect(editor.locator("code")).toHaveText("npm run dev");
  });

  test("a link is added in the editor, not in an OS prompt", async ({ adminPage: page }) => {
    // If the old window.prompt came back this fails loudly rather than hanging:
    // Playwright auto-dismisses dialogs, so the link would simply never be set.
    let osPrompts = 0;
    page.on("dialog", (dialog) => {
      osPrompts += 1;
      void dialog.dismiss();
    });

    const editor = await openComposer(page);
    await page.keyboard.type("see ");

    await page.getByRole("button", { name: "Link", exact: true }).click();
    const url = page.getByRole("textbox", { name: "Link" });
    await expect(url).toBeFocused();

    // Typed the way a person types it — no scheme.
    await url.fill("coditu.com");
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    const link = editor.locator("a");
    await expect(link).toHaveText("https://coditu.com");
    await expect(link).toHaveAttribute("href", "https://coditu.com");
    expect(osPrompts, "the browser prompt is gone").toBe(0);

    // And it can be taken off again, which "clear the box" never made obvious.
    await link.click();
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(editor.locator("a")).toHaveCount(0);
  });

  test("Escape closes the link editor and leaves the draft alone", async ({ adminPage: page }) => {
    const editor = await openComposer(page);
    await page.keyboard.type("half a thought");

    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Link" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("textbox", { name: "Link" })).toHaveCount(0);
    // The composer is still open with what was typed — Escape closed the
    // popover and nothing else.
    await expect(editor).toContainText("half a thought");
  });

  /* ---- pictures ------------------------------------------------------- */

  test("they are thumbnails, not full-width screenshots", async ({ adminPage: page }) => {
    await seedPictureComment();
    await page.goto(ITEM);

    const thumbs = page.getByRole("button", { name: /^Open image/ });
    await expect(thumbs).toHaveCount(2);

    // The number that matters: a 2400px screenshot used to push the thread a
    // screen down. Both are capped at the same height, so a thread of them
    // reads as a thread.
    for (const box of await thumbs.all()) {
      const height = (await box.boundingBox())?.height ?? 0;
      expect(height, "a thumbnail is small and every thumbnail is the same size").toBeLessThanOrEqual(
        140
      );
    }
  });

  test("clicking one opens it, and Escape closes the picture and not the item", async ({
    adminPage: page,
  }) => {
    await seedPictureComment();

    // Reached as an INTERCEPTED modal, which is the case that matters: the
    // thread is then inside a dialog that also listens for Escape, and inside
    // an `overflow: hidden` panel that would clip a `fixed` scrim rendered in
    // place.
    await page.goto(SEED.sprint);
    await page.getByRole("link", { name: SEED.uniqueTitle, exact: true }).click();
    const itemDialog = page.getByRole("dialog", { name: new RegExp(`^Work item ${ITEM_KEY}`) });
    await expect(itemDialog).toBeVisible();

    await page.getByRole("button", { name: "Open image: the wide one" }).click();
    const viewer = page.getByRole("dialog", { name: "the wide one" });
    await expect(viewer).toBeVisible();

    // Not clipped to the comment column: the scrim is the viewport.
    const scrim = (await viewer.evaluate((node) => {
      const rect = node.parentElement!.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })) as { width: number; height: number };
    expect(scrim.width).toBe(1440);

    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(itemDialog, "the item behind it stayed open").toBeVisible();

    // And the second press closes the item, as it always did.
    await page.keyboard.press("Escape");
    await expect(itemDialog).toHaveCount(0);
  });

  test("a picture opens on a phone too", async ({ adminPage: page }) => {
    await seedPictureComment();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ITEM);

    await page.getByRole("button", { name: "Open image: the small one" }).click();
    await expect(page.getByRole("dialog", { name: "the small one" })).toBeVisible();

    // Nothing hangs off the side of a 390px screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });

  /**
   * The block types the design added, and the keyboard that moves them.
   *
   * These are the half a screenshot cannot check: a checklist that looks right
   * and stores as three paragraphs is a checklist that vanishes on reload, and a
   * block move that redraws correctly but writes the old order is worse than one
   * that does nothing.
   */
  test("Alt+ArrowUp moves a block, says so, and the new order is what is stored", async ({
    adminPage: page,
  }) => {
    const editor = await openComposer(page);

    await page.keyboard.type("first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");

    await expect(editor.locator("p").first()).toHaveText("first");

    // The cursor is in "second". Alt+ArrowUp should put it above "first".
    await page.keyboard.press("Alt+ArrowUp");
    await expect(editor.locator("p").first()).toHaveText("second");

    // A move nobody can hear is a move a screen-reader user cannot verify.
    //
    // Matched by its TEXT rather than by `[aria-live=polite]`: this page carries
    // five live regions — the criteria count, the thread, the hours stepper, the
    // toast rail and this one — and asserting on the attribute is asserting that
    // no other part of the screen has anything to say.
    await expect(page.getByText(/Block moved to position 1 of 2/)).toBeAttached();

    await page.keyboard.press("ControlOrMeta+Enter");

    // What was DRAWN is not what matters — what was stored is. A move that only
    // updates the view writes the old order and loses on the next reload.
    await expect
      .poll(async () => {
        const [row] = await query<{ body_text: string }>(
          `select body_text from comments
            where work_item_id = (select id from work_items where key = $1)
            order by created_at desc limit 1`,
          [ITEM_KEY]
        );
        return row?.body_text?.trim() ?? null;
      })
      .toBe("second\nfirst");
  });

  test("Alt+ArrowUp on the first block does nothing rather than something", async ({
    adminPage: page,
  }) => {
    const editor = await openComposer(page);
    await page.keyboard.type("only");

    await page.keyboard.press("Alt+ArrowUp");
    await page.keyboard.press("Alt+ArrowDown");

    // Not a crash, not a duplicate, not an empty paragraph appearing above it.
    await expect(editor.locator("p")).toHaveCount(1);
    await expect(editor.locator("p")).toHaveText("only");
  });

  test("a checklist stores as a checklist, with its ticks", async ({ adminPage: page }) => {
    const editor = await openComposer(page);

    // The input rule, which is how anybody actually makes one.
    await page.keyboard.type("[ ] ship it");
    await expect(editor.locator("input[type=checkbox]")).toHaveCount(1);

    await editor.locator("input[type=checkbox]").check();
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect
      .poll(async () => {
        const [row] = await query<{ body_json: unknown }>(
          `select body_json from comments
            where work_item_id = (select id from work_items where key = $1)
            order by created_at desc limit 1`,
          [ITEM_KEY]
        );
        return JSON.stringify(row?.body_json ?? null);
      })
      // `taskItem` with `checked: true`, not a paragraph that happens to start
      // with a bracket. If the extension were missing, the input rule would not
      // fire and this would store as text.
      .toMatch(/"type":"taskItem".*"checked":true/);
  });

  test("the stored checklist renders as a checklist, disabled", async ({ adminPage: page }) => {
    await openComposer(page);
    await page.keyboard.type("[ ] read it back");
    await page.keyboard.press("ControlOrMeta+Enter");

    // Out of the composer and into the thread — the SERVER renderer, which is a
    // different walker from the editor's schema and has to have learned the same
    // node.
    const thread = page.locator("article").last();
    await expect(thread.locator("input[type=checkbox]")).toBeVisible();
    // Rendered, not interactive: there is no write path behind a tick in a
    // stored comment, and a box that moves but saves nothing is a lie.
    await expect(thread.locator("input[type=checkbox]")).toBeDisabled();
  });


  test("slash opens the block menu, and the keyboard drives it", async ({ adminPage: page }) => {
    const editor = await openComposer(page);

    await page.keyboard.type("/");
    const menu = page.getByRole("listbox", { name: "Insert a block" });
    await expect(menu).toBeVisible();

    // Filtering, then the same keys the mention list uses — one interaction
    // language, not two.
    await page.keyboard.type("quote");
    await expect(menu.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");

    await expect(editor.locator("blockquote")).toBeVisible();
    // The "/quote" that summoned it is gone — the range is deleted, not left
    // behind as text inside the block it asked for.
    await expect(editor).not.toContainText("/quote");
  });

  test("slash does not fire mid-sentence, where a slash is just a slash", async ({
    adminPage: page,
  }) => {
    const editor = await openComposer(page);

    // "and/or", "src/lib/blocks", "TypeScript 5/6" — far more common than the
    // shortcut, and a menu opening on them is an ambush rather than a feature.
    await page.keyboard.type("see src/lib/blocks");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toHaveCount(0);
    await expect(editor).toContainText("see src/lib/blocks");
  });

  test("Escape closes the block menu and leaves the draft standing", async ({
    adminPage: page,
  }) => {
    const editor = await openComposer(page);
    await page.keyboard.type("keep me");

    // A NEW block — `startOfLine` is doing its job, and typing "/" straight
    // after "keep me" correctly opens nothing. The first draft of this test got
    // that wrong and the menu never appeared, which is the shortcut's own
    // guarantee working.
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toHaveCount(0);

    // One press, one dismissal. Without `stopPropagation` the key travels on —
    // on the intercepted route it closes the item dialog, and here it would tear
    // down the composer with the draft still in it. The same trap the link
    // popover and the image viewer each hit.
    //
    // Asserted on the DRAFT rather than on a dialog: this spec opens the item as
    // a full page, where there is no dialog to survive.
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("keep me");
  });

  test("the block menu is clean to axe", async ({ adminPage: page }) => {
    await openComposer(page);
    await page.keyboard.type("/");
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible();
    expect(await auditA11y(page)).toEqual([]);
  });


  test("Escape dismisses the mention list too, and only the list", async ({ adminPage: page }) => {
    const editor = await openComposer(page);
    await page.keyboard.type("ask ");
    await page.keyboard.type("@");

    const list = page.getByRole("listbox", { name: "Mention someone" });
    await expect(list).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);

    // This never worked and nothing said so. ProseMirror checks the VIEW's own
    // `handleKeyDown` before any plugin's, so the editor's "Escape means step
    // away" branch won and blurred the whole composer while the list stayed on
    // screen. Found while building the `/` menu, which has the identical shape.
    await expect(editor).toContainText("ask");
  });

});

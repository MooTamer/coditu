import { expect, query, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-150`;

/**
 * The comment renderer is a security boundary, so this suite attacks it with
 * documents written straight into `body_json` — bypassing the composer, exactly
 * as an attacker with any write path would.
 *
 * "Renders inert" means three things, and each is asserted separately: nothing
 * executes, no dangerous attribute survives into the DOM, and the reader still
 * sees something rather than a blank thread.
 */
async function seedComment(doc: unknown, text = "seeded") {
  return seedRawComment(JSON.stringify(doc), text);
}

/**
 * Seed a comment from JSON that is ALREADY serialised.
 *
 * Separate from `seedComment` rather than a `typeof doc === "string"` branch
 * inside it: a string is perfectly good input to the normal path — one of these
 * tests stores the literal `"not a document"` — so dispatching on the type
 * would quietly send valid data down the wrong road.
 */
async function seedRawComment(body: string, text = "seeded") {
  const [item] = await query<{ id: string }>(`select id from work_items where key = 'COD-150'`);
  const [author] = await query<{ id: string }>(
    // By email, not by name: two profiles are called "Mohamed Tamer", and
    // `[author]` would silently take whichever the planner returned first.
    `select p.id from profiles p join auth.users u on u.id = p.id
     where u.email = 'mohamed@coditu.com'`
  );
  const [row] = await query<{ id: string }>(
    `insert into comments (work_item_id, author_id, body_json, body_text)
     values ($1, $2, $3::jsonb, $4) returning id`,
    [item.id, author.id, body, text]
  );
  return row.id;
}

async function clearComments() {
  await query(
    `delete from comments where work_item_id = (select id from work_items where key = 'COD-150')`
  );
}

test.describe("comment rendering is inert against hostile JSON", () => {
  // Serial: every test seeds and clears comments on the SAME item, so parallel
  // workers would delete each other's fixtures mid-assertion.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await clearComments();
  });

  test.afterEach(async () => {
    await clearComments();
  });

  test("a script node does not execute and is not emitted as a tag", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "script",
            attrs: { src: "https://evil.example/x.js" },
            content: [{ type: "text", text: "window.__pwned = true" }],
          },
        ],
      },
      "hostile script node"
    );

    let pageErrors = 0;
    page.on("pageerror", () => (pageErrors += 1));

    await page.goto(ITEM);

    // Nothing ran.
    expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
    expect(pageErrors).toBe(0);

    // No <script> reached the DOM from the comment.
    const scriptSrcs = await page.evaluate(() =>
      [...document.querySelectorAll("script")].map((s) => s.getAttribute("src") ?? "")
    );
    expect(scriptSrcs.some((src) => src.includes("evil.example"))).toBe(false);

    // The text still reads — fail closed, not fail blank.
    await expect(page.getByText("window.__pwned = true")).toBeVisible();
  });

  test("text that looks like markup renders as characters", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: '<img src=x onerror="window.__xss=1">' },
              { type: "text", text: "<script>window.__xss2=1</script>" },
            ],
          },
        ],
      },
      "markup as text"
    );

    await page.goto(ITEM);

    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
    expect(await page.evaluate(() => "__xss2" in window)).toBe(false);

    // React escaped it, so it is visible text rather than an element.
    await expect(page.getByText('<img src=x onerror="window.__xss=1">')).toBeVisible();
    const injected = await page.evaluate(
      () => document.querySelectorAll('img[src="x"]').length
    );
    expect(injected).toBe(0);
  });

  test("a javascript: link is not clickable", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click me",
                marks: [{ type: "link", attrs: { href: "javascript:window.__nav=1" } }],
              },
            ],
          },
        ],
      },
      "javascript link"
    );

    await page.goto(ITEM);

    // The words are still there; they are just not a link.
    await expect(page.getByText("click me")).toBeVisible();
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "")
    );
    expect(hrefs.some((href) => href.toLowerCase().startsWith("javascript:"))).toBe(false);
  });

  test("a data: image source is refused", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "data:image/svg+xml,<svg onload='window.__svg=1'/>", alt: "x" },
          },
        ],
      },
      "data uri image"
    );

    await page.goto(ITEM);

    expect(await page.evaluate(() => "__svg" in window)).toBe(false);
    const dataImages = await page.evaluate(
      () => [...document.querySelectorAll("img")].filter((i) => (i.getAttribute("src") ?? "").startsWith("data:")).length
    );
    expect(dataImages).toBe(0);
  });

  test("event-handler attributes never reach the DOM", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { onclick: "window.__click=1", onmouseover: "window.__hover=1", style: "position:fixed;inset:0" },
            content: [{ type: "text", text: "attributes should be dropped" }],
          },
        ],
      },
      "attribute injection"
    );

    await page.goto(ITEM);

    const body = page.locator("main, [role='dialog']").first();
    const withHandlers = await body.evaluate(
      (root) => root.querySelectorAll("[onclick], [onmouseover], [onerror], [onload]").length
    );
    expect(withHandlers).toBe(0);
    await expect(page.getByText("attributes should be dropped")).toBeVisible();
  });

  test("a deeply nested document does not crash the page", async ({ adminPage: page }) => {
    // body_json is jsonb — it will store this happily. The renderer must not
    // recurse into it without a bound.
    //
    // Built as a STRING rather than an object: `JSON.stringify` recurses, so
    // 3,000 levels overflows the stack on a machine with a smaller default than
    // a Mac's — the test could not construct its own input on CI, which looked
    // exactly like the app crashing.
    const depth = 3000;
    const deepJson =
      `{"type":"doc","content":[` +
      `{"type":"paragraph","content":[`.repeat(depth) +
      `{"type":"text","text":"bottom of the well"}` +
      `]}`.repeat(depth) +
      `]}`;

    await seedRawComment(deepJson, "deep nesting");

    const response = await page.goto(ITEM);
    expect(response?.status()).toBe(200);
    // The page rendered rather than throwing a 500 from a stack overflow.
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  });

  test("a malformed document degrades to a message, not a broken thread", async ({ adminPage: page }) => {
    await seedComment("just a string, not a document", "malformed");

    await page.goto(ITEM);
    await expect(page.getByText("This comment could not be displayed.")).toBeVisible();
    // The rest of the page is intact.
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  });

  test("a legitimate document renders its formatting", async ({ adminPage: page }) => {
    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bold ", marks: [{ type: "bold" }] },
              { type: "text", text: "and code", marks: [{ type: "code" }] },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: "ts" },
            content: [{ type: "text", text: "const minutes = 450;" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "the docs",
                marks: [{ type: "link", attrs: { href: "https://www.evim.de" } }],
              },
            ],
          },
        ],
      },
      "formatted"
    );

    await page.goto(ITEM);

    await expect(page.locator("strong", { hasText: "Bold" })).toBeVisible();
    await expect(page.locator("code", { hasText: "and code" }).first()).toBeVisible();
    await expect(page.locator("pre code")).toContainText("const minutes = 450;");
    // Highlighted server-side, so the tokens are real elements.
    expect(await page.locator("pre code span").count()).toBeGreaterThan(0);

    const link = page.locator('a[href="https://www.evim.de"]');
    await expect(link).toHaveText("the docs");
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });

  test("a mention renders as a chip and keeps the id out of the page text", async ({ adminPage: page }) => {
    const [adam] = await query<{ id: string }>(
      `select id from profiles where full_name = 'Adam Nafie'`
    );

    await seedComment(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mention", attrs: { id: adam.id, label: "Adam Nafie" } },
              { type: "text", text: " can you confirm the source?" },
            ],
          },
        ],
      },
      "@Adam Nafie can you confirm the source?"
    );

    await page.goto(ITEM);

    await expect(page.getByText("@Adam Nafie")).toBeVisible();
    // A mention is a chip, not a link.
    expect(await page.locator(`a:has-text("Adam Nafie")`).count()).toBe(0);
  });

  test("the editor bundle is not shipped to a reader who never composes", async ({ adminPage: page }) => {
    // Only meaningful against a production build. The dev server eagerly loads
    // dynamic chunks so HMR can patch them, so measuring code splitting there
    // reports a failure that does not exist in what ships.
    const prodUrl = process.env.E2E_PROD_URL;
    test.skip(
      !prodUrl,
      "needs a production build — run `npm run e2e:prod` (sets E2E_PROD_URL)"
    );

    const chunks: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/_next/")) chunks.push(response.url());
    });

    await page.goto(`${prodUrl}${ITEM}`);
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await page.waitForTimeout(800);

    const loadedEditor = await Promise.all(
      chunks.map(async (url) => {
        try {
          const body = await (await page.request.get(url)).text();
          return body.includes("prosemirror") || body.includes("ProseMirror");
        } catch {
          return false;
        }
      })
    );

    expect(
      loadedEditor.some(Boolean),
      "TipTap must not load until somebody opens the composer"
    ).toBe(false);
  });
});

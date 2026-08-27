import { auditA11y, expect, query, SEED, shell, test } from "./fixtures";

/**
 * `/app`, on a phone.
 *
 * The numbers this was written against, all of them measured rather than
 * asserted:
 *
 *  - `grep -rhoE '\b(sm|md|lg|xl):' --include='*.tsx' app/app components/app`
 *    returned **8**. Eight responsive utilities in the whole authenticated
 *    surface, in four files.
 *  - `app/globals.css` was 838 lines with exactly **one** `@media` query, and it
 *    was `prefers-reduced-motion`.
 *  - The rail was `sticky h-dvh`, 72px, and expanded **on hover** — which a
 *    touch screen does not have. At 390px it spent 18% of the width on five
 *    unlabelled icons that could never open.
 *
 * And 162 specs passed, because `playwright.config.ts` declared one project.
 * "No horizontal overflow at thirteen widths" is a much weaker claim than
 * "usable with a thumb", and this file is the difference.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const PHONE = { width: 390, height: 844 };

test.describe("the shell on a phone", () => {
  test("the rail is gone and the tab bar has taken over", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);

    // The rail is not merely narrow — it is not there. It could not be made to
    // work: it opens on hover.
    await expect(page.getByRole("complementary")).toBeHidden();

    const bar = page.locator("[data-tab-bar]");
    await expect(bar).toBeVisible();
    // Four across at 390px is 97px each; five is 78px and the labels truncate.
    // So the bar takes the first three of the design's own nav order — Home,
    // Sprint, My work — and Projects went behind More when Home arrived in W6.
    for (const label of ["Home", "Sprint", "My work", "More"]) {
      await expect(bar.getByText(label, { exact: true })).toBeVisible();
    }

    // Thumb-reachable: the bar is against the bottom of the viewport.
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height), "the bar is not at the bottom").toBe(PHONE.height);
  });

  test("above md the desktop rail is back, untouched", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(SPRINT);
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.locator("[data-tab-bar]")).toBeHidden();
  });

  test("exactly one tab is the current page, and it agrees with the rail", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize(PHONE);

    const current = async () =>
      page
        .locator('[data-tab-bar] [aria-current="page"]')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""));

    await page.goto("/app");
    expect(await current()).toEqual(["Home"]);

    await page.goto(SPRINT);
    expect(await current()).toEqual(["Sprint"]);

    await page.goto("/app/my-work");
    expect(await current()).toEqual(["My work"]);

    // Projects, People, Import and Profile live behind More — which is what
    // carries the current marker for all of them, so there is still exactly
    // one. Projects joined that list in W6, when Home took a tab; Profile
    // joined it in W10, when the personal half of Settings became its own
    // route.
    for (const path of ["/app/projects", "/app/people", "/app/import", "/app/profile"]) {
      await page.goto(path);
      expect(await current(), path).toEqual(["More"]);
    }
  });

  test("the bottom bar never covers the last row", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);

    // Scroll to the very end of the page, then check the last card is clear of
    // the bar. A fixed bar over the last row is the classic version of this
    // bug: the row is visible, and untappable.
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(200);

    // `:visible` matters: below 900px the table is hidden and `SprintCards`
    // renders the same items as cards, so the DOM holds two links per item and
    // half of them have no box at all.
    const last = page.locator("a[href*='/items/']:visible").last();
    await expect(last).toBeVisible();

    const card = (await last.boundingBox())!;
    const bar = (await page.locator("[data-tab-bar]").boundingBox())!;
    expect(card.y + card.height, "the last row is behind the tab bar").toBeLessThanOrEqual(bar.y);
  });

  test("More opens a sheet that reaches the rest of the app", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);

    await page.locator("[data-tab-bar]").getByRole("button", { name: /More/ }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();

    // A sheet, not a centred dialog: against the bottom edge and full width.
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width), "a sheet is full width").toBe(PHONE.width);

    await sheet.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByRole("dialog", { name: "More" })).toHaveCount(0);
  });

  test("search survives the loss of the palette's trigger", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);

    // The wide trigger is `hidden … sm:flex` — a 420px search box does not fit.
    // Search itself still has to be reachable, and ⌘K is not a gesture a phone
    // has.
    await page.getByRole("button", { name: "Search items, sprints, people" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("dialogs are sheets on a phone", () => {
  test("an item opens against the bottom edge, full width", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Measured after the entrance lands. The `surface` tier translates the
    // panel 10px on the way in, so a box read mid-animation is 10px out and
    // the failure looks like a layout bug.
    await expect(dialog).toHaveCSS("opacity", "1");

    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.width), "a sheet is full width").toBe(PHONE.width);
    // Rounded at the top only, because the bottom is the edge of the screen.
    const radius = await dialog.evaluate((el) => {
      const style = getComputedStyle(el);
      return { top: style.borderTopLeftRadius, bottom: style.borderBottomLeftRadius };
    });
    expect(parseFloat(radius.top)).toBeGreaterThan(0);
    expect(parseFloat(radius.bottom)).toBe(0);
  });

  test("the page behind is locked, and stays where it was", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);
    // The page has to be TALL before it can be scrolled 900px, and under three
    // projects at once the cards can still be arriving. Waiting for the last
    // one is waiting for the height.
    await expect(page.locator("a[href*='/items/']:visible").last()).toBeVisible();

    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5000 })
      .toBe(900);

    await page.locator("a[href*='/items/']:visible").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Two halves, and the second is the one iOS needs. `overflow: hidden` on
    // the body stops a wheel and does NOT stop a finger; `touch-action: none`
    // on the scrim is what stops the finger, and the panel's own scroller opts
    // back in with `pan-y`.
    const lock = await page.evaluate(() => ({
      body: getComputedStyle(document.body).overflow,
      scrim: getComputedStyle(document.querySelector("[data-scrim]")!).touchAction,
      panel: getComputedStyle(
        document.querySelector("[data-scrim] [role=dialog] > div:nth-child(2)")!
      ).touchAction,
      // The document scroll must not have been touched. Pinning the body with
      // `position: fixed` is the usual lock and it fights the router's own
      // restoration on `router.back()` — measured at 596, 1251 and 442 on
      // three consecutive runs from the same starting point.
      position: getComputedStyle(document.body).position,
    }));
    expect(lock.body, "the wheel is not locked").toBe("hidden");
    expect(lock.scrim, "a finger will scroll the page behind the sheet on iOS").toBe("none");
    expect(lock.panel, "the sheet's own body cannot be scrolled").toBe("pan-y");
    expect(lock.position, "the body was pinned — this breaks scroll restoration").not.toBe("fixed");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(300);

    // Not `toBe(before)`, and the reason is worth stating rather than rounding
    // off. An item sheet is an INTERCEPTED route: it closes through
    // `router.back()`, and where the page lands afterwards is the App Router's
    // scroll restoration, not this component's. Chromium puts it back at
    // exactly 900; WebKit puts it at 596. What the sheet owes is that it does
    // not throw the reader to the top — which is what the fixed-body lock did,
    // and what this asserts.
    const after = await page.evaluate(() => window.scrollY);
    expect(after, "closing the sheet returned the reader to the top").toBeGreaterThan(300);
  });

  test("above md it is still a centred dialog", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();

    const dialog = page.getByRole("dialog");
    const box = (await dialog.boundingBox())!;
    expect(box.width, "the desktop dialog went full-bleed").toBeLessThan(1280);
    const radius = await dialog.evaluate((el) => getComputedStyle(el).borderBottomLeftRadius);
    expect(parseFloat(radius)).toBeGreaterThan(0);
  });
});

test.describe("touch and input", () => {
  test("every field is at least 16px on a coarse pointer", async ({ browser }) => {
    // Under 16px, focusing an input makes mobile Safari zoom the page in — and
    // it does not zoom back out, so one tap on a filter strands the reader at
    // 1.4x with the table off the side of the screen.
    const context = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto("/login");

      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea"))
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => ({ el: el.getAttribute("name") ?? el.tagName, size: getComputedStyle(el).fontSize }))
          .filter((row) => parseFloat(row.size) < 16)
      );
      expect(small).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("the number fields ask for the right keyboard", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Hours are decimal, so the keyboard has to carry a separator. `numeric`
    // would give a phone a keypad with no way to type 1.5.
    const hours = page.getByRole("dialog").locator('input[inputmode]').first();
    if ((await hours.count()) > 0) {
      await expect(hours).toHaveAttribute("inputmode", /decimal|numeric/);
    }
  });

  test("dragging a row needs a press, so a scroll stays a scroll", async ({ adminPage: page }) => {
    // Read off the component's own sensors rather than by faking a gesture:
    // `PointerSensor` with `distance: 6` treats the first six pixels of a
    // SCROLL as the start of a drag, which is why it had to go.
    const source = await page.request.get("/app/projects/meinevim/sprints/17");
    expect(source.ok()).toBe(true);

    const { readFileSync } = await import("node:fs");
    const table = readFileSync("components/app/sprint-table.client.tsx", "utf8");
    expect(table, "PointerSensor is back — a scroll will start a drag").not.toContain(
      "useSensor(PointerSensor"
    );
    expect(table).toContain("useSensor(TouchSensor");
    expect(table).toMatch(/TouchSensor,\s*\{\s*activationConstraint:\s*\{\s*delay:/);
  });
});

test.describe("the composer, with a thumb", () => {
  /**
   * A mention is CHOSEN by tapping it, not by pressing Enter.
   *
   * That is the whole test. On a phone there is no Enter to press while the
   * suggestion list is open, and WebKit does not select on Enter anyway — it
   * leaves a plain "@Adam" in the text and stores no id, so a rename would
   * silently orphan the mention. `composer.spec.ts` covers the keyboard path
   * and does not run here: it seeds and clears comments on one row, and three
   * projects doing that at once delete each other's fixture.
   */
  test("a mention is chosen by tapping it, and stores the id", async ({ adminPage: page }, info) => {
    const key = SEED.threadPerProject[info.project.name] ?? SEED.threadPerProject.chromium;
    const clear = () =>
      query(`delete from comments where work_item_id = (select id from work_items where key = $1)`, [
        key,
      ]);

    await clear();
    try {
      await page.setViewportSize(PHONE);
      await page.goto(`${SPRINT}/items/${key}`);

      await shell(page).getByText("Write a comment — @ to mention").click();
      const editor = page.locator(".coditu-prose");
      await editor.click();
      await page.keyboard.type("@Adam");

      const list = page.getByRole("listbox", { name: "Mention someone" });
      await expect(list).toBeVisible();
      await list.getByText("Adam Nafie").click();

      await page.keyboard.type(" can you look?");
      await page.getByRole("button", { name: "Comment", exact: true }).click();

      const [adam] = await query<{ id: string }>(
        `select id from profiles where full_name = 'Adam Nafie'`
      );
      await expect
        .poll(
          async () => {
            const rows = await query<{ doc: string }>(
              `select c.body_json::text as doc from comments c
               join work_items w on w.id = c.work_item_id where w.key = $1`,
              [key]
            );
            return rows[0]?.doc ?? "";
          },
          { timeout: 8000 }
        )
        .toContain(adam.id);
    } finally {
      await clear();
    }
  });
});

test.describe("accessibility, on a phone", () => {
  test("axe finds nothing at 390px", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    for (const path of [SPRINT, "/app/my-work", "/app/people", "/app/profile"]) {
      await page.goto(path);
      expect(await auditA11y(page), `axe on ${path} at 390px`).toEqual([]);
    }
  });

  test("axe finds nothing with the More sheet open", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPRINT);
    await page.locator("[data-tab-bar]").getByRole("button", { name: /More/ }).click();
    await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
    await expect(page.locator("[data-scrim] [role=dialog]")).toHaveCSS("opacity", "1");
    expect(await auditA11y(page)).toEqual([]);
  });

  test("every target in the app clears 44px on a coarse pointer", async ({ browser }) => {
    // Twenty-one navigations in one test, each waiting for `networkidle`. That
    // is a minute of work on a busy machine and the default budget is thirty
    // seconds — so this failed as `browserContext.close: Target page … closed`,
    // which reads as a browser crash and is really a stopwatch. The scope grew
    // from four routes to twenty-one when the audit widened it; the budget did
    // not, and that was an oversight rather than a discovery.
    test.setTimeout(180_000);

    // `e2e/a11y.spec.ts` has run this on `/` since it was written, and this ran
    // it on FOUR application screens. The 2026-08-27 audit swept all of them
    // and the four were the wrong four: a role picker at 115×28 on
    // `/app/people`, a projects search at 358×34, seven number fields in
    // Workspace settings at 110×34 and a select at 308×34 were every one of
    // them under the floor, on every phone, for as long as they had existed.
    // None was on a screen this test looked at.
    //
    // The fix was one rule in `globals.css`: the coarse-pointer block had said
    // 44px for buttons and links since W14 and had never said it for `input`,
    // `select` or `textarea`. The guard is the list below, which is every route
    // the application has.
    const context = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      // Sign in on this context — it is not the fixture's.
      const { signIn, SEED_ADMIN } = await import("./fixtures");
      await signIn(page, SEED_ADMIN);

      const ROUTES = [
        "/app",
        "/app/sprint",
        "/app/my-work",
        "/app/people",
        "/app/profile",
        "/app/projects",
        "/app/projects/meinevim",
        "/app/projects/meinevim/pages",
        "/app/projects/meinevim/components",
        "/app/pages",
        "/app/history",
        "/app/trash",
        "/app/earnings",
        "/app/import",
        "/app/clients",
        "/app/settings",
        "/app/settings/payouts",
        "/app/settings/recovery",
        SPRINT,
        `${SPRINT}/notes`,
        `${SPRINT}/items/${SEED.item}`,
      ];

      for (const path of ROUTES) {
        await page.goto(path);
        // `networkidle` rather than a fixed pause. The old version waited 250ms
        // and then read the DOM, which is a race dressed as a test: a screen
        // that had not finished rendering reported no small targets and passed.
        await page.waitForLoadState("networkidle").catch(() => {});

        const small = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              "a[href], button:not([disabled]), [role='button'], input:not([type=hidden]), select, textarea, summary"
            )
          )
            .filter((el) => {
              // A visually hidden field is not a target: the visible control
              // that labels it is. The file inputs behind "Choose a picture"
              // and the export dialog are what this exempts.
              if (el.classList.contains("sr-only")) return false;

              // A checkbox or radio inside a `<label>` is targeted through the
              // label, so the LABEL is what has to clear 44px. Growing the box
              // itself would put a 44px tick beside a 20px word.
              const input = el as HTMLInputElement;
              const measured =
                (input.type === "checkbox" || input.type === "radio") && el.closest("label")
                  ? (el.closest("label") as HTMLElement)
                  : el;

              const box = measured.getBoundingClientRect();
              if (box.width === 0 || box.height === 0) return false;

              // WCAG 2.5.8 exempts a target inline in a sentence — padding one
              // to 44px would break the line it sits in. The activity feed's
              // story keys and the registry's breadcrumb are these.
              if (el.tagName === "A" && el.closest("p, li, span")) return false;

              // 43.5, not 44. A control that has been given `min-width: 44px`
              // still measures 43.9921875 when it sits at a fractional offset
              // in a flex row, and failing it for four thousandths of a pixel
              // is a test failing on arithmetic rather than on a target
              // anybody could miss.
              return box.height < 43.5 || box.width < 43.5;
            })
            // NOT `.slice(0, 8)`. The old cap meant a screen with nine failures
            // reported eight, and fixing those eight looked like fixing the
            // screen.
            .map((el) => {
              const box = el.getBoundingClientRect();
              return `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(box.width)}×${Math.round(box.height)}`;
            })
        );
        expect(small, `targets under 44px on ${path}`).toEqual([]);
      }
    } finally {
      await context.close();
    }
  });
});

/**
 * The composer's toolbar, on a real touch screen.
 *
 * `onMouseDown` preventing default is what keeps ProseMirror's stored marks —
 * the "what I type next is bold" state an empty document has instead of a
 * range. On a touch screen the synthetic mouse event is **not guaranteed**:
 * Safari fires it after a delay and some Android keyboards not at all, so the
 * mark was already gone by the time the handler ran. `onPointerDown` is the
 * fix, and this is what proves it — on a phone, which is the only place it can
 * be proved.
 */
test.describe("bold works before there are any words, with a finger", () => {
  // `hasTouch` on the CONTEXT, not just on the two phone projects: this file is
  // on `ON_A_PHONE`, so chromium runs it too, and `tap()` on a context without
  // touch is not a failed assertion — it is `locator.tap: The page does not
  // support tap`, which reads as a broken test rather than as the thing the
  // test is about. `isMobile` comes with it because the 44px and 16px rules key
  // on `pointer: coarse`, which Chromium derives from it.
  test.use({ sprintTotals: "read", hasTouch: true, isMobile: true });

  test("tap Bold on an empty composer, type, and the stored document is bold", async ({
    adminPage: page,
  }, testInfo) => {
    // One quiet row per Playwright PROJECT. Three projects seeding comments on
    // one item is three workers deleting each other's fixture — the race
    // `playwright.config.ts` records for `composer.spec.ts`.
    const key = SEED.threadPerProject[testInfo.project.name] ?? SEED.thread;
    await query(
      `delete from comments where work_item_id = (select id from work_items where key = $1)`,
      [key]
    );

    await page.goto(`${SEED.sprint}/items/${key}`);
    await page.getByRole("button", { name: /Write a comment/ }).click();
    const editor = page.getByRole("textbox", { name: "Comment" });
    await expect(editor).toBeVisible();
    await editor.click();

    const bold = page.getByRole("button", { name: "Bold" });
    await expect(bold).toBeVisible();
    // The whole point: pressed with no selection at all.
    await bold.tap();
    await expect(bold).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.type("x");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    await expect
      .poll(async () => {
        const [row] = await query<{ marks: string | null }>(
          `select c.body_json #>> '{content,0,content,0,marks,0,type}' as marks
             from comments c
             join work_items w on w.id = c.work_item_id
            where w.key = $1
            order by c.created_at desc limit 1`,
          [key]
        );
        return row?.marks ?? null;
      })
      .toBe("bold");

    await query(
      `delete from comments where work_item_id = (select id from work_items where key = $1)`,
      [key]
    );
  });

  test("the toolbar scrolls sideways rather than becoming two rows", async ({ adminPage: page }, testInfo) => {
    // One quiet row per Playwright PROJECT. Three projects seeding comments on
    // one item is three workers deleting each other's fixture — the race
    // `playwright.config.ts` records for `composer.spec.ts`.
    const key = SEED.threadPerProject[testInfo.project.name] ?? SEED.thread;
    await page.goto(`${SEED.sprint}/items/${key}`);
    await page.getByRole("button", { name: /Write a comment/ }).click();
    await expect(page.getByRole("textbox", { name: "Comment" })).toBeVisible();

    // At 320px a wrapped toolbar is two rows of buttons above a two-line
    // composer, and the thing being written disappears under the keyboard.
    const rows = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLElement>('[aria-label="Bold"], [aria-label="Image"]')];
      if (buttons.length < 2) return -1;
      const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
      return tops.size;
    });
    expect(rows, "the toolbar wrapped to a second row").toBe(1);
  });

  test("every toolbar target clears 44px on a coarse pointer", async ({ adminPage: page }, testInfo) => {
    // One quiet row per Playwright PROJECT. Three projects seeding comments on
    // one item is three workers deleting each other's fixture — the race
    // `playwright.config.ts` records for `composer.spec.ts`.
    const key = SEED.threadPerProject[testInfo.project.name] ?? SEED.thread;
    await page.goto(`${SEED.sprint}/items/${key}`);
    await page.getByRole("button", { name: /Write a comment/ }).click();
    await expect(page.getByRole("textbox", { name: "Comment" })).toBeVisible();

    // Measured the way the existing target audit measures: the button plus the
    // padding around it, because the 28px glyph sits flush in a 34px row.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[aria-pressed], [aria-label="Image"]')]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && (box.height < 27.5 || box.width < 27.5);
        })
        .map((el) => `${el.getAttribute("aria-label")} ${Math.round(el.getBoundingClientRect().height)}px`)
    );
    expect(small, "a toolbar button is too small to hit").toEqual([]);
  });
});

/**
 * The one field the 16px rule does not match.
 *
 * `app/globals.css`'s coarse-pointer block names `input, select, textarea`, and
 * the rich-text surface is a `contenteditable` **div** — so it inherited
 * nothing, and `.coditu-prose p` re-declared 14px. iOS Safari auto-zooms any
 * focusable editable element under 16px and does not zoom back out, which is
 * exactly the failure that block exists to prevent, arriving through the one
 * element it did not match.
 *
 * Asserted as a computed style rather than by eye, because the whole class of
 * bug is a rule that looks like it applies and does not.
 */
test.describe("the editor does not zoom an iPhone in and leave it there", () => {
  // The rule under test lives in `@media (pointer: coarse)`. On a desktop
  // context it does not apply at all, so chromium would report the 14px it is
  // supposed to have and fail for the one reason that is not a bug.
  test.use({ sprintTotals: "read", hasTouch: true, isMobile: true });

  test("every editable surface computes to at least 16px", async ({ adminPage: page }, testInfo) => {
    const key = SEED.threadPerProject[testInfo.project.name] ?? SEED.thread;
    await page.goto(`${SEED.sprint}/items/${key}`);
    await page.getByRole("button", { name: /Write a comment/ }).click();
    await expect(page.getByRole("textbox", { name: "Comment" })).toBeVisible();

    const tooSmall = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.coditu-prose, .coditu-prose p, input, select, textarea'
        ),
      ]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({
          what: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(" ")[0]}` : ""),
          size: parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter((row) => row.size < 16)
    );

    expect(tooSmall, "a field under 16px will zoom mobile Safari in").toEqual([]);
  });
});

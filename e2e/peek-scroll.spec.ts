import { SEED, expect, shell, test } from "./fixtures";

/**
 * PF-9's remaining half: opening a story must not move the page underneath it.
 *
 * ## What the first pass settled, and what it did not
 *
 * "The page scrolls oddly before the popup opens" reproduced on 4 of 5 opens at
 * 1440x900 — and it was the instrument. Playwright scrolls a target into view
 * before clicking it, through CDP, below JavaScript, and this app sets
 * `html { scroll-behavior: smooth }`, so that scroll ANIMATES and reads exactly
 * like the application easing the page somewhere. `link.dispatchEvent("click")`
 * does not scroll into view, and with it the movement was `[0,0,0,0,0]`.
 * `docs/07-FIELD-NOTES.md` records the whole elimination.
 *
 * What that did NOT settle, and this file is the answer to it: **Mohamed
 * reported the page scrolling on a phone, and only a mouse at 1440x900 had been
 * measured.** A phone is a different mechanism, not a smaller one — the peek
 * becomes a bottom sheet, the scroll lock is applied to a document that a
 * finger can still drag, and the visual viewport is a second, independent thing
 * that moves when the browser chrome resizes. None of that exists at 1440x900.
 *
 * So this runs on `mobile-safari` and `mobile-chrome` as well as chromium — it
 * is named in `ON_A_PHONE` in `playwright.config.ts` — and it measures both
 * viewports. `dispatchEvent` throughout: a measurement of scroll around a
 * `locator.click()` is a measurement of Playwright.
 */
const SPRINT = SEED.sprint;
const OPENS = 5;

interface Sample {
  before: number;
  atPaint: number;
  after: number;
  settled: number;
  /** `visualViewport.offsetTop` — the sheet moving the visual viewport, not the document. */
  visualBefore: number;
  visualAfter: number;
}

test.describe("PF-9 — opening a story leaves the page where it was", () => {
  // No `hasTouch`/`isMobile` here on purpose: the two phone projects get them
  // from `devices["iPhone 15"]` and `devices["Pixel 7"]`, and forcing them on
  // `chromium` as well would turn the desktop comparison — the one measurement
  // PF-9 already has a number for — into a third hybrid nobody asked for.
  test.use({ sprintTotals: "read" });
  test.describe.configure({ timeout: 180_000 });

  test("the document scroll does not move when the peek opens", async ({ adminPage: page }, info) => {
    await page.goto(SPRINT);
    // `:visible`, because below a 900px container the TABLE is hidden and the
    // cards are what render — and the table's links are still in the document.
    // Without it the first match on a phone is a hidden row, which is what
    // `mobile.spec.ts` scopes for too.
    const itemLinks = shell(page).locator("a[href*='/items/']:visible");
    await expect(itemLinks.first()).toBeVisible();

    /**
     * What this run actually is, read from the page rather than assumed.
     *
     * A headless browser reports `pointer: fine` unless the context really
     * carries `isMobile`, and a phone measurement taken on a fine pointer is a
     * desktop measurement in a narrow window. It is logged rather than
     * asserted, because chromium is *supposed* to be fine here — the point is
     * that the report can be checked.
     */
    const profile = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      coarse: window.matchMedia("(pointer: coarse)").matches,
      touchPoints: navigator.maxTouchPoints,
      hasVisualViewport: Boolean(window.visualViewport),
    }));

    const samples: Sample[] = [];

    for (let i = 0; i < OPENS; i += 1) {
      if (i > 0) await page.goto(SPRINT);

      // Part-way down, so a jump would be visible at all. Not a fixed number:
      // at 390px the cards are tall and at 1440 the table only scrolls ~566px,
      // and asking for more silently leaves the page wherever it could reach.
      const target = await page.evaluate(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const to = Math.min(700, Math.max(0, max));
        window.scrollTo({ top: to, behavior: "instant" });
        return to;
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(target);
      expect(target, "the page does not scroll, so a jump could not be seen").toBeGreaterThan(150);

      const read = () =>
        page.evaluate(() => ({
          scroll: window.scrollY,
          visual: Math.round(window.visualViewport?.offsetTop ?? 0),
        }));

      const start = await read();
      const link = itemLinks.nth(i % 3);

      // NOT `.click()`. See the header — that scrolls through CDP and this test
      // would be measuring the harness.
      await link.dispatchEvent("click");

      await page.waitForSelector("[role=dialog]", { state: "attached", timeout: 30_000 });
      const atPaint = await read();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
      const after = await read();

      // The lock arrives from an effect and the sheet slides in, so the frame
      // in which the dialog becomes visible is not the frame it has settled in.
      await page.waitForTimeout(600);
      const settled = await read();

      samples.push({
        before: start.scroll,
        atPaint: atPaint.scroll,
        after: after.scroll,
        settled: settled.scroll,
        visualBefore: start.visual,
        visualAfter: settled.visual,
      });

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    const moved = samples.map((s) => s.settled - s.before);
    const visualMoved = samples.map((s) => s.visualAfter - s.visualBefore);
    console.log(
      JSON.stringify({ project: info.project.name, profile, samples, moved, visualMoved }, null, 1)
    );

    // The acceptance, stated as the report stated it: the page does not move.
    // Both viewports, because on a phone they are different things and only one
    // of them is the document.
    expect(moved, "the document scroll moved when the peek opened").toEqual(
      samples.map(() => 0)
    );
    expect(visualMoved, "the visual viewport moved when the peek opened").toEqual(
      samples.map(() => 0)
    );
  });
});

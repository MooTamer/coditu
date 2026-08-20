import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The marketing site.
 *
 * These are not screenshot tests — the point is the claims, the structure, and
 * the promises the page makes to a reader and to a crawler. A section that
 * moves is a design change; a testimonial that reappears is a lie.
 *
 * Signed-out on purpose: `/` must render for someone who has never had an
 * account, so these use the raw `page`, not `adminPage`.
 */

/**
 * Reports each failing node by selector rather than a bare count, so a
 * regression names the element instead of sending the next person to go and
 * find it.
 */
async function audit(page: import("@playwright/test").Page): Promise<string[]> {
  // Let every entrance finish first. `cd-word` fades in from `opacity: 0`, and
  // axe sampling a word mid-animation reports a contrast failure that does not
  // exist once it lands. Infinite animations (`cd-pulse`) are skipped, since
  // waiting on those never returns.
  await page.evaluate(async () => {
    const running = document.getAnimations().filter(
      (animation) =>
        // A PAUSED animation's `finished` never settles — that is exactly what
        // the reveal tiers are, below the fold, waiting for a scroll.
        animation.playState === "running" &&
        animation.effect?.getComputedTiming().iterations !== Infinity
    );
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} @ ${node.target.join(" ")}`)
  );
}

test.describe("marketing site", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
  });

  test("the sections appear in the order the brief specifies", async ({ page }) => {
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll("section[id], footer[id]")).map((el) => el.id)
    );
    expect(ids).toEqual([
      "top",
      "work",
      "services",
      "process",
      "use-cases",
      "team",
      "insights",
      "faq",
      "contact",
    ]);
  });

  test("one h1, and the heading order never skips a level", async ({ page }) => {
    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) =>
        Number(el.tagName[1])
      )
    );

    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1], `heading ${i} jumps from h${levels[i - 1]}`).toBeLessThanOrEqual(1);
    }
  });

  test("the hero headline is words, not one run-on string", async ({ page }) => {
    // `cd-word` is inline-block, and an inline-block swallows its own trailing
    // whitespace — the headline rendered as "Webuildportals" until the spaces
    // were moved between the spans.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "We build portals, internal systems, and RAG assistants."
    );
  });

  test("nothing invented: no testimonials, no metrics, nobody in Berlin", async ({ page }) => {
    const text = (await page.locator("body").innerText()).toLowerCase();

    expect(text).not.toContain("berlin");
    expect(text).not.toContain("testimonial");
    // The three placeholder quotes attributed to people who never said them.
    expect(text).not.toContain("clients served");
    expect(text).not.toContain("years of experience");
    expect(text).not.toMatch(/\b\d+\+? (happy )?clients\b/);

    // The real facts, which are on the page because they are true.
    expect(text).toContain("munich");
    expect(text).toContain("ulm");
    expect(text).toContain("cairo");
    expect(text).toContain("hello@coditu.com");
  });

  test("the name Strukture appears nowhere in what is served", async ({ page }) => {
    // Rendered copy and every piece of metadata — which is what the brief's
    // rule is about. Deliberately NOT `page.content()`: the dev server inlines
    // React owner stacks containing the absolute project path, and this
    // checkout's directory is still literally named `Strukture-Digital`. That
    // is a repository-name problem, not a content one, and it does not exist
    // in a production build.
    const copy = await page.locator("body").innerText();
    const metadata = await page.evaluate(() =>
      [
        document.title,
        ...Array.from(document.querySelectorAll("meta, link")).flatMap((el) =>
          Array.from(el.attributes).map((attribute) => attribute.value)
        ),
        ...Array.from(document.querySelectorAll("img")).map((img) => `${img.alt} ${img.src}`),
      ].join(" ")
    );
    expect(copy.toLowerCase()).not.toContain("strukture");
    expect(metadata.toLowerCase()).not.toContain("strukture");

    for (const path of ["/robots.txt", "/sitemap.xml", "/site.webmanifest"]) {
      const response = await page.request.get(path);
      expect(response.ok(), `${path} should be served`).toBe(true);
      expect((await response.text()).toLowerCase()).not.toContain("strukture");
    }
  });

  test("structured data is valid, and every claim in it is also on the page", async ({ page }) => {
    const raw = await page.locator('script[type="application/ld+json"]').innerText();
    const data = JSON.parse(raw) as { "@graph": Array<Record<string, unknown>> };

    const organization = data["@graph"].find((node) => node["@type"] === "Organization");
    expect(organization?.email).toBe("hello@coditu.com");
    // Four people, and the same four the Team section lists.
    expect((organization?.employee as unknown[]).length).toBe(4);

    const body = await page.locator("body").innerText();
    for (const person of organization?.employee as Array<{ name: string }>) {
      expect(body, `${person.name} is marked up but not on the page`).toContain(person.name);
    }

    const faqPage = data["@graph"].find((node) => node["@type"] === "FAQPage");
    const questions = (faqPage?.mainEntity as Array<{ name: string }>).map((q) => q.name);
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(body, `"${question}" is marked up but not on the page`).toContain(question);
    }
  });

  test("the social card and icons are really there", async ({ page }) => {
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toContain("/og.png");

    for (const path of ["/og.png", "/favicon.ico", "/apple-touch-icon.png", "/icon-512.png"]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path}`).toBe(200);
      expect((await response.body()).byteLength, `${path} is empty`).toBeGreaterThan(500);
    }
  });

  test("a work card opens a dialog, traps focus, and gives it back", async ({ page }) => {
    const card = page.getByRole("button", { name: /MEINEvim internal SharePoint components/ });
    await card.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Internal teams ran on fragmented legacy web parts");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)
      );
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focused).toContain("MEINEvim internal SharePoint components");
  });

  test("the carousel only appears where there is more than one image", async ({ page }) => {
    await page.getByRole("button", { name: /MEINEvim internal SharePoint components/ }).click();
    await expect(page.getByRole("button", { name: "Next image" })).toBeVisible();
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Nile Atelier partner portal/ }).click();
    await expect(page.getByRole("button", { name: "Next image" })).toHaveCount(0);
  });

  test("the FAQ opens one answer at a time and says so to a screen reader", async ({ page }) => {
    const first = page.getByRole("button", { name: "What does an end-to-end engagement include?" });
    const second = page.getByRole("button", { name: "Do you only work with enterprise teams?" });

    await expect(first).toHaveAttribute("aria-expanded", "true");
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });

  test("the signal trace stays out of the text column when there is no gutter", async ({ page }) => {
    // The rail lives beside the 1240px measure. Below 1240 + 2×90 there is no
    // gutter, and a rail crossing body copy reads as a rendering fault.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.locator("svg#site-trace, [data-trace-rail]")).toHaveCount(0);

    const railAt1440 = await page.evaluate(
      () => document.querySelectorAll("svg path[stroke^='url(#traceGrad']").length
    );
    expect(railAt1440).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForTimeout(200);
    const railAt1200 = await page.evaluate(
      () => document.querySelectorAll("svg path[stroke^='url(#traceGrad']").length
    );
    expect(railAt1200, "the trace must not render without a gutter").toBe(0);
  });

  test("content is visible without JavaScript", async ({ browser }) => {
    // The reveal tiers pause on `[data-reveal-on-view]`, but only while <html>
    // carries the `js` class. With scripting off the class is never added, the
    // animations play on parse, and the page is readable — the observer is an
    // enhancement, never a gate.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("MEINEvim internal SharePoint components")).toBeVisible();
    await expect(page.getByText("Tell us what needs building.")).toBeVisible();
    await context.close();
  });

  test("reduced motion leaves a calm, complete page", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForTimeout(400);

    // Every reveal has resolved rather than sitting at frame zero, and the
    // trace is drawn in full instead of tracking the scroll.
    const state = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-on-view]"));
      const trace = document.querySelector<SVGPathElement>("path[stroke^='url(#traceGrad']");
      return {
        hidden: cards.filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
        offset: trace ? Number(getComputedStyle(trace).strokeDashoffset.replace("px", "")) : 0,
      };
    });
    expect(state.hidden, "a reveal is still hidden under reduced motion").toBe(0);
    expect(state.offset, "the trace should be drawn, not waiting for a scroll").toBe(0);
    await context.close();
  });

  test("axe finds nothing on the page or in the work dialog", async ({ page }) => {
    expect(await audit(page)).toEqual([]);

    await page.getByRole("button", { name: /MEINEvim internal SharePoint components/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("axe finds nothing in the light theme either", async ({ page }) => {
    await page.getByRole("button", { name: /Switch to light theme|Toggle theme/ }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(await audit(page)).toEqual([]);
  });
});

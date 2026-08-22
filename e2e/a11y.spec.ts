import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * §12, verified with a tool rather than by eye.
 *
 * The four surfaces the brief names — sprint table, item detail, composer,
 * export dialog — plus the things a scanner cannot see: keyboard reach, 200%
 * zoom, coarse-pointer target sizes, and whether any of it survives at 320px.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-229`;

/** Every failing node by selector, so a regression names itself. */
async function audit(page: Page, only?: string): Promise<string[]> {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getComputedTiming().iterations !== Infinity
      );
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  });

  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (only) builder = builder.include(only);

  const results = await builder.analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} @ ${node.target.join(" ")}`)
  );
}

test.describe("accessibility", () => {
  test.describe.configure({ mode: "serial" });

  // The default theme is light, so the plain run below covers it. The dark
  // run is driven from storage rather than by clicking the toggle: the
  // toggle's label depends on which theme is current, so a spec that clicks
  // "Switch to X" silently starts asserting the wrong theme the day the
  // default flips — which is exactly what happened when it did.
  test("axe: the sprint table, light", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(await audit(page)).toEqual([]);
  });

  test("axe: the sprint table, dark", async ({ adminPage: page }) => {
    await page.addInitScript(() => window.localStorage.setItem("theme", "dark"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await audit(page)).toEqual([]);
  });

  test("axe: the item detail, full page and intercepted", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ITEM);
    expect(await audit(page)).toEqual([]);

    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("axe: the comment composer, open and typed into", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${SPRINT}/items/COD-240`);

    await page.getByText("Write a comment — @ to mention").click();
    await expect(page.locator(".coditu-prose")).toBeVisible();
    await page.locator(".coditu-prose").click();
    await page.keyboard.type("Checking the composer for violations.");

    expect(await audit(page)).toEqual([]);
  });

  test("axe: the export dialog", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(SPRINT);
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("dialog", { name: /^Export EVIM/ })).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("axe: my work, people, and import", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/app/my-work", "/app/people", "/app/import", "/app/projects"]) {
      await page.goto(path);
      expect(await audit(page), `axe on ${path}`).toEqual([]);
    }
  });

  test("axe: sign-in", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    expect(await audit(page)).toEqual([]);
  });
});

test.describe("layout holds", () => {
  const WIDTHS = [320, 360, 390, 430, 640, 744, 834, 1024, 1280, 1440, 1728, 1920, 2560];

  /** Names the offending element, because "something overflows" is not a bug report. */
  async function overflow(page: Page) {
    return page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= limit + 1) return [];
      return Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.getBoundingClientRect().right > limit + 1)
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${el.className.toString().split(" ").slice(0, 2).join(".")}` +
            ` → ${Math.round(el.getBoundingClientRect().right)} > ${limit}`
        );
    });
  }

  test("no horizontal scroll on the marketing site, at any of the thirteen widths", async ({
    page,
  }) => {
    await page.goto("/");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      expect(await overflow(page), `marketing at ${width}px`).toEqual([]);
    }
  });

  test("no horizontal scroll in the app, at any of the thirteen widths", async ({
    adminPage: page,
  }) => {
    // Five routes at thirteen widths each, with a settle between every one.
    // The default 30s was always tight and stopped being enough once each
    // `goto` began waiting for hydration — which it has to, since `/app`
    // started streaming.
    test.slow();
    for (const path of [SPRINT, ITEM, "/app/my-work", "/app/people", "/app/import"]) {
      await page.goto(path);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(120);
        expect(await overflow(page), `${path} at ${width}px`).toEqual([]);
      }
    }
  });

  test("no horizontal scroll at 200% zoom", async ({ adminPage: page }) => {
    // 200% zoom is 1280 CSS pixels of content in a 640px-wide viewport. It is
    // the case a fixed-width layout fails and a fluid one does not.
    for (const path of ["/", SPRINT, ITEM]) {
      await page.goto(path);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => {
        document.body.style.zoom = "2";
      });
      await page.waitForTimeout(200);
      expect(await overflow(page), `${path} at 200% zoom`).toEqual([]);
      await page.evaluate(() => {
        document.body.style.zoom = "";
      });
    }
  });

  test("100dvh everywhere, never 100vh", async ({ adminPage: page }) => {
    // On mobile Safari `100vh` is taller than the visible viewport, so a
    // full-height element is cut off by the browser chrome — and the bottom of
    // it is exactly where an action bar lives.
    await page.goto(SPRINT);
    const offenders = await page.evaluate(() => {
      const found: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            const text = rule.cssText;
            if (/\b(?:100vh|min-height:\s*100vh|height:\s*100vh)\b/.test(text)) {
              found.push(text.slice(0, 120));
            }
          }
        } catch {
          // cross-origin sheet
        }
      }
      return found;
    });
    expect(offenders).toEqual([]);
  });
});

test.describe("keyboard and pointer", () => {
  test("touch targets clear 44px on a coarse pointer", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/");

    const small = await page.evaluate(() => {
      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [role='button']")
      );
      return interactive
        .filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return false;
          // An inline link inside a paragraph is exempt — WCAG 2.5.8 excludes
          // targets in a sentence, and padding one to 44px would break the text.
          if (el.tagName === "A" && el.closest("p")) return false;
          return box.height < 44 || box.width < 44;
        })
        .slice(0, 8)
        .map((el) => {
          const box = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(box.width)}×${Math.round(box.height)}`;
        });
    });
    expect(small).toEqual([]);
    await context.close();
  });

  test("every icon-only control names itself", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/", SPRINT, ITEM]) {
      await page.goto(path);
      const unnamed = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("a[href], button"))
          .filter((el) => {
            const text = (el.textContent ?? "").trim();
            if (text.length > 0) return false;
            return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.title;
          })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0]}`)
      );
      expect(unnamed, `unnamed icon-only control on ${path}`).toEqual([]);
    }
  });

  test("the whole sprint page is reachable by keyboard, and focus is always visible", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.locator("body").click({ position: { x: 2, y: 2 } });

    const seen = new Set<string>();
    let invisible: string | null = null;

    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Tab");
      const step = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          id:
            `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 28)}` +
            `:${Math.round(box.top)}`,
          // `:focus-visible` must produce a real ring, not `outline: none`.
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          visible: box.width > 0 && box.height > 0,
        };
      });
      if (!step) continue;
      seen.add(step.id);
      if (step.visible && step.outline.startsWith("none") && !invisible) invisible = step.id;
    }

    // The rail, the topbar, the filters, and the rows all have to be reachable.
    expect(seen.size, "too few focus stops — something is unreachable").toBeGreaterThan(15);
    expect(invisible, "a focused control had no visible focus ring").toBeNull();
  });
});

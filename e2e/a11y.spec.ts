import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, shell, test } from "./fixtures";

/**
 * §12, verified with a tool rather than by eye.
 *
 * The four surfaces the brief names — sprint table, item detail, composer,
 * export dialog — plus the things a scanner cannot see: keyboard reach, 200%
 * zoom, coarse-pointer target sizes, and whether any of it survives at 320px.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-229`;

/**
 * Every internal route an admin can reach, in one list.
 *
 * **W13 found the gap this closes.** Each phase audited the screen it built —
 * W6 the home, W8 the projects, W10 the profile, W11 the history, W12 the
 * recovery — and none of them ever joined the two sweeps that run here: the
 * unscrolled whole-page audit at 1440, and the thirteen-width overflow check.
 * So eight screens had an axe assertion taken with a panel open and no
 * assertion at all about how they behave on a phone or at 2560.
 *
 * A list rather than five inline arrays, so the next route added is one line
 * and cannot be forgotten by only one of them.
 */
const APP_ROUTES = [
  "/app",
  SPRINT,
  ITEM,
  "/app/my-work",
  "/app/projects",
  "/app/projects/meinevim",
  "/app/people",
  "/app/clients",
  "/app/import",
  "/app/trash",
  "/app/history",
  "/app/profile",
  "/app/settings",
  "/app/settings/payouts",
  "/app/settings/recovery",
] as const;

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
    // A generous timeout, because this is a race and not a claim about speed.
    // `next-themes` writes the class from an inline script before paint, so in
    // production it is there in the first byte — on a dev server under six
    // workers the document can still be arriving when the default 5s is up, and
    // the theme class is simply not on `<html>` yet. Failing here reports "the
    // sprint table has an accessibility problem", which is the wrong sentence
    // entirely: the audit below never ran.
    await expect(page.locator("html")).toHaveClass(/light/, { timeout: 20_000 });
    expect(await audit(page)).toEqual([]);
  });

  test("axe: the sprint table, dark", async ({ adminPage: page }) => {
    await page.addInitScript(() => window.localStorage.setItem("theme", "dark"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 20_000 });
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

    // `shell()`, for the reason measured in the Eighth pass of 08-GAP-MATRIX.md:
    // this exact selector resolves to two on a streaming item route — the
    // second one inside DIV#S:1 — and this test was failing on it before the
    // promotion below arrived, on a different project each run.
    await shell(page).getByText("Write a comment — @ to mention").click();
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

  test("axe: every route an admin can reach, unscrolled", async ({ adminPage: page }) => {
    // Unscrolled and untouched, which is the half the per-phase audits do not
    // cover: those are taken after opening a panel or clicking a control, and
    // `07-FIELD-NOTES.md` records why that is a different measurement — a
    // sticky header genuinely overlaps whatever a click scrolled under it.
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of APP_ROUTES) {
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
    // Every route at thirteen widths each, with a settle between every one.
    // The default 30s was always tight and stopped being enough once each
    // `goto` began waiting for hydration — which it has to, since `/app`
    // started streaming. Fifteen routes now rather than five, so this is
    // deliberately the slowest test in the suite: it is also the one that
    // would have caught W9's unreachable roles table at 390px five phases
    // earlier.
    test.slow();
    for (const path of APP_ROUTES) {
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

/* -------------------------------------------------------------------------- */
/* Promoted out of e2e/home-shell.local.spec.ts, 2026-08-28                    */
/* -------------------------------------------------------------------------- */

/**
 * The two keyboard contracts the local sweep proved and git could not carry.
 *
 * `05-DECISIONS.md`, *The visual evidence lives in three specs git does not
 * carry*, named this as the right long-term answer and left the choice open on
 * purpose. Both of these are durable: a tablist that stops answering arrow
 * keys, or a dialog that lets Tab out of it, is a WCAG failure and not a change
 * of taste — which is what separates them from the diagnostics left behind in
 * the local file, where a 26px greeting is one answer to one question.
 *
 * Neither is something axe can see. `aria-selected` moving with the arrow keys
 * and focus staying inside a dialog are behaviours, and a scanner reads a
 * snapshot.
 *
 * Chromium only: both are keyboard contracts, and there is no keyboard on the
 * two mobile projects this file otherwise runs on.
 */
test.describe("keyboard contracts a scanner cannot see", () => {
  test.skip(({ isMobile }) => !!isMobile, "keyboard behaviour; the phone has no Tab key");

  /**
   * The tabs had `role="tab"` and nothing else — no panel, no `aria-controls`,
   * no arrow keys. A tablist that is only a role is worse than three buttons:
   * it promises a keyboard interface and then does not have one.
   */
  test("My work is a real tablist with a panel and roving focus", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/app");
    await expect(shell(page)).toBeVisible();

    const tabs = shell(page).getByRole("tab");
    await expect(tabs).toHaveCount(3);

    // Every tab points at a panel, that panel is a tabpanel, and it names the
    // tab back.
    const wiring = await shell(page).evaluate((main) =>
      [...main.querySelectorAll('[role="tab"]')].map((tab) => {
        const panelId = tab.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        return {
          controls: panelId,
          panelIsTabpanel: panel?.getAttribute("role") === "tabpanel",
          selected: tab.getAttribute("aria-selected"),
          tabIndex: (tab as HTMLElement).tabIndex,
          labelledBack: panel?.getAttribute("aria-labelledby") === tab.id,
        };
      })
    );

    for (const tab of wiring) {
      expect(tab.controls, "every tab needs aria-controls").toBeTruthy();
      expect(tab.panelIsTabpanel, "aria-controls must point at a tabpanel").toBe(true);
    }
    // Roving: exactly one stop in the tab sequence, and one selected.
    expect(wiring.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(wiring.filter((tab) => tab.selected === "true")).toHaveLength(1);
    expect(wiring[0].labelledBack, "the panel names its selected tab").toBe(true);

    // Arrow keys move selection and take focus with them.
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(2)).toBeFocused();

    // Wrapping, both ways, and Home.
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  });

  /**
   * The tablet drawer: trapped, scroll-locked, restoring, and not doubled.
   *
   * The rail and the drawer are the same components rendered twice at once, so
   * the `id` namespacing is part of the contract and not decoration — a
   * duplicate `id` breaks every `aria-labelledby` that points at it, which is
   * the half a focus test would otherwise miss.
   */
  test("the tablet drawer traps, restores, locks and closes", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 834, height: 1000 });
    await page.goto("/app");
    await expect(shell(page)).toBeVisible();

    const opener = page.getByRole("button", { name: "Open workspace navigation" });
    const scrollBefore = await page.evaluate(() => getComputedStyle(document.body).overflow);

    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
    await expect(drawer).toBeVisible();

    // Docked left, at the handoff's width.
    const box = (await drawer.boundingBox())!;
    expect(Math.round(box.x), "docked to the left edge").toBe(0);
    expect(Math.round(box.width), "min(320px, 86vw)").toBe(320);

    // Scroll lock, with the rail behind it still in the document.
    const locked = await page.evaluate(() => ({
      overflow: getComputedStyle(document.body).overflow,
      railStillThere: !!document.querySelector("aside[data-app-chrome]"),
    }));
    expect(locked.overflow, "the page behind must not scroll").not.toBe(scrollBefore);
    expect(locked.railStillThere, "the rail is still rendered behind the drawer").toBe(true);

    // Nothing in the page is doubled while both are mounted. Polled, because a
    // client transition can hold the outgoing and incoming trees for a frame.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const seen = new Map<string, number>();
            for (const node of document.querySelectorAll("[id]")) {
              seen.set(node.id, (seen.get(node.id) ?? 0) + 1);
            }
            return [...seen.entries()].filter(([, times]) => times > 1).map(([id]) => id);
          }),
        { message: "duplicate element ids while the drawer is open", timeout: 5000 }
      )
      .toEqual([]);

    // Focus is trapped, forwards and backwards.
    const focusables = await drawer.locator("a[href], button:not([disabled])").count();
    expect(focusables).toBeGreaterThan(1);

    const inside = async () =>
      page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        return !!(panel && document.activeElement && panel.contains(document.activeElement));
      });

    for (let i = 0; i < focusables + 2; i += 1) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab ${i + 1} escaped the drawer`).toBe(true);
    }
    for (let i = 0; i < focusables + 2; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${i + 1} escaped the drawer`).toBe(true);
    }

    // Escape closes it, focus goes back to what opened it, scrolling returns.
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(opener, "focus must return to the opener").toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe(scrollBefore);

    // And a navigation closes it, including one it did not handle itself.
    await opener.click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "People" }).first().click();
    await page.waitForURL(/\/app\/people/);
    await expect(drawer).toHaveCount(0);
  });
});

import { expect, test } from "./fixtures";

/**
 * The motion contract, asserted against computed style rather than source.
 *
 * §4 of the brief makes four promises that are invisible when broken: no
 * `will-change` survives its animation, reduced motion is calm *and complete*,
 * blur happens on entrance only, and a table never blur-reveals per row. Each
 * of those fails silently — a pinned compositor layer costs memory with nothing
 * on screen to show for it, and a blur re-running on every filter keystroke
 * just feels vaguely bad.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";

/** Wait out every finite animation that is actually running. */
async function settle(page: import("@playwright/test").Page) {
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
}

async function pinnedWillChange(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const value = getComputedStyle(el).willChange;
        return value && value !== "auto";
      })
      .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-reveal") ?? "?"}]`)
  );
}

test.describe("motion", () => {
  test("no will-change survives its animation, on the marketing page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Scroll the whole page so every scroll-triggered reveal fires and finishes.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    });
    await settle(page);
    await page.waitForTimeout(400);

    expect(await pinnedWillChange(page)).toEqual([]);
  });

  test("no will-change survives its animation, in the app", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await settle(page);
    expect(await pinnedWillChange(page)).toEqual([]);
  });

  test("nothing blur-animated is taller than 40% of the viewport", async ({ adminPage: page }) => {
    // `filter: blur()` forces an offscreen composite pass every frame, so a
    // tall element is the expensive case. What matters is whether the element's
    // KEYFRAMES carry a blur, not which tier it names — `data-reveal-flat`
    // exists precisely so a group past the ceiling keeps its travel and drops
    // the expensive part.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await settle(page);

    const tooTall = await page.evaluate(() => {
      const blurring = new Set<string>();
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSKeyframesRule && rule.cssText.includes("blur(")) {
              blurring.add(rule.name);
            }
          }
        } catch {
          // cross-origin sheet
        }
      }

      const ceiling = window.innerHeight * 0.4;
      return Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"))
        .filter((el) => blurring.has(getComputedStyle(el).animationName))
        .filter((el) => el.getBoundingClientRect().height > ceiling)
        .map(
          (el) =>
            `[${el.dataset.reveal}] ${getComputedStyle(el).animationName} ` +
            `${Math.round(el.getBoundingClientRect().height)}px > ${Math.round(ceiling)}px`
        );
    });
    expect(tooTall).toEqual([]);
  });

  test("a flat reveal really is flat", async ({ adminPage: page }) => {
    // The escape hatch has to actually escape: if `cd-reveal-flat` ever grew a
    // blur, every tall group would silently start paying for it again.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    const flat = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-reveal-flat]");
      if (!el) return null;
      let keyframes = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSKeyframesRule && rule.name === "cd-reveal-flat") {
              keyframes = rule.cssText;
            }
          }
        } catch {
          // cross-origin sheet
        }
      }
      return { name: getComputedStyle(el).animationName, keyframes };
    });

    expect(flat?.name).toBe("cd-reveal-flat");
    expect(flat?.keyframes, "the flat variant must carry no blur").not.toContain("blur");
    expect(flat?.keyframes, "the flat variant keeps its travel").toContain("translateY");
  });

  test("filtering the table never re-runs a blur", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await settle(page);

    // A row must not carry a blur-bearing tier at all — the body reveals once,
    // as one group, on mount. Per-row is where a table visibly hitches.
    const rowTiers = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("tbody tr")).map(
        (row) => row.dataset.reveal ?? "none"
      )
    );
    expect(new Set(rowTiers)).toEqual(new Set(["none"]));

    await page.getByRole("button", { name: "in progress", exact: true }).click();
    await page.waitForTimeout(150);

    const blurring = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target as HTMLElement | null;
          return !!target?.closest("tbody") && animation.playState === "running";
        })
        .map((animation) => (animation as CSSAnimation).animationName ?? "?")
    );
    expect(blurring.filter((name) => name.includes("reveal"))).toEqual([]);
  });

  test("the backdrop resolves, and the panel arrives one frame behind it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByRole("link", { name: "Add optional titles to all webparts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The scrim resolves over 240ms. Sampling it mid-flight reads an
    // intermediate blur — the assertion below is about where it LANDS.
    await settle(page);

    const backdrop = await page.evaluate(() => {
      const scrim = document.querySelector<HTMLElement>("[data-scrim]");
      const panel = scrim?.querySelector<HTMLElement>("[data-reveal]");
      if (!scrim || !panel) return null;
      const s = getComputedStyle(scrim);
      const p = getComputedStyle(panel);
      return {
        name: s.animationName,
        duration: s.animationDuration,
        // The EFFECT, not just the wiring. Lightning CSS silently dropped every
        // `backdrop-filter` here once — a manual `-webkit-` prefix written
        // after the standard property makes it drop both — and a test that only
        // checked the animation's NAME reported green while all three dialogs
        // shipped with no blur at all.
        blur: s.backdropFilter,
        panelTier: panel.dataset.reveal,
        // The axis, not only the tier. A docked panel arrives from the edge it
        // is docked to, and getting that wrong is what put the peek's bottom
        // edge 10px past a 560px viewport — `cd-reveal-surface` translates on
        // Y, and a full-height panel has no gutter to absorb it.
        panelKeyframes: p.animationName,
        panelDelay: p.animationDelay,
      };
    });

    expect(backdrop).toEqual({
      name: "cd-scrim",
      duration: "0.24s",
      blur: "blur(10px)",
      // The story opens as a SIDE PEEK — docked right, full height — so it
      // carries its own entrance tier. The New-item dialog is still `surface`;
      // `dialog-shell.client.tsx` picks per variant.
      panelTier: "peek",
      panelKeyframes: "cd-reveal-peek",
      panelDelay: "0.016s",
    });
  });

  test("reduced motion: calm, complete, and no transforms or blur left running", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
      const words = Array.from(document.querySelectorAll<HTMLElement>(".cd-word"));
      const draws = Array.from(document.querySelectorAll<SVGPathElement>(".cd-draw"));
      const pulses = Array.from(document.querySelectorAll<HTMLElement>(".cd-pulse"));

      return {
        // Every tier collapses to the same 120ms opacity fade.
        tierNames: [...new Set(reveals.map((el) => getComputedStyle(el).animationName))],
        tierDurations: [...new Set(reveals.map((el) => getComputedStyle(el).animationDuration))],
        // No stagger: the section arrives at once, not as a sequence.
        tierDelays: [...new Set(reveals.map((el) => getComputedStyle(el).animationDelay))],
        // Nothing is left mid-transform or mid-blur.
        transformed: reveals
          .concat(words)
          .filter((el) => getComputedStyle(el).transform !== "none").length,
        blurred: reveals.concat(words).filter((el) => getComputedStyle(el).filter !== "none").length,
        hidden: reveals.filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
        // The trace is drawn in full; the pulse is stopped.
        undrawn: draws.filter((el) => getComputedStyle(el).strokeDashoffset !== "0px").length,
        pulsing: pulses.filter((el) => getComputedStyle(el).animationName !== "none").length,
      };
    });

    expect(state.tierNames).toEqual(["cd-fade"]);
    expect(state.tierDurations).toEqual(["0.12s"]);
    expect(state.tierDelays).toEqual(["0s"]);
    expect(state.transformed, "reduced motion must leave no transform").toBe(0);
    expect(state.blurred, "reduced motion must leave no blur").toBe(0);
    expect(state.hidden, "a reveal is still hidden").toBe(0);
    expect(state.undrawn, "the trace should be frozen at full draw").toBe(0);
    expect(state.pulsing, "the pulse should be stopped").toBe(0);

    await context.close();
  });

  /**
   * Read the spinner's animation off the real stylesheet, at a given motion
   * preference.
   *
   * `/login` rather than `/dev/tokens`. The tokens page calls `notFound()` when
   * `NODE_ENV === "production"` — deliberately, it is a review surface and
   * should not be reachable — so a test that navigates there passes against
   * `npm run e2e` and can never pass against the production run CI does
   * immediately afterwards. It reported "missing", not a wrong animation, which
   * is a test failing for a reason unrelated to the thing it is testing.
   *
   * The subject is a global rule, `.cd-spin` under `prefers-reduced-motion`, so
   * any page carrying `globals.css` can host it. The element is injected
   * because the app's only spinner is the sign-in button's pending state, and
   * holding a form mid-submit long enough to sample it would test the network
   * rather than the stylesheet.
   */
  async function spinnerAnimation(
    browser: import("@playwright/test").Browser,
    reducedMotion: "reduce" | "no-preference"
  ): Promise<string> {
    const context = await browser.newContext({ reducedMotion });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      return await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.className = "cd-spin";
        document.body.append(probe);
        const name = getComputedStyle(probe).animationName;
        probe.remove();
        return name;
      });
    } finally {
      await context.close();
    }
  }

  test("reduced motion stops the spinner", async ({ browser }) => {
    // Both directions. Asserting only the "none" half would stay green if the
    // rule were deleted along with the animation it suppresses.
    expect(await spinnerAnimation(browser, "no-preference")).toBe("cd-spin");
    expect(await spinnerAnimation(browser, "reduce")).toBe("none");
  });

  test("the status chip acknowledges a change on the micro tier", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);

    // `micro` is 4px and 200ms with NO blur — a dozen chips on screen must not
    // each cost an offscreen composite pass.
    const chip = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-reveal="micro"]');
      if (!el) return null;
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(chip).toEqual({ name: "cd-reveal-micro", duration: "0.2s" });

    const keyframes = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSKeyframesRule && rule.name === "cd-reveal-micro") {
              return rule.cssText;
            }
          }
        } catch {
          // cross-origin sheet
        }
      }
      return "";
    });
    expect(keyframes, "the micro tier must carry no blur").not.toContain("blur");
  });
});

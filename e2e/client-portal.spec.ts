/**
 * The portal, from a client's browser. LOCAL ONLY — see `.gitignore`.
 *
 * The pgTAP suite proves the database refuses. This proves the pages built on
 * top of it never render what the database withheld, and that the ones a client
 * IS meant to see are usable with a thumb and a screen reader.
 */
import { expect, test } from "@playwright/test";

import { auditA11y, signIn } from "./fixtures";
import {
  CLIENT_CONTACT,
  FIXTURE,
  OTHER_CONTACT,
  grantEffort,
  revokeFixtureGrant,
  setupClientFixture,
  teardownClientFixture,
} from "./client-fixtures";

// One worker: these share one company, one project and one contact, and
// `beforeAll` runs once per worker. See the note in `client-boundary.spec.ts`.
test.describe.configure({ mode: "serial" });

const COMPONENT = `/client/projects/${FIXTURE.projectSlug}/components/${FIXTURE.publishedComponent.slug}`;

test.beforeAll(setupClientFixture);
test.afterAll(teardownClientFixture);

test.describe("the overview", () => {
  test("greets her and shows the project she was granted", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cara");
    await expect(page.getByText(FIXTURE.projectName)).toBeVisible();
    await expect(page.getByRole("heading", { name: FIXTURE.sprintName })).toBeVisible();
  });

  test("lists the published component and not the unpublished one", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    await expect(page.getByRole("heading", { name: FIXTURE.publishedComponent.name })).toBeVisible();

    // Not "hidden" — absent. A CSS-hidden card is still in the payload.
    expect(await page.content()).not.toContain(FIXTURE.hiddenComponent.name);
  });

  test("the counts do not include unpublished work", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    // Three items exist under the component; two are published, one of those is
    // done. A count of 3 here would tell her the third exists, which is the
    // whole failure mode this design is built against.
    await expect(page.getByText("1 of 2 done").first()).toBeVisible();
    expect(await page.content()).not.toContain("of 3 done");
  });

  test("hours are absent without the capability, and present with it", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");
    expect(await page.content()).not.toContain("logged");

    await grantEffort();
    await page.reload();
    await expect(page.getByText(/h logged/).first()).toBeVisible();
  });
});

test.describe("the component page", () => {
  test("shows published work, humanised, with no internal vocabulary", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto(COMPONENT);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      FIXTURE.publishedComponent.name
    );
    await expect(page.getByText(FIXTURE.publishedTitles[0])).toBeVisible();

    // The client-safe rewrite wins over the internal title where one was given.
    await expect(page.getByText(FIXTURE.rewrittenAs)).toBeVisible();
    expect(await page.content()).not.toContain(FIXTURE.publishedTitles[1]);

    // The unpublished item, and every raw enum value.
    const html = await page.content();
    expect(html).not.toContain(FIXTURE.hiddenTitle);
    for (const raw of ["in_progress", "in_peer_review", "in_qa", "changes_requested", "COD-"]) {
      expect(html, raw).not.toContain(raw);
    }
    await expect(page.getByText("In progress").first()).toBeVisible();
  });

  /**
   * Asserted as CONTENT and not as an HTTP status, deliberately.
   *
   * `loading.tsx` on this route is a `<Suspense fallback>`: Next flushes the
   * shell before the page body runs, so the status line is already on the wire
   * and `notFound()` cannot take it back — every one of these is a 200. That
   * is a knowing trade this repository already made and wrote down
   * ("A streamed screen cannot be a 404, and the loading state is worth more",
   * 2026-08-22), and the recorded remedy is exactly this: assert the security
   * property directly, plus the marker Next leaves on a streamed not-found.
   *
   * The security property is the one that matters anyway. A 404 status proves
   * nothing about what was rendered.
   */
  async function expectNotFound(page: import("@playwright/test").Page, url: string) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: /nothing at this address/i })).toBeVisible();
    await expect(page.locator('meta[name="next-error"]')).toHaveAttribute("content", "not-found");
  }

  test("an unpublished component says nothing is here, and shows none of it", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await expectNotFound(
      page,
      `/client/projects/${FIXTURE.projectSlug}/components/${FIXTURE.hiddenComponent.slug}`
    );
    expect(await page.content()).not.toContain(FIXTURE.hiddenComponent.name);
  });

  test("another company's project gives the identical answer, confirming nothing", async ({
    page,
  }) => {
    await signIn(page, CLIENT_CONTACT);
    await expectNotFound(
      page,
      `/client/projects/${FIXTURE.otherProjectSlug}/components/${FIXTURE.publishedComponent.slug}`
    );
  });

  test("the other contact cannot reach the first company's component", async ({ page }) => {
    await signIn(page, OTHER_CONTACT);
    await expectNotFound(page, COMPONENT);
    // The sharp one: not merely refused, but carrying none of the component.
    const html = await page.content();
    expect(html).not.toContain(FIXTURE.publishedComponent.name);
    expect(html).not.toContain(FIXTURE.publishedTitles[0]);
    expect(html).not.toContain(FIXTURE.summary);
  });
});

test.describe("revocation", () => {
  test("takes effect on the very next request of an open session", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");
    await expect(page.getByText(FIXTURE.projectName)).toBeVisible();

    // No sign-out, no new session, no token refresh. The same tab.
    await revokeFixtureGrant();
    await page.reload();

    await expect(page.getByText("Your access is still being set up")).toBeVisible();
    expect(await page.content()).not.toContain(FIXTURE.projectName);
  });
});

test.describe("usable with a thumb and a screen reader", () => {
  test("axe finds nothing on the overview", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");
    expect(await auditA11y(page)).toEqual([]);
  });

  test("axe finds nothing on the component page", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto(COMPONENT);
    expect(await auditA11y(page)).toEqual([]);
  });

  test("every target clears 44px at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("a, button")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.height < 44) out.push(`${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${Math.round(rect.height)}px`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test("no horizontal overflow at the narrow widths", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(COMPONENT);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `${width}px`).toBe(false);
    }
  });

  test("reduced motion leaves nothing transformed, blurred, or transitioning", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    // Settle first. Reduced motion does not mean "no transition" — it means the
    // tiers collapse to 120ms — so reading straight after `goto` catches a
    // reveal at opacity 0.83 and reports it as motion left running. The claim
    // being made is that nothing is left running once it has landed.
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-reveal]")].every(
        (el) => parseFloat(getComputedStyle(el).opacity) >= 1
      )
    );

    const running = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-reveal], [style*='clip-path']")) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < 1) out.push(`opacity ${cs.opacity}`);
        if (cs.filter !== "none" && cs.filter.includes("blur") && !cs.filter.includes("blur(0px)")) {
          out.push(`filter ${cs.filter}`);
        }
        if (cs.willChange !== "auto") out.push(`will-change ${cs.willChange}`);
      }
      return out;
    });
    expect(running).toEqual([]);
    await context.close();
  });
});

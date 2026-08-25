import { existsSync } from "node:fs";

import {
  auditA11y,
  createThrowawayAccount,
  expect,
  removeThrowawayAccount,
  signIn,
  test,
} from "./fixtures";

/**
 * Navigation you can see, and an account you can leave.
 *
 * Three separate holes, all of them only visible on a phone:
 *
 *  - Nothing under `/app` had a `loading.tsx`, and nothing is prefetched, so a
 *    tap produced no feedback at all until the whole dynamic render returned.
 *  - `signOut` was reachable only from the ⌘K palette, whose trigger is
 *    `hidden … sm:flex` — so on a phone there was no way to sign out.
 *  - `/app/settings` rendered and worked and nothing linked to it, so the only
 *    way in was to type the URL, which an installed PWA cannot do.
 */

const SPRINT = "/app/projects/meinevim/sprints/17";
const PHONE = { width: 390, height: 844 };

test.describe("navigation feedback", () => {
  test("every route under /app declares a loading state", async () => {
    // A structural assertion on purpose. The alternative — driving to each
    // route and racing the skeleton — passes on a fast machine whether or not
    // the file exists, which is the failure mode this is guarding against.
    const segments = [
      "app/app",
      "app/app/projects",
      "app/app/projects/[slug]",
      "app/app/projects/[slug]/sprints/[number]",
      "app/app/my-work",
      "app/app/people",
      "app/app/import",
      "app/app/settings",
    ];

    const missing = segments.filter((segment) => !existsSync(`${segment}/loading.tsx`));
    expect(missing, "segments with no loading.tsx").toEqual([]);

    for (const file of ["app/app/error.tsx", "app/app/not-found.tsx", "app/global-error.tsx"]) {
      expect(existsSync(file), `${file} is missing`).toBe(true);
    }
  });

  test("a tapped navigation item marks itself pending before the destination renders", async ({
    adminPage: page,
  }) => {
    await page.goto(SPRINT);
    // "My work" rather than "People": it is in the rail above `md` AND in the
    // phone's bottom bar below it, so this asserts the same behaviour on all
    // three devices instead of asserting the rail on two that do not have one.
    const target = page.getByRole("link", { name: /^My work/ });
    await expect(target).toBeVisible();

    // Hold the destination's payload so the in-flight state is observable.
    // Nothing is prefetched, so this route is only ever hit by the click.
    await page.route("**/app/my-work*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await target.click();

    // The whole point: this must be true while the server is still thinking.
    await expect(page.locator("[data-nav-pending]")).toHaveCount(1);

    await page.unroute("**/app/my-work*");
    await expect(page).toHaveURL(/\/app\/my-work$/);
    // …and gone again once it lands.
    await expect(page.locator("[data-nav-pending]")).toHaveCount(0);
  });

  test("a cold sprint page flushes its skeleton before its table", async ({ adminPage: page }) => {
    // Read off the wire, not off the screen, and deliberately so.
    //
    // A `loading.tsx` is a `<Suspense fallback>`: the server flushes the shell
    // and the fallback, then streams the page in behind it. That is the state a
    // phone actually spends time in — a cold PWA launch or a pull-to-refresh,
    // where there is no previous page to leave on screen.
    //
    // Racing it in the DOM does not work and it is worth saying why, because
    // the obvious spec is a trap: delaying the response with `page.route`
    // delays the *whole* response, fallback included, so nothing appears any
    // earlier and the assertion fails while the feature works. The byte order
    // in the stream is the thing that is actually true.
    const html = await (await page.request.get(SPRINT)).text();

    const skeleton = html.indexOf("Loading the sprint");
    const table = html.indexOf("<table");
    expect(skeleton, "the sprint's own fallback is not in the stream").toBeGreaterThan(-1);
    expect(table, "the table is not in the stream").toBeGreaterThan(-1);
    expect(skeleton, "the skeleton must be flushed ahead of the table").toBeLessThan(table);

    // Shaped like the screen: twelve rows at the same 52px the table draws at
    // the default density, so the real thing replaces it instead of shoving it.
    // One element, not twelve — a fallback is carried in the flight payload of
    // every page below its boundary, so `.cd-skeleton-rows` paints them.
    expect(html).toMatch(/data-skeleton-rows="12"/);
    expect(html).toMatch(/--row-h:\s*52px/);
  });

  test("each screen flushes its own shape, not one shared spinner", async ({ adminPage: page }) => {
    const shapes: Array<[string, string]> = [
      ["/app/people", "Loading the team"],
      ["/app/my-work", "Loading your work"],
      ["/app/projects", "Loading projects"],
      ["/app/import", "Loading the importer"],
      ["/app/settings", "Loading your settings"],
    ];

    for (const [path, label] of shapes) {
      const html = await (await page.request.get(path)).text();
      expect(html, `${path} did not flush "${label}"`).toContain(label);
    }
  });

  test("opening an item leaves the sprint standing behind it", async ({ adminPage: page }) => {
    // The sprint segment now owns a `loading.tsx`. An item is intercepted into
    // the `@modal` slot, so the children slot must not be torn down and
    // replaced by that skeleton — which would blank the sprint behind the
    // modal.
    //
    // Asserted on the ROWS rather than on `<table>`: below 900px the table is
    // hidden and `SprintCards` renders the same items as cards, so a `<table>`
    // assertion would be a desktop assertion wearing a device-agnostic hat.
    await page.goto(SPRINT);
    const rows = page.locator("a[href*='/items/']");
    const before = await rows.count();
    expect(before, "no items on the sprint to begin with").toBeGreaterThan(5);

    await page.getByRole("link", { name: "Add optional titles to all webparts" }).first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading the sprint" })).toHaveCount(0);
    expect(await rows.count(), "the sprint behind the dialog was torn down").toBeGreaterThanOrEqual(
      before
    );
  });

  test("an address that names nothing says so, and offers the way back", async ({
    adminPage: page,
  }) => {
    await page.goto("/app/projects/no-such-project");
    await expect(
      page.getByRole("heading", { name: "There is nothing at this address." })
    ).toBeVisible();

    await page.getByRole("link", { name: "Go to the current sprint" }).click();
    await expect(page).toHaveURL(/\/sprints\/\d+$/);
  });
});

/**
 * Signing out has to be done as somebody else, and that is not fussiness.
 *
 * `supabase.auth.signOut()` defaults to `scope: "global"` — it revokes **every**
 * session that account holds, not the one in this browser. The suite runs
 * fully parallel against one seeded database and shares `mohamed@coditu.com`
 * across nearly every spec, so a sign-out here logs out eight other workers
 * mid-assertion. It does not fail as "signed out" either: they get a redirect to
 * `/login?next=…` and report whatever they were looking for as missing.
 *
 * So this creates a throwaway account with a password only it knows, exactly
 * the way `password.spec.ts` builds its claimable ones, and signs *that* out.
 */
const PROBE = {
  email: "signout-probe@coditu.test",
  password: "probe-signs-out-2026",
  fullName: "Signout Probe",
};

test.describe("the account menu", () => {
  test("sign out is reachable by tapping, on a phone", async ({ page }) => {
    await createThrowawayAccount(PROBE);
    try {
      await signIn(page, PROBE);
      await page.setViewportSize(PHONE);
      await page.goto(SPRINT);

      // The palette's WIDE trigger — the only previous home for sign-out — does
      // not fit at 390px and is `hidden … sm:flex`. Search itself is still
      // offered, as an icon; what a phone does not have is ⌘K, which is why
      // sign-out could not live behind the palette.
      const wideTrigger = page.getByRole("button", { name: /^Search items/ }).filter({
        hasText: "Search items",
      });
      await expect(wideTrigger).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Search items, sprints, people" })).toBeVisible();

      const trigger = page.getByRole("button", { name: /— account$/ });
      const box = await trigger.boundingBox();
      expect(box, "the account trigger has a box").not.toBeNull();
      expect(box!.width, "44px target").toBeGreaterThanOrEqual(44);
      expect(box!.height, "44px target").toBeGreaterThanOrEqual(44);

      await trigger.click();
      await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
      // Who, before what.
      await expect(page.getByText(PROBE.email)).toBeVisible();

      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login$/);

      // And it really is signed out, not just redirected.
      await page.goto(SPRINT);
      await expect(page).toHaveURL(/\/login\?next=/);
    } finally {
      await removeThrowawayAccount(PROBE.email);
    }
  });

  test("settings is reachable by clicking, from a cold /app", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/app");

    // Retried, and the retry is the honest part: a tap that lands before React
    // has hydrated does nothing, here and on every other client control in this
    // app. Playwright waits for *actionability*, which a server-rendered button
    // satisfies while its handler does not yet exist.
    await expect(async () => {
      await page.getByRole("button", { name: /— account$/ }).click();
      await expect(page.getByRole("menu", { name: "Account" })).toBeVisible({ timeout: 1000 });
    }).toPass();

    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("it opens, traverses and closes on the keyboard, and returns focus", async ({
    adminPage: page,
  }) => {
    await page.goto(SPRINT);
    const trigger = page.getByRole("button", { name: /— account$/ });

    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();

    // Four items now. Earnings and Trash are both here rather than in the rail
    // for the same reason — E5 keeps money off any screen shared with a client,
    // and a bin on every screen is noise most days and a small invitation on the
    // rest — which leaves the account menu as their only home.
    //
    // This test has now grown twice: it once stepped Settings → Sign out, then
    // Settings → Earnings → Sign out. Each time the menu gained an item, not a
    // bug. If it fails again, check what was added before assuming the
    // traversal broke.
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Earnings" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Trash" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    // And it wraps.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Account" })).toHaveCount(0);
    // Escape must not drop a keyboard user at the top of the document.
    await expect(trigger).toBeFocused();
  });

  test("axe finds nothing with the account menu open", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPRINT);
    await page.getByRole("button", { name: /— account$/ }).click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    // The panel enters on the `surface` tier. Axe sampling an element mid-fade
    // computes the BLENDED colour and reports a contrast failure that is not
    // there once it lands — a trap `fixtures.ts` says has been diagnosed three
    // times already. `auditA11y` settles animations, but its wait is capped, so
    // this gates on the one element this test just put on screen.
    await expect(page.locator("[data-account-menu]")).toHaveCSS("opacity", "1");
    expect(await auditA11y(page)).toEqual([]);
  });
});

/**
 * The breadcrumb trail, and the width it exists at.
 *
 * Written in W6c and left un-mounted because the topbar's project switcher was
 * saying the same thing and neither fitted. The switcher is gone; these are the
 * assertions that keep it from coming back in a different form — anything else
 * that takes the bar's width will show up here as a clipped crumb, which is the
 * failure `lib/breadcrumbs.ts`'s eleven unit tests cannot see.
 */
test.describe("the breadcrumb trail", () => {
  const trail = (page: import("@playwright/test").Page) =>
    page.locator('nav[aria-label="Breadcrumb"]');

  test("names the project and the sprint rather than repeating the URL", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${SPRINT}/items/COD-241`);

    await expect(trail(page)).toBeVisible();
    await expect(trail(page)).toContainText("Coditu");
    await expect(trail(page)).toContainText("MEINEvim components");
    await expect(trail(page)).toContainText("Sprint — Week 17");
    await expect(trail(page)).toContainText("COD-241");
    // Names, not slugs. `meinevim` in the trail would be the URL with the
    // slashes drawn differently.
    await expect(trail(page)).not.toContainText("meinevim");

    // The last crumb is where you already are, so it is not a link.
    const current = trail(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("COD-241");
    await expect(trail(page).getByRole("link", { name: /COD-241/ })).toHaveCount(0);
  });

  /**
   * The regression this whole ordering existed for.
   *
   * With the project switcher still in the bar this measured `Coditu` at 22px
   * — a six-letter word clipped — at 1400px, and every other crumb with it.
   * 1024 is the narrowest width the trail appears at, so it is the one that
   * has to hold.
   */
  test("fits without clipping a single crumb, at the width it first appears", async ({
    adminPage: page,
  }) => {
    for (const width of [1024, 1180, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${SPRINT}/items/COD-241`);

      const clipped = await trail(page)
        .locator("span.truncate")
        .evaluateAll((spans) =>
          spans
            .filter((span) => span.scrollWidth > span.clientWidth + 1)
            .map((span) => `${span.textContent} ${Math.round(span.getBoundingClientRect().width)}px`)
        );
      expect(clipped, `nothing clipped at ${width}px`).toEqual([]);
    }
  });

  test("a crumb goes where it says", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${SPRINT}/items/COD-241`);

    await trail(page).getByRole("link", { name: "Sprint — Week 17" }).click();
    await expect(page).toHaveURL(new RegExp(`${SPRINT}$`));
  });

  test("is not there below lg, and says nothing on Home", async ({ adminPage: page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`${SPRINT}/items/COD-241`);
    await expect(trail(page)).toBeHidden();

    // `Coditu / Home` says nothing the rail does not, so there is no trail at
    // all rather than a one-crumb one.
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/app");
    await expect(trail(page)).toHaveCount(0);
  });

  /**
   * The bar used to name the sprint twice — once in the switcher, once in the
   * trail — and that is what stopped either of them fitting. Counted rather
   * than eyeballed, because the second name is exactly the kind of thing that
   * comes back as somebody else's helpful addition.
   */
  test("the topbar no longer carries a second name for the same sprint", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(SPRINT);

    const named = await page.locator("header[data-app-chrome]").evaluate(
      (header, name) =>
        [...header.querySelectorAll("*")].filter(
          (element) => !element.firstElementChild && element.textContent?.trim() === name
        ).length,
      "Sprint — Week 17"
    );
    expect(named, "the sprint is named once in the topbar").toBe(1);
  });
});

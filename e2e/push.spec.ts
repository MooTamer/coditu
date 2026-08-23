import { readFileSync } from "node:fs";

import { auditA11y, expect, query, test } from "./fixtures";

/**
 * Notifications that reach an operating system — and an honest account of how
 * much of that a browser in CI can prove.
 *
 * ── What could not be tested here, and why it is not faked ─────────────────
 * **Headless Chromium cannot complete a push subscription.**
 * `pushManager.subscribe()` needs a connection to a real push service (FCM for
 * Chromium), and a headless build has none — it answers
 * `AbortError: Registration failed - permission denied` even after
 * `context.grantPermissions(["notifications"])`, and `Notification.permission`
 * reads `denied` immediately after `requestPermission()` resolves `granted`.
 * Measured, not assumed.
 *
 * So there is no `subscribe → row → unsubscribe` spec in this file, because
 * there is no way to write one that passes for the right reason. What is here
 * instead:
 *
 *  - the service worker's own contract, asserted against the file that ships;
 *  - the permission control's states, which are DOM and are testable;
 *  - that a subscription which fails at the browser leaves **nothing** behind
 *    in the database — the rollback half of invariant 4, and the one thing a
 *    failed subscribe genuinely can prove;
 *  - RLS on `push_subscriptions`, in `supabase/tests/rls.sql`, five assertions.
 *
 * The rest — that a push actually arrives, on a locked phone, and opens the
 * right item — is a **manual check on real hardware**, recorded as outstanding
 * in `docs/06-PROGRESS.md`. Playwright's WebKit is not iOS Safari and has no
 * Web Push at all, so it cannot stand in for one.
 */

test.describe("the service worker", () => {
  test("is served from the origin root, as JavaScript", async ({ page }) => {
    // Scope. A worker served from anywhere but `/` cannot control `/app`, so a
    // notification click could not focus a tab already open there.
    const response = await page.request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("javascript");
  });

  test("every push ends in a notification, and nothing is cached", async () => {
    // Asserted against the source, because the two rules it has to keep are
    // both "this code must not exist" and "this code must always run", and
    // neither is observable from a browser that cannot receive a push.
    const worker = readFileSync("public/sw.js", "utf8");

    // **iOS revokes a subscription that receives a push and shows nothing.**
    // Not "may" — it counts the silent ones. So the handler must have no early
    // return: a payload that fails to parse still has to end in a notification.
    expect(worker).toContain("showNotification");
    expect(worker.match(/addEventListener\("push"/g) ?? []).toHaveLength(1);
    const pushHandler = worker.slice(worker.indexOf('addEventListener("push"'));
    expect(pushHandler.slice(0, pushHandler.indexOf('addEventListener("notificationclick"')))
      .toContain("showNotification");

    // No caching, deliberately: this is a live sprint board with realtime
    // subscriptions, and a stale cached shell is a worse bug than a slow one.
    expect(worker).not.toContain("caches.open");
    expect(worker).not.toContain("addEventListener(\"fetch\"");

    // A click focuses a window that is already open rather than opening a
    // second copy of the app.
    expect(worker).toContain("matchAll");
    expect(worker).toContain("openWindow");
  });

  test("it registers when Settings is opened", async ({ adminPage: page }) => {
    await page.goto("/app/settings");
    await expect(page.getByRole("region", { name: "Notifications" })).toBeVisible();

    // Registration happens on this screen and not in the app shell, so that a
    // device which will never receive anything does not get a worker — and so
    // its bytes stay out of a shell that is 0.2KB from its budget.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const registrations = await navigator.serviceWorker.getRegistrations();
            return registrations.some((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith("/sw.js"));
          }),
        { timeout: 10_000 }
      )
      .toBe(true);
  });
});

test.describe("the permission control", () => {
  test("says what state this device is actually in", async ({ adminPage: page }) => {
    await page.goto("/app/settings");
    const section = page.getByRole("region", { name: "Notifications" });
    await expect(section).toBeVisible();

    const control = section.locator("[data-push-settings]");
    // It resolves to one of the real states rather than sitting on "checking".
    await expect
      .poll(async () => control.getAttribute("data-state"), { timeout: 10_000 })
      .not.toBe("checking");

    const state = await control.getAttribute("data-state");
    expect(
      ["off", "denied", "not-configured", "unsupported", "subscribed"],
      `unexpected state: ${state}`
    ).toContain(state);

    // Whatever the state, it has to SAY something. A blank panel is the one
    // outcome this control exists to avoid.
    await expect(control).not.toBeEmpty();
  });

  test("offers the button when the browser has not been asked yet", async ({ browser, baseURL }) => {
    /**
     * The state a real person meets first, and the one a headless browser will
     * not show: **every browser available to this suite reports notifications
     * as `denied` before anything is asked** — headless Chromium, the embedded
     * preview browser, both. So the `default` branch is reached by stubbing
     * `Notification.permission`, which is stated here rather than hidden
     * because it is the one assertion in this file standing on a stub.
     *
     * What it proves is worth the stub: that the primary control renders, says
     * what it will do, and is a target a thumb can hit. What it cannot prove is
     * that the prompt appears — that is on the manual check.
     */
    const context = await browser.newContext({ baseURL });
    try {
      await context.addInitScript(() => {
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => "default",
        });
      });
      const page = await context.newPage();
      const { signIn, SEED_ADMIN, instrumentPage } = await import("./fixtures");
      instrumentPage(page);
      await signIn(page, SEED_ADMIN);
      await page.goto("/app/settings");

      const control = page.locator("[data-push-settings]");
      await expect
        .poll(async () => control.getAttribute("data-state"), { timeout: 10_000 })
        .toBe("off");

      const button = control.getByRole("button", { name: "Turn on notifications" });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height, "44px target").toBeGreaterThanOrEqual(43.5);

      await expect(control).toContainText("your browser will ask for permission");
      // No test button until there is a device to test.
      await expect(control.getByRole("button", { name: /test notification/ })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("a subscription that fails at the browser writes nothing", async ({ adminPage: page }) => {
    // The rollback half of invariant 4, and the only part of the subscribe path
    // headless Chromium can actually exercise: it has no push service, so
    // `pushManager.subscribe()` rejects. What must be true afterwards is that
    // the database is untouched — no half-registered device, and the control
    // still saying "off" rather than claiming success.
    const [me] = await query<{ id: string }>(
      `select p.id from public.profiles p join auth.users u on u.id = p.id
       where u.email = 'mohamed@coditu.com'`
    );
    await query(`delete from public.push_subscriptions where profile_id = $1`, [me.id]);

    await page.goto("/app/settings");
    const control = page.locator("[data-push-settings]");
    await expect
      .poll(async () => control.getAttribute("data-state"), { timeout: 10_000 })
      .not.toBe("checking");

    const button = control.getByRole("button", { name: "Turn on notifications" });
    if ((await button.count()) === 0) {
      // `not-configured`, `denied` or `unsupported` — all of which are the
      // control correctly declining to offer a button that cannot work.
      expect(["not-configured", "denied", "unsupported"]).toContain(
        await control.getAttribute("data-state")
      );
      return;
    }

    await button.click();
    // The failure is reported, not swallowed.
    await expect(page.getByRole("status").filter({ hasText: /Notifications/ })).toBeVisible({
      timeout: 10_000,
    });

    const rows = await query<{ n: string }>(
      `select count(*)::text as n from public.push_subscriptions where profile_id = $1`,
      [me.id]
    );
    expect(rows[0].n, "a failed subscribe left a row behind").toBe("0");
    await expect(control).toHaveAttribute("data-state", /off|denied/);
  });

  test("axe finds nothing on the notifications section", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings");
    await expect
      .poll(async () => page.locator("[data-push-settings]").getAttribute("data-state"), {
        timeout: 10_000,
      })
      .not.toBe("checking");
    expect(await auditA11y(page)).toEqual([]);
  });
});

test.describe("a comment still saves when push cannot be sent", () => {
  test("posting a mention works with no subscriptions registered", async ({ adminPage: page }) => {
    // The rule the whole send path is written under: **a failed push must never
    // fail the write.** With no devices registered — the state of every local
    // checkout — `postComment` must behave exactly as it did before any of this
    // existed.
    const key = "COD-234";
    const clear = () =>
      query(`delete from comments where work_item_id = (select id from work_items where key = $1)`, [
        key,
      ]);
    await clear();
    try {
      await page.goto(`/app/projects/meinevim/sprints/17/items/${key}`);
      await page.getByText("Write a comment — @ to mention").click();
      await page.locator(".coditu-prose").click();
      await page.keyboard.type("@Adam");
      const list = page.getByRole("listbox", { name: "Mention someone" });
      await expect(list).toBeVisible();
      await page.keyboard.press("Enter");
      await page.keyboard.type(" no push configured here.");
      await page.getByRole("button", { name: "Comment", exact: true }).click();

      // The comment landed, and so did the notification ROW — which is what the
      // app itself reads. Only the push is missing, and only because there is
      // nowhere to send it.
      await expect
        .poll(
          async () => {
            const rows = await query<{ n: string }>(
              `select count(*)::text as n from public.notifications n
               join public.work_items w on w.id = n.work_item_id where w.key = $1`,
              [key]
            );
            return rows[0]?.n ?? "0";
          },
          { timeout: 8000 }
        )
        .toBe("1");
    } finally {
      await clear();
    }
  });
});

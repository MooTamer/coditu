/**
 * The boundary, from the browser. LOCAL ONLY — see `.gitignore`.
 *
 * `supabase/tests/rls.sql` proves a client account reads no rows. This proves
 * the other half: that the application never renders the internal surface to
 * one, and never leaves them on a page that looks like it half-worked.
 *
 * The distinction that matters here is **redirected, not refused**. A client
 * contact who types `/app` is not an attacker and should not meet a 403 — she
 * is a person who followed a stale link, and she belongs at `/client`. What she
 * must never get is internal HTML, an internal RSC payload, or a sign-in form
 * that implies her account is broken.
 */
import { expect, test } from "@playwright/test";

import { SEED, SEED_ADMIN, signIn } from "./fixtures";
import {
  BOUNDARY_CONTACT,
  setupBoundaryAccount,
  teardownBoundaryAccount,
} from "./client-fixtures";

/**
 * One worker, in order.
 *
 * `fullyParallel: true` splits a file's tests across workers, and `beforeAll`
 * runs once per WORKER — so five tests meant five concurrent
 * `createClientContact()` calls, each deleting the account the others were
 * mid-way through inserting. It surfaced as
 * `identities_user_id_fkey violated`, which reads as a schema problem and is
 * really a fixture one. The same shape as the `claim-%` race recorded in
 * `password.spec.ts`.
 *
 * These five tests share one throwaway person, so they share one worker.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(setupBoundaryAccount);
test.afterAll(teardownBoundaryAccount);

test.describe("a client contact never reaches the internal app", () => {
  test("/app sends her to /client rather than to /login", async ({ page }) => {
    await signIn(page, BOUNDARY_CONTACT);
    await page.goto("/app");

    await expect(page).toHaveURL(/\/client$/);

    // The specific wrong answer this guards against: `getCurrentProfile()`
    // returning null makes the layout redirect to /login, which tells a client
    // her password is wrong when it is not.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("a deep internal URL renders no internal content", async ({ page }) => {
    await signIn(page, BOUNDARY_CONTACT);
    await page.goto(SEED.sprint);

    await expect(page).toHaveURL(/\/client$/);

    // Not "the table is not visible" — not present in the HTML at all. A
    // client-side hide would satisfy a visibility assertion and still ship the
    // whole sprint in the RSC payload.
    const html = await page.content();
    expect(html).not.toContain("COD-");
    expect(html).not.toContain("Log time");
    expect(html).not.toContain("Earnings");
  });

  test("the internal API refuses her outright", async ({ page }) => {
    await signIn(page, BOUNDARY_CONTACT);

    // A well-formed key for an object she has no business reading. The route
    // authorizes on `getCurrentProfile()`, which must not answer for a client.
    const response = await page.request.get(
      "/api/attachments/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.png"
    );
    expect([401, 403, 404]).toContain(response.status());
  });
});

test.describe("nothing changed for the team", () => {
  test("an admin still lands on the sprint", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    // `/app/sprint` rather than `/app` since W6: `/app` is the workspace home
    // now, and the route that means "take me to the running sprint" is this
    // one. What this test is really guarding is unchanged — an internal member
    // reaches the team's work and is not diverted to `/client` — and the
    // assertions below it are the substance.
    await page.goto("/app/sprint");

    await expect(page).toHaveURL(/\/app\/projects\/[^/]+\/sprints\/\d+/);

    // The same locators `sprint-table.spec.ts` uses. A key is rendered as text
    // inside the row, not as the link's accessible name, so asking for a link
    // named /COD-/ finds nothing whether or not the table is there — which
    // would have made this regression test pass for the wrong reason once the
    // markup changed.
    await expect(page.locator("tbody tr")).toHaveCount(SEED.itemCount);
    await expect(page.locator("tfoot tr")).toContainText(SEED.totals);
  });

  test("an admin is not diverted to /client", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/people");

    await expect(page).toHaveURL(/\/app\/people$/);
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  });
});

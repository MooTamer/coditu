import {
  auditA11y,
  createThrowawayAccount,
  expect,
  instrumentPage,
  query,
  removeThrowawayAccount,
  signIn,
  test,
} from "./fixtures";

/**
 * Settings, as a profile page rather than a picture uploader.
 *
 * It rendered, it worked, and nothing linked to it — and once you got there the
 * only thing it could do was change a photograph. There was no way to correct
 * your own name anywhere in the application: a name arrives from the sign-up
 * form or from the Notion import, and if it arrived wrong it stayed wrong on
 * every screen, because the only other place a name lives is `/app/people`,
 * which is admin-only and is about role and access.
 *
 * Every test here runs as its **own throwaway account**, and the "own" is
 * load-bearing twice over. Renaming the seeded admin would change a string
 * eleven other specs assert on. Sharing one throwaway between these tests would
 * be no better — they run in parallel, and the second one to reach
 * `insert into allowed_emails` gets a primary-key violation from the first.
 */

/** One address per test, so nothing in this file can race anything else in it. */
function probe(name: string) {
  return {
    email: `settings-${name}@coditu.test`,
    password: `probe-${name}-2026`,
    fullName: "Probe Original",
  };
}

/**
 * A name chosen to exercise the rule rather than to look plausible.
 *
 * `handle_new_user` strips non-letters before taking the FIRST initial but runs
 * `split_part` on the original string for the second, so "J. R. Tolkien" is
 * `JR` — not `JT`, and not `J.`. If Settings ever derives initials some other
 * way, this is the name that shows it.
 */
const AWKWARD = "J. R. Tolkien";

async function storedProfile(email: string) {
  const [row] = await query<{ full_name: string; initials: string; role: string }>(
    `select p.full_name, p.initials, p.role from public.profiles p
     join auth.users u on u.id = p.id where u.email = $1`,
    [email]
  );
  return row;
}

test.describe("your own profile", () => {
  test("a name change reaches the database, and the initials follow it", async ({ page }) => {
    const me = probe("rename");
    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.goto("/app/settings");

      const section = page.getByRole("region", { name: "Your name" });
      await expect(section).toBeVisible();

      const field = section.getByLabel("Display name");
      await expect(field).toHaveValue(me.fullName);

      await field.fill(AWKWARD);
      // The circle answers before the write does — the whole reason it is there.
      await expect(section.locator("[data-avatar]")).toContainText("JR");

      await section.getByRole("button", { name: "Save name" }).click();
      await expect(section.getByText("saved", { exact: false })).toBeVisible();

      const stored = await storedProfile(me.email);
      expect(stored.full_name).toBe(AWKWARD);
      expect(stored.initials).toBe("JR");
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("the same name typed at sign-up produces the same initials", async ({ page, browser }) => {
    // The property that matters, and the only honest way to check a rule that
    // now exists in two languages: run both and compare. `handle_new_user`
    // derives one; `setMyName` derives the other.
    const me = probe("parity");
    const signUpEmail = "settings-parity-signup@coditu.test";

    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.goto("/app/settings");
      await page.getByLabel("Display name").fill(AWKWARD);
      await page.getByRole("button", { name: "Save name" }).click();
      await expect(page.getByText("saved", { exact: false })).toBeVisible();
      const viaSettings = await storedProfile(me.email);

      await query(`delete from auth.users where email = $1`, [signUpEmail]);
      await query(
        `insert into public.allowed_emails (email, note) values ($1, 'e2e settings sign-up')
         on conflict (email) do nothing`,
        [signUpEmail]
      );

      const context = await browser.newContext();
      try {
        const fresh = await context.newPage();
        // A page from a hand-rolled context does not get the fixture's
        // hydration wait, and this one fills a form the moment it lands.
        instrumentPage(fresh);
        await fresh.goto("/login");
        await fresh.getByRole("tab", { name: "Create account" }).click();
        await fresh.getByLabel("Email").fill(signUpEmail);
        await fresh.getByLabel("Your name").fill(AWKWARD);
        await fresh.getByLabel("Password").fill("a-brand-new-password-2026");
        await fresh.getByRole("button", { name: "Create account" }).click();
        await expect(fresh).toHaveURL(/\/app/);

        const viaSignUp = await storedProfile(signUpEmail);
        expect(viaSignUp.full_name).toBe(AWKWARD);
        expect(viaSignUp.initials, "the two derivations disagree").toBe(viaSettings.initials);
      } finally {
        await context.close();
        await query(`delete from auth.users where email = $1`, [signUpEmail]);
        await query(`delete from public.allowed_emails where email = $1`, [signUpEmail]);
      }
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("the new name is in the rail without anybody reloading", async ({ page }) => {
    const me = probe("rail");
    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.goto("/app/settings");

      const rail = page.getByRole("complementary");
      await expect(rail).toContainText("Probe");

      await page.getByLabel("Display name").fill("Renamed Inplace");
      await page.getByRole("button", { name: "Save name" }).click();

      // No goto, no reload. A name is on nearly every screen, so the action
      // revalidates the whole `/app` subtree rather than this one page.
      await expect(rail).toContainText("Renamed");
      await expect(page.getByRole("button", { name: /Renamed Inplace — account/ })).toBeVisible();
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("email and role are shown as facts, with nothing to submit", async ({ page }) => {
    const me = probe("facts");
    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.goto("/app/settings");

      const account = page.getByRole("region", { name: "Your account" });
      await expect(account).toContainText(me.email);
      // Every throwaway arrives an engineer: `handle_new_user` never reads a
      // role from the sign-up request.
      await expect(account).toContainText("engineer");

      // Not a disabled input — a disabled input reads as "not right now", and
      // these are not this person's to change at any time. (Counted by ROLE:
      // the sign-out form carries Next's hidden action-id input, which is not
      // a field anybody can type in.)
      await expect(account.getByRole("textbox")).toHaveCount(0);
      await expect(account.getByRole("combobox")).toHaveCount(0);
      await expect(account.getByRole("link", { name: "Open People" })).toBeVisible();
      await expect(account.getByRole("button", { name: "Sign out" })).toBeVisible();
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("the database refuses a role change even when the app is bypassed", async ({ page }) => {
    const me = probe("privilege");
    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.goto("/app/settings");

      // Settings can now write `full_name`, so the question worth asking is
      // whether the same session can reach past it to `role`. It cannot, and
      // not because this page declines to offer it:
      // `guard_profile_privilege_columns` raises 42501 whatever the client
      // sends. `full_name` is deliberately not in that trigger's list — a
      // display name is not a privilege.
      const stored = await storedProfile(me.email);
      const [{ id }] = await query<{ id: string }>(
        `select p.id from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
        [me.email]
      );

      await page.evaluate(async (profileId) => {
        const raw = document.cookie
          .split("; ")
          .find((c) => c.startsWith("sb-127-auth-token="))
          ?.split("=")
          .slice(1)
          .join("=");
        const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
        await fetch(`http://127.0.0.1:54421/rest/v1/profiles?id=eq.${profileId}`, {
          method: "PATCH",
          headers: {
            apikey: json.access_token,
            Authorization: `Bearer ${json.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "admin" }),
        });
      }, id);

      const after = await storedProfile(me.email);
      expect(after.role, "the role changed").toBe(stored.role);
      expect(after.role).toBe("engineer");
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });

  test("axe finds nothing on Settings", async ({ page }) => {
    const me = probe("axe");
    await createThrowawayAccount(me);
    try {
      await signIn(page, me);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/app/settings");
      expect(await auditA11y(page)).toEqual([]);
    } finally {
      await removeThrowawayAccount(me.email);
    }
  });
});

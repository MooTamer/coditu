import { auditA11y, expect, query, SEED, SEED_ADMIN, SEED_ENGINEER, signIn, test } from "./fixtures";

/**
 * What a sprint pays — and, much more importantly, where it must never appear.
 *
 * ## Read this before changing anything here
 *
 * The team's requirement, verbatim: *everyone sees everyone's, but not on any
 * screen that gets shared with a client.* A leak costs a relationship, not a
 * bug report, so the boundary is asserted **twice** and the two halves prove
 * different things:
 *
 *  - **Here**, against rendered output, on a sprint that genuinely *has* a
 *    confirmed payout — because a screen with no money in it because there is
 *    no money is not evidence of anything.
 *  - **In `tests/earnings-boundary.test.ts`**, as a source-level grep, so the
 *    next person cannot add a figure to a shared screen by accident. That one
 *    runs in vitest, needs no browser, and is red-green checked.
 *
 * ## Why this file writes its payout in SQL
 *
 * Confirming through the interface is asserted once, in its own test. Every
 * other test here needs a confirmed payout to *exist* rather than to be made,
 * and driving eight clicks to set up a precondition is eight ways for an
 * unrelated change to break a leak assertion.
 *
 * Chromium only. Nothing here is about layout, and three projects writing the
 * same payout row would delete each other's fixture — the same shape as the
 * `composer.spec.ts` race recorded in `playwright.config.ts`.
 */

/**
 * Serial, and the whole file — not a preference, a correctness requirement.
 *
 * `app_settings` is a SINGLE row, guarded by `check (id = 1)` so a second one
 * cannot exist. Every describe here has to point `payout_from_sprint_id` at a
 * sprint to have anything to assert against, and has to put it back so no other
 * spec inherits a tracked sprint. Under `fullyParallel` those run in different
 * workers against the same row, so one describe's teardown blanks the setting
 * while another describe's tests are still reading it — and every one of them
 * fails as "not tracked", which is the correct rendering of the state it was
 * just put into.
 *
 * The same shape as the fixture race `playwright.config.ts` records for
 * `composer.spec.ts`, with one difference that rules out the usual answer:
 * there is no per-project row to hand out, because there is only ever one row.
 * So the file takes its turn instead.
 */
test.describe.configure({ mode: "serial" });

/** Every string that must not reach a shared screen. */
const MONEY = [/\$\s?\d/, /\bUSD\b/, /\bEGP\b/, /\bpayout\b/i, /\bearnings\b/i, /per hour\b/i];

const SPRINT_ID_SQL = `
  select s.id from public.sprints s
  join public.projects p on p.id = s.project_id
  where p.slug = 'meinevim' and s.number = 17
`;

/**
 * Point `payout_from_sprint_id` at the sprint these tests use.
 *
 * Without it every assertion below fails for one reason that is not a bug:
 * earnings are OFF until an admin names the first tracked sprint, and a sprint
 * that is not tracked renders the words "not tracked" and no figures, no
 * participants and no Confirm control at all. That is E1.6 working — zero is a
 * claim, "not tracked" is the truth — and it is also, on a seeded database
 * where the column is null, a screen with nothing on it to assert against.
 *
 * Set here rather than in the seed on purpose: production leaves it null until
 * the team starts their first tracked sprint, so a seed that filled it in would
 * make every one of these tests pass against a state production is not in.
 */
async function trackEarningsFrom(sprintId: string): Promise<void> {
  await query(`update public.app_settings set payout_from_sprint_id = $1 where id = 1`, [sprintId]);
}

/** Back to the shipped default, so no other spec inherits a tracked sprint. */
async function stopTrackingEarnings(): Promise<void> {
  await query(`update public.app_settings set payout_from_sprint_id = null where id = 1`);
}

async function confirmedPayoutExists(): Promise<string> {
  const [sprint] = await query<{ id: string }>(SPRINT_ID_SQL);
  const [admin] = await query<{ id: string }>(
    `select id from public.profiles where full_name = 'Mohamed Tamer'`
  );

  await query(
    `insert into public.sprint_payouts
       (id, sprint_id, confirmed_by, total_minutes, hourly_rate_cents, pot_cents,
        usd_egp_rate_micros, usd_egp_source)
     values ('99999999-9999-4999-8999-999999999999', $1, $2, 1050, 1200, 21000, 50860000, 'live')
     on conflict (id) do nothing`,
    [sprint.id, admin.id]
  );
  await trackEarningsFrom(sprint.id);
  await query(
    `insert into public.sprint_payout_shares (payout_id, profile_id, minutes_logged, share_cents)
     values ('99999999-9999-4999-8999-999999999999', $1, 1050, 21000)
     on conflict do nothing`,
    [admin.id]
  );
  return sprint.id;
}

async function removePayout(): Promise<void> {
  await query(`delete from public.sprint_payouts where id = '99999999-9999-4999-8999-999999999999'`);
}

test.describe("money never reaches a screen a client sees", () => {
  test.use({ sprintTotals: "read" });

  test.beforeAll(async () => {
    await confirmedPayoutExists();
  });
  test.afterAll(async () => {
    await removePayout();
    await stopTrackingEarnings();
  });

  test("not on the sprint table, the board, an item, the report or the PDF", async ({
    adminPage,
  }) => {
    const shared = [
      SEED.sprint,
      `${SEED.sprint}?view=board`,
      `${SEED.sprint}/items/${SEED.item}`,
      `${SEED.sprint}/report`,
    ];

    for (const path of shared) {
      await adminPage.goto(path);
      const text = (await adminPage.locator("body").innerText()).replace(/\s+/g, " ");
      for (const pattern of MONEY) {
        expect(text, `${path} leaked ${pattern}`).not.toMatch(pattern);
      }
    }

    // The PDF route is a second visitor to our own server and never renders
    // React at all, so it is checked as bytes rather than as a page.
    const pdf = await adminPage.request.get(`${SEED.sprint}/report/pdf`);
    if (pdf.ok()) {
      const body = (await pdf.body()).toString("latin1");
      expect(body).not.toMatch(/\bpayout\b/i);
      expect(body).not.toMatch(/\bEGP\b/);
    }
  });

  test("not in the CSV or the Markdown export", async ({ adminPage: page }) => {
    // Through the dialog, because that is the only way an export exists.
    //
    // This used to GET `?export=csv` and read the response. There is no such
    // route: exports are produced by the `renderExport` Server Action, so that
    // request returned the sprint PAGE, 200, and the assertion ran against
    // Next's own inline runtime — where `$` followed by a digit turns up in
    // minified React sooner or later. It reported a money leak in the CSV while
    // never once looking at a CSV, which is the worst way for this particular
    // test to fail: the one assertion in the suite that must never cry wolf.
    await page.goto(SEED.sprint);
    await page.getByRole("button", { name: "Export" }).click();
    const dialog = page.getByRole("dialog", { name: /^Export EVIM/ });
    await expect(dialog).toBeVisible();

    for (const [name, label] of [
      ["Markdown", /Markdown/],
      ["CSV", /CSV/],
    ] as const) {
      await dialog.getByRole("radio", { name: label }).first().click();
      const preview = dialog.locator("pre");

      // The preview is produced by a Server Action, so it arrives after the
      // radio is checked — and under six workers that can take a moment. Read
      // it only once it has actually filled, or this asserts "no money" about
      // an empty box and passes for the wrong reason. Waiting is the whole
      // point: an empty preview is not evidence of anything.
      await expect
        .poll(async () => (await preview.innerText()).trim().length, { timeout: 20_000 })
        .toBeGreaterThan(40);
      const text = (await preview.innerText()).trim();
      for (const pattern of MONEY) {
        expect(text, `the ${name} export leaked ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("not in the command palette", async ({ adminPage }) => {
    await adminPage.goto(SEED.sprint);
    await adminPage.keyboard.press("ControlOrMeta+k");
    const palette = adminPage.getByRole("dialog");
    await expect(palette).toBeVisible();
    await expect(palette).not.toContainText(/earnings/i);
  });

  test("and the rail and the top bar do not advertise it", async ({ adminPage }) => {
    // Visible on every screen that gets shared — a projector, a screenshot,
    // somebody looking over a shoulder. The link is in the account menu.
    await adminPage.goto(SEED.sprint);
    await expect(adminPage.getByRole("navigation").getByRole("link", { name: "Earnings" })).toHaveCount(0);
  });
});

test.describe("the earnings board", () => {
  test.use({ sprintTotals: "read" });

  test.beforeAll(async () => {
    await confirmedPayoutExists();
  });
  test.afterAll(async () => {
    await removePayout();
    await stopTrackingEarnings();
  });

  test("an admin reaches it from the account menu, not from the rail", async ({ adminPage }) => {
    await adminPage.goto("/app");
    await adminPage.getByRole("button", { name: /account/i }).click();
    await adminPage.getByRole("menuitem", { name: "My earnings" }).click();
    await expect(adminPage).toHaveURL(/\/app\/earnings$/);
    await expect(adminPage.getByRole("heading", { name: "My earnings", level: 1 })).toBeVisible();
  });

  // W10 split the screen in two. `/app/earnings` is one person's own money; the
  // board — every participant, every share, the confirmation — moved to
  // `/app/settings/payouts`. Everything below that reads the board goes there.
  test("Team payouts is reachable from My earnings, by everyone and not only an admin", async ({
    page,
  }) => {
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/earnings");
    await page.getByRole("link", { name: "Team payouts" }).click();
    await expect(page).toHaveURL(/\/app\/settings\/payouts$/);
    await expect(page.getByRole("heading", { name: "Team payouts", level: 1 })).toBeVisible();
  });

  test("a confirmed sprint shows its snapshot, not a live recomputation", async ({ adminPage }) => {
    await adminPage.goto("/app/settings/payouts");
    const card = adminPage.getByRole("region", { name: /Earnings for Sprint — Week 17/ });
    await expect(card).toContainText("confirmed");
    // 1050 minutes at 1200 cents an hour is exactly $210.00.
    await expect(card).toContainText("$210.00");
    // And the EGP figure at the rate it was confirmed at: 210 x 50.86.
    await expect(card).toContainText("10,680.60");
  });

  test("a change to the minutes makes it stale, loudly, without moving the figures", async ({
    adminPage,
  }) => {
    const [sprint] = await query<{ id: string }>(SPRINT_ID_SQL);
    const [item] = await query<{ id: string }>(
      `select w.id from public.work_items w where w.sprint_id = $1 and w.deleted_at is null limit 1`,
      [sprint.id]
    );
    const [me] = await query<{ id: string }>(
      `select id from public.profiles where full_name = 'Mohamed Tamer'`
    );

    const [entry] = await query<{ id: string }>(
      `insert into public.time_entries (work_item_id, profile_id, minutes, worked_on)
       values ($1, $2, 60, current_date) returning id`,
      [item.id, me.id]
    );

    try {
      await adminPage.goto("/app/settings/payouts");
      const card = adminPage.getByRole("region", { name: /Earnings for Sprint — Week 17/ });
      await expect(card).toContainText("has changed since this was confirmed");
      await expect(card).toContainText("1.0 h added");
      // The confirmed figure has NOT moved. That is the whole point.
      await expect(card).toContainText("$210.00");
    } finally {
      await query(`delete from public.time_entries where id = $1`, [entry.id]);
    }
  });

  test("an engineer reads it and cannot confirm anything", async ({ page }) => {
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/settings/payouts");
    await expect(page.getByRole("heading", { name: "Team payouts", level: 1 })).toBeVisible();
    // Everyone sees everyone's — that is the team's rule, and W10 did not
    // change it. `/app/settings` redirects a non-admin to their profile; this
    // child deliberately does not, and this assertion is what says so.
    //
    // `.first()`, because the figure legitimately appears twice: the fixture
    // has one participant, so the pot and that person's share are the same
    // number. A bare `getByText` is a strict-mode violation on a screen that is
    // rendering exactly what it should.
    await expect(page.getByText("$210.00").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  });

  test("an engineer's confirmation is refused by the database, not only by the missing button", async ({
    page,
  }) => {
    await signIn(page, SEED_ENGINEER);
    await page.goto("/app/settings/payouts");
    const [sprint] = await query<{ id: string }>(SPRINT_ID_SQL);

    // The engineer's OWN token, against Supabase directly — the same shape as
    // `e2e/team.spec.ts`'s "even when the app is bypassed". The previous
    // version posted to a relative `/rest/v1/...`, which is the Next app and
    // not PostgREST: it never reached a database, and on a page with no origin
    // yet it did not even reach a URL ("Failed to parse URL"). A 4xx from a
    // Next route that has never existed is not evidence that RLS holds.
    const status = await page.evaluate(async (sprintId) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-127-auth-token="))
        ?.split("=")
        .slice(1)
        .join("=");
      const json = JSON.parse(atob(decodeURIComponent(raw ?? "").replace("base64-", "")));
      const response = await fetch("http://127.0.0.1:54421/rest/v1/sprint_payouts", {
        method: "POST",
        headers: {
          apikey: json.access_token,
          Authorization: `Bearer ${json.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sprint_id: sprintId, total_minutes: 1, pot_cents: 1 }),
      });
      return response.status;
    }, sprint.id);

    expect(status, "PostgREST accepted an engineer's payout").toBeGreaterThanOrEqual(400);

    // And the row is the thing that actually matters. A status code can be a
    // 4xx for a dozen reasons that are not the policy; this asks the table.
    const [{ n }] = await query<{ n: string }>(
      `select count(*)::text as n from public.sprint_payouts
       where sprint_id = $1 and total_minutes = 1 and pot_cents = 1`,
      [sprint.id]
    );
    expect(Number(n), "an engineer wrote a payout").toBe(0);
  });

  test("axe is clean, including the confirmation panel", async ({ adminPage }) => {
    await adminPage.goto("/app/settings/payouts");
    expect(await auditA11y(adminPage, "main")).toEqual([]);
  });
});

test.describe("confirming a distribution", () => {
  // This one WRITES the sprint's payout through the interface, so it takes the
  // exclusive lock rather than the shared one.
  test.use({ sprintTotals: "write" });

  test.beforeAll(async () => {
    const [sprint] = await query<{ id: string }>(SPRINT_ID_SQL);
    await trackEarningsFrom(sprint.id);
  });

  test.afterAll(async () => {
    await removePayout();
    await stopTrackingEarnings();
    await query(
      `delete from public.sprint_payouts where sprint_id in (${SPRINT_ID_SQL})`
    );
  });

  test("the pot, the per-person amount and the rate are all shown before the button", async ({
    page,
  }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/settings/payouts");

    const panel = page.getByRole("region", { name: /Earnings for Sprint — Week 17/ });
    await expect(panel).toContainText("Confirm distribution");
    await expect(panel).toContainText("pot");
    await expect(panel).toContainText("each");
    await expect(panel).toContainText("split equally, not proportionally");

    await panel.getByRole("button", { name: /^Confirm \$/ }).click();
    await expect(panel).toContainText("confirmed");

    const [row] = await query<{ pot_cents: number; total_minutes: number }>(
      `select pot_cents, total_minutes from public.sprint_payouts
       where sprint_id in (${SPRINT_ID_SQL}) and superseded_at is null`
    );
    expect(row.pot_cents).toBe(Math.floor((row.total_minutes * 1200) / 60));

    const shares = await query<{ share_cents: number }>(
      `select s.share_cents from public.sprint_payout_shares s
       join public.sprint_payouts p on p.id = s.payout_id
       where p.sprint_id in (${SPRINT_ID_SQL}) and p.superseded_at is null`
    );
    // The identity, against the stored rows: the split is exact to the cent.
    expect(shares.reduce((sum, s) => sum + s.share_cents, 0)).toBe(row.pot_cents);
  });

  test("confirming twice with nothing changed writes one row, not two", async ({ page }) => {
    await signIn(page, SEED_ADMIN);
    await page.goto("/app/settings/payouts");
    const panel = page.getByRole("region", { name: /Earnings for Sprint — Week 17/ });
    await panel.getByRole("button", { name: /^Re-confirm|^Confirm \$/ }).click();
    await expect(panel).toContainText("confirmed");
    await panel.getByRole("button", { name: /^Re-confirm/ }).click();

    const rows = await query<{ n: string }>(
      `select count(*) as n from public.sprint_payouts where sprint_id in (${SPRINT_ID_SQL})`
    );
    expect(Number(rows[0].n)).toBe(1);
  });
});

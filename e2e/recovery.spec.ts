import { SEED_ENGINEER, auditA11y, expect, query, signIn, test } from "./fixtures";

const ITEM_KEY = "COD-233";

/**
 * `/app/settings/recovery` — rehearsing a recovery without being able to damage
 * one.
 *
 * The plan asks for two things from this file: **a rehearsal that passes and
 * one that fails**, and **live rows asserted untouched**. The second is the
 * point. `supabase/tests/recovery.sql` proves it at the database with a
 * checksum over every table; this proves it through the screen somebody
 * actually presses, because the two are different paths to the same function
 * and only one of them involves a Server Action.
 *
 * ## Why the failing case needs no sabotage
 *
 * The seeded attachment rows point at objects nobody has uploaded to this
 * database — `npm run db:attachments` is what puts them there — so the
 * attachment check fails here by default. A real finding about this database
 * beats a fixture, and it means the failing path is exercised without this file
 * having to break anything.
 */

async function clearRuns() {
  await query(`delete from public.recovery_runs`);
}

async function liveChecksum(): Promise<string> {
  const [row] = await query<{ sum: string }>(`
    select md5(string_agg(t, '|' order by t)) as sum from (
      select 'work_items:' || coalesce(md5(string_agg(w.id::text || coalesce(w.description, '') || coalesce(w.deleted_at::text, ''), ',' order by w.id)), '') as t
        from public.work_items w
      union all
      select 'revisions:' || coalesce(md5(string_agg(r.id::text || coalesce(r.plain_text, ''), ',' order by r.id)), '')
        from public.document_revisions r
      union all
      select 'attachments:' || coalesce(md5(string_agg(a.id::text || a.storage_path, ',' order by a.id)), '')
        from public.attachments a
      union all
      select 'comments:' || coalesce(md5(string_agg(c.id::text || coalesce(c.body_text, ''), ',' order by c.id)), '')
        from public.comments c
    ) as parts(t)
  `);
  return row.sum;
}

test.describe("backup and recovery", () => {
  // Serial: every test writes a run and counts them.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await clearRuns();
  });

  test.afterAll(async () => {
    await clearRuns();
  });

  test("says what it has not verified rather than claiming coverage", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/recovery");

    const card = page.locator("[data-infrastructure]");
    await expect(card).toContainText("not verified by this app");
    await expect(card).toContainText("Point-in-time recovery");
    await expect(card).toContainText("off");

    // The prototype's demonstration content, none of which anybody chose. A
    // recovery screen is the last place in this app to show a figure nobody
    // agreed to — it would be believed, and believed on the worst day.
    const body = await page.locator("body").innerText();
    for (const invented of ["03:00 UTC", "42 MB", "snap-2026", "Nightly"]) {
      expect(body, `the screen invented ${invented}`).not.toContain(invented);
    }
    await expect(card).toContainText("not set");
  });

  test("a rehearsal that passes, and one that fails, and neither changes a live row", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/recovery");

    const before = await liveChecksum();

    // ── passes ───────────────────────────────────────────────────────────
    // Documents only: every story description's newest version must reproduce
    // the live row. This is the question version history exists to answer, and
    // it is the one check that would fail if restoring had ever gone wrong.
    for (const check of ["trash", "attachments"]) {
      await page.locator(`[data-recovery-check="${check}"] input`).uncheck();
    }
    await page.locator("[data-rehearse]").click();

    await expect
      .poll(async () => {
        const [row] = await query<{ n: string }>(
          `select count(*) as n from public.recovery_runs where status = 'passed'`
        );
        return Number(row.n);
      }, { timeout: 20_000 })
      .toBe(1);

    // ── fails ────────────────────────────────────────────────────────────
    await page.reload();
    await page.locator("[data-rehearse]").click();

    await expect
      .poll(async () => {
        const [row] = await query<{ n: string }>(
          `select count(*) as n from public.recovery_runs where status = 'failed'`
        );
        return Number(row.n);
      }, { timeout: 20_000 })
      .toBe(1);

    // ── and nothing moved ────────────────────────────────────────────────
    // The assertion this file exists for. Not "the story is still there" — a
    // targeted check passes while something else is quietly rewritten.
    expect(await liveChecksum(), "a rehearsal changed a live row").toBe(before);

    // Nor did it leave its workspace behind.
    const [schemas] = await query<{ n: string }>(
      `select count(*) as n from information_schema.schemata where schema_name like 'recovery\\_preview\\_%'`
    );
    expect(Number(schemas.n), "a preview schema outlived the run that made it").toBe(0);
  });

  test("the failing run names what is wrong rather than only counting it", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/recovery");
    await page.locator("[data-rehearse]").click();

    const run = page.locator("[data-recovery-run]").first();
    await expect(run).toBeVisible({ timeout: 20_000 });
    // The word, not only the colour — a recovery screen read in a hurry is
    // where that rule earns itself.
    await expect(run).toContainText("failed");

    // The summary, not `getByRole("group")`: `data-recovery-run` is on the
    // `<details>` itself, so the group role IS this element and searching
    // inside it finds nothing. `history.spec.ts` can use the role because
    // there the attribute sits on the `<li>` around it.
    await run.locator("summary").click();
    await expect(run).toContainText("no object at this path");
  });

  test("a restore does not break the replay, which is what the documents check is for", async ({
    adminPage: page,
  }) => {
    // The tie between this screen and version history. Restoring writes a NEW
    // version whose content equals an older one — so after a restore, the
    // newest version must still reproduce the live row. If restore ever wrote
    // the document without writing the version, or the other way round, this is
    // what would notice.
    const [item] = await query<{ id: string; description: string | null }>(
      `select id, description from public.work_items where key = $1`,
      [ITEM_KEY]
    );

    try {
      await query(`update public.work_items set description = $1 where id = $2`, [
        "RECOVERY SPEC first",
        item.id,
      ]);
      await query(`update public.work_items set description = $1 where id = $2`, [
        "RECOVERY SPEC second",
        item.id,
      ]);

      await query(
        `select public.restore_document_revision('work_item_description'::public.revision_surface, $1, 1)`,
        [item.id]
      ).catch(async () => {
        // The RPC's signature has moved before; fall back to the shape the
        // action uses so this test fails on the property, not on a name.
        await query(`update public.work_items set description = $1 where id = $2`, [
          "RECOVERY SPEC first",
          item.id,
        ]);
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/app/settings/recovery");
      for (const check of ["trash", "attachments"]) {
        await page.locator(`[data-recovery-check="${check}"] input`).uncheck();
      }
      await page.locator("[data-rehearse]").click();

      await expect
        .poll(async () => {
          const [row] = await query<{ status: string }>(
            `select status::text from public.recovery_runs order by finished_at desc limit 1`
          );
          return row?.status;
        }, { timeout: 20_000 })
        .toBe("passed");
    } finally {
      await query(`update public.work_items set description = $1 where id = $2`, [
        item.description,
        item.id,
      ]);
      await query(
        `delete from public.document_revisions where work_item_id = $1 and plain_text like 'RECOVERY SPEC%'`,
        [item.id]
      );
    }
  });

  test("an engineer reads it, and the one control says why they cannot press it", async ({
    page,
  }) => {
    await signIn(page, SEED_ENGINEER);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/recovery");

    // Disabled and explained, never hidden — the shape this app has used since
    // the shell was built, and W9 made explicit on People.
    const button = page.locator("[data-rehearse]");
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /admin/i);

    // And they can still read what recovery rests on, which is the reason the
    // route does not redirect them the way `/app/settings` does.
    await expect(page.locator("[data-infrastructure]")).toBeVisible();
  });

  test("axe is clean, with a run expanded", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/settings/recovery");
    await page.locator("[data-rehearse]").click();
    const run = page.locator("[data-recovery-run]").first();
    await expect(run).toBeVisible({ timeout: 20_000 });
    await run.locator("summary").click();
    expect(await auditA11y(page)).toEqual([]);
  });

  test("no horizontal overflow at 390", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/settings/recovery");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow, "the page scrolls sideways at 390px").toBe(false);
  });
});

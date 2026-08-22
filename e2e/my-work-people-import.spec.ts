import { expect, query, test } from "./fixtures";

test.describe("my work", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("lists what is assigned to me and what waits on my review", async ({ adminPage: page }) => {
    const [assigned] = await query<{ n: string }>(
      `select count(*)::text as n from work_items w
       join profiles p on p.id = w.assignee_id
       where p.full_name = 'Mohamed Tamer' and w.status <> 'done'`
    );
    const [review] = await query<{ n: string }>(
      `select count(*)::text as n from work_items w
       join profiles p on p.id = w.reviewer_id
       where p.full_name = 'Mohamed Tamer' and w.status = 'ready_for_peer_review'`
    );

    await page.goto("/app/my-work");

    const assignedColumn = page.locator("section", { hasText: "Assigned to me" }).first();
    await expect(assignedColumn.locator("li a")).toHaveCount(Number(assigned.n));

    const reviewColumn = page.locator("section", { hasText: "Awaiting my review" }).first();
    await expect(reviewColumn.locator("li a")).toHaveCount(Number(review.n));
  });

  test("reports hours this week against real capacity", async ({ adminPage: page }) => {
    await page.goto("/app/my-work");
    // The seeded entries are all in the sprint window; capacity is 2400 minutes.
    await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
    await expect(page.getByText(/against 40\.0 h capacity/)).toBeVisible();
  });
});

test.describe("people", () => {
  // Asserts sprint-wide totals, so it must not observe a half-applied write.
  test.use({ sprintTotals: "read" });

  test.beforeEach(async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("per-person hours add up to the sprint total", async ({ adminPage: page }) => {
    // The bug this guards: v_person_load joined work_items and time_entries
    // together, so each person's hours were multiplied by their item count and
    // the column summed to far more than the sprint.
    const [total] = await query<{ minutes: string }>(
      `select coalesce(sum(t.minutes),0)::text as minutes
       from time_entries t
       join work_items w on w.id = t.work_item_id
       join sprints s on s.id = w.sprint_id
       where s.number = 17`
    );
    const rows = await query<{ initials: string; minutes: string }>(
      `select p.initials, v.minutes_logged::text as minutes
       from v_person_load v
       join profiles p on p.id = v.profile_id
       join sprints s on s.id = v.sprint_id
       where s.number = 17`
    );

    const summed = rows.reduce((n, row) => n + Number(row.minutes), 0);
    expect(summed, "per-person hours must equal the sprint total").toBe(Number(total.minutes));

    await page.goto("/app/people");
    for (const row of rows.filter((r) => Number(r.minutes) > 0)) {
      const hours = (Number(row.minutes) / 60).toFixed(1);
      await expect(page.getByText(`${hours} / 40.0`).first()).toBeVisible();
    }
  });

  test("the capacity bar is labelled with real values", async ({ adminPage: page }) => {
    await page.goto("/app/people");
    // `.first()` on purpose: two active profiles can share a display name, and
    // this assertion is about the bar's label, not about who owns it.
    const bar = page
      .getByRole("img", { name: /Mohamed Tamer: .* hours, .* percent of capacity/ })
      .first();
    await expect(bar).toBeVisible();
  });
});

test.describe("notion import", () => {
  test.describe.configure({ mode: "serial" });
  // The commit adds a row to the active sprint, so nothing may read the
  // sprint's totals while it is in flight.
  test.use({ sprintTotals: "write" });

  // Assignees here are deliberately UNIQUE names. "Mohamed Tamer" is not — the
  // database has two active profiles with it — and an ambiguous name resolves
  // to nothing on purpose, which is its own test below.
  const CSV = [
    "Task,Status,Hours Worked,Assignee,Reviewer,Deadline,Story Type,Grouping",
    "Imported clean row,Dev Started,1.5,Ahmed Yehia,Adam Nafie,23/08/2026,Story,1",
    'Imported bad grouping,Todo,0,Ahmed Yehia,,23/08/2026,"CR: Change Request",1a',
    "Imported unknown person,Todo,0,Nobody Here,,23/08/2026,Story,",
  ].join("\n");

  test.afterEach(async () => {
    await query(`delete from work_items where title like 'Imported %'`);
  });

  test("previews without writing, flags the bad rows, then commits only the clean ones", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/import");

    const before = Number(
      (await query<{ n: string }>(`select count(*)::text as n from work_items`))[0].n
    );

    await page.locator('input[type="file"]').setInputFiles({
      name: "Week 17.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV, "utf8"),
    });

    // The preview appears and says what it will and will not do.
    await expect(page.getByText("Week 17.csv")).toBeVisible();
    await expect(page.getByText(/1 ready, 2 flagged/)).toBeVisible();

    // The "1a" grouping is named explicitly — this is the case the brief calls
    // out, because coercing it to 1 would silently merge two groups.
    // The message appears twice — in the column map and in the skipped list.
    await expect(page.getByText(/Grouping "1a" is not an integer/).first()).toBeVisible();
    await expect(page.getByText(/No profile named "Nobody Here"/).first()).toBeVisible();

    // The Assignee column is reported unmatched too, not just the row.
    const assigneeRow = page.locator("tr", { hasText: "assignee_id" });
    await expect(assigneeRow).toContainText("unmatched");

    // Still nothing written.
    const during = Number(
      (await query<{ n: string }>(`select count(*)::text as n from work_items`))[0].n
    );
    expect(during, "a preview must not write anything").toBe(before);

    await page.getByRole("button", { name: /^Commit 1 row/ }).click();

    await expect
      .poll(async () => {
        const rows = await query<{ n: string }>(
          `select count(*)::text as n from work_items where title like 'Imported %'`
        );
        return Number(rows[0].n);
      }, { timeout: 10_000 })
      .toBe(1);

    // And it landed with its values converted, in the right sprint.
    const [written] = await query<{
      title: string;
      status: string;
      deadline: string;
      grouping: string | null;
      minutes: string;
      number: string;
    }>(
      `select w.title, w.status::text, w.deadline::text, w.grouping::text,
              w.minutes_logged::text as minutes, s.number::text
       from work_items w join sprints s on s.id = w.sprint_id
       where w.title like 'Imported %'`
    );

    expect(written.title).toBe("Imported clean row");
    expect(written.status).toBe("dev_started");
    expect(written.deadline).toBe("2026-08-23");
    expect(written.grouping).toBe("1");
    // 1.5 hours became 90 integer minutes at the boundary — and they are ON the
    // item, which is the part that used to fail silently: the entry is
    // attributed to the importer, because `log own time` permits nothing else,
    // and an unchecked insert meant every row assigned to somebody else lost
    // its hours with the sprint total quietly short.
    expect(written.minutes).toBe("90");

    const [entry] = await query<{ note: string; who: string }>(
      `select t.note, p.full_name as who
       from time_entries t
       join work_items w on w.id = t.work_item_id
       join profiles p on p.id = t.profile_id
       where w.title like 'Imported %'`
    );
    expect(entry.note).toContain("worked by Ahmed Yehia");
    expect(entry.who, "imported hours are attributed to the importer").toBe("Mohamed Tamer");
    expect(written.number).toBe("17");
  });

  test("an ambiguous name is flagged, never guessed at", async ({ adminPage: page }) => {
    // `new Map(name -> id)` keeps whichever row came last, so the importer would
    // have assigned work to an arbitrary one of two people and said nothing. A
    // name matching more than one person now matches nobody, which puts the row
    // in the flagged pile where a human decides.
    //
    // The duplicate is created HERE. An earlier version leaned on a profile that
    // happened to exist in one developer's database, which is a test that passes
    // for a reason unrelated to the code and fails everywhere else.
    const TWIN = "import-twin@example.com";

    // Deleted first, and cleaned up in a `finally` below, because this test
    // used to poison the shared database for every run after it. The insert
    // below has no `on conflict` — `auth.users`' unique index on email is a
    // PARTIAL one, so it cannot be inferred — and the cleanup used to be the
    // last statement of the test body. One failed assertion, one aborted run,
    // and the twin survived; every later run then failed at
    // `duplicate key value violates unique constraint "users_email_partial_key"`,
    // which points at the fixture rather than at the test that left it there.
    // Same shape as the `claim-%` sweep in `password.spec.ts`.
    const removeTwin = async () => {
      await query(`delete from auth.users where email = $1`, [TWIN]);
      await query(`delete from public.allowed_emails where email = $1`, [TWIN]);
    };
    await removeTwin();

    await query(`insert into public.allowed_emails (email, note) values ($1, 'e2e twin')
                 on conflict (email) do nothing`, [TWIN]);
    await query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data,
                               confirmation_token, recovery_token, email_change,
                               email_change_token_new, email_change_token_current,
                               phone_change, phone_change_token, reauthentication_token)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1, 'x', now(), now(), now(),
               '{"provider":"email","providers":["email"]}'::jsonb,
               jsonb_build_object('full_name', 'Mohamed Tamer'),
               '', '', '', '', '', '', '', '')`,
      [TWIN]
    );

    try {
      await runTheAmbiguousImport();
    } finally {
      await removeTwin();
    }

    async function runTheAmbiguousImport() {
    const [duplicates] = await query<{ n: string }>(
      `select count(*)::text as n from profiles
       where is_active and full_name = 'Mohamed Tamer'`
    );
    expect(Number(duplicates.n), "the twin profile was not created").toBeGreaterThan(1);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "Ambiguous.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Task,Status,Hours Worked,Assignee,Reviewer,Deadline,Story Type,Grouping",
          "Imported ambiguous person,Todo,0,Mohamed Tamer,,23/08/2026,Story,",
        ].join("\n"),
        "utf8"
      ),
    });

    await expect(page.getByText(/0 ready, 1 flagged/)).toBeVisible();
    await expect(page.getByText(/No profile named "Mohamed Tamer"/).first()).toBeVisible();

    const [written] = await query<{ n: string }>(
      `select count(*)::text as n from work_items where title = 'Imported ambiguous person'`
    );
    expect(written.n).toBe("0");
    }
  });

  test("the commit writes into the sprint, so it cannot land under another client", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/import");

    // The page states which sprint it will write into, and it is the active one.
    await expect(page.getByText(/Rows will be created in EVIM · Sprint — Week 17/)).toBeVisible();
  });
});

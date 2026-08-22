import { readFileSync } from "node:fs";

import { auditA11y, expect, query, signIn, test } from "./fixtures";

/**
 * Profile pictures: setting one, seeing it everywhere, and taking it away.
 *
 * The subject is a profile this spec creates and destroys, never a seeded one.
 * A seeded person's picture would appear in the sprint header, the board, the
 * table and the mention menu for every spec running beside this one — and the
 * failure would land somewhere else entirely. Same discipline as `team.spec.ts`.
 */
const SUBJECT = { email: "avatar-subject@example.com", password: "avatar-subject-password" };
const NAME = "Ava Tarr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;

/** 1200×630, 53KB. Non-square on purpose: it exercises the centre crop. */
const SOURCE = readFileSync("public/og.png");

type Requests = import("@playwright/test").APIRequestContext;

async function createSubject(request: Requests) {
  await removeSubject(request);
  await query(
    `insert into public.allowed_emails (email, note) values ($1, 'e2e avatar subject')
     on conflict (email) do nothing`,
    [SUBJECT.email]
  );
  await query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data,
                             confirmation_token, recovery_token, email_change,
                             email_change_token_new, email_change_token_current,
                             phone_change, phone_change_token, reauthentication_token)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', $1, crypt($2, gen_salt('bf')), now(), now(), now(),
             '{"provider":"email","providers":["email"]}'::jsonb,
             jsonb_build_object('full_name', $3::text),
             '', '', '', '', '', '', '', '')`,
    [SUBJECT.email, SUBJECT.password, NAME]
  );
}

async function removeSubject(request: Requests) {
  // Storage objects first: nothing links an object to the `auth.users` row that
  // owns it, so deleting the user would leave the file behind with nothing
  // pointing at it and no way left to find it.
  //
  // Through the Storage API, not a DELETE against `storage.objects` —
  // `storage.protect_objects_delete` refuses a hand-written one, and it is
  // right to: the row is only half of a stored file. That is also the door the
  // application's own `removeStoredAvatar` goes through.
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service) {
    const objects = await query<{ name: string }>(
      `select name from storage.objects
       where bucket_id = 'avatars'
         and (storage.foldername(name))[1] in (select id::text from auth.users where email = $1)`,
      [SUBJECT.email]
    );
    for (const { name } of objects) {
      await request.delete(`${SUPABASE_URL}/storage/v1/object/avatars/${name}`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` },
      });
    }
  }

  await query(`delete from public.profiles where id in (select id from auth.users where email = $1)`, [SUBJECT.email]);
  await query(`delete from auth.users where email = $1`, [SUBJECT.email]);
  await query(`delete from public.allowed_emails where email = $1`, [SUBJECT.email]);
}

async function readSubject() {
  const [row] = await query<{ id: string; avatar_url: string | null; initials: string }>(
    `select p.id::text as id, p.avatar_url, p.initials
     from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [SUBJECT.email]
  );
  return row;
}

/** The stored object's own record of what it is, straight from storage. */
async function readObject(avatarUrl: string) {
  const key = avatarUrl.slice(PUBLIC_PREFIX.length);
  const [row] = await query<{ mimetype: string; size: string }>(
    `select metadata ->> 'mimetype' as mimetype, metadata ->> 'size' as size
     from storage.objects where bucket_id = 'avatars' and name = $1`,
    [key]
  );
  return row;
}

async function accessToken(request: Requests): Promise<string> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — source .env.local");
  const response = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: SUBJECT,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token;
}

test.describe("profile pictures", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeEach(async ({ request }) => createSubject(request));
  test.afterEach(async ({ request }) => removeSubject(request));

  test("a picture set in Settings is stored, served, and shown everywhere", async ({ page, request }) => {
    await signIn(page, SUBJECT);
    await page.goto("/app/settings");

    // Selected through the landmark rather than a CSS path: a `<section>` is
    // only a region if it has an accessible name, so finding it by role proves
    // the heading is really labelling it.
    const picture = page.getByRole("region", { name: "Your picture" });
    const settingsAvatar = picture.locator("[data-avatar]");
    await expect(settingsAvatar).toHaveAttribute("data-avatar", "initials");
    await expect(page.getByText(`your initials (${(await readSubject()).initials}) are shown`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose a picture" })).toBeVisible();

    await page.setInputFiles("input[type=file]", {
      name: "photograph.png",
      mimeType: "image/png",
      buffer: SOURCE,
    });

    // The write reaches the database, not just the screen.
    await expect
      .poll(async () => (await readSubject()).avatar_url, { timeout: 20_000 })
      .toContain(PUBLIC_PREFIX);

    const subject = await readSubject();
    const storedUrl = subject.avatar_url!;
    expect(storedUrl.startsWith(`${PUBLIC_PREFIX}${subject.id}/`)).toBeTruthy();

    // The browser re-encoded it before uploading: a 1200×630 PNG has become a
    // square WebP a fraction of the size. Without that, every board card would
    // be pulling a full-resolution photograph to draw a 20px circle.
    expect(storedUrl.endsWith(".webp")).toBeTruthy();
    const object = await readObject(storedUrl);
    expect(object.mimetype).toBe("image/webp");
    expect(Number(object.size)).toBeLessThan(SOURCE.byteLength);
    expect(Number(object.size)).toBeGreaterThan(0);

    // The bucket is public, and this is the assertion that says so: a request
    // carrying no session at all gets the image. A signed URL would answer this
    // the same way today and 401 an hour from now.
    const direct = await request.get(storedUrl);
    expect(direct.status()).toBe(200);
    expect(direct.headers()["content-type"]).toContain("image/webp");

    // On screen, on the page that set it and on the shell around it.
    await page.reload();
    await expect(settingsAvatar).toHaveAttribute("data-avatar", "picture");
    await expect(settingsAvatar.locator("img")).toHaveAttribute("src", storedUrl);
    await expect(page.locator("aside [data-avatar='picture'] img")).toHaveAttribute("src", storedUrl);

    // And to everybody else, on the screen that lists the team.
    await page.goto("/app/people");
    const row = page.locator("[data-team-member]", { hasText: NAME });
    await expect(row.locator("[data-avatar='picture'] img")).toHaveAttribute("src", storedUrl);

    expect(await auditA11y(page)).toEqual([]);
  });

  test("removing it puts the initials back, and deletes the file", async ({ page }) => {
    await signIn(page, SUBJECT);
    await page.goto("/app/settings");

    await page.setInputFiles("input[type=file]", {
      name: "photograph.png",
      mimeType: "image/png",
      buffer: SOURCE,
    });
    await expect.poll(async () => (await readSubject()).avatar_url, { timeout: 20_000 }).toContain(PUBLIC_PREFIX);
    const storedUrl = (await readSubject()).avatar_url!;

    await page.reload();
    await page.getByRole("button", { name: "Remove" }).click();

    await expect.poll(async () => (await readSubject()).avatar_url, { timeout: 20_000 }).toBeNull();

    // The object goes with it. A row set to null and a file left behind is how
    // a bucket quietly fills with pictures nothing references.
    expect(await readObject(storedUrl)).toBeUndefined();

    const settingsAvatar = page.getByRole("region", { name: "Your picture" }).locator("[data-avatar]");
    await expect(settingsAvatar).toHaveAttribute("data-avatar", "initials");
    await expect(settingsAvatar.locator("img")).toHaveCount(0);
  });

  test("the column cannot be pointed anywhere but our own bucket", async ({ request }) => {
    const token = await accessToken(request);
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const subject = await readSubject();

    // The form is not the boundary, the endpoint is — and this endpoint takes
    // the anon key, which ships in the browser bundle. An arbitrary URL here
    // would render inside an <img> on every teammate's screen.
    const foreign = await request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${subject.id}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: { avatar_url: "https://evil.example/tracker.gif" },
    });
    expect(foreign.status()).toBe(400);
    expect(await foreign.text()).toContain("profiles_avatar_is_our_own_storage");
    expect((await readSubject()).avatar_url).toBeNull();
  });

  test("you cannot set somebody else's picture", async ({ request }) => {
    const token = await accessToken(request);
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const [admin] = await query<{ id: string; avatar_url: string | null }>(
      `select p.id::text as id, p.avatar_url from public.profiles p
       join auth.users u on u.id = p.id where u.email = 'mohamed@coditu.com'`
    );

    const other = await request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${admin.id}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: { avatar_url: `${PUBLIC_PREFIX}${admin.id}/00000000-0000-0000-0000-000000000000.webp` },
    });

    // RLS refuses an update by making the row invisible, so this is a 200 that
    // changed nothing — which is exactly why the assertion is on the database
    // and not on the status code.
    expect(await other.json()).toEqual([]);
    const [after] = await query<{ avatar_url: string | null }>(
      `select avatar_url from public.profiles where id = $1`,
      [admin.id]
    );
    expect(after.avatar_url).toBe(admin.avatar_url);
  });
});

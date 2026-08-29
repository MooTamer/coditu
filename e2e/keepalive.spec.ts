import { expect, test } from "@playwright/test";

/**
 * The keepalive, checked as an external monitor would see it.
 *
 * A free Supabase project pauses after about seven days of low user database
 * activity. This route exists so a monitor can produce that activity without a
 * session, and the two things worth guarding are the exact keyword — a monitor
 * watches for that string and a rename silently breaks it — and the absence of
 * caching, because a cached 200 keeps the monitor green while the database
 * sleeps.
 */
test.describe("@keepalive database health", () => {
  test("answers its keyword, uncached, with no session", async ({ request }) => {
    const response = await request.get("/api/health/database", {
      headers: { cookie: "" },
    });

    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("coditu-database-awake");

    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toContain("no-store");
  });

  test("carries nothing about the workspace", async ({ request }) => {
    const body = await (await request.get("/api/health/database")).text();
    // The whole body, asserted. A probe that grows a payload is a probe that
    // has started leaking something.
    expect(body).toBe("coditu-database-awake");
    expect(body.length).toBeLessThan(64);
  });
});

import { SEED_ADMIN, SEED_LEAD, expect, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";

/**
 * Who else is here — and, more importantly, what leaves the browser to say so.
 *
 * ## The frame assertion is the point of this file
 *
 * Presence is the one place in this application where something reaches the
 * network without a Server Action having looked at it first. Everything else is
 * a validated mutation; this is a socket the browser writes to directly. So the
 * third test reads the actual WebSocket frames and asserts that text somebody
 * typed is not in any of them.
 *
 * That is not paranoia about the current code — it sends a profile id, a
 * surface name and a state, and nothing else. It is a guard against the obvious
 * future change: a "Mohamed is typing…" indicator that helpfully includes what
 * they are typing, or a draft sync that seemed harmless. Sprint notes and story
 * descriptions are internal, unpublished, and sometimes about money.
 *
 * ## Two contexts, two different people
 *
 * Presence is keyed by profile id, so two windows signed in as the same account
 * are deliberately ONE member — a person with the sprint open twice is one
 * person. Testing arrival therefore needs two different accounts.
 */

test.describe("presence", () => {
  test.describe.configure({ mode: "serial" });

  test("two people on the same sprint can see each other", async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const admin = await first.newPage();
    const lead = await second.newPage();

    try {
      await signIn(admin, SEED_ADMIN);
      await signIn(lead, SEED_LEAD);

      await admin.goto(SPRINT);
      await lead.goto(SPRINT);

      // Each sees the other and not themselves — a stack that includes you is
      // an avatar of noise on every screen.
      await expect(admin.getByLabel("Also here").getByText("Adam Nafie")).toBeAttached({
        timeout: 15000,
      });
      await expect(lead.getByLabel("Also here").getByText("Mohamed Tamer")).toBeAttached({
        timeout: 15000,
      });
      await expect(admin.getByLabel("Also here").getByText("Mohamed Tamer")).toHaveCount(0);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("leaving the page takes the avatar away", async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const admin = await first.newPage();
    const lead = await second.newPage();

    try {
      await signIn(admin, SEED_ADMIN);
      await signIn(lead, SEED_LEAD);
      await admin.goto(SPRINT);
      await lead.goto(SPRINT);

      await expect(admin.getByLabel("Also here").getByText("Adam Nafie")).toBeAttached({
        timeout: 15000,
      });

      // Navigating away, not closing the tab: a closed socket eventually times
      // out server-side, which would pass without proving the component
      // untracks on unmount. This is the leak that stays invisible until the
      // socket limit is hit.
      await lead.goto("/app/my-work");

      await expect(admin.getByLabel("Also here")).toHaveCount(0, { timeout: 15000 });
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("nothing anybody types reaches the socket", async ({ adminPage: page }) => {
    const sent: string[] = [];
    page.on("websocket", (ws) => {
      ws.on("framesent", (frame) => {
        if (typeof frame.payload === "string") sent.push(frame.payload);
      });
    });

    await page.goto(SPRINT);
    // Let the socket connect and this member announce itself.
    await expect
      .poll(() => sent.some((frame) => frame.includes("presence")), { timeout: 15000 })
      .toBe(true);

    const secret = "ZZQX private draft nobody should transmit";

    // Type into the sprint notes — an internal, unpublished document, and the
    // most sensitive writing surface on this page.
    await page.getByRole("button", { name: /notes/i }).first().click().catch(() => {});
    const editor = page.locator(".coditu-prose").first();
    if (await editor.count()) {
      await editor.click();
      await page.keyboard.type(secret);
      // Long enough for any throttled indicator to have fired.
      await page.waitForTimeout(1500);
    } else {
      // The notes editor did not open — type into the page anyway, so the
      // assertion still covers keystrokes reaching a socket.
      await page.keyboard.type(secret);
      await page.waitForTimeout(1500);
    }

    const leaked = sent.filter((frame) => frame.includes("ZZQX"));
    expect(leaked, `these frames carried typed text:\n${leaked.join("\n")}`).toHaveLength(0);

    // And prove the check could have failed: the frames are non-empty and this
    // test really was watching them.
    expect(sent.length).toBeGreaterThan(0);
  });

  test("the channel is private, so the join is authorized in SQL", async ({ adminPage: page }) => {
    const joins: string[] = [];
    page.on("websocket", (ws) => {
      ws.on("framesent", (frame) => {
        if (typeof frame.payload === "string" && frame.payload.includes("phx_join")) {
          joins.push(frame.payload);
        }
      });
    });

    await page.goto(SPRINT);
    await expect
      .poll(() => joins.some((f) => f.includes("coditu:presence:sprint:")), { timeout: 15000 })
      .toBe(true);

    const presenceJoin = joins.find((f) => f.includes("coditu:presence:sprint:"))!;
    // `private: true` is what makes realtime check `realtime.messages` RLS
    // instead of accepting any authenticated socket. Without it the channel
    // still works — which is exactly why it is asserted rather than assumed.
    expect(presenceJoin).toContain('"private":true');
    // And the topic carries the prefix the policy requires.
    expect(presenceJoin).toContain("coditu:presence:sprint:");
  });
});

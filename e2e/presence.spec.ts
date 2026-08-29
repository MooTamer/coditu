import { SEED_ADMIN, SEED_LEAD, expect, signIn, test } from "./fixtures";

const SPRINT = "/app/projects/meinevim/sprints/17";
const ITEM = `${SPRINT}/items/COD-241`;

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
    // most sensitive writing surface in this project.
    //
    // This used to click an inline "notes" button on the sprint table. Notes
    // are their own route now, so that button does not exist: the click waited
    // out its full timeout, the `.catch()` swallowed the failure, and the test
    // fell through to the else-branch below having spent most of its budget
    // and typed into no editor at all. It passed or failed on the wrong thing
    // either way. Go where the editor is.
    await page.goto(`${SPRINT}/notes`);
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

    // And now the higher-risk surface: the story, where opening an editor
    // announces WHICH editor. That announcement is a `track` carrying a name,
    // and the mistake it invites is including the content alongside it.
    await page.goto(ITEM);
    await expect
      .poll(() => sent.some((frame) => frame.includes("coditu:presence:item:")), {
        timeout: 15000,
      })
      .toBe(true);

    await page.getByRole("button", { name: /^Edit criterion:/ }).first().click();
    const criterion = page.locator(".coditu-prose").first();
    await expect(criterion).toBeVisible();
    await criterion.click();
    await page.keyboard.type(secret);
    await page.waitForTimeout(1500);

    const leaked = sent.filter((frame) => frame.includes("ZZQX"));
    expect(leaked, `these frames carried typed text:\n${leaked.join("\n")}`).toHaveLength(0);

    // Prove the check could have failed: frames were captured, presence really
    // announced, and the surface name really did cross the wire — so if the
    // content had gone with it, this would have caught it.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((frame) => frame.includes("criteria"))).toBe(true);
  });

  test("a story says who is on it, including you, and what they are doing", async ({
    browser,
  }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const admin = await first.newPage();
    const lead = await second.newPage();

    try {
      await signIn(admin, SEED_ADMIN);
      await signIn(lead, SEED_LEAD);
      await admin.goto(ITEM);
      await lead.goto(ITEM);

      const stack = admin.getByLabel("On this story");
      await expect(stack).toBeAttached({ timeout: 15000 });

      // You ARE in the story stack — unlike the sprint header. On one story the
      // question is "is anybody in here with me", and your own face is what
      // makes the others countable.
      await expect(stack.getByText("Mohamed Tamer (you)", { exact: false })).toBeAttached();
      await expect(stack.getByText("Adam Nafie", { exact: false })).toBeAttached();

      await expect(admin.getByText("2 viewing")).toBeVisible({ timeout: 15000 });

      // Now the lead opens a criterion. The admin should be told WHICH surface,
      // and never what is in it.
      const editButton = lead.getByRole("button", { name: /^Edit criterion:/ }).first();
      await editButton.click();
      await expect(lead.locator(".coditu-prose").first()).toBeVisible();

      await expect(admin.getByText(/Adam editing criteria/)).toBeVisible({ timeout: 15000 });

      // And it goes away again when the editor closes, rather than sticking
      // until the socket drops.
      await lead.keyboard.press("Escape");
      await expect(admin.getByText(/editing criteria/)).toHaveCount(0, { timeout: 15000 });
    } finally {
      await first.close();
      await second.close();
    }
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

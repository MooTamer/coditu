/**
 * Answering a question, from a client's browser. LOCAL ONLY — see `.gitignore`.
 *
 * The conversation is the one place in this feature where a client WRITES, so
 * it is the one place where the write path has to be as well proven as the read
 * path. The pgTAP suite already refuses a spoofed author and a thread on an
 * unpublished component; this proves the screen never offers her either, and
 * that the state moves the way the design says it does.
 */
import { expect, test } from "@playwright/test";

import { auditA11y, signIn } from "./fixtures";
import {
  CLIENT_CONTACT,
  FIXTURE,
  OTHER_CONTACT,
  readOnlyQuestions,
  setupClientFixture,
  teardownClientFixture,
} from "./client-fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(setupClientFixture);
test.afterAll(teardownClientFixture);

test.describe("the questions list", () => {
  test("shows the question on the published component, and not the other", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client/questions");

    await expect(page.getByText(FIXTURE.question)).toBeVisible();
    await expect(page.getByText("Waiting for your reply")).toBeVisible();

    // The control: a real thread, on a component that was never published to
    // her. Absent from the payload, not merely from the list.
    expect(await page.content()).not.toContain(FIXTURE.hiddenQuestion);
  });

  test("the shell counts what is waiting on her", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client");

    await expect(
      page.getByRole("link", { name: /Questions.*one question waiting for you/ })
    ).toBeVisible();
  });

  test("the other contact sees none of it", async ({ page }) => {
    await signIn(page, OTHER_CONTACT);
    await page.goto("/client/questions");

    const html = await page.content();
    expect(html).not.toContain(FIXTURE.question);
    expect(html).not.toContain(FIXTURE.questionOpener);
  });
});

test.describe("answering", () => {
  test("a reply appears, and hands the question back to Coditu", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client/questions");
    await page.getByText(FIXTURE.question).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(FIXTURE.question);
    await expect(page.getByText(FIXTURE.questionOpener)).toBeVisible();

    await page.getByLabel("Your reply").fill("The second one, please.");
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page.getByText("The second one, please.")).toBeVisible();
    // Her answer moves it to us. She should not have to say she is done.
    await expect(page.getByText("We're on it")).toBeVisible();

    // And the message is attributed to her, not to Coditu.
    const mine = page.locator("li", { hasText: "The second one, please." });
    await expect(mine).toContainText("You");
  });

  test("the draft survives leaving the page, and is scoped to her", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client/questions");
    await page.getByText(FIXTURE.question).click();

    await page.getByLabel("Your reply").fill("half a thought");
    await page.goto("/client");
    await page.goBack();

    await expect(page.getByLabel("Your reply")).toHaveValue("half a thought");

    // The key carries her profile id, so a different person on the same device
    // gets their own empty box rather than her sentence.
    const key = await page.evaluate(() =>
      Object.keys(sessionStorage).find((k) => k.startsWith("coditu:client-draft:"))
    );
    expect(key).toMatch(/^coditu:client-draft:[0-9a-f-]{36}:[0-9a-f-]{36}$/);
  });

  test("the send button will not fire twice, or on nothing", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client/questions");
    await page.getByText(FIXTURE.question).click();

    // Empty is not sendable — the common way an accidental blank message goes.
    await page.getByLabel("Your reply").fill("");
    await expect(page.getByRole("button", { name: "Send reply" })).toBeDisabled();
  });

  test("read-only access can follow the thread and is told why it cannot answer", async ({
    page,
  }) => {
    await readOnlyQuestions();

    await signIn(page, CLIENT_CONTACT);
    await page.goto("/client/questions");
    await page.getByText(FIXTURE.question).click();

    // Still reads it — `read_questions` and `reply_questions` are separate.
    await expect(page.getByText(FIXTURE.questionOpener)).toBeVisible();

    // And is given a sentence rather than a box that fails on submit.
    await expect(page.getByText(/follow this conversation but not reply/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reply" })).toHaveCount(0);
    await expect(page.getByLabel("Your reply")).toHaveCount(0);
  });
});

test.describe("usable with a thumb and a screen reader", () => {
  test("axe finds nothing on the list or the thread", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);

    await page.goto("/client/questions");
    expect(await auditA11y(page)).toEqual([]);

    await page.getByText(FIXTURE.question).click();
    expect(await auditA11y(page)).toEqual([]);
  });

  /**
   * Clipping is not overflow, and no overflow assertion will ever catch it.
   *
   * `html` carries `overflow-x-clip`, so a control pushed past the right edge
   * does not create a scrollbar and does not change `scrollWidth` — it simply
   * cannot be read or hit. The topbar shipped exactly this in step 7, and the
   * client header shipped it again at 320px in this brief. Twice is a test.
   */
  test("nothing in the header is clipped off the right edge", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);

    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/client/questions");

      const escaped = await page.evaluate((w) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("header a, header button")) {
          const rect = el.getBoundingClientRect();
          if (rect.right > w + 0.5 || rect.left < -0.5) {
            out.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim()} @ ${Math.round(rect.left)}–${Math.round(rect.right)}`);
          }
        }
        return out;
      }, width);

      expect(escaped, `${width}px`).toEqual([]);
    }
  });

  test("no horizontal overflow, and the composer is 16px", async ({ page }) => {
    await signIn(page, CLIENT_CONTACT);

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/client/questions");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        ),
        `${width}px`
      ).toBe(false);
    }
  });
});

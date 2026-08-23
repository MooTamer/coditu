import { describe, expect, it } from "vitest";

import { isSubscriptionGone, mentionPayload, readVapidConfig } from "@/lib/push/payload";

/**
 * The parts of Web Push that can be answered without a browser or a push
 * service, which is deliberately most of the decisions.
 *
 * Everything not tested here is one HTTP call inside `web-push`, and the
 * end-to-end proof of that is a manual check on real hardware — recorded as
 * such in `docs/06-PROGRESS.md` rather than faked with a spec that appears to
 * test it.
 */

const NOTICE = {
  authorName: "Mohamed Tamer",
  itemKey: "COD-229",
  itemTitle: "Add optional titles to all webparts",
  projectSlug: "meinevim",
  sprintNumber: 17,
  preview: "Can you take a look at the toggle before Friday?",
};

describe("the notification payload", () => {
  it("says who, and what, in the order a lock screen shows them", () => {
    const payload = mentionPayload(NOTICE);
    expect(payload.title).toBe("Mohamed Tamer mentioned you");
    // The KEY first: it is what tells somebody whether this needs them now.
    expect(payload.body).toBe("COD-229 · Can you take a look at the toggle before Friday?");
  });

  it("links at the item, not at the app", () => {
    // A notification that opens the sprint and leaves somebody to find the row
    // is a notification that costs more than it saves.
    expect(mentionPayload(NOTICE).url).toBe(
      "/app/projects/meinevim/sprints/17/items/COD-229"
    );
  });

  it("falls back to the item's title when the comment flattened to nothing", () => {
    // A comment that is only an image or only a mention has no text.
    const payload = mentionPayload({ ...NOTICE, preview: null });
    expect(payload.body).toBe("COD-229 — Add optional titles to all webparts");
  });

  it("collapses the whitespace a pasted comment carries", () => {
    const payload = mentionPayload({ ...NOTICE, preview: "  two\n\nlines   here  " });
    expect(payload.body).toBe("COD-229 · two lines here");
  });

  it("truncates on a word boundary rather than mid-word", () => {
    const preview =
      "This is a deliberately long comment written to run past the point at which any " +
      "operating system would cut it off on a lock screen, and then some more.";
    const payload = mentionPayload({ ...NOTICE, preview });

    expect(payload.body.length).toBeLessThanOrEqual(140);
    expect(payload.body.endsWith("…")).toBe(true);

    // The visible text is an exact prefix of the comment — nothing reworded,
    // nothing dropped from the middle …
    const shown = payload.body.replace(/^COD-229 · /, "").replace(/…$/, "");
    expect(preview.startsWith(shown)).toBe(true);

    // … and the character it stopped before is a space, so the last thing
    // anybody reads is a whole word rather than half of one.
    expect(preview[shown.length]).toBe(" ");
  });

  it("never returns an absolute URL", () => {
    // `sw.js` refuses anything that does not start with `/` and falls back to
    // My work. This is the other half of that contract.
    const payload = mentionPayload({ ...NOTICE, projectSlug: "https://evil.example" });
    expect(payload.url.startsWith("/app/")).toBe(true);
  });
});

describe("what a push service's answer means for the row", () => {
  it("deletes on 404 and 410, and only those", () => {
    // These two mean the installation is gone — uninstalled, wiped, expired.
    expect(isSubscriptionGone(404)).toBe(true);
    expect(isSubscriptionGone(410)).toBe(true);
  });

  it("keeps the row for anything that is about this attempt", () => {
    // 429 is rate limiting, 500 is their bad afternoon, 413 is a payload we
    // should have made smaller. Deleting on any of them would unsubscribe
    // somebody because a push service hiccupped, and they would never find out.
    for (const status of [400, 401, 403, 413, 429, 500, 502, 503]) {
      expect(isSubscriptionGone(status), `${status} must not delete the row`).toBe(false);
    }
    expect(isSubscriptionGone(undefined)).toBe(false);
  });
});

describe("reading the VAPID configuration", () => {
  const complete: Record<string, string | undefined> = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPublicKey",
    VAPID_PRIVATE_KEY: "PrivateKey",
    VAPID_SUBJECT: "mailto:hello@coditu.com",
  };

  it("returns the three values when all three are set", () => {
    expect(readVapidConfig(complete)).toEqual({
      publicKey: "BPublicKey",
      privateKey: "PrivateKey",
      subject: "mailto:hello@coditu.com",
    });
  });

  it("returns null rather than throwing when any is missing", () => {
    // The contract the caller depends on: a comment must never fail to save
    // because push is not set up. A local checkout has no keys.
    for (const key of Object.keys(complete)) {
      const partial = { ...complete, [key]: undefined };
      expect(readVapidConfig(partial), `missing ${key}`).toBeNull();
    }
    expect(readVapidConfig({})).toBeNull();
  });

  it("treats whitespace as absent", () => {
    // A `.env` line with nothing after the `=` reads as an empty string, and a
    // pasted key can arrive with a trailing newline.
    expect(readVapidConfig({ ...complete, VAPID_PRIVATE_KEY: "   " })).toBeNull();
    expect(readVapidConfig({ ...complete, VAPID_PRIVATE_KEY: " Private \n" })?.privateKey).toBe(
      "Private"
    );
  });

  it("refuses a subject the push services will refuse", () => {
    // RFC 8292 requires `mailto:` or `https:`, and the services enforce it —
    // a wrong one fails at the service with a 403 that reads as an
    // authentication problem rather than as a typo in an env var.
    expect(readVapidConfig({ ...complete, VAPID_SUBJECT: "hello@coditu.com" })).toBeNull();
    expect(readVapidConfig({ ...complete, VAPID_SUBJECT: "http://coditu.com" })).toBeNull();
    expect(readVapidConfig({ ...complete, VAPID_SUBJECT: "https://coditu.com" })).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ROUTE,
  attachmentObjectKey,
  attachmentSrc,
  objectKeyFromSrc,
} from "@/lib/attachments";

/**
 * The serve route takes a path out of a URL anybody can type and hands it to
 * Supabase storage. That makes this parser the whole traversal guard, and the
 * one thing standing between `/api/attachments/…` and an open proxy.
 *
 * Written the way `tests/avatar-url.test.ts` is, and for the same reason: the
 * guard is a pure function precisely so the strings that would defeat it can be
 * thrown at it directly.
 */
const MINE = "3f1a0c1e-7c31-4a1e-9a11-0c2f4b6d8e90";
const FILE = "b2c3d4e5-6789-4abc-8def-0123456789ab";
const KEY = `${MINE}/${FILE}.png`;

describe("attachmentObjectKey — the traversal guard", () => {
  it("accepts the exact shape this app writes", () => {
    expect(attachmentObjectKey(KEY)).toBe(KEY);
    for (const ext of ["png", "jpg", "webp", "gif", "avif"]) {
      expect(attachmentObjectKey(`${MINE}/${FILE}.${ext}`)).toBe(`${MINE}/${FILE}.${ext}`);
    }
  });

  it("lowercases, so two spellings of one object are one object", () => {
    expect(attachmentObjectKey(KEY.toUpperCase())).toBe(KEY);
  });

  it("refuses every shape of ..", () => {
    for (const attack of [
      "../secrets/key.png",
      `${MINE}/../../avatars/${FILE}.png`,
      `..%2F..%2Fetc%2Fpasswd`,
      `${MINE}/..`,
      "....//....//x.png",
    ]) {
      expect(attachmentObjectKey(attack)).toBeNull();
    }
  });

  it("refuses a percent sign outright, so a second decode cannot invent one", () => {
    // The key is already decoded by the time it reaches here. `%252e%252e`
    // becoming `..` needs a second round, and the only safe number of rounds is
    // none — so a percent sign is refused rather than reasoned about.
    expect(attachmentObjectKey(`${MINE}/%2e%2e/${FILE}.png`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/%252e%252e/${FILE}.png`)).toBeNull();
  });

  it("refuses an absolute path, an absolute URL, and a backslash", () => {
    expect(attachmentObjectKey(`/${KEY}`)).toBeNull();
    expect(attachmentObjectKey(`https://evil.example/${KEY}`)).toBeNull();
    expect(attachmentObjectKey(`//evil.example/${KEY}`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}\\${FILE}.png`)).toBeNull();
  });

  it("refuses whitespace and control characters", () => {
    expect(attachmentObjectKey(`${MINE}/ ${FILE}.png`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/${FILE}.png\n`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/${FILE}\t.png`)).toBeNull();
  });

  it("refuses a query, a fragment, and an extension we never write", () => {
    expect(attachmentObjectKey(`${KEY}?token=x`)).toBeNull();
    expect(attachmentObjectKey(`${KEY}#x`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/${FILE}.svg`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/${FILE}.html`)).toBeNull();
  });

  it("refuses a key that is not two uuids", () => {
    expect(attachmentObjectKey(`${FILE}.png`)).toBeNull();
    expect(attachmentObjectKey(`somebody/${FILE}.png`)).toBeNull();
    expect(attachmentObjectKey(`${MINE}/${MINE}/${FILE}.png`)).toBeNull();
  });

  it("refuses nothing, and refuses too much", () => {
    expect(attachmentObjectKey(null)).toBeNull();
    expect(attachmentObjectKey(undefined)).toBeNull();
    expect(attachmentObjectKey("")).toBeNull();
    expect(attachmentObjectKey("a".repeat(500))).toBeNull();
  });
});

describe("objectKeyFromSrc — reading a document's own images back", () => {
  it("reads the stable path this app writes now", () => {
    expect(objectKeyFromSrc(attachmentSrc(KEY))).toBe(KEY);
    expect(attachmentSrc(KEY)).toBe(`${ATTACHMENT_ROUTE}/${KEY}`);
  });

  it("reads the object out of an expiring signed URL, which is what the migration needs", () => {
    // The bug: this whole string was stored inside body_json, token and all,
    // and it stopped working an hour later.
    const signed = `http://127.0.0.1:54421/storage/v1/object/sign/comment-images/${KEY}?token=eyJhbGciOi.x.y`;
    expect(objectKeyFromSrc(signed)).toBe(KEY);
  });

  it("reads it on whatever host the project is on", () => {
    expect(
      objectKeyFromSrc(`https://abc.supabase.co/storage/v1/object/sign/comment-images/${KEY}?token=t`)
    ).toBe(KEY);
  });

  it("returns null for somebody else's image rather than claiming it", () => {
    expect(objectKeyFromSrc("https://images.example.com/cat.png")).toBeNull();
    expect(objectKeyFromSrc(`https://evil.example/storage/v1/object/sign/avatars/${KEY}`)).toBeNull();
    expect(objectKeyFromSrc("/api/attachments/../../etc/passwd")).toBeNull();
    expect(objectKeyFromSrc(42)).toBeNull();
    expect(objectKeyFromSrc(null)).toBeNull();
  });

  it("is idempotent, which is what makes the data migration re-runnable", () => {
    const once = attachmentSrc(objectKeyFromSrc(
      `http://127.0.0.1:54421/storage/v1/object/sign/comment-images/${KEY}?token=t`
    )!);
    const twice = attachmentSrc(objectKeyFromSrc(once)!);
    expect(twice).toBe(once);
  });
});

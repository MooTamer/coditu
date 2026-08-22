import { describe, expect, it } from "vitest";

import { avatarObjectKey } from "@/lib/avatar";

/**
 * Replacing a picture deletes the one it replaces, and the only thing naming
 * the object to delete is a URL read back out of a client-writable column.
 *
 * The database constraint `profiles_avatar_is_our_own_storage` is what actually
 * keeps a foreign URL out of that column. This parser is the second half: it
 * refuses to produce a key from anything that is not the exact shape we write,
 * so a `remove()` call cannot be aimed by a string.
 */
const HOST = "http://127.0.0.1:54421/storage/v1/object/public";
const MINE = "3f1a0c1e-7c31-4a1e-9a11-0c2f4b6d8e90";
const FILE = "b2c3d4e5-6789-4abc-8def-0123456789ab";

describe("avatarObjectKey", () => {
  it("reads the object key out of a stored public URL", () => {
    expect(avatarObjectKey(`${HOST}/avatars/${MINE}/${FILE}.webp`)).toBe(`${MINE}/${FILE}.webp`);
  });

  it("ignores a cache-busting query string", () => {
    expect(avatarObjectKey(`${HOST}/avatars/${MINE}/${FILE}.jpg?t=1`)).toBe(`${MINE}/${FILE}.jpg`);
  });

  it("finds the object on whatever host the project is on", () => {
    // The marker is the bucket segment, not the hostname — a project that moves
    // between the local stack and the hosted one still cleans up after itself.
    expect(avatarObjectKey(`https://abc.supabase.co/storage/v1/object/public/avatars/${MINE}/${FILE}.png`))
      .toBe(`${MINE}/${FILE}.png`);
  });

  it("has nothing to delete for a profile with no picture", () => {
    expect(avatarObjectKey(null)).toBeNull();
    expect(avatarObjectKey(undefined)).toBeNull();
    expect(avatarObjectKey("")).toBeNull();
  });

  it("refuses a URL for another bucket", () => {
    // `comment-images` is private and holds client work. A delete aimed at it
    // by way of the avatar column would be one member erasing another's
    // attachments.
    expect(avatarObjectKey(`${HOST}/comment-images/${MINE}/${FILE}.png`)).toBeNull();
  });

  it("refuses anything that is not exactly the shape we write", () => {
    for (const url of [
      `${HOST}/avatars/../comment-images/${MINE}/${FILE}.png`,
      `${HOST}/avatars/${MINE}/../../${FILE}.png`,
      `${HOST}/avatars/${MINE}`,
      `${HOST}/avatars/${MINE}/${FILE}.png/extra`,
      `${HOST}/avatars/not-a-uuid/${FILE}.png`,
      `${HOST}/avatars/${MINE}/${FILE}.php`,
      "https://evil.example/tracker.gif",
      "javascript:alert(1)",
    ]) {
      expect(avatarObjectKey(url), url).toBeNull();
    }
  });
});

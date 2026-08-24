import { describe, expect, it } from "vitest";

import { HEIC_MESSAGE, intrinsicSize, looksLikeHeic, looksLikeImage } from "@/lib/images";

/**
 * The intrinsic size is what stops the thread jumping while somebody reads it.
 *
 * Without `width`/`height` on the `<img>`, every screenshot reflows the
 * conversation the moment it arrives — which is the worst version of this
 * feature, because it happens exactly when you are mid-sentence. The size is
 * read from the file's own header on the server, so it is a fact rather than a
 * claim from the browser that uploaded it.
 *
 * Headers are built by hand here rather than fixtures: the parser only ever
 * reads the first few dozen bytes, and a real 8MB screenshot in the repo would
 * prove nothing extra.
 */

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length + type, then the two dimensions, big-endian.
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** A JPEG with `count` filler segments before the frame header. */
function jpeg(width: number, height: number, filler = 0): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  for (let i = 0; i < filler; i += 1) {
    // APP1, length 6, four bytes of payload — an EXIF block in miniature.
    parts.push(0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66);
  }
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08);
  parts.push((height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff);
  parts.push(...new Array(12).fill(0));
  return new Uint8Array(parts);
}

function webpLossy(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x20], 12);
  const view = new DataView(bytes.buffer);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

describe("intrinsicSize", () => {
  it("reads a PNG", () => {
    expect(intrinsicSize(png(2400, 1350))).toEqual({ width: 2400, height: 1350 });
  });

  it("reads a GIF, which is little-endian where PNG is not", () => {
    expect(intrinsicSize(gif(320, 240))).toEqual({ width: 320, height: 240 });
  });

  it("reads a lossy WebP", () => {
    expect(intrinsicSize(webpLossy(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it("walks past a JPEG's EXIF to the frame header", () => {
    // The case that matters: an iPhone photo carries EXIF, a colour profile and
    // a thumbnail in front of the size, so there is no fixed offset to read.
    expect(intrinsicSize(jpeg(4032, 3024, 0))).toEqual({ width: 4032, height: 3024 });
    expect(intrinsicSize(jpeg(4032, 3024, 3))).toEqual({ width: 4032, height: 3024 });
    expect(intrinsicSize(jpeg(4032, 3024, 20))).toEqual({ width: 4032, height: 3024 });
  });

  it("returns null rather than guessing at a format it does not parse", () => {
    // AVIF, deliberately. Every reader tolerates null anyway, because every
    // image uploaded before this existed has no stored size at all.
    const avif = new Uint8Array(32);
    avif.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
    expect(intrinsicSize(avif)).toBeNull();
  });

  it("returns null for a truncated file instead of reading past the end", () => {
    expect(intrinsicSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(intrinsicSize(new Uint8Array(0))).toBeNull();
    expect(intrinsicSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("does not loop forever on a JPEG whose segment chain is nonsense", () => {
    const junk = new Uint8Array(4096);
    junk.set([0xff, 0xd8], 0);
    junk.fill(0xff, 2);
    expect(intrinsicSize(junk)).toBeNull();
  });
});

describe("a photograph straight off an iPhone", () => {
  it("is recognised by type or by extension", () => {
    expect(looksLikeHeic("image/heic", "IMG_0042.HEIC")).toBe(true);
    expect(looksLikeHeic("image/heif", "x.heif")).toBe(true);
    // Safari sometimes reports an empty type for a file picked out of Files.
    expect(looksLikeHeic("", "IMG_0042.heic")).toBe(true);
  });

  it("is not confused with a format we do accept", () => {
    expect(looksLikeHeic("image/png", "screenshot.png")).toBe(false);
    expect(looksLikeHeic("image/jpeg", "photo.jpg")).toBe(false);
  });

  it("is answered with the setting that fixes it, not with a list of MIME types", () => {
    expect(HEIC_MESSAGE).toContain("Most Compatible");
    expect(HEIC_MESSAGE).toContain("HEIC");
  });
});

describe("looksLikeImage still refuses a file that lies about its type", () => {
  it("takes the bytes over the declared type", () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(looksLikeImage(html, "image/png")).toBe(false);
    expect(looksLikeImage(png(1, 1), "image/png")).toBe(true);
  });
});

/**
 * What counts as an image here, and how that is actually checked.
 *
 * Two upload paths now share this — comment attachments and profile pictures —
 * and they must agree, because they are the same question: is this file really
 * the picture it says it is? Duplicating the answer means one of the two copies
 * eventually learns about a format the other does not.
 *
 * Deliberately not `server-only`. The list is also the `accept` attribute on
 * the file inputs, and a picker that offers a format the server refuses is a
 * disagreement the person using it gets to discover the hard way.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** The `accept` attribute for a file input, from the one list. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Magic-number check. The browser's reported MIME type comes from the file
 * extension, so it is trivially wrong and trivially forged; the first bytes are
 * the actual format.
 */
export function looksLikeImage(bytes: Uint8Array, declared: string): boolean {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

  if (declared === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (declared === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (declared === "image/gif") return starts(0x47, 0x49, 0x46, 0x38);
  if (declared === "image/webp" || declared === "image/avif") {
    // WebP is RIFF....WEBP; AVIF is an ISO-BMFF box with an `ftyp` header.
    const riff = starts(0x52, 0x49, 0x46, 0x46);
    const ftyp = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    return riff || ftyp;
  }
  return false;
}

/** The file extension for a stored object. `jpeg` is spelled `jpg` on disk. */
export function extensionFor(type: string): string {
  return type.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
}

/**
 * A photograph straight off an iPhone.
 *
 * `image/heic` and `image/heif` are not on the allowed list and never will be —
 * transcoding them means a native dependency for a case iOS usually converts
 * away on upload anyway. But the generic refusal ("Images only — PNG, JPEG,
 * WebP, GIF or AVIF") is useless to somebody holding an iPhone, because the
 * phone calls it a photo and they have no idea what a HEIC is.
 *
 * So this is detected by name, and answered with the sentence that actually
 * solves it. Detected by *type or extension*, because Safari sometimes reports
 * an empty type for a file picked out of Files.
 */
export function looksLikeHeic(type: string, fileName: string): boolean {
  return /heic|heif/i.test(type) || /\.(heic|heif)$/i.test(fileName);
}

export const HEIC_MESSAGE =
  "That is a HEIC photo, which browsers cannot display. On iPhone: Settings → Camera → Formats → Most Compatible, then take it again — or share it out of Photos, which converts it.";

/**
 * The intrinsic size of an image, read from its own header.
 *
 * Stored on the image node's attrs at upload time so the thread can reserve the
 * right box before the bytes arrive. A thread that jumps while you are reading
 * it is the worst version of this feature, and `width`/`height` on the `<img>`
 * is what stops it.
 *
 * Done here rather than in the browser because a client-supplied dimension is a
 * claim, and a claim that drives layout is a claim that can distort it. Four
 * formats are parsed; **AVIF deliberately is not** — its size lives inside an
 * ISO-BMFF box tree, and a partial parser that guesses is worse than an honest
 * null. Every reader must tolerate null anyway, for the images uploaded before
 * this existed.
 */
export function intrinsicSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR is always the first chunk, width and height at bytes 16 and 20.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: little-endian, right after the six-byte signature.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // WebP: three flavours, and the size sits in a different place in each.
  if (
    bytes.length > 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (kind === "VP8 ") {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (kind === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") {
      const at = 24;
      return {
        width: (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + 1,
        height: (bytes[at + 3] | (bytes[at + 4] << 8) | (bytes[at + 5] << 16)) + 1,
      };
    }
    return null;
  }

  // JPEG: walk the segment chain to the start-of-frame marker. There is no
  // fixed offset — EXIF, colour profiles and thumbnails all sit in front of it,
  // and an iPhone photo carries all three.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        at += 1;
        continue;
      }
      const marker = bytes[at + 1];
      // SOF0..SOF15, minus the four that are not frame headers at all.
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) {
        return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
      }
      // Standalone markers carry no length field; everything else does.
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01 || marker === 0xff) {
        at += 2;
        continue;
      }
      at += 2 + view.getUint16(at + 2);
    }
  }

  return null;
}

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

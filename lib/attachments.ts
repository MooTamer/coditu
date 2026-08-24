/**
 * Where an image in the thread actually lives, and how a stored document names
 * it.
 *
 * ## The bug this exists to fix
 *
 * `uploadCommentImage` uploaded to the private `comment-images` bucket and
 * returned **a signed URL with a one-hour expiry**, which was then stored
 * verbatim inside `body_json`. An hour later that URL was dead — permanently,
 * because the document held the expired string. Every screenshot posted before
 * 2026-08-25 was already broken or on its way there, and nothing in the app
 * said so: the `<img>` simply failed.
 *
 * So a document stores a **stable reference** instead: `/api/attachments/<key>`,
 * a same-origin path that `isSafeImageSrc` already accepts, served by a route
 * that re-checks authorization on every request and signs a fresh URL each
 * time. The document never contains a credential and never expires.
 *
 * ## Why this file is not `server-only`
 *
 * The parser below is the traversal guard, and a guard belongs in a plain
 * module so it can be tested as a pure function against the strings that would
 * defeat it — the same reason `lib/avatar.ts` exists separately from
 * `lib/actions/profiles.ts`. The editor also builds these paths client-side.
 */

export const COMMENT_IMAGE_BUCKET = "comment-images";

/** The route that serves them. Same-origin, so the allowlist needs no change. */
export const ATTACHMENT_ROUTE = "/api/attachments";

/**
 * The exact shape this app writes: `<profile uuid>/<object uuid>.<ext>`.
 *
 * Anchored, and matched against the shape rather than merely scanned for `..`,
 * for the reason `avatarObjectKey` is: a path built by slicing a string is not
 * the place to discover it contained something else. Anything that is not this
 * is not ours, and refusing it is cheaper than reasoning about it.
 */
const OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|avif)$/i;

/**
 * The object key for a request path, or null.
 *
 * **This is the whole traversal guard on the serve route**, so it refuses more
 * than it strictly has to: anything with `..`, a backslash, a percent sign, a
 * leading slash, a query, a fragment, whitespace or a control character is
 * gone before the shape is even considered. A percent sign is on that list
 * because a key is decoded before it reaches here and a second round of
 * decoding is how `%252e%252e` becomes `..`.
 */
export function attachmentObjectKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) return null;
  if (/[\s\u0000-\u001F\u007F\\%?#]/.test(raw)) return null;
  if (raw.includes("..") || raw.startsWith("/")) return null;
  return OBJECT_KEY.test(raw) ? raw.toLowerCase() : null;
}

/** `<profile>/<uuid>.png` → `/api/attachments/<profile>/<uuid>.png`. */
export function attachmentSrc(objectKey: string): string {
  return `${ATTACHMENT_ROUTE}/${objectKey}`;
}

/**
 * The object key behind a `src` that a document already holds.
 *
 * Three shapes reach this, and all three have to resolve to the same object:
 *
 *  1. `/api/attachments/<key>` — what this app writes now.
 *  2. `…/storage/v1/object/sign/comment-images/<key>?token=…` — the expiring
 *     signed URLs stored before 2026-08-25. Recognised so the data migration
 *     can rewrite them, and so a document that has not been migrated yet still
 *     renders.
 *  3. `…/storage/v1/object/public/comment-images/<key>` — never written by this
 *     app, but the same string minus the token, and cheap to accept.
 *
 * Anything else is somebody else's URL and returns null. The caller renders it
 * or refuses it on its own terms; this function's only job is "is that one of
 * ours, and which object is it".
 */
export function objectKeyFromSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const withoutQuery = src.split(/[?#]/)[0];

  if (withoutQuery.startsWith(`${ATTACHMENT_ROUTE}/`)) {
    return attachmentObjectKey(withoutQuery.slice(ATTACHMENT_ROUTE.length + 1));
  }

  const marker = `/${COMMENT_IMAGE_BUCKET}/`;
  const at = withoutQuery.indexOf(marker);
  if (at === -1) return null;
  return attachmentObjectKey(withoutQuery.slice(at + marker.length));
}

/**
 * How long a freshly signed URL is good for.
 *
 * Short on purpose. The document holds a path, not this URL, so the only thing
 * an expiry can break now is an image already painted on a page somebody is
 * looking at — and five minutes covers that with room to spare. The old
 * one-hour value existed because the URL had to outlive the request that made
 * it; it does not any more.
 */
export const SIGNED_URL_TTL_SECONDS = 300;

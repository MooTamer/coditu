/**
 * Where a profile picture lives, and how to get back from the stored URL to the
 * object it points at.
 *
 * A plain module rather than part of `lib/actions/profiles.ts`, because
 * everything exported from a `"use server"` file is a callable endpoint. A pure
 * string parser does not need to be reachable from the browser to be tested.
 */

export const AVATAR_BUCKET = "avatars";

/**
 * The object key inside `avatars` for a stored `profiles.avatar_url`, or null
 * if the URL is not one of ours.
 *
 * The stored value is `…/storage/v1/object/public/avatars/<uuid>/<uuid>.<ext>`.
 * The marker is the bucket segment rather than the host, so a project that
 * moves hosts still cleans up after itself; and the result is matched against
 * the exact shape we write — two uuids and one of the five extensions we
 * produce — because a delete built by slicing a URL is not the place to
 * discover that the string contained `..`. The same shape is a check constraint
 * on the column, in `20260821190000_avatar_pictures.sql`; both, because the
 * constraint governs what may be stored and this governs what may be deleted.
 */
export function avatarObjectKey(storedUrl: string | null | undefined): string | null {
  if (!storedUrl) return null;

  const marker = `/${AVATAR_BUCKET}/`;
  const at = storedUrl.indexOf(marker);
  if (at === -1) return null;

  const key = storedUrl.slice(at + marker.length).split(/[?#]/)[0];
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|gif|avif)$/i.test(key) ? key : null;
}

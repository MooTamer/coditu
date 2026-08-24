import { NextResponse, type NextRequest } from "next/server";

import {
  COMMENT_IMAGE_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  attachmentObjectKey,
} from "@/lib/attachments";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Serves an image that a comment or an acceptance criterion refers to.
 *
 * ## Why this route exists
 *
 * `uploadCommentImage` used to return a signed URL with a one-hour expiry and
 * that string was stored inside `body_json`. An hour later the image was gone —
 * permanently, because the document held the expired URL. This route is the
 * fix: the document stores `/api/attachments/<key>`, which never expires, and
 * the signing happens here, per request, after the reader has been checked.
 *
 * ## What it must not become
 *
 * An open proxy. Three things stop it, and all three are load-bearing:
 *
 *  1. **Authorization on every request.** `is_active_member`, re-derived from
 *     the session — not from anything in the URL. A deactivated person's link
 *     stops working the moment they are deactivated, which is the whole point
 *     of not putting a credential in the document.
 *  2. **The path is matched, not sanitised.** `attachmentObjectKey` accepts the
 *     exact shape this app writes — two uuids and one of five extensions — and
 *     refuses everything else, `..` and `%2e%2e` and backslashes included. It
 *     is tested as a pure function in `tests/attachment-src.test.ts`, the same
 *     way `avatarObjectKey` is.
 *  3. **The bucket is a constant here**, so no request can name another one.
 *
 * ## Caching
 *
 * `private`, never `public`. A client's work screenshot must not land in a
 * shared CDN cache where the next reader gets it without a session. The
 * max-age is deliberately shorter than the signed URL's own lifetime, so a
 * browser never holds a cached redirect to a URL that has since expired.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shorter than the signature it points at, so a cached redirect cannot outlive it. */
const BROWSER_CACHE_SECONDS = 120;

function refuse(status: number, reason: string) {
  // A JSON body rather than an empty response: this is rendered by an `<img>`,
  // so nobody reads it in the normal course of things — but somebody debugging
  // a missing screenshot at 11pm does, and "not a member" and "no such image"
  // are different problems.
  return NextResponse.json(
    { error: reason },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Joined before it is validated, because the guard's job is to look at the
  // whole key. Validating each segment separately would accept `..` as long as
  // it arrived one segment at a time.
  const key = attachmentObjectKey(path.join("/"));
  if (!key) return refuse(400, "That is not an image address we recognise.");

  const profile = await getCurrentProfile();
  if (!profile) return refuse(401, "You are not signed in.");

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(COMMENT_IMAGE_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    // Storage refuses a missing object and an unreadable one identically, and
    // that is fine here: both mean "this reader cannot see this image", and
    // distinguishing them would leak which keys exist.
    return refuse(404, "That image is not here any more.");
  }

  // A redirect rather than a stream. The bytes go straight from storage to the
  // browser instead of through this server twice, which on a hosted deployment
  // is the difference between an image and a bill. `307` so the method and the
  // cache semantics are preserved and nothing treats it as permanent.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: {
      "Cache-Control": `private, max-age=${BROWSER_CACHE_SECONDS}`,
      // Belt and braces with the header above: some intermediaries key off
      // this one instead, and "shared cache" is the thing being refused.
      Vary: "Cookie",
    },
  });
}

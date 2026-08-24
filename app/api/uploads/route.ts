import { NextResponse, type NextRequest } from "next/server";

import {
  COMMENT_IMAGE_BUCKET,
  attachmentSrc,
} from "@/lib/attachments";
import {
  HEIC_MESSAGE,
  extensionFor,
  intrinsicSize,
  isAllowedImageType,
  looksLikeHeic,
  looksLikeImage,
} from "@/lib/images";
import { getAppSettings } from "@/lib/settings";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Uploading one image from the editor.
 *
 * ## Why a route handler and not the Server Action it replaces
 *
 * Because of the progress bar. A Server Action call is a `fetch`, and no
 * browser reports upload progress on one — so an 8MB screenshot on a hotel
 * connection was thirty seconds of an editor that said `uploading…` and gave no
 * sign it was still alive. `XMLHttpRequest` does report it, and it needs a real
 * endpoint to report it against. The placeholder in the document fills as the
 * bytes go, which is the difference between "this is working" and "I should
 * press it again".
 *
 * `uploadCommentImage` in `lib/actions/comments.ts` is gone. It also returned a
 * one-hour signed URL that got stored inside the document, which is the bug
 * `lib/attachments.ts` documents at length.
 *
 * ## What is checked, and in which order
 *
 * Cheapest and most specific first, so the reader gets the sentence that
 * actually helps:
 *
 *  1. Signed in and active.
 *  2. A HEIC — answered by name, with the iPhone setting that fixes it, before
 *     the generic "images only" refusal gets a chance to be useless.
 *  3. The declared type is on the list.
 *  4. The size is under `app_settings.max_image_bytes` — a setting, not a
 *     constant, so an admin can raise it without a deploy.
 *  5. The BYTES are the format they claim. A `type` in form data is a claim and
 *     a claim is not a check.
 *
 * Only then does anything reach storage.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refuse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** 2 dp, and only for the message. Nothing rounds a byte count that matters. */
function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 1 : 0);
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return refuse(401, "You are not signed in.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // A dropped connection mid-upload lands here. It is the common failure on a
    // phone and it deserves the sentence a person can act on.
    return refuse(400, "That upload did not arrive in one piece. Check your connection and try again.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return refuse(400, "No file was received.");

  if (looksLikeHeic(file.type, file.name)) return refuse(415, HEIC_MESSAGE);
  if (!isAllowedImageType(file.type)) {
    return refuse(415, "Images only — PNG, JPEG, WebP, GIF or AVIF.");
  }

  const settings = await getAppSettings();
  if (file.size > settings.maxImageBytes) {
    return refuse(
      413,
      `That image is ${megabytes(file.size)}MB. The limit is ${megabytes(settings.maxImageBytes)}MB — an admin can raise it in Settings.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) {
    return refuse(415, "That file is not the image type it claims to be.");
  }

  const supabase = await createClient();
  const key = `${profile.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const { error } = await supabase.storage.from(COMMENT_IMAGE_BUCKET).upload(key, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return refuse(502, "That upload failed. Nothing was lost — try again.");

  // Registered in `public.attachments` so an orphan sweep is possible later,
  // and so RLS applies to the record as well as to the object. The table has
  // existed since the first migration and this path had never used it.
  //
  // A failure here does NOT fail the upload: the image is in storage and the
  // document can point at it. Losing somebody's screenshot because a bookkeeping
  // row would not insert is the worse half of the same bug.
  const workItemId = form.get("workItemId");
  if (typeof workItemId === "string" && workItemId) {
    await supabase.from("attachments").insert({
      work_item_id: workItemId,
      storage_path: `${COMMENT_IMAGE_BUCKET}/${key}`,
      file_name: file.name.slice(0, 200) || "image",
      mime_type: file.type,
      bytes: file.size,
      uploaded_by: profile.id,
    });
  }

  // The intrinsic size, read from the file's own header, so the thread can
  // reserve the right box before the bytes arrive and stop reflowing while
  // somebody reads it. Null for a format the parser does not know, and every
  // reader tolerates null — see `intrinsicSize`.
  const size = intrinsicSize(bytes);

  return NextResponse.json({
    ok: true,
    src: attachmentSrc(key),
    alt: file.name.slice(0, 200) || "image",
    width: size?.width ?? null,
    height: size?.height ?? null,
  });
}

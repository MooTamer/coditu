"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { documentSchema, flattenToText, isEmptyDocument } from "@/lib/comments/schema";
import { extensionFor, isAllowedImageType, looksLikeImage } from "@/lib/images";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Comment mutations.
 *
 * `body_text` is derived HERE, on the server, from the same parsed document
 * that gets stored as `body_json`. Accepting a client-supplied `body_text`
 * would mean the searchable, exportable projection of a comment could say
 * something different from the comment — and the export is what a client reads.
 */

export interface CommentResult {
  ok: boolean;
  error?: string;
}

const uuid = z.string().uuid();

async function resolveItemScope(itemId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("work_items")
    .select("id, key, sprints!inner ( number, projects!inner ( slug ) )")
    .eq("id", itemId)
    .maybeSingle();

  if (!data) return null;
  return {
    profile,
    supabase,
    itemId: data.id,
    itemKey: data.key,
    slug: data.sprints.projects.slug,
    sprintNumber: data.sprints.number,
  };
}

function revalidateItem(slug: string, sprintNumber: number, key: string) {
  const sprint = `/app/projects/${slug}/sprints/${sprintNumber}`;
  revalidatePath(sprint);
  revalidatePath(`${sprint}/items/${key}`);
  revalidatePath("/app/my-work");
}

/* -------------------------------------------------------------------------- */

const postInput = z.object({
  itemId: uuid,
  doc: documentSchema,
});

export async function postComment(input: unknown): Promise<CommentResult> {
  const parsed = postInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That comment could not be read." };

  if (isEmptyDocument(parsed.data.doc)) {
    return { ok: false, error: "Write something first." };
  }

  const scope = await resolveItemScope(parsed.data.itemId);
  if (!scope) return { ok: false, error: "You are not signed in, or that item no longer exists." };

  const bodyText = flattenToText(parsed.data.doc).trim();
  if (bodyText.length > 20_000) {
    return { ok: false, error: "That comment is too long — keep it under 20,000 characters." };
  }

  const { error } = await scope.supabase.from("comments").insert({
    work_item_id: scope.itemId,
    // Always the caller. RLS enforces it as well; taking it from the client
    // would just be a value the server has to distrust.
    author_id: scope.profile.id,
    // The generated column type is `Json`, a structural alias; the parsed
    // document satisfies it in shape but not by nominal type.
    body_json: parsed.data.doc as unknown as Json,
    body_text: bodyText,
  });

  if (error) return { ok: false, error: "That comment did not save. Nothing was lost — try again." };

  revalidateItem(scope.slug, scope.sprintNumber, scope.itemKey);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const editInput = z.object({ commentId: uuid, doc: documentSchema });

export async function editComment(input: unknown): Promise<CommentResult> {
  const parsed = editInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That comment could not be read." };
  if (isEmptyDocument(parsed.data.doc)) return { ok: false, error: "A comment cannot be empty." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("comments")
    .select("id, author_id, work_items!inner ( key, sprints!inner ( number, projects!inner ( slug ) ) )")
    .eq("id", parsed.data.commentId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "That comment no longer exists." };
  if (existing.author_id !== profile.id && profile.role !== "admin") {
    return { ok: false, error: "Only the author can edit a comment." };
  }

  const { error } = await supabase
    .from("comments")
    .update({
      body_json: parsed.data.doc as unknown as Json,
      body_text: flattenToText(parsed.data.doc).trim(),
      edited_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.commentId);

  if (error) return { ok: false, error: "That edit did not save. Nothing was lost — try again." };

  const item = existing.work_items;
  revalidateItem(item.sprints.projects.slug, item.sprints.number, item.key);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const deleteInput = z.object({ commentId: uuid });

/**
 * Soft delete only. There is no delete policy on `comments` at all, so a hard
 * delete is refused by the database — an argument that vanishes is worse than
 * one that is visibly withdrawn.
 */
export async function deleteComment(input: unknown): Promise<CommentResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That comment could not be read." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("comments")
    .select("id, author_id, work_items!inner ( key, sprints!inner ( number, projects!inner ( slug ) ) )")
    .eq("id", parsed.data.commentId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "That comment no longer exists." };
  if (existing.author_id !== profile.id && profile.role !== "admin") {
    return { ok: false, error: "Only the author or an admin can remove a comment." };
  }

  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId);

  if (error) return { ok: false, error: "That did not save. Nothing was lost — try again." };

  const item = existing.work_items;
  revalidateItem(item.sprints.projects.slug, item.sprints.number, item.key);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface UploadResult {
  ok: boolean;
  src?: string;
  error?: string;
}

/**
 * Uploads a pasted or dropped image to the private `comment-images` bucket and
 * returns a signed URL.
 *
 * MIME and size are checked against the FILE, not against a field the client
 * sent — a `type` in the form data is a claim, and a claim is not a check. SVG
 * is deliberately not on the list: it is a document format that can carry
 * script, and it would be rendered by an `<img>` we control.
 */
export async function uploadCommentImage(formData: FormData): Promise<UploadResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was received." };

  if (!isAllowedImageType(file.type)) {
    return { ok: false, error: "Images only — PNG, JPEG, WebP, GIF or AVIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "That image is over 8MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) {
    return { ok: false, error: "That file is not the image type it claims to be." };
  }

  const supabase = await createClient();
  const path = `${profile.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const { error } = await supabase.storage.from("comment-images").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: "That upload failed. Try again." };

  const { data: signed } = await supabase.storage
    .from("comment-images")
    .createSignedUrl(path, 60 * 60);

  if (!signed?.signedUrl) return { ok: false, error: "The image uploaded but could not be linked." };
  return { ok: true, src: signed.signedUrl };
}


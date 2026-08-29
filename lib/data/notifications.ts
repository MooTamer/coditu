import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface NotificationRecord {
  id: string;
  kind: "mention" | "assigned" | "review_requested";
  createdAt: string;
  readAt: string | null;
  itemKey: string;
  itemTitle: string;
  projectSlug: string;
  projectName: string;
  sprintNumber: number;
  preview: string | null;
  /**
   * Who wrote the comment this came from, when there was one.
   *
   * `notifications` has no actor column — the row is written by
   * `sync_comment_mentions`, a trigger, and a trigger has no opinion about who
   * caused it beyond what the comment already records. So a `mention` can be
   * attributed through `comment_id`, and an `assigned` or `review_requested`
   * genuinely cannot be. Null means nobody is named, not that nobody acted.
   */
  authorName: string | null;
  authorInitials: string | null;
  authorAvatarUrl: string | null;
}

/**
 * The caller's own notifications. RLS restricts the table to
 * `profile_id = auth.uid()`, so there is no filter to forget here — asking for
 * somebody else's returns nothing rather than returning theirs.
 */
export const listNotifications = cache(async (): Promise<NotificationRecord[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(
      `id, kind, created_at, read_at,
       comments ( body_text, profiles!comments_author_id_fkey ( full_name, initials, avatar_url ) ),
       work_items!inner ( key, title, sprints!inner ( number, projects!inner ( slug, name ) ) )`
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as NotificationRecord["kind"],
    createdAt: row.created_at,
    readAt: row.read_at,
    itemKey: row.work_items.key,
    itemTitle: row.work_items.title,
    projectSlug: row.work_items.sprints.projects.slug,
    projectName: row.work_items.sprints.projects.name,
    sprintNumber: row.work_items.sprints.number,
    authorName: row.comments?.profiles?.full_name ?? null,
    authorInitials: row.comments?.profiles?.initials ?? null,
    authorAvatarUrl: row.comments?.profiles?.avatar_url ?? null,
    // The flattened projection, not the ProseMirror document — a preview does
    // not need a walker, and truncating rich text is how you cut a tag in half.
    preview: row.comments?.body_text?.slice(0, 140) ?? null,
  }));
});

export const countUnreadNotifications = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
});

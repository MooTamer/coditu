import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendToSubscriptions } from "@/lib/push/send";
import type { MentionNotice, PushPayload } from "@/lib/push/payload";

/**
 * Turn the notification rows a comment just produced into pushes.
 *
 * ── Where the rows come from, because it is not obvious ────────────────────
 * `postComment` does not write them. `sync_comment_mentions` does — a
 * `security definer` trigger on `comments`, which walks `body_json` for mention
 * nodes and inserts one `notifications` row per mentioned, active, non-author
 * profile. It has already run by the time the insert returns, so this reads
 * them back rather than re-deriving who to notify. Two answers to "who was
 * mentioned" would eventually disagree, and the trigger's is the one that also
 * decides what the app shows.
 *
 * Only `kind = 'mention'` is ever sent, and that is not a limitation to fix:
 * the check constraint allows `'assigned'` and `'review_requested'` and
 * `lib/data/notifications.ts` types all three, but **nothing in the schema or
 * the application ever inserts either one**. Building delivery for a kind that
 * is never produced would be code with no way to know whether it works.
 *
 * ── This function cannot fail the comment ──────────────────────────────────
 * The caller does not await it and does not read its result. Everything inside
 * is wrapped: a missing VAPID key, an unreachable push service, a query that
 * errors — all of it ends in a comment that saved and a notification row that
 * exists, which is the state the application already worked in before any of
 * this was built.
 */
export async function notifyMentioned(
  commentId: string,
  buildPayload: (notice: MentionNotice) => PushPayload,
  notice: MentionNotice
): Promise<void> {
  try {
    // Service-role, and it has to be: this runs in the AUTHOR's session, and
    // the notification rows and subscriptions belong to the recipients. Their
    // RLS would — correctly — return nothing.
    const admin = createAdminClient();

    const { data: recipients } = await admin
      .from("notifications")
      .select("profile_id")
      .eq("comment_id", commentId)
      .eq("kind", "mention");

    const profileIds = [...new Set((recipients ?? []).map((row) => row.profile_id))];
    if (profileIds.length === 0) return;

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("profile_id", profileIds);

    if (!subscriptions || subscriptions.length === 0) return;

    await sendToSubscriptions(subscriptions, buildPayload(notice));
  } catch {
    // Deliberately silent. The rule this whole file is written under is that a
    // failed push never fails the write, and there is nothing a person writing
    // a comment could do with the news that a push service was unreachable.
  }
}

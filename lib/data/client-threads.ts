import "server-only";

import { cache } from "react";

import type { ClientMessageView, ClientThreadState, ClientThreadView } from "@/lib/client-threads";
import { createClient } from "@/lib/supabase/server";

/**
 * Client question threads, read from both sides of the wall.
 *
 * One pair of loaders serves the portal and the internal screens, because
 * `can_read_client_thread()` already answers correctly for a contact and for an
 * internal member — the rows differ, the shape does not.
 *
 * Both go through `security definer` RPCs rather than `.from()` selects, and
 * the reason is written out on `listClientThreads` below: it is not that these
 * tables are unsafe, it is that a query which joins **outward** from them is.
 */

// The vocabulary lives in `lib/client-threads.ts`, which has no `server-only`
// and can therefore be read by the client components that render these words.
// Re-exported here so existing callers do not have to care which file it is in.
export type {
  ClientMessageView,
  ClientThreadState,
  ClientThreadView,
} from "@/lib/client-threads";
export { THREAD_STATE_LABEL, THREAD_STATE_LABEL_INTERNAL } from "@/lib/client-threads";

/**
 * Every thread this session may see, newest activity first.
 *
 * `projectId` narrows it; omitted, it returns everything this session may read
 * — her granted projects for a contact, all of them for an internal member.
 *
 * Through `client_thread_list`, not a `.from()` select — and the reason is a
 * bug worth keeping in mind. `client_threads` has no internal-only columns, so
 * reading it directly and letting RLS pick the rows was right. But the list
 * also needs the component and project a thread is ABOUT, and a client contact
 * cannot read `components` or `projects` at all. `components!inner (…)` on a
 * join that returns nothing drops the parent row, so the query came back EMPTY
 * — no error, no permission message, just a screen saying there was nothing to
 * answer while the database was happy to say there was one waiting.
 *
 * A client-safe TABLE is not a client-safe QUERY. The moment a query joins
 * outward it inherits the strictest policy it touches, and `!inner` makes that
 * silent.
 */
export const listClientThreads = cache(
  async (projectId?: string): Promise<ClientThreadView[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("client_thread_list", {
      p_project_id: projectId ?? undefined,
    });

    if (error) throw error;

    return (data ?? [])
      .map((row) => ({
        id: row.thread_id,
        title: row.title,
        state: row.state as ClientThreadState,
        componentId: row.component_id,
        componentName: row.component_name,
        componentSlug: row.component_slug,
        projectId: row.project_id,
        projectSlug: row.project_slug,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        messageCount: row.message_count ?? 0,
        // Never opened counts as unread when there is anything in it. Treating
        // "no mark" as read would silently hide the first question anybody was
        // ever asked.
        unread:
          row.last_message_at !== null &&
          (row.last_read_at === null || row.last_read_at < row.last_message_at),
      }))
      .sort((a, b) =>
        (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)
      );
  }
);

/** One thread and its messages, oldest first — a conversation reads downwards. */
export const getClientThread = cache(
  async (
    threadId: string
  ): Promise<{
    thread: ClientThreadView;
    messages: ClientMessageView[];
    canReply: boolean;
  } | null> => {
    const supabase = await createClient();

    // Three calls rather than one nested select, for the same reason as above:
    // there is no join here that could reach a table this session cannot read.
    const [list, messages, canReply] = await Promise.all([
      supabase.rpc("client_thread_list"),
      supabase.rpc("client_thread_messages", { p_thread_id: threadId }),
      supabase.rpc("client_thread_can_reply", { p_thread_id: threadId }),
    ]);

    if (list.error) throw list.error;
    if (messages.error) throw messages.error;

    const row = (list.data ?? []).find((candidate) => candidate.thread_id === threadId);
    if (!row) return null;

    return {
      thread: {
        id: row.thread_id,
        title: row.title,
        state: row.state as ClientThreadState,
        componentId: row.component_id,
        componentName: row.component_name,
        componentSlug: row.component_slug,
        projectId: row.project_id,
        projectSlug: row.project_slug,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        messageCount: row.message_count ?? 0,
        unread: false,
      },
      messages: (messages.data ?? []).map((message) => ({
        id: message.message_id,
        authorId: message.author_id,
        authorName: message.author_name,
        authorInitials: message.author_initials,
        fromCoditu: message.is_from_coditu,
        bodyJson: message.body_json,
        bodyText: message.body_text,
        createdAt: message.created_at,
        editedAt: message.edited_at,
      })),
      canReply: canReply.data === true,
    };
  }
);

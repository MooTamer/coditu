"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { flattenToText, isEmptyDocument } from "@/lib/blocks/schema";
import { documentSchema } from "@/lib/blocks/validate";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, getClientContact, getCurrentProfile } from "@/lib/supabase/server";

/**
 * Client question threads — opening, answering, resolving.
 *
 * ── The document is the same document ──────────────────────────────────────
 *
 * `body_text` is derived HERE, on the server, from the same parsed document
 * that gets stored as `body_json` — exactly as `postComment` does, and for the
 * same reason: accepting a client-supplied `body_text` would let the searchable
 * projection of a message say something different from the message. The schema,
 * the flattener and the emptiness check are `lib/blocks/schema.ts` unchanged,
 * so a hostile document is refused by the code that has already been attacked
 * by ten specs rather than by a second parser written for this feature.
 *
 * ── Who is who ─────────────────────────────────────────────────────────────
 *
 * Every action below resolves the caller as EITHER an internal profile or a
 * client contact, never both, and never from anything in the request. RLS then
 * decides again: `author_id = auth.uid()` is a `with check`, so a spoofed
 * author is refused by the database even if this file were wrong.
 */

export interface ThreadResult {
  ok: boolean;
  error?: string;
  threadId?: string;
}

const uuid = z.string().uuid();

/** Whoever is asking, and which side they are on. */
async function whoIsAsking() {
  const internal = await getCurrentProfile();
  if (internal) return { id: internal.id, internal: true as const };

  const contact = await getClientContact();
  if (contact) return { id: contact.id, internal: false as const };

  return null;
}

function revalidateBoth(projectSlug: string, componentSlug: string) {
  revalidatePath("/client");
  revalidatePath("/client/questions");
  revalidatePath(`/client/projects/${projectSlug}/components/${componentSlug}`);
  revalidatePath(`/app/projects/${projectSlug}/components/${componentSlug}`);
}

/* -------------------------------------------------------------------------- */

const openInput = z.object({
  componentId: uuid,
  workItemId: uuid.nullable().optional(),
  title: z.string().trim().min(1, "Give the question a title.").max(200),
  doc: documentSchema,
});

/**
 * Ask a client something.
 *
 * **No `projectId` parameter, and there never will be one.** The thread's
 * project is derived from its component by `derive_client_thread_project`, so
 * there is nothing here for a caller to get wrong or to lie about — the same
 * shape invariant 1 already has on work items, where the project comes from the
 * item's own sprint.
 */
export async function openClientThread(input: unknown): Promise<ThreadResult> {
  const parsed = openInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That question could not be read." };
  }
  if (isEmptyDocument(parsed.data.doc)) {
    return { ok: false, error: "Write the question first." };
  }

  const asking = await whoIsAsking();
  if (!asking) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const bodyText = flattenToText(parsed.data.doc).trim();

  const { data: thread, error } = await supabase
    .from("client_threads")
    .insert({
      component_id: parsed.data.componentId,
      work_item_id: parsed.data.workItemId ?? null,
      title: parsed.data.title,
      opened_by: asking.id,
      // A question we asked is waiting on them from the moment it exists.
      state: "waiting_client",
      // Required by the column, replaced by the trigger. Passing the component
      // id here would be equally meaningless — the trigger overwrites whatever
      // arrives — and this makes the insert type-check without inventing a
      // value that looks authoritative.
      project_id: "00000000-0000-0000-0000-000000000000",
    })
    .select("id, projects ( slug ), components ( slug )")
    .single();

  if (error || !thread) {
    return { ok: false, error: "That question did not save. Nothing was sent — try again." };
  }

  const { error: messageError } = await supabase.from("client_messages").insert({
    thread_id: thread.id,
    author_id: asking.id,
    body_json: parsed.data.doc as unknown as Json,
    body_text: bodyText,
  });

  if (messageError) {
    // A thread with no message is a title nobody can answer. There is no
    // transaction across two PostgREST calls, so it is cleaned up by hand —
    // and `client_threads` has no delete grant, so this is a soft resolve
    // rather than a delete.
    await supabase.from("client_threads").update({ state: "resolved", resolved_at: new Date().toISOString() }).eq("id", thread.id);
    return { ok: false, error: "That question did not save. Try again." };
  }

  revalidateBoth(thread.projects?.slug ?? "", thread.components?.slug ?? "");
  return { ok: true, threadId: thread.id };
}

/* -------------------------------------------------------------------------- */

const replyInput = z.object({ threadId: uuid, doc: documentSchema });

/**
 * Answer, from either side.
 *
 * The state follows the reply automatically: a client answering makes it ours,
 * and one of us answering makes it theirs again. Recorded in
 * `05-DECISIONS.md` as reversible — the alternative is a person remembering to
 * set it, and a status nobody maintains is worse than no status. **Resolving
 * stays manual and stays with Coditu**, because whether an answer was
 * sufficient is a judgement rather than an event.
 *
 * A reply on a resolved thread reopens it. Somebody had more to say, and a
 * message arriving into a conversation marked finished is exactly the case
 * where the label is wrong.
 */
export async function replyToClientThread(input: unknown): Promise<ThreadResult> {
  const parsed = replyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That reply could not be read." };
  if (isEmptyDocument(parsed.data.doc)) return { ok: false, error: "Write something first." };

  const asking = await whoIsAsking();
  if (!asking) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const bodyText = flattenToText(parsed.data.doc).trim();

  if (bodyText.length > 20_000) {
    return { ok: false, error: "That is too long — keep it under 20,000 characters." };
  }

  const { error } = await supabase.from("client_messages").insert({
    thread_id: parsed.data.threadId,
    // Always the caller. RLS enforces it too; taking it from the client would
    // be a value the server has to distrust.
    author_id: asking.id,
    body_json: parsed.data.doc as unknown as Json,
    body_text: bodyText,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "You cannot reply to this question."
          : "That reply did not send. Nothing was lost — try again.",
    };
  }

  const { data: thread } = await supabase
    .from("client_threads")
    .update({
      state: asking.internal ? "waiting_client" : "waiting_coditu",
      resolved_at: null,
    })
    .eq("id", parsed.data.threadId)
    .select("projects ( slug ), components ( slug )")
    .maybeSingle();

  revalidateBoth(thread?.projects?.slug ?? "", thread?.components?.slug ?? "");
  return { ok: true, threadId: parsed.data.threadId };
}

/* -------------------------------------------------------------------------- */

/**
 * Mark a question answered. Coditu only.
 *
 * The policy allows an internal member to set `resolved` and refuses it to a
 * client; this refuses it before the round trip so the reason is a sentence
 * rather than a policy rejection. Both are needed — the policy is the boundary,
 * and this is the explanation.
 */
export async function resolveClientThread(input: unknown): Promise<ThreadResult> {
  const parsed = z.object({ threadId: uuid, resolved: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Only Coditu can close a question." };

  const supabase = await createClient();
  const { data: thread, error } = await supabase
    .from("client_threads")
    .update(
      parsed.data.resolved
        ? { state: "resolved", resolved_at: new Date().toISOString() }
        : { state: "waiting_coditu", resolved_at: null }
    )
    .eq("id", parsed.data.threadId)
    .select("projects ( slug ), components ( slug )")
    .maybeSingle();

  if (error) return { ok: false, error: "That did not save. Try again." };

  revalidateBoth(thread?.projects?.slug ?? "", thread?.components?.slug ?? "");
  return { ok: true, threadId: parsed.data.threadId };
}

/* -------------------------------------------------------------------------- */

/**
 * Mark a thread read, up to now.
 *
 * Its own action rather than a side effect of rendering the page: a GET that
 * writes is a GET that a prefetch, a bot, or a link preview can fire, and this
 * repository has already measured a prefetch rendering twenty-eight dynamic
 * routes nobody visited. Called from the thread view once it is actually open.
 */
export async function markThreadRead(input: unknown): Promise<ThreadResult> {
  const parsed = z.object({ threadId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };

  const asking = await whoIsAsking();
  if (!asking) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_thread_reads").upsert(
    {
      thread_id: parsed.data.threadId,
      profile_id: asking.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "thread_id,profile_id" }
  );

  // A failed read mark is not worth a toast. The thread stays bold, which is
  // wrong in the harmless direction — the opposite failure would hide a
  // question somebody has not seen.
  if (error) return { ok: false };

  revalidatePath("/client/questions");
  return { ok: true };
}
